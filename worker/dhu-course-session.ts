import { DurableObject } from "cloudflare:workers";
import { normalizeDhuTask, parseDhuCourseOptions, type DhuCourseOption, type DhuTask } from "../lib/dhu-course";
import {
  SchoolHttp, authPrefixFrom, encryptSchoolPassword, schoolRedirect, validateCoursePageUrl,
  type SchoolState,
} from "../lib/dhu-http";

type CourseStorage = {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  setAlarm(timestamp: number): Promise<void>;
  deleteAlarm(): Promise<void>;
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "学校服务暂不可用";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function schoolMessage(value: unknown) {
  const message = String(value || "学校认证失败");
  return message.length <= 120 ? message : "学校认证失败";
}

export class DhuCourseSession extends DurableObject<Cloudflare.Env> {
  private get storage() { return (this.ctx as unknown as { storage: CourseStorage }).storage; }
  private async tasks() { return await this.storage.get<DhuTask[]>("tasks") || []; }
  private async school() { return await this.storage.get<SchoolState>("school"); }

  private async summary() {
    const [tasks, state, courses] = await Promise.all([
      this.tasks(), this.school(), this.storage.get<DhuCourseOption[]>("courses"),
    ]);
    return {
      tasks,
      courses: state?.stage === "ready" ? courses || [] : [],
      schoolSession: state?.stage === "ready" && state.coursePageUrl
        ? { savedAt: state.updatedAt, coursePageUrl: state.coursePageUrl } : null,
      login: state ? { stage: state.stage, username: state.username || null } : null,
    };
  }

  async fetch(request: Request) {
    const path = new URL(request.url).pathname;
    try {
      if (request.method === "GET" && path === "/status") return json(await this.summary());
      if (request.method !== "POST") return json({ error: "方法不支持" }, 405);
      const input = await request.json().catch(() => null);
      if (path === "/login/start") return json(await this.startLogin(input));
      if (path === "/login/code") return json(await this.sendCode());
      if (path === "/login/finish") return json(await this.finishLogin(input));
      if (path === "/login/course") return json(await this.openCoursePage(input));
      if (path === "/task") return json(await this.addTask(input), 201);
      if (path === "/task/cancel") return json(await this.cancelTask(input));
      return json({ error: "路径不存在" }, 404);
    } catch (error) {
      return json({ error: schoolMessage(errorMessage(error)) }, 400);
    }
  }

  private async startLogin(input: unknown) {
    const data = record(input);
    const username = String(data.username || "").trim();
    const password = String(data.password || "");
    if (!/^[a-zA-Z0-9@._-]{4,64}$/.test(username) || !password || password.length > 100) {
      throw new Error("请填写学校通行证账号和密码");
    }
    const savedAttempts = await this.storage.get<{ version?: number; count: number; until: number }>("loginAttempts");
    const attempts = savedAttempts?.version === 2 ? savedAttempts : undefined;
    if (attempts && attempts.until > Date.now() && attempts.count >= 5) throw new Error("本站登录尝试过于频繁，请在 5 分钟后重试");
    await this.storage.put("loginAttempts", {
      version: 2,
      count: attempts && attempts.until > Date.now() ? attempts.count + 1 : 1,
      until: attempts && attempts.until > Date.now() ? attempts.until : Date.now() + 5 * 60_000,
    });

    const state: SchoolState = { cookies: [], stage: "passport", username, updatedAt: Date.now() };
    const school = new SchoolHttp(state);
    const landing = await school.request("https://webproxy.dhu.edu.cn/login");
    if (!landing.response.ok) throw new Error("学校通行证入口暂不可用");
    state.authPrefix = authPrefixFrom(landing.url);
    const page = (await school.json(`${state.authPrefix}/esc-sso/dynamic/page?appCode=webproxy443&pageUrl=/identity/login`)).body.data;
    const template = Array.isArray(page?.templates) ? record(page.templates[0]) : {};
    const pageId = String(template.pageId || "");
    if (!/^[a-zA-Z0-9]{8,64}$/.test(pageId)) throw new Error("学校登录页初始化失败");
    await school.request(`${state.authPrefix}/pd-entry/page/${pageId}/index.html`);
    const policy = (await school.json(`${state.authPrefix}/esc-sso/authn/policy?app=webproxy443`)).body.data;
    const params = record(policy?.param);
    const encrypted = encryptSchoolPassword(password, String(params.publicKey || ""), String(params.publicKeyId || ""));
    const result = (await school.json(`${state.authPrefix}/esc-sso/authn/login`, "POST", {
      authType: "webLocalAuth", dataField: { username, ...encrypted, vcode: "" }, redirectUri: "",
    }, landing.url.href)).body;
    const redirect = schoolRedirect(result.data, state.authPrefix);
    if (redirect) await school.request(redirect);
    const enhanced = (await school.json(`${state.authPrefix}/esc-sso/authn/policy/enhance`)).body.data;
    const config = record(enhanced?.config);
    const mfa = record(config.mfaAuth);
    if (mfa.status !== "1") throw new Error("学校未返回预期的企业微信认证步骤，请在学校官网核对登录状态");
    const schoolUser = String(config.username || username);
    if (schoolUser !== username) throw new Error("学校认证账号与提交账号不一致");
    state.stage = "mfa";
    state.username = schoolUser;
    state.updatedAt = Date.now();
    await this.storage.delete("courses");
    await this.storage.put("school", state);
    return { login: { stage: "mfa", username: schoolUser } };
  }

  private async sendCode() {
    const state = await this.school();
    if (!state || state.stage !== "mfa" || !state.authPrefix || !state.username) throw new Error("请先登录学校通行证");
    const last = await this.storage.get<number>("lastCodeAt") || 0;
    if (Date.now() - last < 60_000) throw new Error("验证码已发送，请稍后重试");
    await this.storage.put("lastCodeAt", Date.now());
    const school = new SchoolHttp(state);
    await school.json(`${state.authPrefix}/esc-sso/message/code`, "POST", {
      username: state.username, type: "workwechat",
    }, `${state.authPrefix}/login/mfaLogin.html`);
    state.updatedAt = Date.now();
    await this.storage.put("school", state);
    return { sent: true };
  }

  private async finishLogin(input: unknown) {
    const state = await this.school();
    if (!state || state.stage !== "mfa" || !state.authPrefix || !state.username) throw new Error("请先登录学校通行证");
    const code = String(record(input).code || "").trim();
    if (!/^\d{4,8}$/.test(code)) throw new Error("请填写学校发送的验证码");
    const school = new SchoolHttp(state);
    const policy = (await school.json(`${state.authPrefix}/esc-sso/authn/policy/enhance`)).body.data;
    const mfa = record(record(policy?.config).mfaAuth);
    if (mfa.status !== "1") throw new Error("学校认证步骤已过期，请重新登录");
    const app = record(mfa.app);
    const dataField: Record<string, string> = {
      username: state.username, password: "", msgCode: code, vcode: "",
    };
    let endpoint = `${state.authPrefix}/esc-sso/auth/login`;
    if (mfa.type === 2) {
      endpoint = `${state.authPrefix}/esc-sso/authn/app/enhance/ext/login`;
      dataField.appId = String(app.appId || "");
      dataField.appUrl = String(app.appUrl || "");
    }
    const result = (await school.json(endpoint, "POST", {
      authType: "webWorkWechatMsgAuth", dataField, redirectUri: "",
    }, `${state.authPrefix}/login/mfaLogin.html`)).body;
    const redirect = schoolRedirect(result.data, state.authPrefix);
    if (!redirect) throw new Error("学校未返回认证完成后的跳转地址");
    await school.request(redirect);
    state.stage = "ready";
    state.updatedAt = Date.now();
    await this.storage.put("school", state);
    await this.storage.delete("loginAttempts");
    return { login: { stage: "ready", username: state.username } };
  }

  private async openCoursePage(input: unknown) {
    const state = await this.school();
    if (!state || state.stage !== "ready") throw new Error("请先完成学校企业微信验证");
    const coursePageUrl = validateCoursePageUrl(String(record(input).coursePageUrl || ""));
    const school = new SchoolHttp(state);
    const { url, response } = await school.request(coursePageUrl);
    const html = await response.text();
    if (!response.ok || !url.pathname.includes("/dhu/selectcourse/") || !html.includes("tsCoursesTbl")) {
      throw new Error("未能打开学校课程列表，请检查地址和学校登录状态");
    }
    state.coursePageUrl = url.href;
    state.updatedAt = Date.now();
    await this.storage.put("courses", parseDhuCourseOptions(html));
    const scriptSource = html.match(/<script[^>]+src=["']([^"']*selecthome\.js[^"']*)["']/i)?.[1];
    if (scriptSource) {
      try {
        const script = await school.request(scriptSource.replaceAll("&amp;", "&"));
        if (script.response.ok) {
          const source = await script.response.text();
          // Static school code only; never log HTML, cookies, credentials, or student data.
          console.log("DHU_SELECTHOME_SCRIPT", source.slice(0, 30_000));
        }
      } catch { /* Course page verification is independent of static script diagnostics. */ }
    }
    await this.storage.put("school", state);
    return { schoolSession: { savedAt: state.updatedAt, coursePageUrl: state.coursePageUrl } };
  }

  private async addTask(input: unknown) {
    const state = await this.school();
    if (!state?.coursePageUrl) throw new Error("请先连接学校课程列表");
    // The school's course submission endpoint is not derivable from the unauthenticated page.
    // Do not accept a reservation until the exact request and success response are verified.
    normalizeDhuTask(input);
    throw new Error("学校选课提交接口尚待验证，暂不能创建自动报名预约");
  }

  private async cancelTask(input: unknown) {
    const id = String(record(input).id || "");
    const tasks = await this.tasks();
    const task = tasks.find((item) => item.id === id);
    if (!task || !["scheduled", "watching", "needs_login", "paused"].includes(task.status)) throw new Error("预约不存在或已执行");
    task.status = "cancelled";
    task.message = "已取消";
    task.updatedAt = Date.now();
    await this.storage.put("tasks", tasks);
    await this.storage.deleteAlarm();
    return { task };
  }

  async alarm() {
    const tasks = await this.tasks();
    for (const task of tasks) {
      if (!["scheduled", "watching"].includes(task.status)) continue;
      task.status = "paused";
      task.message = "学校直连选课接口尚未验证，预约未提交";
      task.updatedAt = Date.now();
    }
    await this.storage.put("tasks", tasks);
    await this.storage.deleteAlarm();
  }
}

import { DurableObject } from "cloudflare:workers";
import { MAX_SUBMISSION_ATTEMPTS, RETRY_INTERVAL_MS, normalizeDhuTask, parseDhuCourseOptions, parseDhuSectionOptions, planDhuSubmission, type DhuCourseOption, type DhuSectionOption, type DhuSessionHealth, type DhuSubmissionRecord, type DhuTask } from "../lib/dhu-course";
import { ensureDhuTables, saveDhuAccount, saveDhuSubmission, saveDhuTask } from "../lib/dhu-persistence";
import {
  DHU_COURSE_SEED_URL, SchoolHttp, authPrefixFrom, discoverCoursePageUrls,
  encryptSchoolPassword, schoolRedirect, validateCoursePageUrl,
  type SchoolState,
} from "../lib/dhu-http";

type CourseStorage = {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  setAlarm(timestamp: number): Promise<void>;
  deleteAlarm(): Promise<void>;
};

const SESSION_CHECK_MS = 10 * 60_000;
const SESSION_RETRY_MS = 2 * 60_000;

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
  return message.length <= 240 ? message : `${message.slice(0, 239)}…`;
}

function mfaReferer(state: SchoolState) {
  if (state.mfaPageUrl) return state.mfaPageUrl;
  const url = new URL(`${state.authPrefix}/login/mfaLogin.html`, "https://webproxy.dhu.edu.cn");
  if (state.mfa?.appId && state.mfa.appUrl) {
    url.searchParams.set("appId", state.mfa.appId);
    url.searchParams.set("appUrl", state.mfa.appUrl);
  }
  return url.href;
}

async function schoolStep<T>(step: string, action: Promise<T>): Promise<T> {
  try { return await action; }
  catch (error) { throw new Error(`${step}：${errorMessage(error)}`); }
}

export class DhuCourseSession extends DurableObject<Cloudflare.Env> {
  private schemaReady?: Promise<void>;
  private get storage() { return (this.ctx as unknown as { storage: CourseStorage }).storage; }
  private async db() {
    if (!this.schemaReady) this.schemaReady = ensureDhuTables(this.env.DB).catch((error) => {
      this.schemaReady = undefined;
      throw error;
    });
    await this.schemaReady;
    return this.env.DB;
  }
  private async ownerId() {
    let id = await this.storage.get<string>("ownerId");
    if (!id) { id = crypto.randomUUID(); await this.storage.put("ownerId", id); }
    return id;
  }
  private async persistAccount(state: SchoolState) {
    if (state.username) await saveDhuAccount(await this.db(), await this.ownerId(), state);
  }
  private async persistTask(username: string, task: DhuTask) {
    await saveDhuTask(await this.db(), await this.ownerId(), username, task);
  }
  private async persistRecord(item: DhuSubmissionRecord) {
    await saveDhuSubmission(await this.db(), await this.ownerId(), item);
  }
  private async archiveExisting(username: string) {
    const marker = `d1Archive:${username}`;
    if (await this.storage.get<boolean>(marker)) return;
    const [tasks, records] = await Promise.all([
      this.tasks(username), this.storage.get<DhuSubmissionRecord[]>(`submissionRecords:${username}`),
    ]);
    for (const task of tasks) await this.persistTask(username, task);
    for (const item of records || []) await this.persistRecord(item);
    await this.storage.put(marker, true);
  }
  private async tasks(username?: string) {
    return username ? await this.storage.get<DhuTask[]>(`tasks:${username}`) || [] : [];
  }
  private async school() { return await this.storage.get<SchoolState>("school"); }

  private async summary() {
    const [state, courses, sections, sessionHealth] = await Promise.all([
      this.school(), this.storage.get<DhuCourseOption[]>("courses"),
      this.storage.get<DhuSectionOption[]>("sections"), this.storage.get<DhuSessionHealth>("sessionHealth"),
    ]);
    const [tasks, submissionRecords] = await Promise.all([
      this.tasks(state?.username),
      state?.username ? this.storage.get<DhuSubmissionRecord[]>(`submissionRecords:${state.username}`) : undefined,
    ]);
    if (state?.username && !(await this.storage.get<boolean>(`d1Archive:${state.username}`))) {
      await this.persistAccount(state);
      await this.archiveExisting(state.username);
    }
    return {
      tasks,
      courses: state?.stage === "ready" ? courses || [] : [],
      sections: state?.stage === "ready" ? sections || [] : [],
      sessionHealth: state?.stage === "ready" ? sessionHealth || null : null,
      submissionRecords: submissionRecords || [],
      submissionReady: false,
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
      if (path === "/login/start") return json(await this.startLogin(input, request.headers.get("X-Appoint-User-Agent")));
      if (path === "/login/code") return json(await this.sendCode());
      if (path === "/login/finish") return json(await this.finishLogin(input));
      if (path === "/login/inspect") return json(await this.inspectMfa());
      if (path === "/login/course") return json(await this.openCoursePage());
      if (path === "/task") return json(await this.addTask(input), 201);
      if (path === "/task/cancel") return json(await this.cancelTask(input));
      return json({ error: "路径不存在" }, 404);
    } catch (error) {
      return json({ error: schoolMessage(errorMessage(error)) }, 400);
    }
  }

  private async startLogin(input: unknown, userAgent: string | null) {
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

    const state: SchoolState = { cookies: [], stage: "passport", username, updatedAt: Date.now(),
      userAgent: userAgent && userAgent.length <= 512 ? userAgent : undefined };
    const school = new SchoolHttp(state);
    const landing = await schoolStep("学校通行证入口", school.request("https://webproxy.dhu.edu.cn/login"));
    if (!landing.response.ok) throw new Error("学校通行证入口暂不可用");
    state.authPrefix = authPrefixFrom(landing.url);
    const page = (await schoolStep("学校登录页初始化", school.json(`${state.authPrefix}/esc-sso/dynamic/page?appCode=webproxy443&pageUrl=/identity/login`))).body.data;
    const template = Array.isArray(page?.templates) ? record(page.templates[0]) : {};
    const pageId = String(template.pageId || "");
    if (!/^[a-zA-Z0-9]{8,64}$/.test(pageId)) throw new Error("学校登录页初始化失败");
    await school.request(`${state.authPrefix}/pd-entry/page/${pageId}/index.html`);
    const policy = (await schoolStep("学校登录策略", school.json(`${state.authPrefix}/esc-sso/authn/policy?app=webproxy443`))).body.data;
    const params = record(policy?.param);
    const encrypted = encryptSchoolPassword(password, String(params.publicKey || ""), String(params.publicKeyId || ""));
    const result = (await schoolStep("学校通行证账号验证", school.json(`${state.authPrefix}/esc-sso/authn/login`, "POST", {
      authType: "webLocalAuth", dataField: { username, ...encrypted },
    }, landing.url.href))).body;
    const redirect = schoolRedirect(result.data, state.authPrefix);
    if (redirect) {
      const mfaLanding = await schoolStep("学校登录跳转", school.request(redirect));
      if (/\/login\/mfaLogin\.html$/i.test(mfaLanding.url.pathname)) state.mfaPageUrl = mfaLanding.url.href;
    }
    const enhanced = (await schoolStep("学校企业微信步骤", school.json(`${state.authPrefix}/esc-sso/authn/policy/enhance`))).body.data;
    const config = record(enhanced?.config);
    const mfa = record(config.mfaAuth);
    if (mfa.status !== "1") throw new Error("学校未返回预期的企业微信认证步骤，请在学校官网核对登录状态");
    const app = record(mfa.app);
    const mfaType = Number(mfa.type);
    if (![1, 2].includes(mfaType)) throw new Error("学校返回了未知的企业微信认证类型");
    const appId = String(app.appId || "");
    const appUrl = String(app.appUrl || "");
    if (mfaType === 2 && (!appId || !appUrl)) throw new Error("学校未提供企业微信应用认证参数");
    const schoolUser = String(config.username || username);
    if (schoolUser !== username) throw new Error("学校认证账号与提交账号不一致");
    state.stage = "mfa";
    state.username = schoolUser;
    const auths = Array.isArray(mfa.auths) ? mfa.auths.map((item) => String(record(item).type || "")) : [];
    const messageAuth = record(record(record(enhanced?.login).webCodeAuth).webWorkWechatMsgAuth);
    state.mfa = { type: mfaType, appId, appUrl, methodAvailable: auths.includes("webWorkWechatMsgAuth"),
      passwordRequired: messageAuth.staticPassword === "1" };
    state.updatedAt = Date.now();
    await this.storage.delete("courses");
    await this.storage.delete("sections");
    await this.storage.delete("sessionHealth");
    await this.storage.deleteAlarm();
    await this.storage.put("school", state);
    await this.persistAccount(state);
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
    }, mfaReferer(state));
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
    const storedMfa = state.mfa;
    const policy = storedMfa ? null : (await school.json(`${state.authPrefix}/esc-sso/authn/policy/enhance`)).body.data;
    const policyMfa = record(record(policy?.config).mfaAuth);
    const mfa = storedMfa || policyMfa;
    if (!storedMfa && policyMfa.status !== "1") throw new Error("学校认证步骤已过期，请重新登录");
    const app = storedMfa || record(policyMfa.app);
    const dataField: Record<string, string> = {
      username: state.username, password: "", msgCode: code, vcode: "",
    };
    // The school's MFA form checks the selected account and auth method before submitting.
    const check = (await school.json(
      `${state.authPrefix}/esc-sso/authn/user?username=${encodeURIComponent(state.username)}&authType=webWorkWechatMsgAuth`,
      "GET", undefined, mfaReferer(state),
    ).catch(() => null))?.body.data;
    if (check?.enable && check?.type) throw new Error("学校要求额外图形验证，请在学校官网完成认证");
    let endpoint = `${state.authPrefix}/esc-sso/auth/login`;
    if (Number(mfa.type) === 2) {
      // mfaLogin.html calls appLogin (/app/enhance/login) for type 2.
      endpoint = `${state.authPrefix}/esc-sso/app/enhance/login`;
      dataField.appId = String(app.appId || "");
      dataField.appUrl = String(app.appUrl || "");
    }
    let result: { data?: Record<string, unknown> };
    try {
      result = (await schoolStep("学校企业微信验证码验证", school.json(endpoint, "POST", {
        authType: "webWorkWechatMsgAuth", dataField, redirectUri: "",
      }, mfaReferer(state)))).body;
    } catch (error) {
      // A rejected OTP can still rotate school cookies. Keep that rotation for inspection/retry.
      await this.storage.put("school", state);
      throw error;
    }
    const redirect = schoolRedirect(result.data, state.authPrefix);
    if (!redirect) throw new Error("学校未返回认证完成后的跳转地址");
    // A successful OTP response and a successful webproxy gateway hop are separate events.
    // Keep the authenticated SSO cookies even when the VPN gateway rejects its last hop.
    let gatewayReady = false;
    try {
      const completed = await schoolStep("学校认证完成跳转", school.request(redirect, {
        headers: { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", Referer: mfaReferer(state) },
      }));
      gatewayReady = completed.response.ok
        && completed.url.pathname !== "/wengine-vpn/failed"
        && !/\/(?:identity\/login|login\/mfaLogin\.html|login)$/i.test(completed.url.pathname);
    } catch { /* The OTP was accepted, but the gateway still needs direct course-page verification. */ }
    state.stage = gatewayReady ? "ready" : "verified";
    state.updatedAt = Date.now();
    await this.storage.put("school", state);
    await this.persistAccount(state);
    await this.storage.delete("sessionHealth");
    await this.storage.delete("loginAttempts");
    return { login: { stage: state.stage, username: state.username },
      gatewayWarning: gatewayReady ? null : "学校已接受企业微信验证码，但网关跳转未完成。本站将自动查找课程页核实会话。" };
  }

  private async inspectMfa() {
    const state = await this.school();
    if (!state || state.stage !== "mfa" || !state.authPrefix) throw new Error("当前没有待完成的企业微信认证");
    const school = new SchoolHttp(state);
    const policyResponse = await school.json(`${state.authPrefix}/esc-sso/authn/policy/enhance`).catch((error) => ({ error: errorMessage(error) }));
    if ("error" in policyResponse) {
      await this.storage.put("school", state);
      return { diagnostic: { schoolError: policyResponse.error,
        methodAvailable: state.mfa?.methodAvailable ?? null, passwordRequired: state.mfa?.passwordRequired ?? null } };
    }
    const policy = policyResponse.body.data;
    const config = record(policy?.config);
    const current = record(config.mfaAuth);
    const app = record(current.app);
    const messageAuth = record(record(record(policy?.login).webCodeAuth).webWorkWechatMsgAuth);
    const auths = Array.isArray(current.auths) ? current.auths.map((item) => String(record(item).type || "")) : [];
    const challenge = (await school.json(
      `${state.authPrefix}/esc-sso/authn/user?username=${encodeURIComponent(state.username || "")}&authType=webWorkWechatMsgAuth`,
      "GET", undefined, mfaReferer(state),
    ).catch(() => null))?.body.data;
    await this.storage.put("school", state);
    return { diagnostic: {
      schoolStatus: String(current.status ?? "未知"),
      schoolType: Number(current.type),
      schoolSteps: Number(current.count),
      applicationParametersPresent: Boolean(app.appId && app.appUrl),
      applicationParametersMatch: Boolean(state.mfa && String(app.appId || "") === state.mfa.appId
        && String(app.appUrl || "") === state.mfa.appUrl),
      accountMatches: String(config.username || "") === state.username,
      sessionCookieCount: state.cookies.length,
      methodAvailable: auths.includes("webWorkWechatMsgAuth"),
      passwordRequired: messageAuth.staticPassword === "1",
      captchaRequired: challenge ? Boolean(challenge.enable && challenge.type) : null,
    } };
  }

  private async openCoursePage() {
    const state = await this.school();
    if (!state || state.stage === "passport") throw new Error("请先登录学校通行证");
    const school = new SchoolHttp(state);
    const candidates = new Set<string>();
    if (state.coursePageUrl) candidates.add(validateCoursePageUrl(state.coursePageUrl));
    let sawGatewayFailure = false;
    let sawLoginRedirect = false;
    // Read the live school's resource links so a rotated webproxy resource id does not need user input.
    try {
      const portal = await school.request("https://webproxy.dhu.edu.cn/");
      if (portal.url.pathname === "/wengine-vpn/failed") sawGatewayFailure = true;
      if (/\/(?:identity\/login|login\/mfaLogin\.html|login)$/i.test(portal.url.pathname)) sawLoginRedirect = true;
      if (portal.response.ok) {
        const portalHtml = await portal.response.text();
        for (const url of discoverCoursePageUrls(portalHtml)) candidates.add(url);
      }
    } catch { /* The known public resource link can still work if the portal is unavailable. */ }
    candidates.add(DHU_COURSE_SEED_URL);

    let coursePage: { url: URL; entryUrl: string; html: string } | null = null;
    for (const candidate of candidates) {
      try {
        const { url, response } = await school.request(candidate);
        if (url.pathname === "/wengine-vpn/failed") sawGatewayFailure = true;
        if (/\/(?:identity\/login|login\/mfaLogin\.html|login)$/i.test(url.pathname)) sawLoginRedirect = true;
        const html = await response.text();
        if (response.ok && url.pathname.includes("/dhu/selectcourse/") && html.includes("tsCoursesTbl")) {
          coursePage = { url, entryUrl: candidate, html };
          break;
        }
      } catch { /* Try the next school-provided course link. */ }
    }
    if (!coursePage) {
      await this.storage.put("school", state);
      if (sawGatewayFailure) throw new Error("学校网关拒绝了本站服务器会话，课程页未连接。验证码通过不等于学校 VPN 已放行");
      if (sawLoginRedirect) throw new Error("学校要求重新登录，当前会话尚不能访问课程页");
      throw new Error("学校课程页自动发现失败，当前会话尚不能读取选课列表");
    }
    const { url, html } = coursePage;
    // The course list itself is the strongest proof that webproxy and the academic system agree on this session.
    state.stage = "ready";
    state.coursePageUrl = coursePage.entryUrl;
    state.updatedAt = Date.now();
    await this.storage.put("courses", parseDhuCourseOptions(html));
    await this.storage.put("sections", parseDhuSectionOptions(html));
    await this.storage.put("sessionHealth", { checkedAt: Date.now(), active: true, loginRequired: false,
      message: "学校课程列表已连接" } satisfies DhuSessionHealth);
    const scriptSource = html.match(/<script[^>]+src=["']([^"']*selecthome\.js[^"']*)["']/i)?.[1];
    if (scriptSource) {
      try {
        const script = await school.request(new URL(scriptSource.replaceAll("&amp;", "&"), url.href).href);
        if (script.response.ok) {
          const source = await script.response.text();
          // Static school code only; never log HTML, cookies, credentials, or student data.
          console.log("DHU_SELECTHOME_SCRIPT", source.slice(0, 30_000));
        }
      } catch { /* Course page verification is independent of static script diagnostics. */ }
    }
    await this.storage.put("school", state);
    await this.persistAccount(state);
    await this.storage.setAlarm(Date.now() + SESSION_CHECK_MS);
    return { schoolSession: { savedAt: state.updatedAt, coursePageUrl: state.coursePageUrl } };
  }

  private async addTask(input: unknown) {
    const state = await this.school();
    if (state?.stage !== "ready" || !state.coursePageUrl || !state.username) throw new Error("请先连接学校课程列表");
    const task = normalizeDhuTask(input);
    const tasks = await this.tasks(state.username);
    if (tasks.some((item) => item.courseCode === task.courseCode && item.sectionNumber === task.sectionNumber
      && ["scheduled", "watching", "paused", "needs_login"].includes(item.status))) {
      throw new Error("该课程和班次已有未结束的预约意向");
    }
    // The live school's POST URL, fields, and success response have not been verified.
    // Save an explicit intent, but never imply it will be submitted automatically yet.
    task.status = "paused";
    task.nextAt = task.scheduledAt;
    task.attempts = 0;
    task.message = "预约意向已保存；学校提交接口待核验，自动提交尚未启用";
    await this.persistTask(state.username, task);
    await this.storage.put(`tasks:${state.username}`, [...tasks, task]);
    return { task, submissionReady: false };
  }

  private async cancelTask(input: unknown) {
    const id = String(record(input).id || "");
    const state = await this.school();
    const tasks = await this.tasks(state?.username);
    const task = tasks.find((item) => item.id === id);
    if (!task || !["scheduled", "watching", "needs_login", "paused"].includes(task.status)) throw new Error("预约不存在或已执行");
    task.status = "cancelled";
    task.message = "已取消";
    task.updatedAt = Date.now();
    if (state?.username) await this.storage.put(`tasks:${state.username}`, tasks);
    if (state?.username) await this.persistTask(state.username, task);
    if (state?.stage === "ready" && state.coursePageUrl) await this.storage.setAlarm(Date.now() + SESSION_CHECK_MS);
    else await this.storage.deleteAlarm();
    return { task };
  }

  async alarm() {
    const state = await this.school();
    const tasks = await this.tasks(state?.username);
    const now = Date.now();
    const recordKey = state?.username ? `submissionRecords:${state.username}` : null;
    const submissionRecords = recordKey ? await this.storage.get<DhuSubmissionRecord[]>(recordKey) || [] : [];
    let changed = false;
    for (const task of tasks) {
      if (!["scheduled", "watching", "submitted"].includes(task.status) || task.nextAt > now) continue;
      changed = true;
      if (task.scheduledAt > now) {
        task.status = "watching";
        task.nextAt = task.scheduledAt;
        task.message = "等待指定报名时间";
      } else if (!state || state.stage !== "ready" || !state.coursePageUrl) {
        task.status = "needs_login";
        task.message = "学校会话未就绪，未发送报名请求";
      } else if (planDhuSubmission(task, now).action === "wait") {
        task.status = "watching";
        task.nextAt = Math.max(task.scheduledAt, (task.lastAttemptAt || 0) + RETRY_INTERVAL_MS);
      } else if ((task.attempts || 0) >= MAX_SUBMISSION_ATTEMPTS) {
        task.status = "failed";
        task.message = "已达到最多 10 次提交尝试";
      } else {
        // The protocol guard is deliberate: we have not observed the school's
        // authenticated submit request, so there is no safe network request to send.
        const recordId = `${task.id}:not-sent`;
        if (recordKey && !submissionRecords.some((item) => item.id === recordId)) {
          const item: DhuSubmissionRecord = {
            id: recordId, username: state.username || "", taskId: task.id,
            courseCode: task.courseCode, sectionNumber: task.sectionNumber,
            buyMaterial: task.buyMaterial, scheduledAt: task.scheduledAt, recordedAt: now,
            outcome: "not_sent", message: "学校提交接口未验证，没有向学校发送报名请求",
          };
          submissionRecords.push(item);
          await this.persistRecord(item);
        }
        task.status = "paused";
        task.message = "学校提交接口待核验，预约未提交";
      }
      task.updatedAt = now;
      if (state?.username) await this.persistTask(state.username, task);
    }
    if (changed) {
      if (recordKey) await this.storage.put(recordKey, submissionRecords);
      if (state?.username) await this.storage.put(`tasks:${state.username}`, tasks);
    }
    const nextTaskAt = Math.min(...tasks.filter((task) => ["scheduled", "watching", "submitted"].includes(task.status))
      .map((task) => task.nextAt));
    if (!state || state.stage !== "ready" || !state.coursePageUrl) {
      if (Number.isFinite(nextTaskAt)) await this.storage.setAlarm(nextTaskAt);
      return;
    }
    const school = new SchoolHttp(state);
    let health: DhuSessionHealth;
    let nextCheck = SESSION_CHECK_MS;
    try {
      const { url, response } = await school.request(state.coursePageUrl);
      const html = await response.text();
      const validAddress = url.pathname.includes("/dhu/selectcourse/");
      if (!response.ok || !validAddress || !html.includes("tsCoursesTbl")) {
        health = { checkedAt: Date.now(), active: false, loginRequired: true,
          message: "学校会话已失效，请重新完成学校通行证和企业微信认证" };
      } else {
        health = { checkedAt: Date.now(), active: true, loginRequired: false, message: "学校课程列表可访问" };
        state.updatedAt = Date.now();
      }
    } catch {
      health = { checkedAt: Date.now(), active: false, loginRequired: false,
        message: "暂时无法检查学校会话，系统将稍后重试" };
      nextCheck = SESSION_RETRY_MS;
    }
    await this.storage.put("school", state);
    await this.persistAccount(state);
    await this.storage.put("sessionHealth", health);
    if (health.loginRequired && state.username) {
      for (const task of tasks) {
        if (!["scheduled", "watching", "submitted"].includes(task.status)) continue;
        task.status = "needs_login";
        task.message = "学校会话已失效，需重新完成学校认证后才能报名";
        task.updatedAt = Date.now();
        await this.persistTask(state.username, task);
      }
      await this.storage.put(`tasks:${state.username}`, tasks);
    }
    if (!health.loginRequired) await this.storage.setAlarm(Math.min(Date.now() + nextCheck, nextTaskAt));
  }
}

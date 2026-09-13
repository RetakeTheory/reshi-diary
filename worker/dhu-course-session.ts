import { DurableObject } from "cloudflare:workers";
import { acquire, connect, launch, type BrowserContextOptions } from "@cloudflare/playwright";
import {
  classifySchoolResult, DHU_LOGIN_URL, isSchoolCoursePage, normalizeDhuTask,
  RETRY_INTERVAL_MS, WATCH_WINDOW_MS, type DhuTask,
} from "../lib/dhu-course";

type LoginSession = { id: string; liveUrl: string; expiresAt: number };
type SavedAuth = { state: BrowserContextOptions["storageState"]; coursePageUrl: string; savedAt: number };
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

export class DhuCourseSession extends DurableObject<Cloudflare.Env> {
  private readonly running = new Set<string>();
  private get storage() { return (this.ctx as unknown as { storage: CourseStorage }).storage; }
  private async tasks() { return await this.storage.get<DhuTask[]>("tasks") || []; }

  private async schedule(tasks: DhuTask[]) {
    const next = tasks.filter((task) => task.status === "scheduled" || task.status === "watching")
      .reduce<number | null>((earliest, task) => earliest === null ? task.nextAt : Math.min(earliest, task.nextAt), null);
    if (next === null) await this.storage.deleteAlarm();
    else await this.storage.setAlarm(Math.max(Date.now() + 1000, next));
  }

  private async summary() {
    const [tasks, auth, login] = await Promise.all([
      this.tasks(), this.storage.get<SavedAuth>("auth"), this.storage.get<LoginSession>("login"),
    ]);
    return { tasks, schoolSession: auth ? { savedAt: auth.savedAt, coursePageUrl: auth.coursePageUrl } : null,
      login: login && login.expiresAt > Date.now() ? login : null };
  }

  async fetch(request: Request) {
    const path = new URL(request.url).pathname;
    try {
      if (request.method === "GET" && path === "/status") return json(await this.summary());
      if (request.method !== "POST") return json({ error: "方法不支持" }, 405);
      if (path === "/login/start") return json(await this.startLogin());
      if (path === "/login/finish") return json(await this.finishLogin());
      if (path === "/task") {
        const input = await request.json();
        const task = normalizeDhuTask(input);
        const auth = await this.storage.get<SavedAuth>("auth");
        if (!auth) return json({ error: "请先完成学校登录并打开课程列表" }, 400);
        task.coursePageUrl = auth.coursePageUrl;
        const tasks = await this.tasks();
        if (tasks.filter((item) => item.status === "scheduled" || item.status === "watching").length >= 10) {
          return json({ error: "最多同时预约 10 门课程" }, 400);
        }
        tasks.push(task);
        await this.storage.put("tasks", tasks);
        await this.schedule(tasks);
        return json({ task }, 201);
      }
      if (path === "/task/cancel") {
        const { id } = await request.json() as { id?: string };
        const tasks = await this.tasks();
        const task = tasks.find((item) => item.id === id);
        if (!task || !["scheduled", "watching", "needs_login"].includes(task.status)) return json({ error: "预约不存在或已执行" }, 404);
        if (this.running.has(task.id)) return json({ error: "学校提交正在执行，暂不能取消" }, 409);
        task.status = "cancelled"; task.message = "已取消"; task.updatedAt = Date.now();
        await this.storage.put("tasks", tasks);
        await this.schedule(tasks);
        return json({ task });
      }
      return json({ error: "路径不存在" }, 404);
    } catch (error) {
      return json({ error: errorMessage(error) }, 400);
    }
  }

  private async startLogin() {
    const previous = await this.storage.get<LoginSession>("login");
    if (previous && previous.expiresAt > Date.now()) {
      try {
        const existing = await connect(this.env.BROWSER, previous.id);
        try {
          const page = existing.contexts().flatMap((context) => context.pages()).at(-1);
          if (!page) throw new Error("登录窗口已关闭");
          const cdp = await page.context().newCDPSession(page);
          const { devtoolsFrontendUrl } = await (cdp.send as unknown as (method: string, params: Record<string, unknown>) => Promise<{ devtoolsFrontendUrl: string }>)(
            "Cloudflare.getLiveView", { mode: "full", expiresInMs: 600_000 });
          const login = { ...previous, liveUrl: devtoolsFrontendUrl, expiresAt: Date.now() + 600_000 };
          await this.storage.put("login", login);
          return { login };
        } finally { await existing.close(); }
      } catch { await this.storage.delete("login"); }
    }
    const { sessionId } = await acquire(this.env.BROWSER, { keep_alive: 120_000 });
    const browser = await connect(this.env.BROWSER, sessionId);
    try {
      const context = browser.contexts()[0];
      if (!context) throw new Error("学校登录窗口无法初始化");
      const page = await context.newPage();
      await page.goto(DHU_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 25_000 });
      const cdp = await page.context().newCDPSession(page);
      const { devtoolsFrontendUrl } = await (cdp.send as unknown as (method: string, params: Record<string, unknown>) => Promise<{ devtoolsFrontendUrl: string }>)(
        "Cloudflare.getLiveView", { mode: "full", expiresInMs: 600_000 });
      const login = { id: sessionId, liveUrl: devtoolsFrontendUrl, expiresAt: Date.now() + 600_000 };
      await this.storage.put("login", login);
      return { login };
    } finally { await browser.close(); }
  }

  private async finishLogin() {
    const login = await this.storage.get<LoginSession>("login");
    if (!login || login.expiresAt <= Date.now()) throw new Error("登录窗口已过期，请重新打开");
    let browser;
    try { browser = await connect(this.env.BROWSER, login.id); }
    catch { await this.storage.delete("login"); throw new Error("登录窗口已关闭，请重新打开"); }
    try {
      const pages = browser.contexts().flatMap((context) => context.pages());
      const page = pages.find((item) => item.url().includes("/dhu/selectcourse/")) || pages.at(-1);
      if (!page) throw new Error("登录窗口不存在");
      await page.locator("#enrollCoursesTbl").waitFor({ state: "attached", timeout: 10_000 }).catch(() => undefined);
      const hasList = await page.locator("#enrollCoursesTbl").count() > 0;
      if (!isSchoolCoursePage(page.url(), hasList)) {
        throw new Error("请先在窗口内完成学校登录，并打开目标课程类别的课程列表");
      }
      const auth: SavedAuth = {
        state: await page.context().storageState({ indexedDB: true }),
        coursePageUrl: page.url(), savedAt: Date.now(),
      };
      await this.storage.put("auth", auth);
      await this.storage.delete("login");
      const tasks = await this.tasks();
      for (const task of tasks) if (task.status === "needs_login" && task.scheduledAt + WATCH_WINDOW_MS > Date.now()) {
        task.status = "watching"; task.nextAt = Date.now() + 1000;
        task.message = "登录已恢复，等待重试"; task.updatedAt = Date.now();
      }
      await this.storage.put("tasks", tasks);
      await this.schedule(tasks);
      return { schoolSession: { savedAt: auth.savedAt, coursePageUrl: auth.coursePageUrl } };
    } finally { await browser.close(); }
  }

  async alarm() {
    const tasks = await this.tasks();
    const now = Date.now();
    const due = tasks.filter((task) => ["scheduled", "watching"].includes(task.status) && task.nextAt <= now + 1000)
      .sort((a, b) => a.scheduledAt - b.scheduledAt);
    for (const task of due) {
      if ((await this.tasks()).find((current) => current.id === task.id)?.status === "cancelled") continue;
      this.running.add(task.id);
      try {
        try { await this.runTask(task); }
        catch (error) {
          if (/429|500|超时|timeout|暂不可用/i.test(errorMessage(error))) this.retry(task, "学校或浏览器服务暂时不可用，稍后重试");
          else { task.status = "failed"; task.message = errorMessage(error); task.updatedAt = Date.now(); }
        }
        const latest = await this.tasks();
        const index = latest.findIndex((current) => current.id === task.id);
        if (index >= 0 && latest[index].status !== "cancelled") latest[index] = task;
        await this.storage.put("tasks", latest);
      } finally { this.running.delete(task.id); }
    }
    await this.schedule(await this.tasks());
  }

  private async runTask(task: DhuTask) {
    if (Date.now() < task.scheduledAt - 30_000) { await this.preflight(task); return; }
    const auth = await this.storage.get<SavedAuth>("auth");
    if (!auth) {
      task.status = "needs_login"; task.message = "学校登录状态不可用，请重新验证"; task.updatedAt = Date.now();
      return;
    }
    const browser = await launch(this.env.BROWSER);
    try {
      const context = await browser.newContext({ storageState: auth.state });
      const page = await context.newPage();
      await page.goto(task.coursePageUrl || auth.coursePageUrl, { waitUntil: "domcontentloaded", timeout: 25_000 });
      await page.locator("#enrollCoursesTbl").waitFor({ state: "attached", timeout: 10_000 }).catch(() => undefined);
      const hasList = await page.locator("#enrollCoursesTbl").count() > 0;
      if (!isSchoolCoursePage(page.url(), hasList)) {
        task.status = "needs_login"; task.message = "学校会话已过期，请在后台重新完成学校验证"; task.updatedAt = Date.now();
        await this.storage.delete("auth");
        return;
      }
      const rows = page.locator("#enrollCoursesTbl tbody tr");
      let courseRow = null;
      for (let index = 0; index < await rows.count(); index += 1) {
        const row = rows.nth(index);
        if ((await row.locator("td").nth(1).innerText()).trim() === task.courseCode) { courseRow = row; break; }
      }
      if (!courseRow) throw new Error("当前课程类别中找不到该课程编号，请重新登录并打开对应类别列表");
      await courseRow.locator("td").first().locator("a").click();
      await page.locator("#accessClassTbl tbody tr a").first().waitFor({ state: "visible", timeout: 10_000 });
      const sections = page.locator("#accessClassTbl tbody tr");
      let section = null;
      for (let index = 0; index < await sections.count(); index += 1) {
        const row = sections.nth(index);
        const link = row.locator("td").first().locator("a");
        if (await link.count() && (await link.innerText()).trim() === task.sectionNumber) { section = link; break; }
      }
      if (!section) { this.retry(task, "暂未找到选课序号"); return; }
      await section.click();
      const details = page.locator("#accessClassTbl td.details .table_detail").last();
      if (!await details.count()) { this.retry(task, "学校暂未开放确认入口"); return; }
      const cells = details.locator("tr").last().locator("td");
      if ((await cells.nth(0).innerText()).trim() !== task.sectionNumber || (await cells.nth(1).innerText()).trim() !== task.courseCode) {
        throw new Error("学校确认信息与预约课程不一致，已停止提交");
      }
      const confirm = details.locator('td[onclick*="selectSubmit"]');
      if (!await confirm.count() || (await confirm.innerText()).includes("已满")) { this.retry(task, "班次已满，继续监听"); return; }
      await details.locator('input[name="buyMaterial"]').setChecked(task.buyMaterial);
      const wait = task.scheduledAt - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(wait, 15_000)));
      let dialog = "";
      page.on("dialog", async (event) => { dialog = event.message(); await event.accept(); });
      const responsePromise = page.waitForResponse((response) => response.url().includes("/dhu/selectcourse/")
        && ["POST", "PUT"].includes(response.request().method()), { timeout: 10_000 }).catch(() => null);
      await confirm.click();
      const response = await responsePromise;
      const responseText = response ? (await response.text().catch(() => "")).slice(0, 1500) : "";
      const result = classifySchoolResult([dialog, responseText]);
      if (result === "failed" && /已满|名额/.test(dialog + responseText)) { this.retry(task, "班次已满，继续监听"); return; }
      task.status = result === "unknown" ? "submitted" : result;
      task.message = result === "success" ? "学校返回报名成功" : result === "failed" ? (dialog || "学校拒绝本次报名") : "已向学校提交，请核对本人选课结果";
      task.updatedAt = Date.now();
      await this.storage.put("auth", { ...auth, state: await context.storageState({ indexedDB: true }), savedAt: Date.now() });
    } finally { await browser.close(); }
  }

  private async preflight(task: DhuTask) {
    const auth = await this.storage.get<SavedAuth>("auth");
    if (!auth) {
      task.status = "needs_login"; task.message = "请重新完成学校验证"; task.updatedAt = Date.now();
      return;
    }
    const browser = await launch(this.env.BROWSER);
    try {
      const context = await browser.newContext({ storageState: auth.state });
      const page = await context.newPage();
      await page.goto(task.coursePageUrl || auth.coursePageUrl, { waitUntil: "domcontentloaded", timeout: 25_000 });
      await page.locator("#enrollCoursesTbl").waitFor({ state: "attached", timeout: 10_000 }).catch(() => undefined);
      const valid = isSchoolCoursePage(page.url(), await page.locator("#enrollCoursesTbl").count() > 0);
      if (!valid) {
        task.status = "needs_login"; task.message = "学校会话已过期，请在报名时间前重新验证";
        await this.storage.delete("auth");
      } else {
        task.status = "scheduled"; task.message = "学校登录有效，等待报名时间";
        task.nextAt = task.scheduledAt - 15_000;
        await this.storage.put("auth", { ...auth, state: await context.storageState({ indexedDB: true }), savedAt: Date.now() });
      }
      task.updatedAt = Date.now();
    } finally { await browser.close(); }
  }

  private retry(task: DhuTask, message: string) {
    const now = Date.now();
    task.status = now + RETRY_INTERVAL_MS > task.scheduledAt + WATCH_WINDOW_MS ? "failed" : "watching";
    task.message = task.status === "failed" ? `${message}；监听时段已结束` : message;
    task.nextAt = now + RETRY_INTERVAL_MS;
    task.updatedAt = now;
  }
}

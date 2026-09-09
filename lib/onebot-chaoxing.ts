import { ChaoxingClient, CxError, parseLocation, parseRegistration, type CxSession, type CxLocation } from "./chaoxing-client.ts";
export interface CxStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  list<T>(options: { prefix: string; limit?: number }): Promise<Map<string,T>>;
}
type Account = { session: CxSession; location?: CxLocation; enabled: boolean; nextAt: number; refreshedAt: number;
  cursor: number; failures: number; receipts: Record<string,string>; outbox: string[]; lastStatus: string };
export const CX_MENU = ["QQ Bot 菜单", "10分钟后提醒我 喝水", "明天 08:00 提醒我 上课", "/register 手机号 密码", "登录并开启监听（仅私聊）", "/location 纬度 经度 地址", "设置定位签到的位置", "/status 查看监听状态", "/stop 暂停  /start 继续", "/unregister 删除登录资料", "普通、已设位置签到自动提交", "其他验证方式发送提醒", "注册消息发出后请立即撤回"].join("\n");
export class OneBotChaoxing {
  private storage: CxStorage;
  private send: (qq: string, text: string, image?: boolean) => Promise<void>;
  private client: (session?: CxSession) => ChaoxingClient;
  private locks = new Map<string, Promise<unknown>>();
  constructor(storage: CxStorage, send: (qq: string, text: string, image?: boolean) => Promise<void>,
    client = (session?: CxSession) => new ChaoxingClient(session?.cookies)) {
    this.storage = storage; this.send = send; this.client = client;
  }
  private async serial<T>(qq: string, task: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(qq) || Promise.resolve();
    const current = previous.catch(() => {}).then(task);
    this.locks.set(qq, current);
    try { return await current; } finally { if (this.locks.get(qq) === current) this.locks.delete(qq); }
  }
  async command(qq: string, text: string, group: boolean, replyGroup: (text: string, image?: boolean) => Promise<void>) {
    if (!/^\/(help|register|location|status|stop|start|unregister)(?:$|\s|\+)/.test(text)) return false;
    if (group) {
      if (text === "/help") await replyGroup(CX_MENU, true);
      else await replyGroup(/^\/register/.test(text) ? "请立即撤回含手机号和密码的消息！注册仅支持私聊机器人。" : "请私聊机器人使用 /help 查看菜单和设置学习通。");
      return true;
    }
    if (/^\/register(?:$|\s|\+)/.test(text)) await this.send(qq, "请立即撤回刚才的注册消息，保护手机号和密码。机器人不会保存密码；撤回不会影响登录处理。");
    // Read-only commands must not wait behind a slow upstream poll or login.
    if (text === "/help") {
      await this.send(qq, CX_MENU, true);
      return true;
    }
    if (text === "/status") {
      const account = await this.storage.get<Account>("cx:account:" + qq);
      if (!account) await this.send(qq, "尚未绑定，请私聊 /register 手机号 密码");
      else await this.send(qq, (account.enabled ? "监听中" : "已暂停") + "\n课程数：" + account.session.courses.length +
        "\n位置：" + (account.location ? "已设置" : "未设置") + "\n" + account.lastStatus, true);
      return true;
    }
    await this.serial(qq, async () => {
      try {
        const key = "cx:account:" + qq;
        const account = await this.storage.get<Account>(key);
        if (/^\/register(?:$|\s|\+)/.test(text)) {
          const credentials = parseRegistration(text);
          if (!credentials) { await this.send(qq, "格式：/register 手机号 密码，或 /register+手机号+密码"); return; }
          const rateKey = "cx:login:" + qq, last = await this.storage.get<number>(rateKey) || 0;
          if (Date.now() - last < 60_000) { await this.send(qq, "请等待一分钟再尝试登录"); return; }
          if (!account && (await this.storage.list({ prefix: "cx:account:", limit: 20 })).size >= 20) {
            await this.send(qq, "当前机器人已达到 20 个监听账号上限"); return;
          }
          await this.storage.put(rateKey, Date.now());
          const session = await this.client().login(credentials.phone, credentials.password);
          await this.storage.put<Account>(key, { session, location: account?.location, enabled: true, nextAt: Date.now(), refreshedAt: Date.now(),
            cursor: 0, failures: 0, receipts: {}, outbox: [], lastStatus: "登录成功，等待首次检查" });
          await this.send(qq, "登录成功，已开启监听。检测到 " + session.courses.length + " 门根目录课程。普通签到自动提交；定位签到请先 /location。", true);
          return;
        }
        if (text === "/unregister") {
          await this.storage.delete(key); await this.storage.delete("cx:login:" + qq);
          await this.send(qq, "已停止监听并删除保存的登录会话、位置和签到记录"); return;
        }
        if (!account) { await this.send(qq, "尚未绑定，请私聊 /register 手机号 密码"); return; }
        if (text === "/stop") account.enabled = false;
        else if (text === "/start") { account.enabled = true; account.nextAt = Date.now(); account.failures = 0; }
        else if (text.startsWith("/location")) {
          const location = parseLocation(text);
          if (!location) { await this.send(qq, "格式：/location 纬度 经度 地址；纬度 -90～90，经度 -180～180"); return; }
          account.location = location; account.nextAt = Date.now();
          for (const [id,result] of Object.entries(account.receipts)) if (result.startsWith("需要位置")) delete account.receipts[id];
        } else { await this.send(qq, "命令格式有误，请发送 /help"); return; }
        await this.storage.put(key, account);
        await this.send(qq, text === "/stop" ? "已暂停监听" : text === "/start" ? "已继续监听" : "位置已保存，将携带 latitude、longitude 和 address 提交定位签到");
      } catch (error) { await this.send(qq, error instanceof CxError ? error.message : "处理失败，请稍后重试；密码未保存"); }
    });
    return true;
  }
  async nextAt() {
    const accounts = await this.storage.list<Account>({ prefix: "cx:account:", limit: 20 });
    const times = [...accounts.values()].filter(a => a.enabled || a.outbox.length).map(a => a.nextAt);
    return times.length ? Math.min(...times) : null;
  }
  async poll(now = Date.now()) {
    const accounts = await this.storage.list<Account>({ prefix: "cx:account:", limit: 20 });
    // One due account per invocation bounds upstream work and lets QQ events continue.
    const due = [...accounts].filter(([,a]) => (a.enabled || a.outbox.length) && a.nextAt <= now).sort((a,b) => a[1].nextAt-b[1].nextAt)[0];
    if (!due) return this.nextAt();
    const [key] = due, qq = key.slice("cx:account:".length);
    await this.serial(qq, async () => {
      const account = await this.storage.get<Account>(key);
      if (!account || (!account.enabled && !account.outbox.length) || account.nextAt > now) return;
      account.nextAt = now + 60_000;
      await this.storage.put(key, account);
      try {
        if (account.enabled && account.outbox.length < 10) {
          const client = this.client(account.session);
          if (now - account.refreshedAt > 15 * 60_000) { account.session.courses = await client.courses(); account.refreshedAt = now; }
          const courses = account.session.courses;
          const batch = Array.from({ length: Math.min(courses.length, 10) }, (_,i) => courses[(account.cursor + i) % courses.length]);
          account.cursor = courses.length ? (account.cursor + batch.length) % courses.length : 0;
          for (const course of batch) {
            for (const activity of (await client.activities(course)).slice(0, 5)) {
              const eventId = activity.id;
              if (account.receipts[eventId]) continue;
              const result = await client.sign(activity, account.location);
              account.receipts[eventId] = result;
              const entries = Object.entries(account.receipts).slice(-200);
              account.receipts = Object.fromEntries(entries);
              account.outbox.push(activity.name + "\n活动 " + activity.id + "\n" + result);
              // Commit the result BEFORE notification so delivery retries never resubmit a successful check-in.
              account.session.cookies = client.cookies;
              await this.storage.put(key, account);
              if (account.outbox.length >= 10) break;
            }
            if (account.outbox.length >= 10) break;
          }
          account.session.cookies = client.cookies;
          account.failures = 0;
          account.lastStatus = "最近检查：" + new Date(now).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
        }
      } catch (error) {
        account.failures++;
        account.lastStatus = error instanceof CxError ? error.message : "检查失败，请稍后重试";
        account.nextAt = now + Math.min(15 * 60_000, 60_000 * 2 ** Math.min(account.failures,4));
        if (account.lastStatus.includes("登录已失效")) account.enabled = false;
        if (account.failures === 1 || !account.enabled) account.outbox.push(account.lastStatus);
      }
      await this.storage.put(key, account);
      while (account.outbox.length) {
        try { await this.send(qq, account.outbox[0], true); } catch { break; }
        account.outbox.shift(); await this.storage.put(key, account);
      }
    });
    return this.nextAt();
  }
}

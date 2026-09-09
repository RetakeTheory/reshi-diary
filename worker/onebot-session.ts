import { DurableObject } from "cloudflare:workers";
import { jsonId, processOneBotEvent, type OneBotPayload } from "../lib/onebot-cloudflare";
import { dispatchScheduledForBot } from "../lib/onebot-scheduler";

import { OneBotChaoxing, type CxStorage, CX_MENU } from "../lib/onebot-chaoxing";
import { sendOneBotReply } from "../lib/onebot-reply";
import { groupReminderCommand, oneBotMessageText } from "../lib/onebot-reminder";

type SocketAttachment = { botId: string; verified: boolean };
type PendingCall = {
  resolve(value: OneBotPayload): void;
  reject(reason: Error): void;
  timeout: ReturnType<typeof setTimeout>;
};
const ONEBOT_ACTION_ACK_GRACE_MS = 800;
type SchedulerStorage = {
  put(key: string, value: string): Promise<void>;
  get<T>(key: string): Promise<T | undefined>;
  delete(key: string): Promise<boolean>;
  getAlarm(): Promise<number | null>;
  setAlarm(timestamp: number): Promise<void>;
  deleteAlarm(): Promise<void>;
};

function socketAttachment(socket: WebSocket): SocketAttachment | null {
  const value = socket.deserializeAttachment();
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<SocketAttachment>;
  return typeof candidate.botId === "string" && typeof candidate.verified === "boolean"
    ? { botId: candidate.botId, verified: candidate.verified }
    : null;
}

export class OneBotSession extends DurableObject<Cloudflare.Env> {
  private readonly chaoxing = new OneBotChaoxing(
    (this.ctx as unknown as { storage: CxStorage }).storage,
    async (qq, text, image) => {
      await sendOneBotReply((action, params) => this.call(action, params), "private", qq, text, image ? async () => {
        const { renderOneBotReminderCard } = await import("../lib/onebot-reminder-card");
        return renderOneBotReminderCard({ text, title: "学习通助手", menu: text === CX_MENU, dueAt: Date.now() });
      } : undefined);
    },
  );
  private dueTask: Promise<{ sent: number; nextAt: number | null }> | null = null;
  private readonly pending = new Map<string, PendingCall>();

  async fetch(request: Request) {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    const botId = request.headers.get("x-reshi-onebot-id") || "";
    if (!/^\d{5,20}$/.test(botId)) return new Response("Unauthorized", { status: 401 });

    this.rejectPending("QQ Bot 连接已被新会话替换");
    for (const socket of this.ctx.getWebSockets()) socket.close(1012, "Bot connection replaced");
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    // The Worker already authenticated the reverse-WebSocket token before it
    // forwarded this request, so the socket can accept calls immediately.
    server.serializeAttachment({ botId, verified: true } satisfies SocketAttachment);
    this.ctx.acceptWebSocket(server, [`bot:${botId}`]);
    return new Response(null, { status: 101, webSocket: client });
  }

  async isOnline() {
    return this.verifiedSockets().length > 0;
  }

  async call(action: string, params: OneBotPayload) {
    const socket = this.verifiedSockets()[0];
    if (!socket) throw new Error("QQ Bot 当前未连接");
    const echo = crypto.randomUUID().replaceAll("-", "");
    const result = new Promise<OneBotPayload>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(echo);
        // Some OneBot 11 implementations execute reverse-WebSocket actions but
        // never return an echo response. A successful socket write is the only
        // acknowledgement available in that mode, so do not turn every command
        // into a false 20-second timeout or resend it as a failure.
        resolve({ status: "ok", retcode: 0, data: { accepted: true } });
      }, ONEBOT_ACTION_ACK_GRACE_MS);
      this.pending.set(echo, { resolve, reject, timeout });
    });
    try {
      socket.send(JSON.stringify({ action, params, echo }));
    } catch {
      const pending = this.pending.get(echo);
      if (pending) clearTimeout(pending.timeout);
      this.pending.delete(echo);
      throw new Error("QQ Bot 连接已断开");
    }
    return result;
  }

  async disconnect(reason = "配置已更新") {
    for (const socket of this.ctx.getWebSockets()) socket.close(1012, reason.slice(0, 120));
    this.rejectPending("QQ Bot 连接已断开");
  }

  async scheduleWake(botId: string, dueAt: number) {
    if (!/^\d{5,20}$/.test(botId) || !Number.isFinite(dueAt)) throw new Error("定时任务无效");
    const storage = this.schedulerStorage();
    await storage.put("schedulerBotId", botId);
    const current = await storage.getAlarm();
    if (current === null || current <= Date.now() || dueAt < current) await storage.setAlarm(Math.max(Date.now() + 1000, dueAt));
  }

  async processDue(botId: string, now = Date.now()) {
    if (this.dueTask) return this.dueTask;
    const task = this.processAllDue(botId, now);
    this.dueTask = task;
    try { return await task; } finally { this.dueTask = null; }
  }

  private async processAllDue(botId: string, now: number) {
    await this.keepAlive(botId);
    const result = await dispatchScheduledForBot(botId, (action, params) => this.call(action, params), now);
    const bot = await this.env.DB.prepare("SELECT enabled FROM onebot_bots WHERE bot_id = ?").bind(botId).first<{ enabled: number }>();
    const cxNext = bot?.enabled ? await this.chaoxing.poll(now) : null;
    if (cxNext !== null) result.nextAt = Math.min(result.nextAt ?? Infinity, Math.max(Date.now() + 5000, cxNext));
    if (result.nextAt !== null) await this.scheduleWake(botId, result.nextAt);
    else {
      const storage = this.schedulerStorage();
      await storage.deleteAlarm();
      await storage.delete("schedulerBotId");
    }
    return result;
  }

  private async keepAlive(botId: string) {
    if (!this.verifiedSockets().length) return;
    try {
      const response = await this.call("get_status", {});
      if (response.status && response.status !== "ok") {
        console.warn(JSON.stringify({ event: "onebot_keepalive_rejected", botId, retcode: Number(response.retcode) }));
      }
    } catch (error) {
      console.warn(JSON.stringify({ event: "onebot_keepalive_failed", botId,
        reason: error instanceof Error ? error.message : "unknown" }));
    }
  }

  async alarm() {
    const storage = this.schedulerStorage();
    const botId = await storage.get<string>("schedulerBotId");
    if (!botId) return;
    try {
      await this.processDue(botId);
    } catch (error) {
      console.error(JSON.stringify({ event: "onebot_alarm_failed", botId, reason: error instanceof Error ? error.message : "unknown" }));
      await storage.setAlarm(Date.now() + 60_000);
    }
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") return;
    let payload: OneBotPayload;
    try {
      const parsed: unknown = JSON.parse(message);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
      payload = parsed as OneBotPayload;
    } catch {
      return;
    }

    const attachment = socketAttachment(socket);
    if (!attachment) {
      socket.close(1008, "Missing Bot connection identity");
      return;
    }
    const payloadSelfId = jsonId(payload.self_id);
    if (payloadSelfId && payloadSelfId !== attachment.botId) {
      socket.close(1008, "self_id does not match configured Bot");
      return;
    }

    const echo = typeof payload.echo === "string" ? payload.echo
      : typeof payload.echo === "number" || typeof payload.echo === "boolean" ? String(payload.echo)
        : "";
    const pending = echo ? this.pending.get(echo) : null;
    if (pending) {
      clearTimeout(pending.timeout);
      this.pending.delete(echo);
      pending.resolve(payload);
      return;
    }

    // OneBot action responses normally contain echo/status/retcode but no
    // self_id. Only event payloads can establish or update Bot identity.
    if (!payloadSelfId) return;
    if (!attachment.verified) {
      socket.serializeAttachment({ ...attachment, verified: true } satisfies SocketAttachment);
    }

    this.ctx.waitUntil(this.processEvent(attachment.botId, payload));
  }

  private async processEvent(botId: string, payload: OneBotPayload) {
    if (payload.post_type === "message" && jsonId(payload.user_id) === botId) {
      // Some OneBot implementations report the bot's own outgoing message as
      // a normal message event. Ignore it to prevent self-reply loops.
      return;
    }
    const targetType = payload.message_type === "group" ? "group" : "private";
    const targetId = jsonId(targetType === "group" ? payload.group_id : payload.user_id);
    const rawText = oneBotMessageText(Array.isArray(payload.message) ? undefined : payload.raw_message, payload.message);
    const commandText = targetType === "group" ? groupReminderCommand(rawText, botId) : rawText;
    const isReminderCommand = commandText.includes("提醒我");
    const isExplicitCommand = commandText.startsWith("/") || /^(绑定|验证|登录|注册)/.test(commandText.trim());
    const canReply = payload.post_type === "message" && ["private", "group"].includes(String(payload.message_type))
      && /^\d{5,20}$/.test(targetId) && Number.isSafeInteger(Number(targetId));
    const sendText = (text: string) => sendOneBotReply((action, params) => this.call(action, params), targetType, targetId, text);
    const slowNotice = canReply && commandText && !commandText.startsWith("/register")
      ? setTimeout(() => { void sendText("正在处理，请稍候；如长时间没有结果，可发送 /status 查询。").catch(() => {}); }, 3000) : null;
    try {
      const qq = jsonId(payload.user_id);
      if (payload.post_type === "message" && ["private", "group"].includes(String(payload.message_type))
        && /^\d{5,20}$/.test(qq) && Number.isSafeInteger(Number(qq))) {
        const handled = await this.chaoxing.command(qq, commandText, targetType === "group", async (text, image) => {
          if (!/^\d{5,20}$/.test(targetId) || !Number.isSafeInteger(Number(targetId))) return;
          await sendOneBotReply((action, params) => this.call(action, params), "group", targetId, text, image ? async () => {
            const { renderOneBotReminderCard } = await import("../lib/onebot-reminder-card");
            return renderOneBotReminderCard({ text, title: "QQ Bot 菜单", menu: true, dueAt: Date.now() });
          } : undefined);
        });
        if (handled) {
          const next = await this.chaoxing.nextAt();
          if (next !== null) {
            await this.scheduleWake(botId, next).catch((error) => console.warn(JSON.stringify({
              event: "onebot_chaoxing_alarm_schedule_failed", botId,
              reason: error instanceof Error ? error.message : "unknown",
            })));
          }
          return;
        }
      }
      const reply = await processOneBotEvent(botId, payload);
      if (!reply) {
        if (canReply && isReminderCommand) {
          await sendText("没有识别到提醒时间。示例：10分钟后提醒我 喝水，或 明天 08:00 提醒我 上课。");
        } else if (canReply && commandText.startsWith("/")) {
          await sendText("未识别的命令，请发送 /help 查看菜单。");
        }
        return;
      }
      const isGroup = reply.targetType === "group";
      const outgoingMessage = isGroup && reply.mentionUserId
        ? [{ type: "at", data: { qq: reply.mentionUserId } }, { type: "text", data: { text: ` ${reply.reply}` } }]
        : reply.reply;
      const action = isGroup ? "send_group_msg" : "send_private_msg";
      const response = await this.call(action, {
        ...(isGroup ? { group_id: Number(reply.targetId) } : { user_id: Number(reply.targetId) }),
        message: outgoingMessage,
        auto_escape: !isGroup,
      });
      if (response.status !== "ok" || Number(response.retcode) !== 0) {
        console.error(JSON.stringify({ event: "onebot_event_reply_failed", botId, targetType: reply.targetType,
          targetId: reply.targetId, retcode: Number(response.retcode) }));
      }
      if ("wakeAt" in reply && reply.wakeAt) {
        await this.scheduleWake(botId, reply.wakeAt).catch((error) => console.warn(JSON.stringify({
          event: "onebot_reminder_alarm_schedule_failed", botId, targetType: reply.targetType, targetId: reply.targetId,
          reason: error instanceof Error ? error.message : "unknown",
        })));
      }
    } catch (error) {
      console.error(JSON.stringify({ event: "onebot_event_process_failed", botId, targetType, targetId,
        reason: error instanceof Error ? error.message : "unknown" }));
      if (canReply && (isExplicitCommand || isReminderCommand)) {
        const failure = commandText.startsWith("/register")
          ? "注册处理失败或机器人接口超时，请稍后重试。请勿重复发送含密码的消息。"
          : isReminderCommand
            ? "提醒处理失败或机器人接口超时，请稍后重试。"
            : "命令处理失败或机器人接口超时，请稍后重试。";
        await sendText(failure).catch(() => {});
      }
    } finally {
      if (slowNotice !== null) clearTimeout(slowNotice);
    }
  }

  async webSocketClose(socket: WebSocket, code: number, reason: string) {
    if (socket.readyState < WebSocket.CLOSING) socket.close(code, reason);
    if (!this.verifiedSockets().length) this.rejectPending("QQ Bot 连接已断开");
  }

  async webSocketError(socket: WebSocket) {
    socket.close(1011, "WebSocket error");
    if (!this.verifiedSockets().length) this.rejectPending("QQ Bot 连接异常");
  }

  private verifiedSockets() {
    return this.ctx.getWebSockets().filter((socket) => {
      const attachment = socketAttachment(socket);
      return attachment?.verified && socket.readyState === WebSocket.OPEN;
    });
  }

  private schedulerStorage() {
    return (this.ctx as unknown as { storage: SchedulerStorage }).storage;
  }

  private rejectPending(message: string) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(message));
    }
    this.pending.clear();
  }
}

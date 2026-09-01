import { DurableObject } from "cloudflare:workers";
import { jsonId, processOneBotEvent, type OneBotPayload } from "../lib/onebot-cloudflare";

type SocketAttachment = { botId: string; verified: boolean };
type PendingCall = {
  resolve(value: OneBotPayload): void;
  reject(reason: Error): void;
  timeout: ReturnType<typeof setTimeout>;
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
  private readonly pending = new Map<string, PendingCall>();

  async fetch(request: Request) {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    const botId = request.headers.get("x-reshi-onebot-id") || "";
    if (!/^\d{5,20}$/.test(botId)) return new Response("Unauthorized", { status: 401 });

    for (const socket of this.ctx.getWebSockets()) socket.close(1012, "Bot connection replaced");
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({ botId, verified: false } satisfies SocketAttachment);
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
        reject(new Error("QQ Bot 响应超时"));
      }, 20_000);
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

    const echo = typeof payload.echo === "string" ? payload.echo : "";
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

    const reply = await processOneBotEvent(attachment.botId, payload);
    if (!reply) return;
    socket.send(JSON.stringify({
      action: "send_private_msg",
      params: { user_id: Number(reply.userId), message: reply.reply, auto_escape: true },
    }));
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

  private rejectPending(message: string) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(message));
    }
    this.pending.clear();
  }
}

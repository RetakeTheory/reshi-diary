import { Buffer } from "node:buffer";
import { ensureDatabaseSchema, getD1 } from "../../../../db/runtime";
import { getApiAdmin } from "../../../admin/admin-auth";
import { sameOrigin } from "../../../../lib/admin-email-auth";
import { jsonId, numericId, oneBotErrorResponse, OneBotHttpError, oneBotOnline, oneBotStub, parseOneBotGroups } from "../../../../lib/onebot-cloudflare";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_CARD_HTML_CHARS = 20_000;
const safeImages = new Set(["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"]);

type BotRow = {
  bot_id: string;
  display_name: string;
  groups_json: string;
  enabled: number;
  created_at: number;
};

function htmlToPlainText(html: string) {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;|&#34;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function cardUrl(request: Request, value: string) {
  const publicOrigin = "https://rettheory.top";
  const trimmed = value.trim();
  if (!trimmed) return publicOrigin;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return `${publicOrigin}${trimmed}`;
  try {
    const parsed = new URL(trimmed, request.url);
    if (parsed.protocol !== "https:") throw new Error("unsafe protocol");
    return parsed.toString();
  } catch {
    throw new OneBotHttpError(400, "卡片链接需为 HTTPS 地址或站内路径");
  }
}

function firstCardImage(html: string) {
  const match = html.match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i);
  if (!match) return null;
  const source = match[1].trim();
  if (source.startsWith("/") && !source.startsWith("//")) return `https://rettheory.top${source}`;
  try {
    const parsed = new URL(source);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function oneBotActionSucceeded(payload: Record<string, unknown>) {
  return payload.status === "ok" && Number(payload.retcode) === 0;
}

function oneBotFailureDetail(payload: Record<string, unknown>) {
  const retcode = Number(payload.retcode);
  const reason = [payload.message, payload.wording, payload.msg]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter((value, index, values) => values.indexOf(value) === index)
    .join("；")
    .slice(0, 240);
  const code = Number.isFinite(retcode) ? `retcode ${retcode}` : "未知错误码";
  return reason ? `${reason}（${code}）` : code;
}

async function recordDelivery(input: { adminEmail: string; botId: string; groupId: string; status: "sent" | "failed"; messageId?: string }) {
  const db = await getD1();
  const now = Date.now();
  const dayKey = Math.floor(now / 86_400_000);
  await db.prepare(`INSERT INTO onebot_delivery_daily
    (day_key, admin_email, bot_id, group_id, sent_count, failed_count, last_message_id, last_status, last_sent_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(day_key, bot_id, group_id) DO UPDATE SET
      admin_email = excluded.admin_email,
      sent_count = onebot_delivery_daily.sent_count + excluded.sent_count,
      failed_count = onebot_delivery_daily.failed_count + excluded.failed_count,
      last_message_id = excluded.last_message_id,
      last_status = excluded.last_status,
      last_sent_at = excluded.last_sent_at`)
    .bind(dayKey, input.adminEmail, input.botId, input.groupId, input.status === "sent" ? 1 : 0,
      input.status === "failed" ? 1 : 0, input.messageId || null, input.status, now).run();
}

export async function GET() {
  try {
    if (!await getApiAdmin()) throw new OneBotHttpError(401, "请先登录管理员账户");
    await ensureDatabaseSchema();
    const db = await getD1();
    const rows = await db.prepare("SELECT bot_id, display_name, groups_json, enabled, created_at FROM onebot_bots ORDER BY created_at, bot_id")
      .all<BotRow>();
    const bots = await Promise.all((rows.results || []).map(async (row) => ({
      botId: row.bot_id,
      displayName: row.display_name,
      enabled: Boolean(row.enabled),
      online: Boolean(row.enabled) && await oneBotOnline(row.bot_id),
      createdAt: row.created_at,
      groups: parseOneBotGroups(row.groups_json),
    })));
    return Response.json({
      configured: bots.length > 0,
      online: bots.some((bot) => bot.online),
      bots,
      reverseWsPath: "/api/onebot/ws",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return oneBotErrorResponse(error);
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  try {
    const session = await getApiAdmin();
    if (!session) throw new OneBotHttpError(401, "请先登录管理员账户");
    const declared = Number(request.headers.get("content-length") || 0);
    if (declared > MAX_IMAGE_BYTES + 1024 * 1024) throw new OneBotHttpError(400, "图片不能超过 8 MB");
    const form = await request.formData().catch(() => null);
    if (!form) throw new OneBotHttpError(400, "上传表单无效");
    const botId = numericId(String(form.get("botId") || ""), "Bot QQ 号");
    const groupId = numericId(String(form.get("groupId") || ""), "QQ群号");
    const mode = String(form.get("mode") || "");

    await ensureDatabaseSchema();
    const db = await getD1();
    const bot = await db.prepare("SELECT groups_json, enabled FROM onebot_bots WHERE bot_id = ? LIMIT 1")
      .bind(botId).first<{ groups_json: string; enabled: number }>();
    if (!bot?.enabled || !parseOneBotGroups(bot.groups_json).some((group) => group.groupId === groupId)) {
      throw new OneBotHttpError(403, "所选 Bot 或群不在允许列表中");
    }

    let message: unknown[];
    let cardFallbackMessage: unknown[] | null = null;
    if (mode === "card") {
      const title = String(form.get("title") || "").trim();
      const html = String(form.get("contentHtml") || "").trim();
      if ([...title].length < 1 || [...title].length > 100) throw new OneBotHttpError(400, "卡片标题需为 1–100 个字符");
      if ([...html].length > MAX_CARD_HTML_CHARS) throw new OneBotHttpError(400, "卡片正文不能超过 20000 字");
      const plain = htmlToPlainText(html);
      if (!plain) throw new OneBotHttpError(400, "请填写卡片正文");
      const data: Record<string, string> = {
        url: cardUrl(request, String(form.get("url") || "")),
        title,
        content: [...plain].slice(0, 300).join(""),
      };
      const image = firstCardImage(html);
      if (image) data.image = image;
      message = [{ type: "share", data }];
      cardFallbackMessage = [{
        type: "text",
        data: { text: [title, [...plain].slice(0, 300).join(""), data.url].join("\n") },
      }];
    } else if (mode === "image") {
      const image = form.get("image");
      if (!(image instanceof File) || !safeImages.has(image.type) || image.size < 1) {
        throw new OneBotHttpError(400, "仅支持 AVIF、GIF、JPEG、PNG 或 WebP 图片");
      }
      if (image.size > MAX_IMAGE_BYTES) throw new OneBotHttpError(400, "图片不能超过 8 MB");
      const caption = [...String(form.get("caption") || "").trim()].slice(0, 500).join("");
      message = caption ? [{ type: "text", data: { text: caption } }] : [];
      message.push({ type: "image", data: { file: `base64://${Buffer.from(await image.arrayBuffer()).toString("base64")}` } });
    } else {
      throw new OneBotHttpError(400, "通知类型无效");
    }

    let payload: Record<string, unknown>;
    let deliveryMode: "card" | "card-text-fallback" | "image" = mode === "card" ? "card" : "image";
    try {
      const stub = await oneBotStub(botId);
      payload = await stub.call("send_group_msg", {
        group_id: Number(groupId), message, auto_escape: false,
      });
      if (cardFallbackMessage && !oneBotActionSucceeded(payload)) {
        const cardFailure = oneBotFailureDetail(payload);
        console.warn(JSON.stringify({
          event: "onebot_group_card_fallback",
          botId,
          groupId,
          retcode: Number(payload.retcode),
          reason: cardFailure,
        }));
        payload = await stub.call("send_group_msg", {
          group_id: Number(groupId), message: cardFallbackMessage, auto_escape: false,
        });
        deliveryMode = "card-text-fallback";
      }
    } catch (error) {
      await recordDelivery({ adminEmail: session.admin.email, botId, groupId, status: "failed" });
      throw new OneBotHttpError(502, error instanceof Error ? error.message : "QQ Bot 发送通知失败");
    }
    const sent = oneBotActionSucceeded(payload);
    const data = payload.data && typeof payload.data === "object" ? payload.data as Record<string, unknown> : null;
    const messageId = jsonId(data?.message_id);
    await recordDelivery({ adminEmail: session.admin.email, botId, groupId, status: sent ? "sent" : "failed", messageId });
    console.log(JSON.stringify({
      event: "onebot_group_notice",
      botId,
      groupId,
      deliveryMode,
      status: sent ? "sent" : "failed",
      retcode: Number(payload.retcode),
      messageId,
    }));
    if (!sent) throw new OneBotHttpError(502, `QQ Bot 发送通知失败：${oneBotFailureDetail(payload)}`);
    return Response.json({ ok: true, messageId, deliveryMode }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return oneBotErrorResponse(error);
  }
}

import { Buffer } from "node:buffer";
import { ensureDatabaseSchema, getD1 } from "../db/runtime";
import { renderOneBotReminderCard } from "./onebot-reminder-card";
import { deleteS3Object, getS3Object, putS3Object } from "./s3-storage";

const MAX_ATTEMPTS = 3;

export type ScheduledOneBotRow = {
  id: string;
  bot_id: string;
  target_type: "private" | "group";
  target_id: string;
  delivery_mode: "text" | "image" | "card-image";
  summary: string;
  message_text: string;
  image_key: string | null;
  admin_email: string | null;
  mention_user_id: string | null;
  due_at: number;
  attempts: number;
  claimed_at: number | null;
  created_at: number;
};

export type ScheduledOneBotCall = (action: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;

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

export async function createPrivateReminder(input: { botId: string; userId: string; dueAt: number; text: string }) {
  await ensureDatabaseSchema();
  const db = await getD1();
  const pending = await db.prepare("SELECT COUNT(*) AS count FROM onebot_scheduled_messages WHERE bot_id = ? AND target_type = 'private' AND target_id = ?")
    .bind(input.botId, input.userId).first<{ count: number }>();
  if ((pending?.count || 0) >= 30) throw new Error("你的待发送提醒已达 30 条，请等待部分提醒发出后再添加。");
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.prepare(`INSERT INTO onebot_scheduled_messages
    (id, bot_id, target_type, target_id, delivery_mode, summary, message_text, image_key, admin_email, due_at, attempts, claimed_at, created_at)
    VALUES (?, ?, 'private', ?, 'text', ?, ?, NULL, NULL, ?, 0, NULL, ?)`)
    .bind(id, input.botId, input.userId, [...input.text].slice(0, 80).join(""), input.text, input.dueAt, now).run();
  return id;
}

export async function createGroupReminder(input: { botId: string; groupId: string; userId: string; dueAt: number; text: string }) {
  await ensureDatabaseSchema();
  const db = await getD1();
  const bot = await db.prepare("SELECT groups_json, enabled FROM onebot_bots WHERE bot_id = ? LIMIT 1")
    .bind(input.botId).first<{ groups_json: string; enabled: number }>();
  let allowed = false;
  try {
    const groups: unknown = JSON.parse(bot?.groups_json || "[]");
    allowed = Boolean(bot?.enabled) && Array.isArray(groups) && groups.some((group) => group && typeof group === "object"
      && (group as { groupId?: unknown }).groupId === input.groupId);
  } catch {
    allowed = false;
  }
  if (!allowed) throw new Error("本群尚未加入 Bot 的允许列表，无法创建提醒。");
  const pending = await db.prepare(`SELECT COUNT(*) AS group_count,
      SUM(CASE WHEN mention_user_id = ? THEN 1 ELSE 0 END) AS user_count
    FROM onebot_scheduled_messages WHERE bot_id = ? AND target_type = 'group' AND target_id = ?`)
    .bind(input.userId, input.botId, input.groupId).first<{ group_count: number; user_count: number }>();
  if ((pending?.group_count || 0) >= 100) throw new Error("本群的待发送任务已达 100 条，请等待部分任务发出后再添加。");
  if ((pending?.user_count || 0) >= 30) throw new Error("你在本群的待发送提醒已达 30 条，请等待部分提醒发出后再添加。");

  const id = crypto.randomUUID();
  const now = Date.now();
  const key = `uploads/onebot-scheduled/${id}.png`;
  const card = await renderOneBotReminderCard({ text: input.text, dueAt: input.dueAt, generatedAt: now });
  const uploaded = await putS3Object(key, {
    body: card,
    filename: "group-reminder-card.png",
    contentType: "image/png",
    previewable: true,
  });
  if (!uploaded.ok) throw new Error(`提醒卡片存储失败（HTTP ${uploaded.status}）`);
  try {
    await db.prepare(`INSERT INTO onebot_scheduled_messages
      (id, bot_id, target_type, target_id, delivery_mode, summary, message_text, image_key, admin_email, mention_user_id, due_at, attempts, claimed_at, created_at)
      VALUES (?, ?, 'group', ?, 'card-image', ?, '', ?, NULL, ?, ?, 0, NULL, ?)`)
      .bind(id, input.botId, input.groupId, [...input.text].slice(0, 80).join(""), key, input.userId, input.dueAt, now).run();
  } catch (error) {
    await deleteS3Object(key).catch(() => null);
    throw error;
  }
  return id;
}

export async function nextScheduledAt(botId: string) {
  const db = await getD1();
  const row = await db.prepare("SELECT MIN(due_at) AS due_at FROM onebot_scheduled_messages WHERE bot_id = ?")
    .bind(botId).first<{ due_at: number | null }>();
  return row?.due_at ?? null;
}

async function scheduledMessage(row: ScheduledOneBotRow) {
  if (row.delivery_mode === "text" && !row.mention_user_id) return row.message_text;
  const message: unknown[] = row.mention_user_id
    ? [{ type: "at", data: { qq: row.mention_user_id } }, { type: "text", data: { text: " " } }]
    : [];
  if (row.message_text) message.push({ type: "text", data: { text: row.message_text } });
  if (row.delivery_mode === "text") return message;
  if (!row.image_key) throw new Error("定时图片不存在");
  const object = await getS3Object(row.image_key);
  if (!object.ok) throw new Error(`读取定时图片失败（HTTP ${object.status}）`);
  const bytes = await object.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 8 * 1024 * 1024) throw new Error("定时图片大小无效");
  message.push({ type: "image", data: { file: `base64://${Buffer.from(bytes).toString("base64")}` } });
  return message;
}

async function groupStillAllowed(row: ScheduledOneBotRow) {
  if (row.target_type !== "group") return true;
  const db = await getD1();
  const bot = await db.prepare("SELECT groups_json, enabled FROM onebot_bots WHERE bot_id = ? LIMIT 1")
    .bind(row.bot_id).first<{ groups_json: string; enabled: number }>();
  if (!bot?.enabled) return false;
  try {
    const groups: unknown = JSON.parse(bot.groups_json || "[]");
    return Array.isArray(groups) && groups.some((group) => group && typeof group === "object"
      && (group as { groupId?: unknown }).groupId === row.target_id);
  } catch {
    return false;
  }
}

async function removeScheduledRow(row: ScheduledOneBotRow) {
  const db = await getD1();
  await db.prepare("DELETE FROM onebot_scheduled_messages WHERE id = ?").bind(row.id).run();
  if (row.image_key) {
    const deleted = await deleteS3Object(row.image_key).catch(() => null);
    if (deleted && !deleted.ok && deleted.status !== 404) console.error(JSON.stringify({ event: "onebot_scheduled_image_cleanup_failed", id: row.id, status: deleted.status }));
  }
}

export async function dispatchScheduledForBot(botId: string, call: ScheduledOneBotCall, now = Date.now()) {
  await ensureDatabaseSchema();
  const db = await getD1();
  const rows = await db.prepare(`SELECT id, bot_id, target_type, target_id, delivery_mode, summary, message_text,
      image_key, admin_email, mention_user_id, due_at, attempts, claimed_at, created_at
    FROM onebot_scheduled_messages
    WHERE bot_id = ? AND due_at <= ? AND (claimed_at IS NULL OR claimed_at < ?)
    ORDER BY due_at, created_at LIMIT 20`)
    .bind(botId, now, now - 60_000).all<ScheduledOneBotRow>();
  let sent = 0;
  for (const row of rows.results || []) {
    const claim = await db.prepare(`UPDATE onebot_scheduled_messages SET claimed_at = ?
      WHERE id = ? AND (claimed_at IS NULL OR claimed_at < ?)`).bind(now, row.id, now - 60_000).run();
    if (!Number(claim.meta.changes || 0)) continue;
    try {
      if (!await groupStillAllowed(row)) {
        await removeScheduledRow(row);
        console.warn(JSON.stringify({ event: "onebot_scheduled_allowlist_removed", id: row.id, botId, targetId: row.target_id }));
        continue;
      }
      const message = await scheduledMessage(row);
      const action = row.target_type === "group" ? "send_group_msg" : "send_private_msg";
      const target = row.target_type === "group" ? { group_id: Number(row.target_id) } : { user_id: Number(row.target_id) };
      const payload = await call(action, { ...target, message, auto_escape: row.delivery_mode === "text" });
      if (!oneBotActionSucceeded(payload)) throw new Error(oneBotFailureDetail(payload));
      await removeScheduledRow(row);
      sent += 1;
      console.log(JSON.stringify({ event: "onebot_scheduled_sent", id: row.id, botId, targetType: row.target_type, deliveryMode: row.delivery_mode }));
    } catch (error) {
      const attempts = row.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await removeScheduledRow(row);
        console.error(JSON.stringify({ event: "onebot_scheduled_dropped", id: row.id, botId, attempts, reason: error instanceof Error ? error.message : "unknown" }));
      } else {
        const retryAt = Date.now() + (attempts === 1 ? 30_000 : 120_000);
        await db.prepare("UPDATE onebot_scheduled_messages SET attempts = ?, due_at = ?, claimed_at = NULL WHERE id = ?")
          .bind(attempts, retryAt, row.id).run();
      }
    }
  }
  return { sent, nextAt: await nextScheduledAt(botId) };
}

export async function removeScheduledById(id: string, targetType: "group" | "private" = "group") {
  const db = await getD1();
  const row = await db.prepare("SELECT id, image_key FROM onebot_scheduled_messages WHERE id = ? AND target_type = ? LIMIT 1")
    .bind(id, targetType).first<{ id: string; image_key: string | null }>();
  if (!row) return false;
  await db.prepare("DELETE FROM onebot_scheduled_messages WHERE id = ?").bind(id).run();
  if (row.image_key) await deleteS3Object(row.image_key).catch(() => null);
  return true;
}

export async function removeScheduledForBot(botId: string) {
  const db = await getD1();
  const rows = await db.prepare("SELECT image_key FROM onebot_scheduled_messages WHERE bot_id = ? AND image_key IS NOT NULL")
    .bind(botId).all<{ image_key: string }>();
  await db.prepare("DELETE FROM onebot_scheduled_messages WHERE bot_id = ?").bind(botId).run();
  await Promise.allSettled((rows.results || []).map((row) => deleteS3Object(row.image_key)));
}

export async function removeScheduledForGroup(botId: string, groupId: string) {
  const db = await getD1();
  const rows = await db.prepare(`SELECT image_key FROM onebot_scheduled_messages
    WHERE bot_id = ? AND target_type = 'group' AND target_id = ? AND image_key IS NOT NULL`)
    .bind(botId, groupId).all<{ image_key: string }>();
  await db.prepare("DELETE FROM onebot_scheduled_messages WHERE bot_id = ? AND target_type = 'group' AND target_id = ?")
    .bind(botId, groupId).run();
  await Promise.allSettled((rows.results || []).map((row) => deleteS3Object(row.image_key)));
}

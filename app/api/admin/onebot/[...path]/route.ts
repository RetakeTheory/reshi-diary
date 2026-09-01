import { ensureDatabaseSchema, getD1 } from "../../../../../db/runtime";
import { getApiAdmin } from "../../../../admin/admin-auth";
import { sameOrigin } from "../../../../../lib/admin-email-auth";
import {
  disconnectOneBot,
  displayName,
  encodeOneBotGroups,
  generateOneBotToken,
  numericId,
  oneBotErrorResponse,
  OneBotHttpError,
  oneBotTokenHash,
  parseOneBotGroups,
} from "../../../../../lib/onebot-cloudflare";
import { removeScheduledById, removeScheduledForBot, removeScheduledForGroup } from "../../../../../lib/onebot-scheduler";

type BotRow = { display_name: string; groups_json: string; enabled: number; created_at: number };

function routeParts(request: Request) {
  return new URL(request.url).pathname.slice("/api/admin/onebot/".length).split("/").filter(Boolean).map(decodeURIComponent);
}

function changed(result: D1Result) {
  return Number(result.meta.changes || 0) > 0;
}

async function authorize(request: Request) {
  if (!sameOrigin(request)) throw new OneBotHttpError(403, "请求来源无效");
  if (!await getApiAdmin()) throw new OneBotHttpError(401, "请先登录管理员账户");
  await ensureDatabaseSchema();
  return getD1();
}

async function createBot(request: Request) {
  const db = await authorize(request);
  const body = await request.json().catch(() => ({})) as { botId?: string; displayName?: string };
  const botId = numericId(body.botId, "Bot QQ 号");
  const name = displayName(body.displayName, `QQ Bot ${botId}`);
  const accessToken = generateOneBotToken();
  const now = Date.now();
  try {
    await db.prepare(`INSERT INTO onebot_bots
      (bot_id, display_name, access_token_hash, groups_json, enabled, created_at, updated_at)
      VALUES (?, ?, ?, '[]', 1, ?, ?)`).bind(botId, name, await oneBotTokenHash(accessToken), now, now).run();
  } catch (error) {
    if (error instanceof Error && /unique|constraint/i.test(error.message)) throw new OneBotHttpError(409, "该 Bot 已存在");
    throw error;
  }
  return Response.json({
    ok: true,
    bot: { botId, displayName: name, enabled: true, online: false, createdAt: now, groups: [] },
    accessToken,
    reverseWsPath: "/api/onebot/ws",
  }, { headers: { "Cache-Control": "no-store" } });
}

async function updateBot(request: Request, botIdValue: string) {
  const db = await authorize(request);
  const botId = numericId(botIdValue, "Bot QQ 号");
  const current = await db.prepare("SELECT display_name, groups_json, enabled, created_at FROM onebot_bots WHERE bot_id = ? LIMIT 1")
    .bind(botId).first<BotRow>();
  if (!current) throw new OneBotHttpError(404, "Bot 不存在");
  const body = await request.json().catch(() => ({})) as { displayName?: string; enabled?: boolean };
  const name = body.displayName === undefined ? current.display_name : displayName(body.displayName, `QQ Bot ${botId}`);
  const enabled = typeof body.enabled === "boolean" ? body.enabled : Boolean(current.enabled);
  await db.prepare("UPDATE onebot_bots SET display_name = ?, enabled = ?, updated_at = ? WHERE bot_id = ?")
    .bind(name, enabled ? 1 : 0, Date.now(), botId).run();
  if (!enabled) await disconnectOneBot(botId, "Bot 已停用");
  return Response.json({ ok: true, botId, displayName: name, enabled }, { headers: { "Cache-Control": "no-store" } });
}

async function deleteBot(request: Request, botIdValue: string) {
  const db = await authorize(request);
  const botId = numericId(botIdValue, "Bot QQ 号");
  const result = await db.prepare("DELETE FROM onebot_bots WHERE bot_id = ?").bind(botId).run();
  if (!changed(result)) throw new OneBotHttpError(404, "Bot 不存在");
  await removeScheduledForBot(botId);
  await disconnectOneBot(botId, "Bot 已删除");
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

async function rotateToken(request: Request, botIdValue: string) {
  const db = await authorize(request);
  const botId = numericId(botIdValue, "Bot QQ 号");
  const accessToken = generateOneBotToken();
  const result = await db.prepare("UPDATE onebot_bots SET access_token_hash = ?, updated_at = ? WHERE bot_id = ?")
    .bind(await oneBotTokenHash(accessToken), Date.now(), botId).run();
  if (!changed(result)) throw new OneBotHttpError(404, "Bot 不存在");
  await disconnectOneBot(botId, "连接令牌已轮换");
  return Response.json({ ok: true, accessToken, reverseWsPath: "/api/onebot/ws" }, { headers: { "Cache-Control": "no-store" } });
}

async function addGroup(request: Request, botIdValue: string) {
  const db = await authorize(request);
  const botId = numericId(botIdValue, "Bot QQ 号");
  const body = await request.json().catch(() => ({})) as { groupId?: string; displayName?: string };
  const groupId = numericId(body.groupId, "QQ群号");
  const name = displayName(body.displayName);
  const row = await db.prepare("SELECT groups_json FROM onebot_bots WHERE bot_id = ? LIMIT 1").bind(botId).first<{ groups_json: string }>();
  if (!row) throw new OneBotHttpError(404, "Bot 不存在");
  const groups = parseOneBotGroups(row.groups_json);
  if (groups.some((group) => group.groupId === groupId)) throw new OneBotHttpError(409, "该群已添加到此 Bot");
  if (groups.length >= 100) throw new OneBotHttpError(400, "每个 Bot 最多配置 100 个群");
  groups.push({ groupId, displayName: name });
  await db.prepare("UPDATE onebot_bots SET groups_json = ?, updated_at = ? WHERE bot_id = ?")
    .bind(encodeOneBotGroups(groups), Date.now(), botId).run();
  return Response.json({ ok: true, group: { groupId, displayName: name } }, { headers: { "Cache-Control": "no-store" } });
}

async function deleteGroup(request: Request, botIdValue: string, groupIdValue: string) {
  const db = await authorize(request);
  const botId = numericId(botIdValue, "Bot QQ 号");
  const groupId = numericId(groupIdValue, "QQ群号");
  const row = await db.prepare("SELECT groups_json FROM onebot_bots WHERE bot_id = ? LIMIT 1").bind(botId).first<{ groups_json: string }>();
  if (!row) throw new OneBotHttpError(404, "Bot 不存在");
  const groups = parseOneBotGroups(row.groups_json);
  const next = groups.filter((group) => group.groupId !== groupId);
  if (next.length === groups.length) throw new OneBotHttpError(404, "群配置不存在");
  await db.prepare("UPDATE onebot_bots SET groups_json = ?, updated_at = ? WHERE bot_id = ?")
    .bind(encodeOneBotGroups(next), Date.now(), botId).run();
  await removeScheduledForGroup(botId, groupId);
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

async function dispatch(request: Request) {
  const parts = routeParts(request);
  if (request.method === "POST" && parts.length === 1 && parts[0] === "bots") return createBot(request);
  if (request.method === "DELETE" && parts.length === 2 && parts[0] === "scheduled") {
    await authorize(request);
    if (!/^[0-9a-f-]{36}$/i.test(parts[1])) throw new OneBotHttpError(400, "定时任务无效");
    if (!await removeScheduledById(parts[1])) throw new OneBotHttpError(404, "定时任务不存在或已经发送");
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  }
  if (parts[0] !== "bots" || !parts[1]) throw new OneBotHttpError(404, "OneBot 管理接口不存在");
  if (request.method === "PUT" && parts.length === 2) return updateBot(request, parts[1]);
  if (request.method === "DELETE" && parts.length === 2) return deleteBot(request, parts[1]);
  if (request.method === "POST" && parts.length === 3 && parts[2] === "token") return rotateToken(request, parts[1]);
  if (request.method === "POST" && parts.length === 3 && parts[2] === "groups") return addGroup(request, parts[1]);
  if (request.method === "DELETE" && parts.length === 4 && parts[2] === "groups") return deleteGroup(request, parts[1], parts[3]);
  throw new OneBotHttpError(405, "此操作不受支持");
}

async function handle(request: Request) {
  try { return await dispatch(request); }
  catch (error) { return oneBotErrorResponse(error); }
}

export const POST = handle;
export const PUT = handle;
export const DELETE = handle;

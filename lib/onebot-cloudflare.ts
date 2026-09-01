import { ensureDatabaseSchema, getD1 } from "../db/runtime";
import { hashValue, randomToken } from "./admin-email-auth";

const QQ_AUTH_TTL_MS = 10 * 60 * 1000;
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export type OneBotPayload = Record<string, unknown>;
export type OneBotGroup = { groupId: string; displayName: string };
export type OneBotStub = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  isOnline(): Promise<boolean>;
  call(action: string, params: OneBotPayload): Promise<OneBotPayload>;
  disconnect(reason?: string): Promise<void>;
};

export type QqChallenge = {
  flow_id: string;
  purpose: "login" | "register" | "bind";
  user_id: string | null;
  display_name: string | null;
  bot_id: string;
  verified_qq_id: string | null;
  status: "pending" | "verified" | "failed" | "consumed";
  error: string | null;
  expires_at: number;
};

export class OneBotHttpError extends Error {
  constructor(public status: number, message: string, public retryAfter?: number) {
    super(message);
  }
}

export function oneBotErrorResponse(error: unknown) {
  const known = error instanceof OneBotHttpError;
  const status = known ? error.status : 500;
  const message = error instanceof Error ? error.message : "OneBot 服务暂时不可用";
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (known && error.retryAfter) headers.set("Retry-After", String(error.retryAfter));
  return Response.json({ error: known ? message : "OneBot 服务暂时不可用" }, { status, headers });
}

export function numericId(value: string | null | undefined, label: string) {
  const normalized = value?.trim() || "";
  if (!/^\d{5,20}$/.test(normalized) || !Number.isSafeInteger(Number(normalized))) {
    throw new OneBotHttpError(400, `${label}无效`);
  }
  return normalized;
}

export function displayName(value: string | null | undefined, fallback = "") {
  const normalized = value?.trim() || fallback;
  if ([...normalized].length > 40) throw new OneBotHttpError(400, "名称不能超过 40 个字符");
  return normalized;
}

export function parseOneBotGroups(value: string | null | undefined): OneBotGroup[] {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const group = item as Partial<OneBotGroup>;
      if (typeof group.groupId !== "string" || !/^\d{5,20}$/.test(group.groupId) || !Number.isSafeInteger(Number(group.groupId))) return [];
      return [{ groupId: group.groupId, displayName: typeof group.displayName === "string" ? group.displayName.slice(0, 40) : "" }];
    }).slice(0, 100);
  } catch {
    return [];
  }
}

export function encodeOneBotGroups(groups: OneBotGroup[]) {
  return JSON.stringify([...groups].sort((left, right) => left.groupId.localeCompare(right.groupId)));
}

export function generateOneBotToken() {
  return `ob_${randomToken(32)}`;
}

export async function oneBotTokenHash(token: string) {
  return hashValue(`onebot-token:${token.trim()}`);
}

export function normalizeQqCode(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

export function parseQqVerificationMessage(value: string) {
  const trimmed = value.trim();
  const prefix = ["绑定", "验证", "登录", "注册"].find((item) => trimmed.startsWith(item));
  if (!prefix) return null;
  const code = normalizeQqCode(trimmed.slice(prefix.length));
  return code.length === 8 && [...code].every((char) => CODE_ALPHABET.includes(char)) ? code : null;
}

export function jsonId(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  return "";
}

async function oneBotNamespace() {
  const { env } = await import("cloudflare:workers");
  if (!env.ONEBOT) throw new OneBotHttpError(503, "OneBot 实时服务尚未部署");
  return env.ONEBOT;
}

export async function oneBotStub(botId: string): Promise<OneBotStub> {
  const namespace = await oneBotNamespace();
  return namespace.getByName(botId) as OneBotStub;
}

export async function oneBotOnline(botId: string) {
  try {
    return await (await oneBotStub(botId)).isOnline();
  } catch {
    return false;
  }
}

export async function disconnectOneBot(botId: string, reason = "配置已更新") {
  try {
    await (await oneBotStub(botId)).disconnect(reason);
  } catch {
    // A missing or already-evicted object is already effectively disconnected.
  }
}

export async function availableOneBot() {
  await ensureDatabaseSchema();
  const db = await getD1();
  const rows = await db.prepare("SELECT bot_id FROM onebot_bots WHERE enabled = 1 ORDER BY created_at, bot_id")
    .all<{ bot_id: string }>();
  for (const row of rows.results || []) {
    if (await oneBotOnline(row.bot_id)) return row.bot_id;
  }
  throw new OneBotHttpError(503, "暂无可用的 QQ Bot");
}

function generateQqCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const raw = Array.from(bytes, (byte) => CODE_ALPHABET[byte & 31]).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

async function requestKeyHash(request: Request) {
  const forwarded = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const agent = (request.headers.get("user-agent") || "unknown").slice(0, 160);
  return hashValue(`qq-flow:${forwarded.trim()}:${agent}`);
}

export async function createQqChallenge(input: {
  request: Request;
  purpose: "login" | "register" | "bind";
  botId: string;
  userId?: string | null;
  displayName?: string | null;
}) {
  await ensureDatabaseSchema();
  const db = await getD1();
  const now = Date.now();
  const requestKey = await requestKeyHash(input.request);
  const latest = await db.prepare("SELECT created_at FROM qq_auth_challenges WHERE request_key_hash = ? ORDER BY created_at DESC LIMIT 1")
    .bind(requestKey).first<{ created_at: number }>();
  if (latest && now - latest.created_at < 20_000) {
    throw new OneBotHttpError(429, "请求过于频繁，请稍后重试", 20);
  }
  const recent = await db.prepare("SELECT COUNT(*) AS count FROM qq_auth_challenges WHERE request_key_hash = ? AND created_at > ?")
    .bind(requestKey, now - QQ_AUTH_TTL_MS).first<{ count: number }>();
  if ((recent?.count || 0) >= 10) throw new OneBotHttpError(429, "请求过于频繁，请稍后重试", 600);

  const flowId = randomToken(32);
  const code = generateQqCode();
  const expiresAt = now + QQ_AUTH_TTL_MS;
  await db.batch([
    db.prepare("DELETE FROM qq_auth_challenges WHERE expires_at <= ? OR (status IN ('consumed', 'failed') AND created_at < ?)")
      .bind(now, now - QQ_AUTH_TTL_MS),
    db.prepare(`INSERT INTO qq_auth_challenges
      (flow_id, code_hash, purpose, user_id, display_name, request_key_hash, bot_id, status, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`)
      .bind(flowId, await hashValue(`qq-auth:${normalizeQqCode(code)}`), input.purpose, input.userId || null,
        input.displayName || null, requestKey, input.botId, now, expiresAt),
  ]);
  return { flowId, code, command: `${input.purpose === "bind" ? "绑定" : "验证"} ${code}`, expiresAt, botId: input.botId };
}

export async function getQqChallenge(flowId: string) {
  if (!/^[a-f0-9]{64}$/.test(flowId)) throw new OneBotHttpError(400, "验证请求无效");
  await ensureDatabaseSchema();
  const db = await getD1();
  const row = await db.prepare(`SELECT flow_id, purpose, user_id, display_name, bot_id, verified_qq_id, status, error, expires_at
    FROM qq_auth_challenges WHERE flow_id = ? LIMIT 1`).bind(flowId).first<QqChallenge>();
  if (!row) throw new OneBotHttpError(404, "验证请求不存在");
  return row;
}

export function pendingChallengeResponse(row: QqChallenge) {
  if (row.expires_at <= Date.now()) return Response.json({ status: "expired", error: "验证已过期，请重新开始" }, { status: 410 });
  if (row.status === "pending") return Response.json({ status: "pending" }, { status: 202, headers: { "Cache-Control": "no-store" } });
  if (row.status === "failed") return Response.json({ status: "failed", error: row.error || "QQ 验证失败" }, { status: 409 });
  if (row.status !== "verified") throw new OneBotHttpError(409, "验证请求已使用");
  return null;
}

export async function processOneBotEvent(botId: string, payload: OneBotPayload) {
  if (payload.post_type !== "message" || payload.message_type !== "private") return null;
  const qqId = jsonId(payload.user_id);
  if (!/^\d{5,20}$/.test(qqId) || !Number.isSafeInteger(Number(qqId))) return null;
  const code = typeof payload.raw_message === "string" ? parseQqVerificationMessage(payload.raw_message) : null;
  if (!code) return null;

  await ensureDatabaseSchema();
  const db = await getD1();
  const row = await db.prepare(`SELECT flow_id, purpose, user_id, display_name, bot_id, verified_qq_id, status, error, expires_at
    FROM qq_auth_challenges WHERE code_hash = ? AND bot_id = ? LIMIT 1`)
    .bind(await hashValue(`qq-auth:${code}`), botId).first<QqChallenge>();
  const now = Date.now();
  if (!row || row.status !== "pending" || row.expires_at <= now) {
    return { userId: qqId, reply: "验证码无效、已过期或已使用，请回网站重新获取。" };
  }

  let failure = "";
  if (row.purpose === "login") {
    const binding = await db.prepare("SELECT 1 FROM qq_bindings WHERE qq_id = ? LIMIT 1").bind(qqId).first();
    if (!binding) failure = "该 QQ 尚未注册，请在网站选择 QQ 注册。";
  } else if (row.purpose === "bind") {
    const [owner, current] = await Promise.all([
      db.prepare("SELECT user_id FROM qq_bindings WHERE qq_id = ? LIMIT 1").bind(qqId).first<{ user_id: string }>(),
      db.prepare("SELECT qq_id FROM qq_bindings WHERE user_id = ? LIMIT 1").bind(row.user_id).first<{ qq_id: string }>(),
    ]);
    if (owner && owner.user_id !== row.user_id) failure = "该 QQ 已绑定其他网站账户。";
    else if (current && current.qq_id !== qqId) failure = "该网站账户已绑定其他 QQ，请先解绑。";
  }

  if (failure) {
    await db.prepare("UPDATE qq_auth_challenges SET status = 'failed', error = ?, verified_at = ? WHERE flow_id = ? AND status = 'pending'")
      .bind(failure, now, row.flow_id).run();
    return { userId: qqId, reply: failure };
  }
  await db.prepare("UPDATE qq_auth_challenges SET status = 'verified', verified_qq_id = ?, verified_at = ? WHERE flow_id = ? AND status = 'pending'")
    .bind(qqId, now, row.flow_id).run();
  return {
    userId: qqId,
    reply: row.purpose === "bind" ? "身份验证成功，请返回网站完成绑定。" : "身份验证成功，请返回网站完成登录。",
  };
}

export function isSyntheticQqEmail(email: string) {
  return email.startsWith("qq-") && email.endsWith("@qq.rettheory.local");
}

export function syntheticQqEmail(qqId: string) {
  return `qq-${qqId}@qq.rettheory.local`;
}

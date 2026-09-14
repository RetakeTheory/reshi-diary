import { getD1 } from "../db/runtime";
import { hashValue, randomToken } from "./admin-email-auth";

const COOKIE = "cx_query_session";
const TTL_MS = 12 * 60 * 60 * 1000;
let schemaReady = false;

export async function ensureChaoxingQuerySchema() {
  if (schemaReady) return;
  const db = await getD1();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS chaoxing_query_sessions (
      token_hash TEXT PRIMARY KEY NOT NULL,
      uid TEXT NOT NULL,
      bot_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_chaoxing_query_sessions_expires ON chaoxing_query_sessions (expires_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS chaoxing_query_login_attempts (
      key_hash TEXT PRIMARY KEY NOT NULL,
      attempts INTEGER NOT NULL,
      window_started_at INTEGER NOT NULL
    )`),
  ]);
  schemaReady = true;
}

function cookieValue(request: Request) {
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === COOKIE) return value.join("=");
  }
  return null;
}

export function clearChaoxingQueryCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function createChaoxingQuerySession(uid: string, botId: string) {
  await ensureChaoxingQuerySchema();
  const db = await getD1();
  const token = randomToken(32);
  const now = Date.now();
  await db.batch([
    db.prepare("DELETE FROM chaoxing_query_sessions WHERE expires_at <= ?").bind(now),
    db.prepare("INSERT INTO chaoxing_query_sessions (token_hash, uid, bot_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
      .bind(await hashValue(token), uid, botId, now, now + TTL_MS),
  ]);
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL_MS / 1000}`;
}

export async function readChaoxingQuerySession(request: Request) {
  const token = cookieValue(request);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  await ensureChaoxingQuerySchema();
  return (await getD1()).prepare("SELECT uid, bot_id FROM chaoxing_query_sessions WHERE token_hash = ? AND expires_at > ? LIMIT 1")
    .bind(await hashValue(token), Date.now()).first<{ uid: string; bot_id: string }>();
}

export async function deleteChaoxingQuerySession(request: Request) {
  const token = cookieValue(request);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return;
  await ensureChaoxingQuerySchema();
  await (await getD1()).prepare("DELETE FROM chaoxing_query_sessions WHERE token_hash = ?")
    .bind(await hashValue(token)).run();
}

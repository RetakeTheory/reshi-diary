import { ensureDatabaseSchema, getD1 } from "../db/runtime";
import { SESSION_TTL_MS, hashValue, randomToken } from "./admin-email-auth";
import { readerLevel, readerLevelColor } from "./reader-levels";

export const READER_SESSION_COOKIE = "reshi_user_session";

export type ReaderRow = {
  id: string;
  email: string;
  display_name: string;
  avatar_key: string | null;
  points: number;
  created_at: number;
};

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

export function normalizeReaderEmail(value: string) {
  return value.trim().toLowerCase();
}

export function validReaderEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

export async function issueReaderSession(userId: string) {
  await ensureDatabaseSchema();
  const db = await getD1();
  const token = randomToken(32);
  const now = Date.now();
  await db.batch([
    db.prepare("DELETE FROM reader_sessions WHERE expires_at <= ?").bind(now),
    db.prepare("INSERT INTO reader_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .bind(await hashValue(token), userId, now, now + SESSION_TTL_MS),
  ]);
  return `${READER_SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
}

export function clearReaderSessionCookie() {
  return `${READER_SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function readerFromRequest(request: Request) {
  const token = cookieValue(request, READER_SESSION_COOKIE);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  await ensureDatabaseSchema();
  const db = await getD1();
  return db.prepare(`SELECT u.id, u.email, u.display_name, u.avatar_key, u.points, u.created_at
    FROM reader_sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? LIMIT 1`)
    .bind(await hashValue(token), Date.now()).first<ReaderRow>();
}

export function publicReader(user: ReaderRow) {
  const level = readerLevel(user.points);
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    avatarUrl: user.avatar_key ? `/api/files/${user.avatar_key}` : null,
    points: user.points,
    level,
    levelColor: readerLevelColor(level),
    createdAt: user.created_at,
  };
}

import { ensureDatabaseSchema, getD1 } from "../db/runtime";
import { ADMIN_EMAIL, ADMIN_SESSION_COOKIE, SESSION_TTL_MS, hashValue, randomToken } from "./admin-email-auth";

export async function issueAdminSession() {
  await ensureDatabaseSchema();
  const db = await getD1();
  const token = randomToken(32);
  const tokenHash = await hashValue(token);
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;

  await db.batch([
    db.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").bind(now),
    db.prepare("INSERT INTO admin_sessions (token_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .bind(tokenHash, ADMIN_EMAIL, now, expiresAt),
  ]);

  return `${ADMIN_SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
}

import { ensureDatabaseSchema, getD1 } from "../../../../../db/runtime";
import { ADMIN_EMAIL, ADMIN_SESSION_COOKIE, SESSION_TTL_MS, hashValue, randomToken, sameOrigin } from "../../../../../lib/admin-email-auth";

type LoginCode = { id: number; code_hash: string; salt: string; attempts: number; expires_at: number };

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { email?: string; code?: string };
  const email = body.email?.trim().toLowerCase();
  const code = body.code?.trim();
  if (email !== ADMIN_EMAIL || !/^\d{6}$/.test(code || "")) return Response.json({ error: "请输入 6 位验证码" }, { status: 400 });

  await ensureDatabaseSchema();
  const db = await getD1();
  const loginCode = await db.prepare("SELECT id, code_hash, salt, attempts, expires_at FROM admin_login_codes WHERE email = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1")
    .bind(ADMIN_EMAIL).first<LoginCode>();
  const now = Date.now();
  if (!loginCode || loginCode.expires_at <= now) return Response.json({ error: "验证码已过期，请重新发送" }, { status: 400 });
  if (loginCode.attempts >= 5) return Response.json({ error: "尝试次数过多，请重新发送验证码" }, { status: 429 });

  const submittedHash = await hashValue(`${ADMIN_EMAIL}:${code}:${loginCode.salt}`);
  if (submittedHash !== loginCode.code_hash) {
    await db.prepare("UPDATE admin_login_codes SET attempts = attempts + 1 WHERE id = ?").bind(loginCode.id).run();
    return Response.json({ error: "验证码不正确" }, { status: 400 });
  }

  const token = randomToken(32);
  const tokenHash = await hashValue(token);
  const expiresAt = now + SESSION_TTL_MS;
  await db.batch([
    db.prepare("UPDATE admin_login_codes SET used_at = ? WHERE id = ?").bind(now, loginCode.id),
    db.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").bind(now),
    db.prepare("INSERT INTO admin_sessions (token_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .bind(tokenHash, ADMIN_EMAIL, now, expiresAt),
  ]);

  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": `${ADMIN_SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}` } });
}

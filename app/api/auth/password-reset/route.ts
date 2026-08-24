import { ensureDatabaseSchema, getD1 } from "../../../../db/runtime";
import { hashValue, sameOrigin } from "../../../../lib/admin-email-auth";
import { normalizeReaderEmail, readerFromRequest } from "../../../../lib/reader-auth";
import { hashReaderPassword, validReaderPassword } from "../../../../lib/reader-password";

type LoginCode = { id: number; code_hash: string; salt: string; attempts: number; expires_at: number };

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  try {
  const body = await request.json().catch(() => ({})) as { email?: string; code?: string; password?: string; intent?: string };
  const email = normalizeReaderEmail(body.email || ""); const code = body.code?.trim() || ""; const password = body.password || "";
  const intent = body.intent === "set_password" ? "set_password" : "reset_password";
  if (!/^\d{6}$/.test(code) || !validReaderPassword(password)) return Response.json({ error: "请输入 6 位验证码及 8–128 位新密码" }, { status: 400 });
  await ensureDatabaseSchema(); const db = await getD1();
  const user = await db.prepare("SELECT id, is_banned FROM users WHERE email = ? LIMIT 1").bind(email).first<{ id: string; is_banned: number }>();
  if (!user) return Response.json({ error: "账户不存在" }, { status: 404 });
  if (user.is_banned) return Response.json({ error: "此账户已被封禁" }, { status: 403 });
  if (intent === "set_password" && (await readerFromRequest(request))?.id !== user.id) return Response.json({ error: "请先登录本人账户" }, { status: 401 });
  const row = await db.prepare(`SELECT id, code_hash, salt, attempts, expires_at FROM reader_login_codes
    WHERE email = ? AND intent = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1`).bind(email, intent).first<LoginCode>();
  const now = Date.now();
  if (!row || row.expires_at <= now) return Response.json({ error: "验证码已过期，请重新发送" }, { status: 400 });
  if (row.attempts >= 5) return Response.json({ error: "尝试次数过多，请重新发送验证码" }, { status: 429 });
  if (await hashValue(`${email}:${code}:${row.salt}`) !== row.code_hash) { await db.prepare("UPDATE reader_login_codes SET attempts = attempts + 1 WHERE id = ?").bind(row.id).run(); return Response.json({ error: "验证码不正确" }, { status: 400 }); }
  await db.batch([
    db.prepare("UPDATE reader_login_codes SET used_at = ? WHERE id = ?").bind(now, row.id),
    db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").bind(await hashReaderPassword(password), now, user.id),
  ]);
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("password reset failed", error);
    return Response.json({ error: "密码保存失败，请重新获取验证码后再试" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

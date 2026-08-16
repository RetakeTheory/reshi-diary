import { ensureDatabaseSchema, getD1 } from "../../../../../db/runtime";
import { sameOrigin } from "../../../../../lib/admin-email-auth";
import { findUserByEmail, hashPassword, normalizeEmail, validatePassword, verifyUserCode } from "../../../../../lib/user-auth";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { identifier?: string; code?: string; password?: string };
  const email = normalizeEmail(body.identifier || "");
  const passwordError = validatePassword(body.password || "");
  if (!email || !/^\d{6}$/.test(body.code || "")) return Response.json({ error: "请输入有效邮箱和 6 位验证码" }, { status: 400 });
  if (passwordError) return Response.json({ error: passwordError }, { status: 400 });
  const user = await findUserByEmail(email);
  if (!user) return Response.json({ error: "邮箱或验证码不正确" }, { status: 401 });
  const verified = await verifyUserCode(email, "reset", body.code!);
  if (!verified.ok) return Response.json({ error: verified.error }, { status: 400 });
  const nextPassword = await hashPassword(body.password!);
  await ensureDatabaseSchema();
  const db = await getD1();
  await db.batch([
    db.prepare("UPDATE users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?").bind(nextPassword.hash, nextPassword.salt, Date.now(), user.id),
    db.prepare("DELETE FROM user_sessions WHERE user_id = ?").bind(user.id),
  ]);
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

import { ensureDatabaseSchema, getD1 } from "../../../../../db/runtime";
import { hashValue, randomCode, randomToken, sameOrigin } from "../../../../../lib/admin-email-auth";
import { findUserByEmail, normalizeEmail, USER_CODE_COOLDOWN_MS, USER_CODE_TTL_MS, type AuthPurpose } from "../../../../../lib/user-auth";
import { sendUserOtp } from "../../../../../lib/user-otp";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { identifier?: string; purpose?: AuthPurpose };
  const email = normalizeEmail(body.identifier || "");
  const purpose = body.purpose;
  if (!email || !purpose || !["register", "login", "reset"].includes(purpose)) {
    return Response.json({ error: "请输入有效的邮箱地址" }, { status: 400 });
  }

  const existingUser = await findUserByEmail(email);
  if (purpose === "register" && existingUser) return Response.json({ error: "该账号已经注册，请直接登录" }, { status: 409 });
  if (purpose !== "register" && !existingUser) {
    return Response.json({ ok: true, expiresIn: USER_CODE_TTL_MS / 1000 }, { headers: { "Cache-Control": "no-store" } });
  }

  await ensureDatabaseSchema();
  const db = await getD1();
  const now = Date.now();
  const recent = await db.prepare("SELECT created_at FROM user_auth_codes WHERE destination = ? ORDER BY created_at DESC LIMIT 1")
    .bind(email).first<{ created_at: number }>();
  if (recent && now - recent.created_at < USER_CODE_COOLDOWN_MS) {
    const retryAfter = Math.ceil((USER_CODE_COOLDOWN_MS - (now - recent.created_at)) / 1000);
    return Response.json({ error: `请在 ${retryAfter} 秒后重试`, retryAfter }, { status: 429 });
  }

  const code = randomCode();
  const salt = randomToken(16);
  const codeHash = await hashValue(`${email}:${purpose}:${code}:${salt}`);
  await db.batch([
    db.prepare("DELETE FROM user_auth_codes WHERE expires_at < ? OR used_at IS NOT NULL").bind(now),
    db.prepare("INSERT INTO user_auth_codes (destination, channel, purpose, code_hash, salt, attempts, expires_at, created_at) VALUES (?, 'email', ?, ?, ?, 0, ?, ?)")
      .bind(email, purpose, codeHash, salt, now + USER_CODE_TTL_MS, now),
  ]);

  const delivery = await sendUserOtp(email, code, purpose);
  if (!delivery.ok) {
    await db.prepare("DELETE FROM user_auth_codes WHERE code_hash = ?").bind(codeHash).run();
    return Response.json({ error: delivery.unconfigured ? "邮件服务尚未配置" : "邮件发送失败，请稍后重试" }, { status: delivery.unconfigured ? 503 : 502 });
  }
  return Response.json({ ok: true, expiresIn: USER_CODE_TTL_MS / 1000 }, { headers: { "Cache-Control": "no-store" } });
}

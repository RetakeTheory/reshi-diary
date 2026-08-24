import { ensureDatabaseSchema, getD1 } from "../../../../../db/runtime";
import { ADMIN_EMAIL, CODE_TTL_MS, SEND_COOLDOWN_MS, hashValue, randomCode, randomToken, sameOrigin } from "../../../../../lib/admin-email-auth";
import { sendAdminLoginCode } from "../../../../../lib/admin-mail";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { email?: string };
  if (body.email?.trim().toLowerCase() !== ADMIN_EMAIL) return Response.json({ error: "管理员邮箱不正确" }, { status: 400 });

  await ensureDatabaseSchema();
  const db = await getD1();
  const now = Date.now();
  const recent = await db.prepare("SELECT created_at FROM admin_login_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1")
    .bind(ADMIN_EMAIL).first<{ created_at: number }>();
  if (recent && now - recent.created_at < SEND_COOLDOWN_MS) {
    const retryAfter = Math.ceil((SEND_COOLDOWN_MS - (now - recent.created_at)) / 1000);
    return Response.json({ error: `请在 ${retryAfter} 秒后重试`, retryAfter }, { status: 429 });
  }

  const code = randomCode();
  const salt = randomToken(16);
  const codeHash = await hashValue(`${ADMIN_EMAIL}:${code}:${salt}`);
  const expiresAt = now + CODE_TTL_MS;
  await db.batch([
    db.prepare("DELETE FROM admin_login_codes WHERE expires_at < ? OR used_at IS NOT NULL").bind(now),
    db.prepare("INSERT INTO admin_login_codes (email, code_hash, salt, attempts, expires_at, created_at) VALUES (?, ?, ?, 0, ?, ?)")
      .bind(ADMIN_EMAIL, codeHash, salt, expiresAt, now),
  ]);

  const mailResult = await sendAdminLoginCode(code);
  if (!mailResult.ok) {
    await db.prepare("DELETE FROM admin_login_codes WHERE code_hash = ?").bind(codeHash).run();
    const errors = {
      unconfigured: "验证码邮件尚未配置完整：请设置 ADMIN_EMAIL、RESEND_API_KEY 和 RESEND_FROM",
      invalid_key: "Resend API Key 无效，请在 Cloudflare 中更新 RESEND_API_KEY",
      testing_recipient: "当前仍使用 Resend 测试发件地址；请验证自己的域名并设置 RESEND_FROM",
      sender_unverified: "RESEND_FROM 使用的域名尚未通过 Resend 验证",
      rejected: "邮件服务拒绝了发送请求，请检查 Resend 控制台中的发送记录",
      unavailable: "暂时无法连接邮件服务，请稍后重试，或使用 Passkey 登录",
    } as const;
    return Response.json(
      { error: errors[mailResult.reason], code: `MAIL_${mailResult.reason.toUpperCase()}` },
      { status: mailResult.reason === "unconfigured" ? 503 : 502, headers: { "Cache-Control": "no-store" } },
    );
  }
  return Response.json({ ok: true, expiresIn: CODE_TTL_MS / 1000 }, { headers: { "Cache-Control": "no-store" } });
}

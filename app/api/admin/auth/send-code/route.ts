import { ensureDatabaseSchema, getD1 } from "../../../../../db/runtime";
import { ADMIN_EMAIL, CODE_TTL_MS, SEND_COOLDOWN_MS, hashValue, randomCode, randomToken, sameOrigin } from "../../../../../lib/admin-email-auth";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { email?: string };
  if (body.email?.trim().toLowerCase() !== ADMIN_EMAIL) return Response.json({ error: "管理员邮箱不正确" }, { status: 400 });

  const { env } = await import("cloudflare:workers");
  const apiKey = env.RESEND_API_KEY;
  const from = env.RESEND_FROM || "reshi的日记本 <onboarding@resend.dev>";
  if (!apiKey) return Response.json({ error: "邮件服务尚未配置" }, { status: 503 });

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

  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `reshi-login-${salt}`,
    },
    body: JSON.stringify({
      from,
      to: [ADMIN_EMAIL],
      subject: "reshi的日记本 · 登录验证码",
      text: `你的登录验证码是 ${code}。验证码 10 分钟内有效，请勿转发给他人。`,
      html: `<div style="font-family:system-ui,sans-serif;padding:24px;color:#181927"><p style="color:#7657f6;font-weight:700">RESHI'S DIARY</p><h1 style="font-size:24px">登录验证码</h1><p>你正在登录 reshi 的日记本后台。</p><div style="margin:24px 0;padding:18px;border-radius:14px;background:#f0edff;color:#6548e8;font-size:32px;font-weight:800;letter-spacing:8px;text-align:center">${code}</div><p style="color:#6b6f80;font-size:13px">验证码 10 分钟内有效，请勿转发给他人。如果不是你本人操作，可以忽略此邮件。</p></div>`,
    }),
  });

  if (!emailResponse.ok) {
    await db.prepare("DELETE FROM admin_login_codes WHERE code_hash = ?").bind(codeHash).run();
    return Response.json({ error: "验证码邮件发送失败，请检查邮件服务设置" }, { status: 502 });
  }
  return Response.json({ ok: true, expiresIn: CODE_TTL_MS / 1000 });
}

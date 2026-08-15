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
    return Response.json(
      { error: mailResult.unconfigured ? "邮件服务尚未配置" : "邮件暂时发送失败，请稍后重试" },
      { status: mailResult.unconfigured ? 503 : 502, headers: { "Cache-Control": "no-store" } },
    );
  }
  return Response.json({ ok: true, expiresIn: CODE_TTL_MS / 1000 }, { headers: { "Cache-Control": "no-store" } });
}

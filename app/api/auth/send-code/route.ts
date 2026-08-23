import { ensureDatabaseSchema, getD1 } from "../../../../db/runtime";
import { CODE_TTL_MS, SEND_COOLDOWN_MS, hashValue, randomCode, randomToken, sameOrigin } from "../../../../lib/admin-email-auth";
import { displayNameKey, normalizeDisplayName, normalizeReaderEmail, readerFromRequest, validReaderEmail } from "../../../../lib/reader-auth";
import { sendReaderLoginCode } from "../../../../lib/reader-mail";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { email?: string; intent?: string; displayName?: string };
  const email = normalizeReaderEmail(body.email || "");
  const intent = body.intent === "register" || body.intent === "set_password" || body.intent === "reset_password" ? body.intent : "login";
  const displayName = normalizeDisplayName(body.displayName || "");
  if (!validReaderEmail(email)) return Response.json({ error: "请输入有效邮箱地址" }, { status: 400 });
  if (intent === "register" && (displayName.length < 2 || displayName.length > 40)) {
    return Response.json({ error: "显示名称需为 2–40 个字符" }, { status: 400 });
  }

  await ensureDatabaseSchema();
  const db = await getD1();
  const user = await db.prepare("SELECT id, is_banned FROM users WHERE email = ? LIMIT 1").bind(email).first<{ id: string; is_banned: number }>();
  if (intent === "register" && user) return Response.json({ error: "该邮箱已注册，请直接登录" }, { status: 409 });
  if (intent === "register" && await db.prepare("SELECT 1 FROM users WHERE display_name_key = ? LIMIT 1").bind(displayNameKey(displayName)).first()) return Response.json({ error: "该昵称已被使用" }, { status: 409 });
  if (intent !== "register" && !user) return Response.json({ error: "该邮箱尚未注册" }, { status: 404 });
  if (user?.is_banned) return Response.json({ error: "此账户已被封禁" }, { status: 403 });
  if (intent === "set_password") {
    const current = await readerFromRequest(request);
    if (!current || current.id !== user?.id) return Response.json({ error: "请先登录本人账户" }, { status: 401 });
  }

  const now = Date.now();
  const recent = await db.prepare("SELECT created_at FROM reader_login_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1")
    .bind(email).first<{ created_at: number }>();
  if (recent && now - recent.created_at < SEND_COOLDOWN_MS) {
    return Response.json({ error: `请在 ${Math.ceil((SEND_COOLDOWN_MS - now + recent.created_at) / 1000)} 秒后重试` }, { status: 429 });
  }
  const code = randomCode();
  const salt = randomToken(16);
  const codeHash = await hashValue(`${email}:${code}:${salt}`);
  await db.batch([
    db.prepare("DELETE FROM reader_login_codes WHERE expires_at < ? OR used_at IS NOT NULL").bind(now),
    db.prepare(`INSERT INTO reader_login_codes (email, intent, display_name, code_hash, salt, attempts, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)`)
      .bind(email, intent, displayName || null, codeHash, salt, now + CODE_TTL_MS, now),
  ]);
  const purpose = intent === "set_password" ? "设置密码" : intent === "reset_password" ? "重置密码" : intent === "register" ? "注册" : "登录";
  const mail = await sendReaderLoginCode(email, code, purpose);
  if (!mail.ok) {
    await db.prepare("DELETE FROM reader_login_codes WHERE code_hash = ?").bind(codeHash).run();
    return Response.json({ error: mail.unconfigured ? "邮件服务尚未配置" : "邮件发送失败，请稍后重试" }, { status: mail.unconfigured ? 503 : 502 });
  }
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

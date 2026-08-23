import { ensureDatabaseSchema, getD1 } from "../../../../db/runtime";
import { hashValue, sameOrigin } from "../../../../lib/admin-email-auth";
import { displayNameKey, issueReaderSession, normalizeReaderEmail, uniqueReaderUid } from "../../../../lib/reader-auth";

type LoginCode = { id: number; intent: string; display_name: string | null; code_hash: string; salt: string; attempts: number; expires_at: number };

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { email?: string; code?: string; intent?: string };
  const email = normalizeReaderEmail(body.email || "");
  const intent = body.intent === "register" ? "register" : "login";
  const code = body.code?.trim() || "";
  if (!/^\d{6}$/.test(code)) return Response.json({ error: "请输入 6 位验证码" }, { status: 400 });

  await ensureDatabaseSchema();
  const db = await getD1();
  const row = await db.prepare(`SELECT id, intent, display_name, code_hash, salt, attempts, expires_at
    FROM reader_login_codes WHERE email = ? AND intent = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1`)
    .bind(email, intent).first<LoginCode>();
  const now = Date.now();
  if (!row || row.expires_at <= now) return Response.json({ error: "验证码已过期，请重新发送" }, { status: 400 });
  if (row.attempts >= 5) return Response.json({ error: "尝试次数过多，请重新发送验证码" }, { status: 429 });
  if (await hashValue(`${email}:${code}:${row.salt}`) !== row.code_hash) {
    await db.prepare("UPDATE reader_login_codes SET attempts = attempts + 1 WHERE id = ?").bind(row.id).run();
    return Response.json({ error: "验证码不正确" }, { status: 400 });
  }
  await db.prepare("UPDATE reader_login_codes SET used_at = ? WHERE id = ?").bind(now, row.id).run();
  let user = await db.prepare("SELECT id FROM users WHERE email = ? LIMIT 1").bind(email).first<{ id: string }>();
  if (!user && intent === "register") {
    user = { id: crypto.randomUUID() };
    const displayName = row.display_name || email.split("@")[0];
    await db.prepare("INSERT INTO users (id, uid, email, display_name, display_name_key, points, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)")
      .bind(user.id, await uniqueReaderUid(db), email, displayName, displayNameKey(displayName), now, now).run();
  }
  if (!user) return Response.json({ error: "账户不存在，请先注册" }, { status: 404 });
  return Response.json({ ok: true }, { headers: { "Set-Cookie": await issueReaderSession(user.id), "Cache-Control": "no-store" } });
}

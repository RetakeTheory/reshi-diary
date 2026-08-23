import { ensureDatabaseSchema, getD1 } from "../../../../db/runtime";
import { hashValue, sameOrigin } from "../../../../lib/admin-email-auth";
import { issueReaderSession, normalizeReaderEmail } from "../../../../lib/reader-auth";
import { validReaderPassword, verifyReaderPassword } from "../../../../lib/reader-password";

function clientIp(request: Request) { return request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown"; }

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { identifier?: string; password?: string };
  const identifier = (body.identifier || "").trim(); const password = body.password || "";
  if (!identifier || !validReaderPassword(password)) return Response.json({ error: "账号或密码错误" }, { status: 400 });
  await ensureDatabaseSchema(); const db = await getD1(); const now = Date.now();
  const keyHash = await hashValue(`${normalizeReaderEmail(identifier)}:${clientIp(request)}`);
  const throttle = await db.prepare("SELECT attempts, window_started_at FROM reader_password_attempts WHERE key_hash = ?").bind(keyHash).first<{ attempts: number; window_started_at: number }>();
  if (throttle && now - throttle.window_started_at < 15 * 60_000 && throttle.attempts >= 8) return Response.json({ error: "尝试次数过多，请 15 分钟后再试" }, { status: 429 });
  const user = await db.prepare("SELECT id, password_hash, is_banned FROM users WHERE email = ? OR uid = ? LIMIT 1")
    .bind(normalizeReaderEmail(identifier), identifier).first<{ id: string; password_hash: string | null; is_banned: number }>();
  const valid = Boolean(user?.password_hash) && await verifyReaderPassword(password, user!.password_hash!);
  if (!valid) {
    await db.prepare(`INSERT INTO reader_password_attempts (key_hash, attempts, window_started_at) VALUES (?, 1, ?)
      ON CONFLICT(key_hash) DO UPDATE SET attempts = CASE WHEN ? - window_started_at >= 900000 THEN 1 ELSE attempts + 1 END, window_started_at = CASE WHEN ? - window_started_at >= 900000 THEN ? ELSE window_started_at END`)
      .bind(keyHash, now, now, now, now).run();
    return Response.json({ error: "账号或密码错误" }, { status: 401 });
  }
  if (user!.is_banned) return Response.json({ error: "此账户已被封禁" }, { status: 403 });
  await db.prepare("DELETE FROM reader_password_attempts WHERE key_hash = ?").bind(keyHash).run();
  return Response.json({ ok: true }, { headers: { "Set-Cookie": await issueReaderSession(user!.id), "Cache-Control": "no-store" } });
}

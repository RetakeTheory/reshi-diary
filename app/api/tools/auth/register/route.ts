import { ensureDatabaseSchema, getD1 } from "../../../../../db/runtime";
import { sameOrigin } from "../../../../../lib/admin-email-auth";
import { findUserByEmail, hashPassword, issueUserSession, normalizeEmail, validatePassword, verifyUserCode } from "../../../../../lib/user-auth";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { identifier?: string; code?: string; password?: string; displayName?: string };
  const email = normalizeEmail(body.identifier || "");
  const password = body.password || "";
  const passwordError = validatePassword(password);
  const displayName = (body.displayName || "").trim().slice(0, 30);
  if (!email) return Response.json({ error: "请输入有效的邮箱地址" }, { status: 400 });
  if (passwordError) return Response.json({ error: passwordError }, { status: 400 });
  if (!/^\d{6}$/.test(body.code || "")) return Response.json({ error: "请输入 6 位验证码" }, { status: 400 });
  if (await findUserByEmail(email)) return Response.json({ error: "该邮箱已经注册" }, { status: 409 });

  const verified = await verifyUserCode(email, "register", body.code!);
  if (!verified.ok) return Response.json({ error: verified.error }, { status: 400 });
  const passwordValue = await hashPassword(password);
  const userId = crypto.randomUUID();
  const now = Date.now();
  await ensureDatabaseSchema();
  const db = await getD1();
  try {
    await db.prepare("INSERT INTO users (id, email, password_hash, password_salt, display_name, verified_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(userId, email, passwordValue.hash, passwordValue.salt, displayName || email.split("@")[0], now, now, now).run();
  } catch {
    return Response.json({ error: "该账号已经注册" }, { status: 409 });
  }
  return Response.json({ ok: true }, { status: 201, headers: { "Set-Cookie": await issueUserSession(userId), "Cache-Control": "no-store" } });
}

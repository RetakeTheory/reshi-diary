import { sameOrigin } from "../../../../../lib/admin-email-auth";
import { findUserByEmail, issueUserSession, normalizeEmail, verifyUserCode } from "../../../../../lib/user-auth";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { identifier?: string; code?: string };
  const email = normalizeEmail(body.identifier || "");
  if (!email || !/^\d{6}$/.test(body.code || "")) return Response.json({ error: "请输入有效邮箱和 6 位验证码" }, { status: 400 });
  const user = await findUserByEmail(email);
  if (!user) return Response.json({ error: "邮箱或验证码不正确" }, { status: 401 });
  const verified = await verifyUserCode(email, "login", body.code!);
  if (!verified.ok) return Response.json({ error: verified.error }, { status: 400 });
  return Response.json({ ok: true }, { headers: { "Set-Cookie": await issueUserSession(user.id), "Cache-Control": "no-store" } });
}

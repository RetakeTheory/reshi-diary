import { sameOrigin } from "../../../../../lib/admin-email-auth";
import { findUserByEmail, issueUserSession, normalizeEmail, verifyPassword } from "../../../../../lib/user-auth";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { identifier?: string; password?: string };
  const email = normalizeEmail(body.identifier || "");
  if (!email || !body.password) return Response.json({ error: "请输入邮箱和密码" }, { status: 400 });
  const user = await findUserByEmail(email);
  if (!user || !(await verifyPassword(body.password, user.password_salt, user.password_hash))) {
    return Response.json({ error: "账号或密码不正确" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({ ok: true }, { headers: { "Set-Cookie": await issueUserSession(user.id), "Cache-Control": "no-store" } });
}

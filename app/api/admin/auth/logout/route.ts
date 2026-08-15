import { cookies } from "next/headers";
import { ensureDatabaseSchema, getD1 } from "../../../../../db/runtime";
import { ADMIN_SESSION_COOKIE, hashValue, sameOrigin } from "../../../../../lib/admin-email-auth";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response("请求来源无效", { status: 403 });
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (token) {
    await ensureDatabaseSchema();
    const db = await getD1();
    await db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(await hashValue(token)).run();
  }
  return new Response(null, {
    status: 303,
    headers: {
      "Location": "/admin/login",
      "Set-Cookie": `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    },
  });
}

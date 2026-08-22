import { ensureDatabaseSchema, getD1 } from "../../../../db/runtime";
import { hashValue, sameOrigin } from "../../../../lib/admin-email-auth";
import { READER_SESSION_COOKIE, clearReaderSessionCookie } from "../../../../lib/reader-auth";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const token = (request.headers.get("cookie") || "").split(";").map((item) => item.trim()).find((item) => item.startsWith(`${READER_SESSION_COOKIE}=`))?.slice(READER_SESSION_COOKIE.length + 1);
  if (token) {
    await ensureDatabaseSchema();
    const db = await getD1();
    await db.prepare("DELETE FROM reader_sessions WHERE token_hash = ?").bind(await hashValue(token)).run();
  }
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearReaderSessionCookie(), "Cache-Control": "no-store" } });
}

import { publicReader, readerFromRequest } from "../../../../lib/reader-auth";

export async function GET(request: Request) {
  const user = await readerFromRequest(request);
  if (!user) return Response.json({ error: "请先登录" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  return Response.json({ user: publicReader(user) }, { headers: { "Cache-Control": "no-store" } });
}

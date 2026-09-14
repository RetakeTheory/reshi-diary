import { env } from "cloudflare:workers";
import { readChaoxingQuerySession } from "../../../../lib/chaoxing-query-auth";

export async function GET(request: Request) {
  const session = await readChaoxingQuerySession(request);
  if (!session) return Response.json({ error: "请先登录" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const snapshot = await env.ONEBOT.getByName(session.bot_id).queryChaoxingByUid(session.uid).catch(() => null);
  return snapshot
    ? Response.json({ snapshot }, { headers: { "Cache-Control": "no-store" } })
    : Response.json({ error: "未找到当前账号的挂课记录，请重新登录" }, { status: 404, headers: { "Cache-Control": "no-store" } });
}

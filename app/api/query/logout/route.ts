import { sameOrigin } from "../../../../lib/admin-email-auth";
import { clearChaoxingQueryCookie, deleteChaoxingQuerySession } from "../../../../lib/chaoxing-query-auth";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  await deleteChaoxingQuerySession(request);
  return Response.json({ ok: true }, {
    headers: { "Set-Cookie": clearChaoxingQueryCookie(), "Cache-Control": "no-store" },
  });
}

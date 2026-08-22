import { publicReader, readerFromRequest } from "../../../../lib/reader-auth";
import { dailyTaskState } from "../../../../lib/reader-points";

export async function GET(request: Request) {
  const user = await readerFromRequest(request);
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  return Response.json({ user: publicReader(user), tasks: await dailyTaskState(user.id) }, { headers: { "Cache-Control": "no-store" } });
}

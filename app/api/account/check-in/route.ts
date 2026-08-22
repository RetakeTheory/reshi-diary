import { sameOrigin } from "../../../../lib/admin-email-auth";
import { publicReader, readerFromRequest } from "../../../../lib/reader-auth";
import { awardDailyPoints, dailyTaskState } from "../../../../lib/reader-points";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const user = await readerFromRequest(request);
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const awarded = await awardDailyPoints(user.id, "check_in");
  if (awarded) user.points += 2;
  return Response.json({ awarded, user: publicReader(user), tasks: await dailyTaskState(user.id) }, { headers: { "Cache-Control": "no-store" } });
}

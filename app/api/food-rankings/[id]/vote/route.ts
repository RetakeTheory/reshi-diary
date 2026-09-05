import { saveFoodRating } from "../../../../../lib/food-ratings-store";
import { ensureDatabaseSchema, getD1 } from "../../../../../db/runtime";
import { sameOrigin } from "../../../../../lib/admin-email-auth";
import { readerFromRequest } from "../../../../../lib/reader-auth";
import { normalizeFoodRating } from "../../../../../lib/food-rankings";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const user = await readerFromRequest(request);
  if (!user) return Response.json({ error: "请先登录注册用户账户再评分" }, { status: 401 });
  let rating: number | null;
  try { const body = await request.json(); rating = normalizeFoodRating(body?.rating); }
  catch { return Response.json({ error: "评分必须是 1–5 的整数，撤回评分请传 null" }, { status: 400 }); }
  const { id } = await context.params;
  await ensureDatabaseSchema(); const db = await getD1();
  if (!await db.prepare("SELECT 1 FROM food_rankings WHERE id = ?").bind(id).first()) return Response.json({ error: "餐厅不存在" }, { status: 404 });
  const totals = await saveFoodRating(db, id, user.id, rating);
  return Response.json(totals, { headers: { "Cache-Control": "no-store" } });
}

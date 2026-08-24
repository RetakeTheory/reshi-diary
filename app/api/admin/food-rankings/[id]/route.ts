import { ensureDatabaseSchema, getD1 } from "../../../../../db/runtime";
import { sameOrigin } from "../../../../../lib/admin-email-auth";
import { foodRankingFromRow, foodRankingSelect, normalizeFoodRankingInput } from "../../../../../lib/food-rankings";
import { getApiAdmin } from "../../../../admin/admin-auth";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  if (!await getApiAdmin()) return Response.json({ error: "请先登录管理员账户" }, { status: 401 });
  try {
    const input = normalizeFoodRankingInput(await request.json()); const { id } = await context.params;
    await ensureDatabaseSchema(); const db = await getD1();
    const result = await db.prepare("UPDATE food_rankings SET list_type = ?, restaurant = ?, location = ?, category = ?, summary = ?, details = ?, tags_json = ?, image_url = ?, updated_at = ? WHERE id = ?").bind(input.listType, input.restaurant, input.location, input.category, input.summary, input.details, JSON.stringify(input.tags), input.imageUrl, Date.now(), id).run();
    if (!result.meta.changes) return Response.json({ error: "榜单条目不存在" }, { status: 404 });
    const row = await db.prepare(`${foodRankingSelect} WHERE id = ?`).bind(id).first<Record<string, unknown>>();
    return Response.json({ entry: foodRankingFromRow(row!) });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "保存失败" }, { status: 400 }); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  if (!await getApiAdmin()) return Response.json({ error: "请先登录管理员账户" }, { status: 401 });
  const { id } = await context.params; await ensureDatabaseSchema(); const db = await getD1();
  await db.prepare("DELETE FROM food_rankings WHERE id = ?").bind(id).run(); return Response.json({ ok: true });
}

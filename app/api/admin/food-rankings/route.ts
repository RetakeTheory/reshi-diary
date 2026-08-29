import { ensureDatabaseSchema, getD1 } from "../../../../db/runtime";
import { sameOrigin } from "../../../../lib/admin-email-auth";
import { foodRankingFromRow, foodRankingSelect, normalizeFoodRankingInput } from "../../../../lib/food-rankings";
import { getApiAdmin } from "../../../admin/admin-auth";

export async function GET() {
  if (!await getApiAdmin()) return Response.json({ error: "请先登录管理员账户" }, { status: 401 });
  await ensureDatabaseSchema(); const db = await getD1();
  const rows = await db.prepare(`${foodRankingSelect} ORDER BY updated_at DESC`).all<Record<string, unknown>>();
  return Response.json({ entries: (rows.results || []).map(foodRankingFromRow) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  if (!await getApiAdmin()) return Response.json({ error: "请先登录管理员账户" }, { status: 401 });
  try {
    const input = normalizeFoodRankingInput(await request.json()); const id = crypto.randomUUID(); const now = Date.now();
    await ensureDatabaseSchema(); const db = await getD1();
    await db.prepare("INSERT INTO food_rankings (id, list_type, restaurant, location, category, summary, details, tags_json, image_url, latitude, longitude, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, input.listType, input.restaurant, input.location, input.category, input.summary, input.details, JSON.stringify(input.tags), input.imageUrl, input.latitude, input.longitude, now, now).run();
    const row = await db.prepare(`${foodRankingSelect} WHERE id = ?`).bind(id).first<Record<string, unknown>>();
    return Response.json({ entry: foodRankingFromRow(row!) }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "添加失败" }, { status: 400 }); }
}


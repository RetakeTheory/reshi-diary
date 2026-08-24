import { ensureDatabaseSchema, getD1 } from "../../../db/runtime";
import { foodRankingFromRow, foodRankingSelect } from "../../../lib/food-rankings";

export async function GET() {
  await ensureDatabaseSchema(); const db = await getD1();
  const rows = await db.prepare(`${foodRankingSelect} ORDER BY updated_at DESC`).all<Record<string, unknown>>();
  return Response.json({ entries: (rows.results || []).map(foodRankingFromRow) }, { headers: { "Cache-Control": "public, max-age=60" } });
}

import { ensureDatabaseSchema, getD1 } from "../../../db/runtime";
import { foodRankingFromRow, foodRankingSelect } from "../../../lib/food-rankings";
import { readerFromRequest } from "../../../lib/reader-auth";

export async function GET(request: Request) {
  await ensureDatabaseSchema(); const db = await getD1();
  const rows = await db.prepare(`${foodRankingSelect} ORDER BY updated_at DESC`).all<Record<string, unknown>>();
  const totals = await db.prepare(`SELECT entry_id AS entryId,
    SUM(CASE WHEN vote = 'up' THEN 1 ELSE 0 END) AS likes,
    SUM(CASE WHEN vote = 'down' THEN 1 ELSE 0 END) AS dislikes
    FROM food_ranking_votes GROUP BY entry_id`).all<{ entryId: string; likes: number; dislikes: number }>();
  const totalMap = new Map((totals.results || []).map((item) => [item.entryId, item]));
  const user = await readerFromRequest(request);
  const mine = user ? await db.prepare("SELECT entry_id AS entryId, vote FROM food_ranking_votes WHERE user_id = ?").bind(user.id).all<{ entryId: string; vote: "up" | "down" }>() : { results: [] };
  const mineMap = new Map((mine.results || []).map((item) => [item.entryId, item.vote]));
  const entries = (rows.results || []).map((row) => foodRankingFromRow({ ...row, ...(totalMap.get(String(row.id)) || {}), myVote: mineMap.get(String(row.id)) || null }));
  return Response.json({ entries, canVote: Boolean(user) }, { headers: { "Cache-Control": "no-store" } });
}

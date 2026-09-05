import { ensureDatabaseSchema, getD1 } from "../../../db/runtime";
import { foodRankingFromRow, foodRankingSelect } from "../../../lib/food-rankings";
import { readerFromRequest } from "../../../lib/reader-auth";

export async function GET(request: Request) {
  await ensureDatabaseSchema(); const db = await getD1();
  const rows = await db.prepare(`${foodRankingSelect} ORDER BY updated_at DESC`).all<Record<string, unknown>>();
  const user = await readerFromRequest(request);
  const mine = user ? await db.prepare("SELECT entry_id AS entryId, rating FROM food_ratings WHERE user_id = ?").bind(user.id).all<{ entryId: string; rating: number }>() : { results: [] };
  const mineMap = new Map((mine.results || []).map((item) => [item.entryId, item.rating]));
  const entries = (rows.results || []).map((row) => foodRankingFromRow({ ...row, myRating: mineMap.get(String(row.id)) || null }));
  return Response.json({ entries, canVote: Boolean(user) }, { headers: { "Cache-Control": "no-store" } });
}

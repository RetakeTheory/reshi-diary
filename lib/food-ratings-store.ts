export async function saveFoodRating(db: D1Database, id: string, userId: string, rating: number | null) {
  const now = Date.now();
  const mutation = rating === null
    ? db.prepare("DELETE FROM food_ratings WHERE entry_id = ? AND user_id = ?").bind(id, userId)
    : db.prepare(`INSERT INTO food_ratings (entry_id, user_id, rating, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(entry_id, user_id) DO UPDATE SET rating = excluded.rating, updated_at = excluded.updated_at`).bind(id, userId, rating, now, now);
  const results = await db.batch<{ averageRating: number | null; ratingCount: number }>([
    mutation,
    db.prepare("SELECT AVG(rating) AS averageRating, COUNT(*) AS ratingCount FROM food_ratings WHERE entry_id = ?").bind(id),
  ]);
  const totals = results[1].results[0];
  return { averageRating: totals.averageRating, ratingCount: totals.ratingCount, myRating: rating };
}

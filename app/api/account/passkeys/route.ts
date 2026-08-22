import { ensureDatabaseSchema, getD1 } from "../../../../db/runtime";
import { readerFromRequest } from "../../../../lib/reader-auth";

export async function GET(request: Request) {
  const user = await readerFromRequest(request);
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  await ensureDatabaseSchema(); const db = await getD1();
  const rows = await db.prepare("SELECT id, name, created_at, last_used_at FROM reader_passkeys WHERE user_id = ? ORDER BY created_at DESC")
    .bind(user.id).all<{ id: string; name: string; created_at: number; last_used_at: number | null }>();
  return Response.json({ passkeys: rows.results.map((row) => ({ id: row.id, name: row.name, createdAt: row.created_at, lastUsedAt: row.last_used_at })) }, { headers: { "Cache-Control": "no-store" } });
}

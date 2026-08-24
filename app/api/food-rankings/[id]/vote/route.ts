import { ensureDatabaseSchema, getD1 } from "../../../../../db/runtime";
import { sameOrigin } from "../../../../../lib/admin-email-auth";
import { readerFromRequest } from "../../../../../lib/reader-auth";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const user = await readerFromRequest(request);
  if (!user) return Response.json({ error: "请先登录注册用户账户再发表意见" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { vote?: unknown };
  const vote = body.vote === "up" || body.vote === "down" ? body.vote : body.vote === null ? null : undefined;
  if (vote === undefined) return Response.json({ error: "投票类型无效" }, { status: 400 });
  const { id } = await context.params; await ensureDatabaseSchema(); const db = await getD1();
  if (!await db.prepare("SELECT 1 FROM food_rankings WHERE id = ? LIMIT 1").bind(id).first()) return Response.json({ error: "榜单条目不存在" }, { status: 404 });
  const now = Date.now();
  if (vote === null) await db.prepare("DELETE FROM food_ranking_votes WHERE entry_id = ? AND user_id = ?").bind(id, user.id).run();
  else await db.prepare(`INSERT INTO food_ranking_votes (entry_id, user_id, vote, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(entry_id, user_id) DO UPDATE SET vote = excluded.vote, updated_at = excluded.updated_at`).bind(id, user.id, vote, now, now).run();
  const totals = await db.prepare(`SELECT
    SUM(CASE WHEN vote = 'up' THEN 1 ELSE 0 END) AS likes,
    SUM(CASE WHEN vote = 'down' THEN 1 ELSE 0 END) AS dislikes
    FROM food_ranking_votes WHERE entry_id = ?`).bind(id).first<{ likes: number; dislikes: number }>();
  return Response.json({ likes: Number(totals?.likes || 0), dislikes: Number(totals?.dislikes || 0), myVote: vote });
}

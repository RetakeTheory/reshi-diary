import { ensureDatabaseSchema, getD1 } from "../../../../../db/runtime";
import { sameOrigin } from "../../../../../lib/admin-email-auth";
import { readerFromRequest } from "../../../../../lib/reader-auth";
import { awardDailyPoints } from "../../../../../lib/reader-points";

const kinds = new Set(["heart", "spark", "insight"]);

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const user = await readerFromRequest(request);
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const input = await request.json().catch(() => ({})) as { kind?: string };
  if (!kinds.has(input.kind || "")) return Response.json({ error: "回应类型无效" }, { status: 400 });
  await ensureDatabaseSchema();
  const db = await getD1();
  const { slug } = await context.params;
  const post = await db.prepare("SELECT id FROM posts WHERE slug = ? AND status = 'published' LIMIT 1").bind(slug).first<{ id: number }>();
  if (!post) return Response.json({ error: "文章不存在" }, { status: 404 });
  const removed = await db.prepare("DELETE FROM post_reactions WHERE post_id = ? AND user_id = ? AND kind = ? RETURNING kind")
    .bind(post.id, user.id, input.kind).first();
  const active = !removed;
  let pointsAwarded = 0;
  if (active) {
    await db.prepare("INSERT INTO post_reactions (post_id, user_id, kind, created_at) VALUES (?, ?, ?, ?)").bind(post.id, user.id, input.kind, Date.now()).run();
    if (await awardDailyPoints(user.id, "reaction")) pointsAwarded = 3;
  }
  const reactions = await db.prepare("SELECT kind, COUNT(*) AS count FROM post_reactions WHERE post_id = ? GROUP BY kind ORDER BY kind").bind(post.id).all();
  return Response.json({ active, reactions: reactions.results || [], pointsAwarded });
}

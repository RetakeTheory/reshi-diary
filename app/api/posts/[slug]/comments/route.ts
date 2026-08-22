import { ensureDatabaseSchema, getD1 } from "../../../../../db/runtime";
import { sameOrigin } from "../../../../../lib/admin-email-auth";
import { readerFromRequest } from "../../../../../lib/reader-auth";
import { readerLevel, readerLevelColor } from "../../../../../lib/reader-levels";
import { awardDailyPoints } from "../../../../../lib/reader-points";

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const user = await readerFromRequest(request);
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const input = await request.json().catch(() => ({})) as { body?: string; parentId?: number | null };
  const body = input.body?.trim() || "";
  if (!body || body.length > 1000) return Response.json({ error: "评论需为 1–1000 字" }, { status: 400 });
  await ensureDatabaseSchema();
  const db = await getD1();
  const { slug } = await context.params;
  const post = await db.prepare("SELECT id FROM posts WHERE slug = ? AND status = 'published' LIMIT 1").bind(slug).first<{ id: number }>();
  if (!post) return Response.json({ error: "文章不存在" }, { status: 404 });
  if (input.parentId) {
    const parent = await db.prepare("SELECT id FROM comments WHERE id = ? AND post_id = ? LIMIT 1").bind(input.parentId, post.id).first();
    if (!parent) return Response.json({ error: "回复的评论不存在" }, { status: 400 });
  }
  const now = Date.now();
  const inserted = await db.prepare(`INSERT INTO comments (post_id, user_id, parent_id, body, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?) RETURNING id`).bind(post.id, user.id, input.parentId || null, body, now, now).first<{ id: number }>();
  const awarded = await awardDailyPoints(user.id, "comment");
  if (awarded) user.points += 3;
  const level = readerLevel(user.points);
  return Response.json({ comment: { id: inserted!.id, parentId: input.parentId || null, body, createdAt: now, userId: user.id, displayName: user.display_name, avatarUrl: user.avatar_key ? `/api/files/${user.avatar_key}` : null, level, levelColor: readerLevelColor(level) }, pointsAwarded: awarded ? 3 : 0 }, { status: 201 });
}

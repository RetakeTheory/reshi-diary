import { ensureDatabaseSchema, getD1 } from "../../../../../db/runtime";
import { readerFromRequest } from "../../../../../lib/reader-auth";
import { readerLevel, readerLevelColor } from "../../../../../lib/reader-levels";

type CommentRow = { id: number; parentId: number | null; body: string; createdAt: number; userId: string; displayName: string; avatarKey: string | null; points: number };

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  await ensureDatabaseSchema();
  const db = await getD1();
  const { slug } = await context.params;
  const post = await db.prepare("SELECT id FROM posts WHERE slug = ? AND status = 'published' LIMIT 1").bind(slug).first<{ id: number }>();
  if (!post) return Response.json({ error: "文章不存在" }, { status: 404 });
  const rows = await db.prepare(`SELECT c.id, c.parent_id AS parentId, c.body, c.created_at AS createdAt,
    u.id AS userId, u.display_name AS displayName, u.avatar_key AS avatarKey, u.points
    FROM comments c JOIN users u ON u.id = c.user_id WHERE c.post_id = ? ORDER BY c.created_at, c.id`)
    .bind(post.id).all<CommentRow>();
  const reactions = await db.prepare("SELECT kind, COUNT(*) AS count FROM post_reactions WHERE post_id = ? GROUP BY kind ORDER BY kind")
    .bind(post.id).all();
  const user = await readerFromRequest(request);
  const mine = user ? await db.prepare("SELECT kind FROM post_reactions WHERE post_id = ? AND user_id = ? ORDER BY kind").bind(post.id, user.id).all<{ kind: string }>() : null;
  const comments = (rows.results || []).map((comment) => {
    const level = readerLevel(comment.points);
    return { ...comment, avatarUrl: comment.avatarKey ? `/api/files/${comment.avatarKey}` : null, level, levelColor: readerLevelColor(level) };
  });
  return Response.json({ comments, reactions: reactions.results || [], myReactions: mine?.results.map((row) => row.kind) || [] }, { headers: { "Cache-Control": "no-store" } });
}

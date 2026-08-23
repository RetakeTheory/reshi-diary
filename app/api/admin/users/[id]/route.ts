import { ensureDatabaseSchema, getD1 } from "../../../../../db/runtime";
import { sameOrigin } from "../../../../../lib/admin-email-auth";
import { getApiAdmin } from "../../../../admin/admin-auth";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  if (!await getApiAdmin()) return Response.json({ error: "请先登录管理员账户" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { banned?: boolean; reason?: string }; const reason = body.reason?.trim().slice(0, 200) || null; const { id } = await context.params;
  await ensureDatabaseSchema(); const db = await getD1(); const now = Date.now();
  const user = await db.prepare(`UPDATE users SET is_banned = ?, ban_reason = ?, banned_at = ?, updated_at = ? WHERE id = ?
    RETURNING id, uid, email, display_name AS displayName, points, is_banned AS isBanned, ban_reason AS banReason, banned_at AS bannedAt, created_at AS createdAt`)
    .bind(body.banned ? 1 : 0, body.banned ? reason : null, body.banned ? now : null, now, id).first();
  if (!user) return Response.json({ error: "用户不存在" }, { status: 404 });
  if (body.banned) await db.prepare("DELETE FROM reader_sessions WHERE user_id = ?").bind(id).run();
  return Response.json({ user }, { headers: { "Cache-Control": "no-store" } });
}

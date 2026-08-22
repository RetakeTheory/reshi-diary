import { ensureDatabaseSchema, getD1 } from "../../../../../db/runtime";
import { sameOrigin } from "../../../../../lib/admin-email-auth";
import { getApiAdmin } from "../../../../admin/admin-auth";

const statuses = new Set(["open", "in_progress", "resolved", "closed"]);

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  if (!await getApiAdmin()) return Response.json({ error: "请先登录管理员账户" }, { status: 401 });
  const id = Number((await context.params).id);
  const body = await request.json().catch(() => ({})) as { status?: string; adminReply?: string };
  if (!Number.isSafeInteger(id) || !statuses.has(body.status || "") || (body.adminReply?.length || 0) > 2000) {
    return Response.json({ error: "工单参数无效" }, { status: 400 });
  }
  await ensureDatabaseSchema();
  const db = await getD1();
  const ticket = await db.prepare(`UPDATE tickets SET status = ?, admin_reply = ?, updated_at = ? WHERE id = ?
    RETURNING id, category, title, body, status, admin_reply AS adminReply, created_at AS createdAt, updated_at AS updatedAt`)
    .bind(body.status, body.adminReply?.trim() || null, Date.now(), id).first();
  if (!ticket) return Response.json({ error: "工单不存在" }, { status: 404 });
  return Response.json({ ticket }, { headers: { "Cache-Control": "no-store" } });
}

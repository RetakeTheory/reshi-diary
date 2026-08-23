import { ensureDatabaseSchema, getD1 } from "../../../../../../db/runtime";
import { sameOrigin } from "../../../../../../lib/admin-email-auth";
import { readerFromRequest } from "../../../../../../lib/reader-auth";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const user = await readerFromRequest(request); if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const id = Number((await context.params).id); const body = await request.json().catch(() => ({})) as { body?: string }; const content = body.body?.trim() || "";
  if (!Number.isSafeInteger(id) || !content || content.length > 2000) return Response.json({ error: "回复需为 1–2000 字" }, { status: 400 });
  await ensureDatabaseSchema(); const db = await getD1(); const ticket = await db.prepare("SELECT id, status FROM tickets WHERE id = ? AND user_id = ? LIMIT 1").bind(id, user.id).first<{ id: number; status: string }>();
  if (!ticket) return Response.json({ error: "工单不存在" }, { status: 404 });
  if (ticket.status === "closed") return Response.json({ error: "已关闭的工单不能继续回复" }, { status: 409 });
  const now = Date.now(); const message = await db.prepare("INSERT INTO ticket_messages (ticket_id, sender_type, sender_id, body, created_at) VALUES (?, 'user', ?, ?, ?) RETURNING id, ticket_id AS ticketId, sender_type AS senderType, body, created_at AS createdAt")
    .bind(id, user.id, content, now).first();
  await db.prepare("UPDATE tickets SET status = 'open', updated_at = ? WHERE id = ?").bind(now, id).run();
  return Response.json({ message, status: "open", updatedAt: now }, { status: 201, headers: { "Cache-Control": "no-store" } });
}

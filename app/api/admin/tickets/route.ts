import { ensureDatabaseSchema, getD1 } from "../../../../db/runtime";
import { getApiAdmin } from "../../../admin/admin-auth";

export async function GET() {
  if (!await getApiAdmin()) return Response.json({ error: "请先登录管理员账户" }, { status: 401 });
  await ensureDatabaseSchema();
  const db = await getD1();
  const rows = await db.prepare(`SELECT t.id, t.user_id AS userId, t.category, t.title, t.body, t.status, t.admin_reply AS adminReply,
    t.created_at AS createdAt, t.updated_at AS updatedAt, u.display_name AS displayName, u.email, u.uid, u.is_banned AS isBanned
    FROM tickets t JOIN users u ON u.id = t.user_id ORDER BY t.updated_at DESC LIMIT 200`).all();
  const messages = await db.prepare("SELECT id, ticket_id AS ticketId, sender_type AS senderType, body, created_at AS createdAt FROM ticket_messages ORDER BY created_at ASC").all();
  return Response.json({ tickets: (rows.results || []).map((ticket) => ({ ...ticket, messages: (messages.results || []).filter((message) => message.ticketId === ticket.id) })) }, { headers: { "Cache-Control": "no-store" } });
}

import { ensureDatabaseSchema, getD1 } from "../../../../db/runtime";
import { getApiAdmin } from "../../../admin/admin-auth";

export async function GET() {
  if (!await getApiAdmin()) return Response.json({ error: "请先登录管理员账户" }, { status: 401 });
  await ensureDatabaseSchema();
  const db = await getD1();
  const rows = await db.prepare(`SELECT t.id, t.category, t.title, t.body, t.status, t.admin_reply AS adminReply,
    t.created_at AS createdAt, t.updated_at AS updatedAt, u.display_name AS displayName, u.email
    FROM tickets t JOIN users u ON u.id = t.user_id ORDER BY t.updated_at DESC LIMIT 200`).all();
  return Response.json({ tickets: rows.results || [] }, { headers: { "Cache-Control": "no-store" } });
}

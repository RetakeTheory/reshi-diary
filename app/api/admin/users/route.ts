import { ensureDatabaseSchema, getD1 } from "../../../../db/runtime";
import { getApiAdmin } from "../../../admin/admin-auth";

export async function GET(request: Request) {
  if (!await getApiAdmin()) return Response.json({ error: "请先登录管理员账户" }, { status: 401 });
  await ensureDatabaseSchema(); const db = await getD1(); const search = new URL(request.url).searchParams.get("q")?.trim() || "";
  const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  const rows = await db.prepare(`SELECT u.id, u.uid, u.email, u.display_name AS displayName, u.points, u.is_banned AS isBanned,
    u.ban_reason AS banReason, u.banned_at AS bannedAt, u.created_at AS createdAt,
    (SELECT COUNT(*) FROM tickets t WHERE t.user_id = u.id) AS ticketCount
    FROM users u WHERE ? = '' OR u.uid = ? OR u.email LIKE ? ESCAPE '\\' OR u.display_name LIKE ? ESCAPE '\\'
    ORDER BY u.created_at DESC LIMIT 200`).bind(search, search, pattern, pattern).all();
  return Response.json({ users: rows.results || [] }, { headers: { "Cache-Control": "no-store" } });
}

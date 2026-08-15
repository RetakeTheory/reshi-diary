import { getApiAdmin } from "../../../admin/admin-auth";
import { ensureDatabaseSchema, getD1 } from "../../../../db/runtime";
import { ADMIN_EMAIL } from "../../../../lib/admin-email-auth";

type PasskeyListRow = { id: string; name: string; device_type: string; backed_up: number; created_at: number; last_used_at: number | null };

export async function GET() {
  if (!await getApiAdmin()) return Response.json({ error: "请先登录管理员账号" }, { status: 401 });
  await ensureDatabaseSchema();
  const db = await getD1();
  const rows = await db.prepare("SELECT id, name, device_type, backed_up, created_at, last_used_at FROM admin_passkeys WHERE email = ? ORDER BY created_at DESC")
    .bind(ADMIN_EMAIL).all<PasskeyListRow>();
  return Response.json({ passkeys: rows.results.map((row) => ({
    id: row.id,
    name: row.name,
    deviceType: row.device_type,
    backedUp: row.device_type === "multiDevice" || Boolean(row.backed_up),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  })) }, { headers: { "Cache-Control": "no-store" } });
}

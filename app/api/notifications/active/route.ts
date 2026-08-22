import { ensureDatabaseSchema, getD1 } from "../../../../db/runtime";

export async function GET() {
  await ensureDatabaseSchema();
  const db = await getD1();
  const notification = await db.prepare(`SELECT id, text, background_color AS backgroundColor,
    created_at AS createdAt, updated_at AS updatedAt FROM notifications WHERE active = 1 ORDER BY updated_at DESC LIMIT 1`).first<Record<string, unknown>>();
  return Response.json({ notification: notification ? { ...notification, foregroundColor: foreground(String(notification.backgroundColor)) } : null }, { headers: { "Cache-Control": "no-store" } });
}

function foreground(background: string) {
  const value = background.replace("#", "");
  const channels = [0, 2, 4].map((start) => Number.parseInt(value.slice(start, start + 2), 16) || 0);
  return channels[0] * .299 + channels[1] * .587 + channels[2] * .114 > 155 ? "#171326" : "#FFFFFF";
}

import { ensureDatabaseSchema, getD1 } from "../../../../db/runtime";
import { sameOrigin } from "../../../../lib/admin-email-auth";
import { getApiAdmin } from "../../../admin/admin-auth";

const colorPattern = /^#[0-9A-Fa-f]{6}$/;

async function current() {
  const db = await getD1();
  return db.prepare(`SELECT id, text, background_color AS backgroundColor, created_at AS createdAt, updated_at AS updatedAt
    FROM notifications WHERE active = 1 ORDER BY updated_at DESC LIMIT 1`).first();
}

export async function GET() {
  if (!await getApiAdmin()) return Response.json({ error: "未登录" }, { status: 401 });
  await ensureDatabaseSchema();
  return Response.json({ notification: await current() }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  if (!await getApiAdmin()) return Response.json({ error: "未登录" }, { status: 401 });
  const input = await request.json().catch(() => ({})) as { text?: string; backgroundColor?: string };
  const text = input.text?.trim() || "";
  if (!text || text.length > 300 || !colorPattern.test(input.backgroundColor || "")) return Response.json({ error: "通知内容或颜色无效" }, { status: 400 });
  await ensureDatabaseSchema();
  const db = await getD1();
  const now = Date.now();
  await db.batch([
    db.prepare("UPDATE notifications SET active = 0, updated_at = ? WHERE active = 1").bind(now),
    db.prepare("INSERT INTO notifications (text, background_color, active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").bind(text, input.backgroundColor!.toUpperCase(), now, now),
  ]);
  return Response.json({ notification: await current() }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  if (!await getApiAdmin()) return Response.json({ error: "未登录" }, { status: 401 });
  await ensureDatabaseSchema();
  const db = await getD1();
  await db.prepare("UPDATE notifications SET active = 0, updated_at = ? WHERE active = 1").bind(Date.now()).run();
  return Response.json({ ok: true });
}

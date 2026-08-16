import { ensureDatabaseSchema, getD1 } from "../../../../db/runtime";
import { sameOrigin } from "../../../../lib/admin-email-auth";
import { getApiToolUser } from "../../../../lib/user-session";

type EventInput = { title?: string; description?: string; location?: string; startsAt?: number; endsAt?: number; allDay?: boolean; source?: "manual" | "ics" };

export async function GET() {
  const user = await getApiToolUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  await ensureDatabaseSchema();
  const db = await getD1();
  const result = await db.prepare("SELECT id, title, description, location, starts_at, ends_at, all_day, source, created_at, updated_at FROM calendar_events WHERE user_id = ? ORDER BY starts_at ASC").bind(user.id).all();
  return Response.json({ events: result.results });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const user = await getApiToolUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as EventInput & { events?: EventInput[] };
  const inputs = Array.isArray(body.events) ? body.events.slice(0, 200) : [body];
  const normalized = inputs.map((item) => ({ title: item.title?.trim().slice(0, 160) || "", description: item.description?.trim().slice(0, 2000) || "", location: item.location?.trim().slice(0, 200) || "", startsAt: Number(item.startsAt), endsAt: Number(item.endsAt), allDay: Boolean(item.allDay), source: item.source === "ics" ? "ics" : "manual" })).filter((item) => item.title && Number.isFinite(item.startsAt) && Number.isFinite(item.endsAt) && item.endsAt >= item.startsAt);
  if (!normalized.length) return Response.json({ error: "没有可导入的有效日程" }, { status: 400 });
  await ensureDatabaseSchema();
  const db = await getD1();
  const now = Date.now();
  await db.batch(normalized.map((item) => db.prepare("INSERT INTO calendar_events (id, user_id, title, description, location, starts_at, ends_at, all_day, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), user.id, item.title, item.description, item.location, item.startsAt, item.endsAt, item.allDay ? 1 : 0, item.source, now, now)));
  return Response.json({ ok: true, count: normalized.length }, { status: 201 });
}

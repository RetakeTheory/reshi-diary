import { ensureDatabaseSchema, getD1 } from "../../../../../db/runtime";
import { sameOrigin } from "../../../../../lib/admin-email-auth";
import { getApiToolUser } from "../../../../../lib/user-session";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const user = await getApiToolUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const id = (await context.params).id;
  const body = await request.json().catch(() => ({})) as { title?: string; description?: string; location?: string; startsAt?: number; endsAt?: number; allDay?: boolean };
  await ensureDatabaseSchema();
  const db = await getD1();
  const current = await db.prepare("SELECT title, description, location, starts_at, ends_at, all_day FROM calendar_events WHERE id = ? AND user_id = ? LIMIT 1").bind(id, user.id).first<{ title: string; description: string; location: string; starts_at: number; ends_at: number; all_day: number }>();
  if (!current) return Response.json({ error: "日程不存在" }, { status: 404 });
  const title = body.title === undefined ? current.title : body.title.trim().slice(0, 160);
  const startsAt = body.startsAt === undefined ? current.starts_at : Number(body.startsAt);
  const endsAt = body.endsAt === undefined ? current.ends_at : Number(body.endsAt);
  if (!title || !Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt < startsAt) return Response.json({ error: "日程内容或时间无效" }, { status: 400 });
  await db.prepare("UPDATE calendar_events SET title = ?, description = ?, location = ?, starts_at = ?, ends_at = ?, all_day = ?, updated_at = ? WHERE id = ? AND user_id = ?")
    .bind(title, body.description === undefined ? current.description : body.description.trim().slice(0, 2000), body.location === undefined ? current.location : body.location.trim().slice(0, 200), startsAt, endsAt, body.allDay === undefined ? current.all_day : body.allDay ? 1 : 0, Date.now(), id, user.id).run();
  return Response.json({ ok: true });
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const user = await getApiToolUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const id = (await context.params).id;
  await ensureDatabaseSchema();
  const db = await getD1();
  await db.prepare("DELETE FROM calendar_events WHERE id = ? AND user_id = ?").bind(id, user.id).run();
  return Response.json({ ok: true });
}

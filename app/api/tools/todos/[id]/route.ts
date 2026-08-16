import { ensureDatabaseSchema, getD1 } from "../../../../../db/runtime";
import { sameOrigin } from "../../../../../lib/admin-email-auth";
import { getApiToolUser } from "../../../../../lib/user-session";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const user = await getApiToolUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const id = (await context.params).id;
  const body = await request.json().catch(() => ({})) as { title?: string; notes?: string; completed?: boolean; dueAt?: number | null; reminderAt?: number | null };
  await ensureDatabaseSchema();
  const db = await getD1();
  const current = await db.prepare("SELECT title, notes, completed, due_at, reminder_at FROM todos WHERE id = ? AND user_id = ? LIMIT 1").bind(id, user.id)
    .first<{ title: string; notes: string; completed: number; due_at: number | null; reminder_at: number | null }>();
  if (!current) return Response.json({ error: "任务不存在" }, { status: 404 });
  const title = body.title === undefined ? current.title : body.title.trim().slice(0, 160);
  if (!title) return Response.json({ error: "任务名称不能为空" }, { status: 400 });
  await db.prepare("UPDATE todos SET title = ?, notes = ?, completed = ?, due_at = ?, reminder_at = ?, updated_at = ? WHERE id = ? AND user_id = ?")
    .bind(title, body.notes === undefined ? current.notes : body.notes.trim().slice(0, 1000), body.completed === undefined ? current.completed : body.completed ? 1 : 0, body.dueAt === undefined ? current.due_at : body.dueAt, body.reminderAt === undefined ? current.reminder_at : body.reminderAt, Date.now(), id, user.id).run();
  return Response.json({ ok: true });
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const user = await getApiToolUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const id = (await context.params).id;
  await ensureDatabaseSchema();
  const db = await getD1();
  await db.batch([
    db.prepare("DELETE FROM todo_subtasks WHERE todo_id = ? AND user_id = ?").bind(id, user.id),
    db.prepare("DELETE FROM todos WHERE id = ? AND user_id = ?").bind(id, user.id),
  ]);
  return Response.json({ ok: true });
}

import { ensureDatabaseSchema, getD1 } from "../../../../../../../db/runtime";
import { sameOrigin } from "../../../../../../../lib/admin-email-auth";
import { getApiToolUser } from "../../../../../../../lib/user-session";

type RouteContext = { params: Promise<{ id: string; subtaskId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const user = await getApiToolUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const { id, subtaskId } = await context.params;
  const body = await request.json().catch(() => ({})) as { completed?: boolean; title?: string };
  await ensureDatabaseSchema();
  const db = await getD1();
  const current = await db.prepare("SELECT title, completed FROM todo_subtasks WHERE id = ? AND todo_id = ? AND user_id = ? LIMIT 1").bind(subtaskId, id, user.id).first<{ title: string; completed: number }>();
  if (!current) return Response.json({ error: "子任务不存在" }, { status: 404 });
  const title = body.title === undefined ? current.title : body.title.trim().slice(0, 160);
  if (!title) return Response.json({ error: "子任务不能为空" }, { status: 400 });
  await db.prepare("UPDATE todo_subtasks SET title = ?, completed = ? WHERE id = ? AND todo_id = ? AND user_id = ?")
    .bind(title, body.completed === undefined ? current.completed : body.completed ? 1 : 0, subtaskId, id, user.id).run();
  await db.prepare("UPDATE todos SET updated_at = ? WHERE id = ? AND user_id = ?").bind(Date.now(), id, user.id).run();
  return Response.json({ ok: true });
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const user = await getApiToolUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const { id, subtaskId } = await context.params;
  await ensureDatabaseSchema();
  const db = await getD1();
  await db.prepare("DELETE FROM todo_subtasks WHERE id = ? AND todo_id = ? AND user_id = ?").bind(subtaskId, id, user.id).run();
  return Response.json({ ok: true });
}

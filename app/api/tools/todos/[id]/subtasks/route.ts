import { ensureDatabaseSchema, getD1 } from "../../../../../../db/runtime";
import { sameOrigin } from "../../../../../../lib/admin-email-auth";
import { getApiToolUser } from "../../../../../../lib/user-session";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const user = await getApiToolUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const todoId = (await context.params).id;
  const body = await request.json().catch(() => ({})) as { title?: string };
  const title = body.title?.trim().slice(0, 160) || "";
  if (!title) return Response.json({ error: "请填写子任务" }, { status: 400 });
  await ensureDatabaseSchema();
  const db = await getD1();
  const todo = await db.prepare("SELECT id FROM todos WHERE id = ? AND user_id = ? LIMIT 1").bind(todoId, user.id).first();
  if (!todo) return Response.json({ error: "任务不存在" }, { status: 404 });
  const sort = await db.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort FROM todo_subtasks WHERE todo_id = ? AND user_id = ?").bind(todoId, user.id).first<{ next_sort: number }>();
  await db.prepare("INSERT INTO todo_subtasks (id, todo_id, user_id, title, completed, sort_order, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)")
    .bind(crypto.randomUUID(), todoId, user.id, title, sort?.next_sort || 0, Date.now()).run();
  return Response.json({ ok: true }, { status: 201 });
}

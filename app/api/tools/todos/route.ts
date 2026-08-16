import { ensureDatabaseSchema, getD1 } from "../../../../db/runtime";
import { sameOrigin } from "../../../../lib/admin-email-auth";
import { getApiToolUser } from "../../../../lib/user-session";

type TodoRow = { id: string; title: string; notes: string; completed: number; due_at: number | null; reminder_at: number | null; created_at: number; updated_at: number };
type SubtaskRow = { id: string; todo_id: string; title: string; completed: number; sort_order: number };

export async function GET() {
  const user = await getApiToolUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  await ensureDatabaseSchema();
  const db = await getD1();
  const [todoResult, subtaskResult] = await Promise.all([
    db.prepare("SELECT id, title, notes, completed, due_at, reminder_at, created_at, updated_at FROM todos WHERE user_id = ? ORDER BY completed ASC, updated_at DESC").bind(user.id).all<TodoRow>(),
    db.prepare("SELECT id, todo_id, title, completed, sort_order FROM todo_subtasks WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC").bind(user.id).all<SubtaskRow>(),
  ]);
  return Response.json({ todos: todoResult.results.map((todo) => ({ ...todo, completed: Boolean(todo.completed), subtasks: subtaskResult.results.filter((item) => item.todo_id === todo.id).map((item) => ({ ...item, completed: Boolean(item.completed) })) })) });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const user = await getApiToolUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { title?: string; notes?: string; dueAt?: number | null; reminderAt?: number | null; subtasks?: string[] };
  const title = body.title?.trim().slice(0, 160) || "";
  if (!title) return Response.json({ error: "请填写任务名称" }, { status: 400 });
  const id = crypto.randomUUID();
  const now = Date.now();
  const subtasks = (body.subtasks || []).map((item) => item.trim().slice(0, 160)).filter(Boolean).slice(0, 30);
  await ensureDatabaseSchema();
  const db = await getD1();
  await db.batch([
    db.prepare("INSERT INTO todos (id, user_id, title, notes, completed, due_at, reminder_at, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)")
      .bind(id, user.id, title, body.notes?.trim().slice(0, 1000) || "", body.dueAt || null, body.reminderAt || null, now, now),
    ...subtasks.map((subtask, index) => db.prepare("INSERT INTO todo_subtasks (id, todo_id, user_id, title, completed, sort_order, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)")
      .bind(crypto.randomUUID(), id, user.id, subtask, index, now)),
  ]);
  return Response.json({ ok: true, id }, { status: 201 });
}

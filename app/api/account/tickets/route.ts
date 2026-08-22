import { ensureDatabaseSchema, getD1 } from "../../../../db/runtime";
import { sameOrigin } from "../../../../lib/admin-email-auth";
import { readerFromRequest } from "../../../../lib/reader-auth";

const categories = new Set(["feedback", "problem", "question"]);

export async function GET(request: Request) {
  const user = await readerFromRequest(request);
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  await ensureDatabaseSchema();
  const db = await getD1();
  const rows = await db.prepare(`SELECT id, category, title, body, status, admin_reply AS adminReply,
    created_at AS createdAt, updated_at AS updatedAt FROM tickets WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50`)
    .bind(user.id).all();
  return Response.json({ tickets: rows.results || [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const user = await readerFromRequest(request);
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { category?: string; title?: string; body?: string };
  const category = categories.has(body.category || "") ? body.category! : "feedback";
  const title = body.title?.trim() || "";
  const content = body.body?.trim() || "";
  if (!title || title.length > 80 || !content || content.length > 2000) {
    return Response.json({ error: "标题需为 1–80 字，内容需为 1–2000 字" }, { status: 400 });
  }
  await ensureDatabaseSchema();
  const db = await getD1();
  const now = Date.now();
  const ticket = await db.prepare(`INSERT INTO tickets (user_id, category, title, body, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'open', ?, ?) RETURNING id, category, title, body, status, admin_reply AS adminReply, created_at AS createdAt, updated_at AS updatedAt`)
    .bind(user.id, category, title, content, now, now).first();
  return Response.json({ ticket }, { status: 201, headers: { "Cache-Control": "no-store" } });
}

import { ensureDatabaseSchema, getD1 } from "../../../../db/runtime";
import { sameOrigin } from "../../../../lib/admin-email-auth";
import { getApiAdmin } from "../../../admin/admin-auth";

export async function GET() {
  const auth = await getApiAdmin();
  if (!auth) return Response.json({ error: "未登录或没有管理员权限" }, { status: 401 });
  await ensureDatabaseSchema();
  const db = await getD1();
  const result = await db.prepare("SELECT id, content, link_url, link_label, published, created_at, updated_at, published_at FROM announcements ORDER BY updated_at DESC LIMIT 20").all();
  return Response.json({ announcements: result.results });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const auth = await getApiAdmin();
  if (!auth) return Response.json({ error: "未登录或没有管理员权限" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { content?: string; linkUrl?: string; linkLabel?: string };
  const content = body.content?.trim().slice(0, 240) || "";
  const linkUrl = body.linkUrl?.trim().slice(0, 500) || "";
  if (!content) return Response.json({ error: "请填写通知内容" }, { status: 400 });
  if (linkUrl && !/^(https?:\/\/|\/)/.test(linkUrl)) return Response.json({ error: "通知链接必须是站内路径或 http(s) 地址" }, { status: 400 });
  const now = Date.now();
  await ensureDatabaseSchema();
  const db = await getD1();
  await db.batch([
    db.prepare("UPDATE announcements SET published = 0, updated_at = ? WHERE published = 1").bind(now),
    db.prepare("INSERT INTO announcements (content, link_url, link_label, published, created_at, updated_at, published_at) VALUES (?, ?, ?, 1, ?, ?, ?)")
      .bind(content, linkUrl, body.linkLabel?.trim().slice(0, 30) || "了解更多", now, now, now),
  ]);
  return Response.json({ ok: true }, { status: 201 });
}

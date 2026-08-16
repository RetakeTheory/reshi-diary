import { ensureDatabaseSchema, getD1 } from "../../../../../db/runtime";
import { sameOrigin } from "../../../../../lib/admin-email-auth";
import { getApiAdmin } from "../../../../admin/admin-auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const auth = await getApiAdmin();
  if (!auth) return Response.json({ error: "未登录或没有管理员权限" }, { status: 401 });
  const id = Number((await context.params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "通知编号无效" }, { status: 400 });
  const body = await request.json().catch(() => ({})) as { published?: boolean };
  await ensureDatabaseSchema();
  const db = await getD1();
  if (body.published) {
    await db.batch([
      db.prepare("UPDATE announcements SET published = 0, updated_at = ? WHERE published = 1").bind(Date.now()),
      db.prepare("UPDATE announcements SET published = 1, published_at = ?, updated_at = ? WHERE id = ?").bind(Date.now(), Date.now(), id),
    ]);
  } else {
    await db.prepare("UPDATE announcements SET published = 0, updated_at = ? WHERE id = ?").bind(Date.now(), id).run();
  }
  return Response.json({ ok: true });
}

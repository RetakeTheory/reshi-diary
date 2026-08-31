import { getApiAdmin } from "../../../../admin/admin-auth";
import { sameOrigin } from "../../../../../lib/admin-email-auth";
import { runOnlineEditorAction } from "../../../../../lib/online-site-editor";

export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  if (!sameOrigin(request)) return Response.json({ ok: false, error: "请求来源无效" }, { status: 403 });
  const session = await getApiAdmin();
  if (!session) return Response.json({ ok: false, error: "请先登录管理端" }, { status: 401 });
  const { action } = await params;
  const payload = await request.json().catch(() => ({}));
  try {
    return Response.json(await runOnlineEditorAction(session.admin.email, action, payload), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "页面编辑操作失败" }, { status: 400 });
  }
}

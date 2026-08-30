import { getApiAdmin } from "../../../admin/admin-auth";
import { loadOnlineEditor } from "../../../../lib/online-site-editor";

export async function GET() {
  const session = await getApiAdmin();
  if (!session) return Response.json({ ok: false, error: "请先登录管理端" }, { status: 401 });
  try {
    return Response.json(await loadOnlineEditor(session.admin.email), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "页面配置读取失败" }, { status: 502 });
  }
}

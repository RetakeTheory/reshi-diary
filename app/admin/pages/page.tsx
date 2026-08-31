import { requireAdmin } from "../admin-auth";

export const dynamic = "force-dynamic";

export default async function OnlineSiteEditorPage() {
  const { admin } = await requireAdmin();
  return <main className="online-site-editor-page">
    <header>
      <a className="brand" href="https://rettheory.top/"><span>RE</span>reshi 的日记本</a>
      <div><span>页面编辑器 · {admin.displayName}</span><a href="/admin">管理中心</a><form action="/api/admin/auth/logout" method="post"><button type="submit">退出</button></form></div>
    </header>
    <iframe
      src="/site-visual-editor.html?online=1"
      title="reshi 整站模块编辑器"
      sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
    />
  </main>;
}

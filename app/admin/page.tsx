import { desc } from "drizzle-orm";
import { getDb } from "../../db";
import { posts } from "../../db/schema";
import { ensureDatabaseSchema } from "../../db/runtime";
import { requireAdmin } from "./admin-auth";
import AdminEditor from "./AdminEditor";
import PasskeyManager from "./PasskeyManager";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE } from "../../lib/admin-email-auth";
import { getRustBackendOrigin, rustBackendFetch } from "../../lib/rust-backend";
import NotificationManager from "./NotificationManager";
import TicketManager from "./TicketManager";
import SurveyManager from "./SurveyManager";
import UserManager from "./UserManager";
import FoodRankingManager from "./FoodRankingManager";
import OneBotManager from "./OneBotManager";
import AdminDashboardTabs, { type AdminDashboardTab } from "./AdminDashboardTabs";
import EditableModule from "../EditableModule";
import { pageDocument } from "../../lib/site-pages";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { admin } = await requireAdmin();
  const rustOrigin = await getRustBackendOrigin();
  let initialPosts;
  if (rustOrigin) {
    const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
    const response = await rustBackendFetch("/api/admin/posts", {
      headers: token ? { Cookie: `${ADMIN_SESSION_COOKIE}=${token}` } : undefined,
    });
    if (!response?.ok) throw new Error("Rust backend failed to load admin posts");
    initialPosts = ((await response.json()) as { posts: Array<{
      id: number; title: string; slug: string; excerpt: string; content: string; category: string;
      status: "draft" | "published"; createdAt: number; updatedAt: number; publishedAt: number | null;
    }> }).posts;
  } else {
    await ensureDatabaseSchema();
    const db = await getDb();
    const rows = await db.select().from(posts).orderBy(desc(posts.updatedAt), desc(posts.id));
    initialPosts = rows.map((post) => ({
      ...post,
      createdAt: post.createdAt.getTime(),
      updatedAt: post.updatedAt.getTime(),
      publishedAt: post.publishedAt?.getTime() ?? null,
    }));
  }

  const page = pageDocument("admin");
  const sections = {
    "admin-notice": <NotificationManager />,
    "admin-passkeys": <PasskeyManager />,
    "admin-tickets": <TicketManager />,
    "admin-surveys": <SurveyManager />,
    "admin-food-rankings": <FoodRankingManager />,
    "admin-posts": <AdminEditor initialPosts={initialPosts} />,
  };
  const tabMeta = {
    "admin-notice": { description: "发布或撤下全站顶部通知", icon: "spark" },
    "admin-passkeys": { description: "管理后台登录设备与密钥", icon: "key" },
    "admin-tickets": { description: "查看工单并继续回复用户", icon: "comment" },
    "admin-surveys": { description: "创建问卷、考试与结果查询", icon: "table" },
    "admin-food-rankings": { description: "维护学校餐厅红榜与黑榜", icon: "ranking" },
    "admin-posts": { description: "撰写、预览并发布文章", icon: "file" },
  } as const;
  const tabs: AdminDashboardTab[] = page.modules.flatMap((module) => {
    const content = sections[module.id as keyof typeof sections];
    const meta = tabMeta[module.id as keyof typeof tabMeta];
    return content && meta ? [{ id: module.id, label: module.label, ...meta, content: <EditableModule module={module}>{content}</EditableModule> }] : [];
  });
  tabs.push({ id: "admin-users", label: "注册用户管理", description: "搜索用户并处理恶意账户", icon: "user", content: <UserManager /> });
  tabs.push({ id: "admin-onebot", label: "QQ群通知", description: "查看 Bot 连接并发送群图片", icon: "bot", content: <OneBotManager /> });

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <a className="brand" href="https://rettheory.top/"><span>RE</span>reshi 的日记本</a>
        <div><a href="/admin/pages">页面编辑器</a><span>管理员 · {admin.displayName}</span><form action="/api/admin/auth/logout" method="post"><button type="submit">退出</button></form></div>
      </header>
      <AdminDashboardTabs items={tabs} />
    </main>
  );
}

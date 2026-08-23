import { desc } from "drizzle-orm";
import Link from "next/link";
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
    "admin-posts": <AdminEditor initialPosts={initialPosts} />,
  };

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <Link className="brand" href="/"><span>RE</span>reshi 的日记本</Link>
        <div><span>管理员 · {admin.displayName}</span><form action="/api/admin/auth/logout" method="post"><button type="submit">退出</button></form></div>
      </header>
      {page.modules.map((module) => <EditableModule module={module} key={module.id}>
        {sections[module.id as keyof typeof sections]}
      </EditableModule>)}
      <UserManager />
    </main>
  );
}

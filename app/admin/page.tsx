import { desc } from "drizzle-orm";
import Link from "next/link";
import { getDb } from "../../db";
import { posts } from "../../db/schema";
import { ensureDatabaseSchema } from "../../db/runtime";
import { requireAdmin } from "./admin-auth";
import AdminEditor from "./AdminEditor";
import PasskeyManager from "./PasskeyManager";
import AnnouncementManager from "./AnnouncementManager";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { admin } = await requireAdmin();
  await ensureDatabaseSchema();
  const db = await getDb();
  const rows = await db.select().from(posts).orderBy(desc(posts.updatedAt), desc(posts.id));
  const initialPosts = rows.map((post) => ({
    ...post,
    createdAt: post.createdAt.getTime(),
    updatedAt: post.updatedAt.getTime(),
    publishedAt: post.publishedAt?.getTime() ?? null,
  }));

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <Link className="brand" href="/"><span>RE</span>reshi 的日记本</Link>
        <div><span>管理员 · {admin.displayName}</span><form action="/api/admin/auth/logout" method="post"><button type="submit">退出</button></form></div>
      </header>
      <PasskeyManager />
      <AnnouncementManager />
      <AdminEditor initialPosts={initialPosts} />
    </main>
  );
}

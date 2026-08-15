import { desc } from "drizzle-orm";
import { getDb } from "../../db";
import { posts } from "../../db/schema";
import { ensureDatabaseSchema } from "../../db/runtime";
import { chatGPTSignOutPath } from "../chatgpt-auth";
import { requireAdmin } from "./admin-auth";
import AdminEditor from "./AdminEditor";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { admin } = await requireAdmin("/admin");
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
        <a className="brand" href="/"><span>RE</span>reshi 的日记本</a>
        <div><span>管理员 · {admin.displayName}</span><a href={chatGPTSignOutPath("/admin/login")}>退出</a></div>
      </header>
      <AdminEditor initialPosts={initialPosts} />
    </main>
  );
}

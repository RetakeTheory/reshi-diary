import { desc } from "drizzle-orm";
import { getDb } from "../../../../db";
import { ensureDatabaseSchema } from "../../../../db/runtime";
import { posts } from "../../../../db/schema";
import { getApiAdmin } from "../../../admin/admin-auth";
import { richTextToPlainText, sanitizeRichHtml } from "../../../../lib/rich-content";
import { createPostId } from "../../../../lib/post-id";

export async function GET() {
  const auth = await getApiAdmin();
  if (!auth) return Response.json({ error: "未登录或没有管理员权限" }, { status: 401 });
  await ensureDatabaseSchema();
  const db = await getDb();
  const rows = await db.select().from(posts).orderBy(desc(posts.updatedAt), desc(posts.id));
  return Response.json({ posts: rows });
}

export async function POST(request: Request) {
  const auth = await getApiAdmin();
  if (!auth) return Response.json({ error: "未登录或没有管理员权限" }, { status: 401 });

  const body = await request.json() as Partial<{
    title: string; excerpt: string; content: string; category: string; status: "draft" | "published";
  }>;
  const title = body.title?.trim() ?? "";
  const content = sanitizeRichHtml(body.content?.trim() ?? "");
  const plainContent = richTextToPlainText(content);
  const status = body.status === "published" ? "published" : "draft";
  if (!title) return Response.json({ error: "请填写文章标题" }, { status: 400 });
  if (!plainContent && !/<(img|div)[\s>]/i.test(content)) return Response.json({ error: "请填写文章正文" }, { status: 400 });

  await ensureDatabaseSchema();
  const now = new Date();
  const db = await getDb();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const [post] = await db.insert(posts).values({
        title,
        slug: createPostId(),
        excerpt: body.excerpt?.trim() || plainContent.slice(0, 90),
        content,
        category: body.category?.trim() || "日常",
        status,
        createdAt: now,
        updatedAt: now,
        publishedAt: status === "published" ? now : null,
      }).returning();
      return Response.json({ post }, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存失败";
      const duplicate = message.includes("UNIQUE") || message.includes("unique");
      if (!duplicate) return Response.json({ error: message }, { status: 400 });
    }
  }

  return Response.json({ error: "文章 ID 生成失败，请重试" }, { status: 500 });
}

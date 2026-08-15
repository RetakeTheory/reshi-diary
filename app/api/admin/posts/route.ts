import { desc } from "drizzle-orm";
import { getDb } from "../../../../db";
import { ensureDatabaseSchema } from "../../../../db/runtime";
import { posts } from "../../../../db/schema";
import { getApiAdmin } from "../../../admin/admin-auth";
import { richTextToPlainText, sanitizeRichHtml } from "../../../../lib/rich-content";

function slugify(value: string) {
  const slug = value.toLowerCase().trim()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `post-${Date.now()}`;
}

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
    title: string; slug: string; excerpt: string; content: string; category: string; status: "draft" | "published";
  }>;
  const title = body.title?.trim() ?? "";
  const content = sanitizeRichHtml(body.content?.trim() ?? "");
  const plainContent = richTextToPlainText(content);
  const status = body.status === "published" ? "published" : "draft";
  if (!title) return Response.json({ error: "请填写文章标题" }, { status: 400 });
  if (!plainContent && !/<(img|div)[\s>]/i.test(content)) return Response.json({ error: "请填写文章正文" }, { status: 400 });

  await ensureDatabaseSchema();
  const now = new Date();
  try {
    const db = await getDb();
    const [post] = await db.insert(posts).values({
      title,
      slug: slugify(body.slug || title),
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
    return Response.json({ error: duplicate ? "文章链接已存在，请换一个链接名称" : message }, { status: 400 });
  }
}

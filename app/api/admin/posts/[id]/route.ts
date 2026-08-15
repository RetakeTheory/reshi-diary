import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { ensureDatabaseSchema } from "../../../../../db/runtime";
import { posts } from "../../../../../db/schema";
import { getApiAdmin } from "../../../../admin/admin-auth";
import { richTextToPlainText, sanitizeRichHtml } from "../../../../../lib/rich-content";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: RouteContext) {
  const auth = await getApiAdmin();
  if (!auth) return Response.json({ error: "未登录或没有管理员权限" }, { status: 401 });
  const id = Number((await context.params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "文章编号无效" }, { status: 400 });
  const body = await request.json() as Partial<{
    title: string; slug: string; excerpt: string; content: string; category: string; status: "draft" | "published";
  }>;
  const content = sanitizeRichHtml(body.content?.trim() || "");
  const plainContent = richTextToPlainText(content);
  if (!body.title?.trim() || (!plainContent && !/<(img|div)[\s>]/i.test(content))) return Response.json({ error: "标题和正文不能为空" }, { status: 400 });

  await ensureDatabaseSchema();
  const db = await getDb();
  const [current] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  if (!current) return Response.json({ error: "文章不存在" }, { status: 404 });
  const status = body.status === "published" ? "published" : "draft";
  try {
    const [post] = await db.update(posts).set({
      title: body.title.trim(),
      slug: body.slug?.trim() || current.slug,
      excerpt: body.excerpt?.trim() || plainContent.slice(0, 90),
      content,
      category: body.category?.trim() || "日常",
      status,
      updatedAt: new Date(),
      publishedAt: status === "published" ? (current.publishedAt || new Date()) : null,
    }).where(eq(posts.id, id)).returning();
    return Response.json({ post });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存失败";
    return Response.json({ error: message.includes("UNIQUE") ? "文章链接已存在" : message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await getApiAdmin();
  if (!auth) return Response.json({ error: "未登录或没有管理员权限" }, { status: 401 });
  const id = Number((await context.params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "文章编号无效" }, { status: 400 });
  await ensureDatabaseSchema();
  const db = await getDb();
  await db.delete(posts).where(eq(posts.id, id));
  return Response.json({ ok: true });
}

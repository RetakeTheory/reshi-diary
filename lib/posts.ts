import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { posts } from "../db/schema";
import { ensureDatabaseSchema } from "../db/runtime";
import { demoPosts } from "../data/demo-posts";
import { rustBackendFetch } from "./rust-backend";

export type PublicPost = {
  title: string; slug: string; excerpt: string; content: string; category: string; date: string; read: string;
};

export const getPublicPost = cache(async (slug: string): Promise<PublicPost | null> => {
  let normalizedSlug = slug;
  try { normalizedSlug = decodeURIComponent(slug); } catch { /* Keep malformed input unchanged. */ }

  try {
    const rustResponse = await rustBackendFetch(`/api/posts/${encodeURIComponent(normalizedSlug)}`);
    if (rustResponse) {
      if (rustResponse.status === 404) return null;
      if (!rustResponse.ok) throw new Error("Rust backend failed to load post");
      const { post } = await rustResponse.json() as { post: {
        title: string; slug: string; excerpt: string; content: string; category: string;
        createdAt: number; publishedAt: number | null;
      } };
      return {
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        content: post.content,
        category: post.category,
        date: new Date(post.publishedAt || post.createdAt).toLocaleDateString("zh-CN"),
        read: `${Math.max(2, Math.ceil(post.content.length / 500))} 分钟`,
      };
    }
    await ensureDatabaseSchema();
    const db = await getDb();
    const [post] = await db.select().from(posts)
      .where(and(eq(posts.slug, normalizedSlug), eq(posts.status, "published"))).limit(1);
    if (post) return {
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      content: post.content,
      category: post.category,
      date: (post.publishedAt || post.createdAt).toLocaleDateString("zh-CN"),
      read: `${Math.max(2, Math.ceil(post.content.length / 500))} 分钟`,
    };
  } catch {
    // Local previews without an initialized database still render demo entries.
  }

  const demo = demoPosts.find((post) => post.slug === normalizedSlug);
  return demo ? { ...demo } : null;
});

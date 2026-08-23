import { desc, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { posts as postsTable } from "../../db/schema";
import { ensureDatabaseSchema } from "../../db/runtime";
import { demoPosts } from "../../data/demo-posts";
import { rustBackendFetch } from "../../lib/rust-backend";
import ArrowIcon from "../ArrowIcon";
import Icon, { type IconName } from "../Icon";
import SiteNav from "../SiteNav";
import EditableModule from "../EditableModule";
import EditableText from "../EditableText";
import { pageDocument, splitDisplayText } from "../../lib/site-pages";

export const dynamic = "force-dynamic";

type ListedPost = {
  title: string; slug: string; excerpt: string; content: string; category: string;
  date: string; read: string; theme: string; icon: IconName;
};

function decorate(posts: Array<{ title: string; slug: string; excerpt: string; content: string; category: string; timestamp: number }>): ListedPost[] {
  const themes = ["violet", "orange", "lime", "blue"];
  const icons: IconName[] = ["spark", "comment", "insight", "heart"];
  return posts.map((post, index) => ({
    ...post,
    date: new Date(post.timestamp).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).replaceAll("/", "."),
    read: `${Math.max(2, Math.ceil(post.content.length / 500))} 分钟`,
    theme: themes[index % themes.length],
    icon: icons[index % icons.length],
  }));
}

async function loadPosts(): Promise<ListedPost[]> {
  try {
    const response = await rustBackendFetch("/api/posts?limit=100");
    if (response) {
      if (!response.ok) throw new Error("Rust backend failed to load posts");
      const payload = await response.json() as { posts: Array<{
        title: string; slug: string; excerpt: string; content: string; category: string;
        createdAt: number; publishedAt: number | null;
      }> };
      return decorate(payload.posts.map((post) => ({ ...post, timestamp: post.publishedAt || post.createdAt })));
    }
    await ensureDatabaseSchema();
    const db = await getDb();
    const rows = await db.select().from(postsTable).where(eq(postsTable.status, "published"))
      .orderBy(desc(postsTable.publishedAt), desc(postsTable.id)).limit(100);
    return decorate(rows.map((post) => ({
      title: post.title, slug: post.slug, excerpt: post.excerpt, content: post.content,
      category: post.category, timestamp: (post.publishedAt || post.createdAt).getTime(),
    })));
  } catch {
    return decorate(demoPosts.map((post, index) => ({ ...post, timestamp: Date.now() - index * 86_400_000 })));
  }
}

export default async function PostsPage() {
  const posts = await loadPosts();
  const categories = Array.from(new Set(posts.map((post) => post.category)));
  const page = pageDocument("posts");
  return (
    <main className="posts-directory-page" id="top">
      <SiteNav />
      {page.modules.map((module) => {
        const fields = module.fields;
        if (module.id === "posts-header") {
          const title = splitDisplayText(fields.title);
          return <EditableModule module={module} key={module.id}><header className="posts-directory-head shell">
          <div><p>{fields.eyebrow}</p><h1>{title.lead}{title.accent && <><br /><span><EditableText text={title.accent} /></span></>}</h1></div>
          <p>{posts.length} 篇文章 · {categories.length} 个分类<br />{fields.description}</p>
        </header></EditableModule>;
        }
        if (module.id === "posts-feed") return <EditableModule module={module} key={module.id}><section className="posts shell posts-directory-list" aria-label="全部文章"><div className="post-grid">
          {posts.length === 0 && <div className="homepage-empty"><Icon name="file" /><h2>{fields.emptyTitle}</h2><p>{fields.emptyDescription}</p></div>}
          {posts.map((post, index) => <article className="post-card" key={post.slug}><a href={`/posts/${post.slug}`} aria-label={`阅读《${post.title}》`}>
            <div className={`post-art ${post.theme}`} aria-hidden="true"><span className="art-index">{String(index + 1).padStart(2, "0")}</span><b><Icon name={post.icon} /></b><div className="art-disc" /><div className="art-tile" /></div>
            <div className="post-meta"><span>{post.category}</span><time>{post.date}</time></div><h2>{post.title}</h2><p>{post.excerpt}</p>
            <div className="read-more"><span>{post.read}</span><b>{fields.readCta} <ArrowIcon direction="up-right" /></b></div>
          </a></article>)}
        </div></section></EditableModule>;
        return null;
      })}
    </main>
  );
}

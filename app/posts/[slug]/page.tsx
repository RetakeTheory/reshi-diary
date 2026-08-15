import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicPost } from "../../../lib/posts";
import { plainTextToRichHtml, sanitizeRichHtml } from "../../../lib/rich-content";
import RichPostContent from "./RichPostContent";
import ArrowIcon from "../../ArrowIcon";

export const dynamic = "force-dynamic";
type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const post = await getPublicPost((await params).slug);
  if (!post) return { title: "文章不存在｜reshi的日记本" };
  const title = `${post.title}｜reshi的日记本`;
  return {
    title,
    description: post.excerpt,
    openGraph: { title, description: post.excerpt, images: [] },
    twitter: { card: "summary", title, description: post.excerpt, images: [] },
  };
}

export default async function PostPage({ params }: PageProps) {
  const post = await getPublicPost((await params).slug);
  if (!post) notFound();
  return (
    <main className="article-page">
      <nav className="nav shell"><a className="brand" href="/"><span>RE</span>reshi的日记本</a><a className="article-back" href="/#posts"><ArrowIcon direction="left" /> 返回文章</a></nav>
      <article className="article-shell">
        <header className="article-head">
          <div className="article-meta"><span>{post.category}</span><time>{post.date}</time><span>{post.read}</span></div>
          <h1>{post.title}</h1><p>{post.excerpt}</p>
          <div className="article-object" aria-hidden="true"><span>✦</span><i /></div>
        </header>
        <div className="article-body"><RichPostContent html={sanitizeRichHtml(post.content.includes("<") ? post.content : plainTextToRichHtml(post.content))} /></div>
        <footer className="article-end"><b>写于 reshi 的日记本</b><a href="/#posts">继续阅读 <ArrowIcon /></a></footer>
      </article>
    </main>
  );
}

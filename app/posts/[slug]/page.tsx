import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicPost } from "../../../lib/posts";
import { plainTextToRichHtml, sanitizeRichHtml } from "../../../lib/rich-content";
import RichPostContent from "./RichPostContent";
import ArrowIcon from "../../ArrowIcon";
import Community from "./Community";
import Icon from "../../Icon";
import SiteNav from "../../SiteNav";
import Link from "next/link";

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
      <SiteNav backHref="/posts" backLabel="返回文章" />
      <article className="article-shell">
        <header className="article-head">
          <div className="article-meta"><span>{post.category}</span><time>{post.date}</time><span>{post.read}</span></div>
          <h1>{post.title}</h1><p>{post.excerpt}</p>
          <div className="article-object" aria-hidden="true"><span><Icon name="spark" /></span><i /></div>
        </header>
        <div className="article-body"><RichPostContent html={sanitizeRichHtml(post.content.includes("<") ? post.content : plainTextToRichHtml(post.content))} /></div>
        <Community slug={post.slug} />
        <footer className="article-end"><b>写于 reshi 的日记本</b><Link href="/posts">继续阅读 <ArrowIcon /></Link></footer>
      </article>
    </main>
  );
}

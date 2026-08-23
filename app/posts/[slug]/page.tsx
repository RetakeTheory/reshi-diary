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
import EditableModule from "../../EditableModule";
import { pageDocument, pageModule } from "../../../lib/site-pages";

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
  const page = pageDocument("article");
  const headerCopy = pageModule("article", "article-header").fields;
  return (
    <main className="article-page">
      <SiteNav backHref="/posts" backLabel={headerCopy.backLabel} />
      <article className="article-shell">
        {page.modules.map((module) => {
          if (module.id === "article-header") return <EditableModule module={module} key={module.id}><header className="article-head"><div className="article-meta"><span>{post.category}</span><time>{post.date}</time><span>{post.read}</span></div><h1>{post.title}</h1><p>{post.excerpt}</p><div className="article-object" aria-hidden="true"><span><Icon name="spark" /></span><i /></div></header></EditableModule>;
          if (module.id === "article-body") return <EditableModule module={module} key={module.id}><div className="article-body"><RichPostContent html={sanitizeRichHtml(post.content.includes("<") ? post.content : plainTextToRichHtml(post.content))} /></div></EditableModule>;
          if (module.id === "article-community") return <EditableModule module={module} key={module.id}><Community slug={post.slug} /></EditableModule>;
          if (module.id === "article-footer") return <EditableModule module={module} key={module.id}><footer className="article-end"><b>{module.fields.signature}</b><Link href={module.fields.ctaHref}>{module.fields.cta} <ArrowIcon /></Link></footer></EditableModule>;
          return null;
        })}
      </article>
    </main>
  );
}

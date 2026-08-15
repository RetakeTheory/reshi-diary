import { desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { posts as postsTable } from "../db/schema";
import { ensureDatabaseSchema } from "../db/runtime";
import { demoPosts } from "../data/demo-posts";
import ArrowIcon from "./ArrowIcon";

export const dynamic = "force-dynamic";

async function loadPublishedPosts() {
  try {
    await ensureDatabaseSchema();
    const db = await getDb();
    const rows = await db.select().from(postsTable)
      .where(eq(postsTable.status, "published"))
      .orderBy(desc(postsTable.publishedAt), desc(postsTable.id)).limit(8);
    if (rows.length === 0) return [];
    const themes = ["violet", "orange", "lime", "blue"];
    const symbols = ["✦", "○", "↗", "☁"];
    return rows.map((post, index) => ({
      date: (post.publishedAt || post.createdAt).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).replaceAll("/", "."),
      category: post.category,
      read: `${Math.max(2, Math.ceil(post.content.length / 500))} 分钟`,
      title: post.title,
      excerpt: post.excerpt,
      theme: themes[index % themes.length],
      symbol: symbols[index % symbols.length],
      slug: post.slug,
    }));
  } catch {
    return demoPosts;
  }
}

export default async function Home() {
  const displayPosts = await loadPublishedPosts();
  const topicCounts = displayPosts.reduce((counts, post) => {
    counts.set(post.category, (counts.get(post.category) || 0) + 1);
    return counts;
  }, new Map<string, number>());
  const topics = Array.from(topicCounts.entries());
  return (
    <main>
      <nav className="nav shell" aria-label="主导航">
        <a className="brand" href="#top"><span>RE</span>reshi的日记本</a>
        <div className="nav-links"><a href="#posts">文章</a>{topics.length > 0 && <a href="#topics">分类</a>}<a href="#about">关于</a></div>
        <a className="admin-link" href="/admin/login">写日记 <ArrowIcon direction="up-right" /></a>
      </nav>

      <header className="hero shell" id="top">
        <div className="hero-copy">
          <p className="kicker"><i /> 一个计算机系废柴学生的个人博客</p>
          <h1>写点代码，<br />也写点<span>没用的话。</span></h1>
          <p className="intro">你好，我是 reshi，一名努力不挂科的计算机系废柴学生。这里记下学不会的知识、跑不通的代码和普通生活。</p>
          <a className="primary" href="#posts">开始阅读 <ArrowIcon /></a>
        </div>

        <div className="hero-scene" aria-hidden="true">
          <div className="aura aura-one" /><div className="aura aura-two" />
          <div className="glass-diary">
            <div className="diary-top"><span>RESHI / 2026</span><i>✦</i></div>
            <div className="diary-code"><span>01</span><p><b>const</b> today = <em>&quot;still learning&quot;</em>;</p></div>
            <div className="diary-code"><span>02</span><p><b>if</b> (bug) keepTrying();</p></div>
            <h2>普通学生的<br />非标准答案。</h2>
            <div className="diary-foot"><span>计算机系废柴学生</span><b>↗</b></div>
          </div>
          <div className="glass-chip chip-one">⌘</div><div className="glass-chip chip-two">{`{ }`}</div>
        </div>
      </header>

      <section className="posts shell" id="posts" aria-labelledby="posts-title">
        <div className="section-head">
          <div><p>RECENT STORIES / 近期文章</p><h2 id="posts-title">刚刚写下的</h2></div>
          <a href="#archive">查看全部文章 <ArrowIcon /></a>
        </div>
        <div className="post-grid">
          {displayPosts.length === 0 && <div className="homepage-empty"><b>✦</b><h3>日记本还是空白的</h3><p>新文章发布后会出现在这里。</p></div>}
          {displayPosts.map((post, index) => (
            <article className="post-card" key={post.title}>
              <a href={`/posts/${post.slug}`} aria-label={`阅读《${post.title}》`}>
                <div className={`post-art ${post.theme}`} aria-hidden="true">
                  <span className="art-index">0{index + 1}</span>
                  <b>{post.symbol}</b>
                  <div className="art-disc" /><div className="art-tile" />
                </div>
                <div className="post-meta"><span>{post.category}</span><time>{post.date}</time></div>
                <h3>{post.title}</h3>
                <p>{post.excerpt}</p>
                <div className="read-more"><span>{post.read}</span><b>阅读文章 <ArrowIcon direction="up-right" /></b></div>
              </a>
            </article>
          ))}
        </div>
      </section>

      {topics.length > 0 && <section className="topics" id="topics" aria-labelledby="topics-title">
        <div className="shell topics-wrap">
          <div className="topics-copy">
            <p>EXPLORE / 探索主题</p>
            <h2 id="topics-title">从感兴趣的<br />话题开始。</h2>
            <div className="topic-orbit" aria-hidden="true"><span>+</span><i /><b>✦</b></div>
          </div>
          <div className="topic-list">
            {topics.map(([name, count], index) => (
              <a href="#posts" key={name}><span>{String(index + 1).padStart(2, "0")}</span><h3>{name}</h3><small>{String(count).padStart(2, "0")} 篇</small><ArrowIcon direction="up-right" /></a>
            ))}
          </div>
        </div>
      </section>}

      <section className="about shell" id="about" aria-labelledby="about-title">
        <div className="avatar-scene" aria-hidden="true">
          <div className="avatar-card"><div className="face"><span aria-hidden="true">&lt;/&gt;</span></div><p>KEEP<br />CURIOUS</p></div>
          <div className="mini-cube">M</div><div className="mini-sphere" />
        </div>
        <div className="about-copy">
          <p>ABOUT THE AUTHOR / 关于作者</p>
          <h2 id="about-title">你好，我是 reshi。</h2>
          <div className="about-text">
            <p>身份仅为计算机系废柴学生。会写一点代码，又经常被代码教育，目前仍在努力理解这个专业。</p>
            <p>这个博客是我的线上日记本：记学习、记折腾，也记下那些和计算机没有关系的普通日子。</p>
          </div>
          <div className="contact-links"><span>小红书 · reshi_</span><a href="https://github.com/RetakeTheory" target="_blank" rel="noopener noreferrer">GitHub · RetakeTheory <ArrowIcon direction="up-right" /></a><a href="mailto:reshi1417@163.com">reshi1417@163.com <ArrowIcon direction="up-right" /></a></div>
        </div>
      </section>

      <section className="subscribe" id="subscribe">
        <div className="shell subscribe-card">
          <div><p>RESHI&apos;S LETTER / 日记来信</p><h2>新日记，偶尔送到你的邮箱。</h2><span>更新随缘，内容不一定有用，但保证都是本人写的。</span></div>
          <form><label className="sr-only" htmlFor="email">邮箱地址</label><input id="email" type="email" placeholder="你的邮箱地址" required /><button type="submit">订阅更新 <ArrowIcon /></button></form>
          <div className="mail-object" aria-hidden="true"><span>✦</span></div>
        </div>
      </section>

      <footer className="footer" id="archive">
        <div className="shell footer-top"><a className="brand" href="#top"><span>RE</span>reshi的日记本</a><p>代码不一定跑得通，<br />日子还是要继续过。</p></div>
        <div className="shell footer-bottom"><p>© 2026 reshi</p><div><span>小红书 reshi_</span><a href="https://github.com/RetakeTheory" target="_blank" rel="noopener noreferrer">GitHub</a><a href="mailto:reshi1417@163.com">邮箱</a></div><a href="#top">回到顶部 <ArrowIcon direction="up" /></a></div>
      </footer>
    </main>
  );
}

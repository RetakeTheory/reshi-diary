import ArrowIcon from "./ArrowIcon";
import Icon from "./Icon";
import SiteNav from "./SiteNav";
import Link from "next/link";
import homeContent from "../src/content/home.json";

export default function Home() {
  const [heroTitleLead, ...heroTitleRest] = homeContent.hero.title.split("\n");
  const heroTitleAccent = heroTitleRest.join("\n");

  return (
    <main>
      <SiteNav />

      <header className="hero shell" id="top">
        <div className="hero-copy">
          <p className="kicker"><i /> 欢迎来到 reshi 的私人存档点</p>
          <h1>
            {heroTitleLead}
            {heroTitleAccent ? <><br /><span>{heroTitleAccent}</span></> : null}
          </h1>
          <p className="intro">{homeContent.hero.subtitle}</p>
          <Link className="primary" href="/posts">{homeContent.hero.cta} <ArrowIcon /></Link>
        </div>

        <div className="hero-scene" aria-hidden="true">
          <div className="aura aura-one" /><div className="aura aura-two" />
          <div className="glass-diary">
            <div className="diary-top"><span>RESHI / 2026</span><i><Icon name="spark" /></i></div>
            <div className="diary-code"><span>01</span><p>今日状态：<em>努力加载中</em></p></div>
            <div className="diary-code"><span>02</span><p>支线任务：把普通日子过好</p></div>
            <h2>普通人的<br />随机事件簿。</h2>
            <div className="diary-foot"><span>主线摸鱼 · 支线生活</span><b><ArrowIcon direction="up-right" /></b></div>
          </div>
          <div className="glass-chip chip-one"><Icon name="spark" /></div>
          <div className="glass-chip chip-two"><Icon name="comment" /></div>
        </div>
      </header>

      <section className="archive-portal shell" aria-labelledby="archive-title">
        <div>
          <p>STORY INDEX / 文章目录</p>
          <h2 id="archive-title">文章搬到单独一页了。</h2>
          <span>按时间浏览全部文章，不再让长列表挤占主页。</span>
        </div>
        <Link className="primary" href="/posts">打开文章目录 <ArrowIcon /></Link>
        <Icon name="file" className="archive-portal-icon" />
      </section>

      <section className="about shell" id="about" aria-labelledby="about-title">
        <div className="avatar-scene" aria-hidden="true">
          <div className="avatar-card"><div className="face"><Icon name="spark" /></div><p>KEEP<br />CURIOUS</p></div>
          <div className="mini-cube">M</div><div className="mini-sphere" />
        </div>
        <div className="about-copy">
          <p>ABOUT THE AUTHOR / 关于作者</p>
          <h2 id="about-title">你好，我是 reshi。</h2>
          <div className="about-text">
            <p>属性：普通人类，偶尔电量不足。喜欢的东西很多，挖过的坑也很多，目前正在缓慢收集生活经验值。</p>
            <p>这里是我的线上存档点：记喜欢的东西、突发脑洞、踩过的坑，以及一些不太适合塞进朋友圈的小事。</p>
          </div>
          <div className="contact-links"><span>小红书 · reshi_</span><a href="https://github.com/RetakeTheory" target="_blank" rel="noopener noreferrer">GitHub · RetakeTheory <ArrowIcon direction="up-right" /></a><a href="mailto:reshi1417@163.com">reshi1417@163.com <ArrowIcon direction="up-right" /></a></div>
        </div>
      </section>

      <section className="subscribe" id="subscribe">
        <div className="shell subscribe-card">
          <div><p>RESHI&apos;S LETTER / 日记来信</p><h2>有新存档时，偶尔飘到你的邮箱。</h2><span>更新频率看缘分，内容可能没用，但大概会有一点好玩。</span></div>
          <form><label className="sr-only" htmlFor="email">邮箱地址</label><input id="email" type="email" placeholder="你的邮箱地址" required /><button type="submit">订阅更新 <ArrowIcon /></button></form>
          <div className="mail-object" aria-hidden="true"><Icon name="spark" /></div>
        </div>
      </section>

      <footer className="footer" id="archive">
        <div className="shell footer-top"><a className="brand" href="#top"><span>RE</span>reshi的日记本</a><p>主线慢慢推，<br />日子慢慢过。</p></div>
        <div className="shell footer-bottom"><p>© 2026 reshi</p><div><span>小红书 reshi_</span><a href="https://github.com/RetakeTheory" target="_blank" rel="noopener noreferrer">GitHub</a><a href="mailto:reshi1417@163.com">邮箱</a></div><a href="#top">回到顶部 <ArrowIcon direction="up" /></a></div>
      </footer>
    </main>
  );
}

import ArrowIcon from "../ArrowIcon";
import Link from "next/link";

export default function PluginsPage() {
  return (
    <main className="plugins-page">
      <nav className="nav shell" aria-label="插件页导航">
        <Link className="brand" href="/"><span>RE</span>reshi的日记本</Link>
        <div className="nav-links"><Link href="/">首页</Link><Link href="/plugins">插件</Link></div>
        <a className="admin-link" href="/admin/login">写日记 <ArrowIcon direction="up-right" /></a>
      </nav>
      <header className="plugin-directory-head shell">
        <p>MINI TOOLS / 小插件仓库</p>
        <h1>这里有些<br /><span>奇怪小玩意。</span></h1>
        <p>不保证能解决人生难题，但至少可以解决下一顿吃什么。</p>
      </header>
      <section className="plugin-grid shell" aria-label="插件目录">
        <Link className="plugin-card" href="/plugins/food-roulette">
          <div className="plugin-card-art" aria-hidden="true"><span>🍜</span><i>✦</i></div>
          <div><small>DAILY QUEST / 01</small><h2>今天吃什么</h2><p>58 道候选已就位，按一下，把晚饭交给命运。</p><b>开始摇奖 <ArrowIcon /></b></div>
        </Link>
      </section>
    </main>
  );
}

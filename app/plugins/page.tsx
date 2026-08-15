/* eslint-disable @next/next/no-html-link-for-pages */
import ArrowIcon from "../ArrowIcon";

export default function PluginsPage() {
  return (
    <main className="plugins-page">
      <nav className="nav shell" aria-label="插件页导航">
        <a className="brand" href="/"><span>RE</span>reshi的日记本</a>
        <div className="nav-links"><a href="/">首页</a><a href="/plugins">插件</a></div>
        <a className="admin-link" href="/admin/login">写日记 <ArrowIcon direction="up-right" /></a>
      </nav>
      <header className="plugin-directory-head shell">
        <p>MINI TOOLS / 小插件仓库</p>
        <h1>这里有些<br /><span>奇怪小玩意。</span></h1>
        <p>不保证能解决人生难题，但很擅长替选择困难症按下那个按钮。</p>
      </header>
      <section className="plugin-grid shell" aria-label="插件目录">
        <a className="plugin-card" href="/plugins/food-roulette">
          <div className="plugin-card-art" aria-hidden="true"><span>🍜</span><i>✦</i></div>
          <div><small>DAILY QUEST / 01</small><h2>今天吃什么</h2><p>58 道候选已就位，按一下，把晚饭交给命运。</p><b>开始摇奖 <ArrowIcon /></b></div>
        </a>
        <a className="plugin-card" href="/plugins/random-number">
          <div className="plugin-card-art number-art" aria-hidden="true"><span>🎲</span><i>02</i></div>
          <div><small>RANDOM DROP / 02</small><h2>随机数</h2><p>输入上限和数量，不重复抽取，让数字替你决定支线走向。</p><b>召唤数字 <ArrowIcon /></b></div>
        </a>
      </section>
    </main>
  );
}

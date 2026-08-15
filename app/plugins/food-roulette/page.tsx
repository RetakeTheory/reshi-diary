import ArrowIcon from "../../ArrowIcon";
import FoodRoulette from "../../FoodRoulette";
import Link from "next/link";

export default function FoodRoulettePage() {
  return (
    <main className="plugin-detail-page">
      <nav className="nav shell" aria-label="插件详情导航">
        <Link className="brand" href="/"><span>RE</span>reshi的日记本</Link>
        <div className="nav-links"><Link href="/">首页</Link><Link href="/plugins">插件目录</Link></div>
        <a className="admin-link" href="/plugins">返回目录 <ArrowIcon direction="left" /></a>
      </nav>
      <div className="plugin-breadcrumb shell"><Link href="/plugins">小插件仓库</Link><span>/</span><b>今天吃什么</b></div>
      <FoodRoulette />
    </main>
  );
}

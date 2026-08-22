import FoodRoulette from "../../FoodRoulette";
import SiteNav from "../../SiteNav";

export default function FoodRoulettePage() {
  return (
    <main className="plugin-detail-page">
      <SiteNav backHref="/plugins" backLabel="返回目录" />
      <div className="plugin-breadcrumb shell"><a href="/plugins">小插件仓库</a><span>/</span><b>今天吃什么</b></div>
      <FoodRoulette />
    </main>
  );
}

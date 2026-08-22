import PrizeWheel from "../../PrizeWheel";
import SiteNav from "../../SiteNav";

export default function PrizeWheelPage() {
  return (
    <main className="plugin-detail-page">
      <SiteNav backHref="/plugins" backLabel="返回目录" />
      <div className="plugin-breadcrumb shell"><a href="/plugins">小插件仓库</a><span>/</span><b>自定义抽奖</b></div>
      <PrizeWheel />
    </main>
  );
}

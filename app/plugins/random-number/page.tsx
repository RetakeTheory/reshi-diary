import RandomNumberPicker from "../../RandomNumberPicker";
import SiteNav from "../../SiteNav";

export default function RandomNumberPage() {
  return (
    <main className="plugin-detail-page">
      <SiteNav backHref="/plugins" backLabel="返回目录" />
      <div className="plugin-breadcrumb shell"><a href="/plugins">小插件仓库</a><span>/</span><b>随机数</b></div>
      <RandomNumberPicker />
    </main>
  );
}

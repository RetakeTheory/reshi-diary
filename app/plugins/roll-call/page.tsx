import SiteNav from "../../SiteNav";
import RollCall from "./RollCall";

export default function RollCallPage() {
  return <main className="plugin-detail-page"><SiteNav backHref="/plugins" backLabel="返回目录" /><div className="plugin-breadcrumb shell"><a href="/plugins">小插件仓库</a><span>/</span><b>点名器</b></div><RollCall /></main>;
}

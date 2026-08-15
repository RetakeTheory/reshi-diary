/* eslint-disable @next/next/no-html-link-for-pages */
import ArrowIcon from "../../ArrowIcon";
import RandomNumberPicker from "../../RandomNumberPicker";

export default function RandomNumberPage() {
  return (
    <main className="plugin-detail-page">
      <nav className="nav shell" aria-label="插件详情导航">
        <a className="brand" href="/"><span>RE</span>reshi的日记本</a>
        <div className="nav-links"><a href="/">首页</a><a href="/plugins">插件目录</a></div>
        <a className="admin-link" href="/plugins">返回目录 <ArrowIcon direction="left" /></a>
      </nav>
      <div className="plugin-breadcrumb shell"><a href="/plugins">小插件仓库</a><span>/</span><b>随机数</b></div>
      <RandomNumberPicker />
    </main>
  );
}

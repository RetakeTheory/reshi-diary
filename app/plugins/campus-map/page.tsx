import CampusMap from "../../CampusMap";
import SiteNav from "../../SiteNav";
import { pageModule } from "../../../lib/site-pages";

export default function CampusMapPage() {
  const fields = pageModule("campusMap", "campus-map-widget").fields;
  return <main className="plugin-detail-page campus-map-page">
    <SiteNav backHref="/plugins" backLabel="返回目录" />
    <div className="plugin-breadcrumb shell"><a href="/plugins">{fields.breadcrumbHome}</a><span>/</span><b>{fields.breadcrumbCurrent}</b></div>
    <CampusMap title={fields.title} description={fields.description} hint={fields.hint} mapAlt={fields.mapAlt} hotspotHint={fields.hotspotHint} />
  </main>;
}

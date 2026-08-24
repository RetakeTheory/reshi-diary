import EditableModule from "../../EditableModule";
import SiteNav from "../../SiteNav";
import { pageDocument } from "../../../lib/site-pages";
import FoodRankings from "./FoodRankings";

export default function FoodRankingsPage() {
  const page = pageDocument("foodRankings"); const pageModule = page.modules[0];
  return <main className="food-rankings-page"><SiteNav backHref="/plugins" backLabel={pageModule.fields.back} /><EditableModule module={pageModule}><header className="food-rankings-head shell"><p>{pageModule.fields.eyebrow}</p><h1>{pageModule.fields.title}</h1><span>{pageModule.fields.description}</span></header><div className="shell"><FoodRankings /></div></EditableModule></main>;
}

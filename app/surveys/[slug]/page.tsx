import EditableModule from "../../EditableModule";
import SiteNav from "../../SiteNav";
import { pageDocument } from "../../../lib/site-pages";
import SurveyForm from "./SurveyForm";

export const dynamic = "force-dynamic";

export default async function SurveyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = pageDocument("survey");
  const formModule = page.modules[0];
  return <main className="survey-public-page"><SiteNav backHref="/" backLabel="返回首页" /><EditableModule module={formModule}><div className="survey-public-shell"><SurveyForm slug={slug} /></div></EditableModule></main>;
}

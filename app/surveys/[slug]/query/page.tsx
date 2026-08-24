import SurveyQuery from "./SurveyQuery";
import EditableModule from "../../../EditableModule";
import { pageDocument } from "../../../../lib/site-pages";

export default async function SurveyQueryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = pageDocument("surveyQuery"); const queryModule = page.modules[0];
  return <main className="survey-query-page"><EditableModule module={queryModule}><SurveyQuery slug={slug} copy={queryModule.fields} /></EditableModule></main>;
}

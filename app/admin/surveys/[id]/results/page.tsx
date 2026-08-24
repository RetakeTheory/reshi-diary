import { requireAdmin } from "../../../admin-auth";
import SurveyResultsClient from "./SurveyResultsClient";
import EditableModule from "../../../../EditableModule";
import { pageModule } from "../../../../../lib/site-pages";

export const dynamic = "force-dynamic";
export default async function SurveyResultsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin(); const { id } = await params;
  const editableModule = pageModule("surveyResults", "survey-results");
  const copy = editableModule.fields;
  return <main className="admin-shell survey-results-page"><EditableModule module={editableModule}><header className="admin-topbar"><a className="brand" href="/admin"><span>RE</span>{copy.brand}</a><a className="admin-topbar-action" href="/admin">{copy.back}</a></header><SurveyResultsClient id={id} copy={copy} /></EditableModule></main>;
}

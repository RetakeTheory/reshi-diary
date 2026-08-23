import Link from "next/link";
import { requireAdmin } from "../../../admin-auth";
import SurveyResultsClient from "./SurveyResultsClient";

export const dynamic = "force-dynamic";
export default async function SurveyResultsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin(); const { id } = await params;
  return <main className="admin-shell survey-results-page"><header className="admin-topbar"><Link className="brand" href="/admin"><span>RE</span>问卷报表</Link><Link href="/admin">返回管理端</Link></header><SurveyResultsClient id={id} /></main>;
}

import { ensureDatabaseSchema, getD1 } from "../../../../../../db/runtime";
import { getApiAdmin } from "../../../../../admin/admin-auth";
import { buildSurveyQuestionReports, type SurveyResponseResult } from "../../../../../../lib/survey-report";
import { surveyFromRow, surveySelect, type SurveyDbRow } from "../../../../../../lib/survey-d1";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await getApiAdmin()) return Response.json({ error: "请先登录管理员账户" }, { status: 401 });
  await ensureDatabaseSchema(); const db = await getD1(); const { id } = await context.params;
  const row = await db.prepare(`${surveySelect} WHERE s.id = ? LIMIT 1`).bind(id).first<SurveyDbRow>();
  if (!row) return Response.json({ error: "问卷不存在" }, { status: 404 });
  const survey = surveyFromRow(row); const url = new URL(request.url); const page = Math.max(1, Number(url.searchParams.get("page")) || 1); const pageSize = 100;
  const all = await db.prepare("SELECT id, answers_json AS answersJson, created_at AS createdAt FROM survey_responses WHERE survey_id = ? ORDER BY created_at DESC LIMIT 5000").bind(id).all<{ id: string; answersJson: string; createdAt: number }>();
  const responses: SurveyResponseResult[] = (all.results || []).map((item) => ({ id: item.id, answers: JSON.parse(item.answersJson), createdAt: item.createdAt }));
  return Response.json({ survey, reports: buildSurveyQuestionReports(survey.questions, responses), responses: responses.slice((page - 1) * pageSize, page * pageSize), total: responses.length, page, pageSize, truncated: survey.responseCount > 5000 }, { headers: { "Cache-Control": "no-store" } });
}

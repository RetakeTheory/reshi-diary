import { ensureDatabaseSchema, getD1 } from "../../../../../../db/runtime";
import { getApiAdmin } from "../../../../../admin/admin-auth";
import { buildSurveyQuestionReports, type SurveyResponseResult } from "../../../../../../lib/survey-report";
import { surveyFromRow, surveySelect, type SurveyDbRow } from "../../../../../../lib/survey-d1";
import { applyManualSurveyScores, type SurveyAnswers } from "../../../../../../lib/surveys";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await getApiAdmin()) return Response.json({ error: "请先登录管理员账户" }, { status: 401 });
  await ensureDatabaseSchema(); const db = await getD1(); const { id } = await context.params;
  const row = await db.prepare(`${surveySelect} WHERE s.id = ? LIMIT 1`).bind(id).first<SurveyDbRow>();
  if (!row) return Response.json({ error: "问卷不存在" }, { status: 404 });
  const survey = surveyFromRow(row); const url = new URL(request.url); const page = Math.max(1, Number(url.searchParams.get("page")) || 1); const pageSize = 100;
  const all = await db.prepare("SELECT id, answers_json AS answersJson, score, max_score AS maxScore, manual_scores_json AS manualScoresJson, feedback_json AS feedbackJson, feedback_updated_at AS feedbackUpdatedAt, created_at AS createdAt FROM survey_responses WHERE survey_id = ? ORDER BY created_at DESC LIMIT 5000").bind(id).all<{ id: string; answersJson: string; score: number | null; maxScore: number | null; manualScoresJson: string | null; feedbackJson: string | null; feedbackUpdatedAt: number | null; createdAt: number }>();
  const responses: SurveyResponseResult[] = (all.results || []).map((item) => {
    const answers = JSON.parse(item.answersJson) as SurveyAnswers; const manualScores = JSON.parse(item.manualScoresJson || "{}") as Record<string, number>;
    const grading = item.score === null ? null : applyManualSurveyScores(survey.questions, answers, manualScores);
    return { id: item.id, answers, createdAt: item.createdAt, ...(grading ? { score: grading.score, maxScore: grading.maxScore, manualScores, manualPending: grading.manualPending } : {}), feedback: item.feedbackJson ? { ...JSON.parse(item.feedbackJson), updatedAt: item.feedbackUpdatedAt } : undefined };
  });
  return Response.json({ survey, reports: buildSurveyQuestionReports(survey.questions, responses), responses: responses.slice((page - 1) * pageSize, page * pageSize), total: responses.length, page, pageSize, truncated: survey.responseCount > 5000 }, { headers: { "Cache-Control": "no-store" } });
}

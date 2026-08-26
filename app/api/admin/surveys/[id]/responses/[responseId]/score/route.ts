import { ensureDatabaseSchema, getD1 } from "../../../../../../../../db/runtime";
import { sameOrigin } from "../../../../../../../../lib/admin-email-auth";
import { getApiAdmin } from "../../../../../../../admin/admin-auth";
import { applyManualSurveyScores, isManualScoringQuestion, type SurveyAnswers } from "../../../../../../../../lib/surveys";
import { surveyFromRow, surveySelect, type SurveyDbRow } from "../../../../../../../../lib/survey-d1";

export async function PUT(request: Request, context: { params: Promise<{ id: string; responseId: string }> }) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  if (!await getApiAdmin()) return Response.json({ error: "请先登录管理员账户" }, { status: 401 });
  try {
    const { id, responseId } = await context.params;
    const body = await request.json() as { scores?: unknown };
    if (!body.scores || typeof body.scores !== "object" || Array.isArray(body.scores)) throw new Error("人工评分内容无效");
    await ensureDatabaseSchema(); const db = await getD1();
    const row = await db.prepare(`${surveySelect} WHERE s.id = ? LIMIT 1`).bind(id).first<SurveyDbRow>();
    if (!row) return Response.json({ error: "问卷不存在" }, { status: 404 });
    const survey = surveyFromRow(row);
    if (survey.kind !== "exam") throw new Error("只有考试答卷可以评分");
    const response = await db.prepare("SELECT answers_json AS answersJson FROM survey_responses WHERE id = ? AND survey_id = ? LIMIT 1").bind(responseId, id).first<{ answersJson: string }>();
    if (!response) return Response.json({ error: "答卷不存在" }, { status: 404 });
    const manualQuestions = survey.questions.filter(isManualScoringQuestion);
    const scores: Record<string, number> = {};
    for (const question of manualQuestions) {
      const value = Number((body.scores as Record<string, unknown>)[question.id]);
      if (!Number.isSafeInteger(value) || value < 0 || value > question.points) throw new Error(`“${question.title}”评分需为 0–${question.points} 的整数`);
      scores[question.id] = value;
    }
    const result = applyManualSurveyScores(survey.questions, JSON.parse(response.answersJson) as SurveyAnswers, scores);
    await db.prepare("UPDATE survey_responses SET manual_scores_json = ?, score = ?, max_score = ? WHERE id = ? AND survey_id = ?").bind(JSON.stringify(scores), result.score, result.maxScore, responseId, id).run();
    return Response.json({ scores, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "评分保存失败" }, { status: 400 }); }
}

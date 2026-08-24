import { ensureDatabaseSchema, getD1 } from "../../../../../../db/runtime";
import { sameOrigin } from "../../../../../../lib/admin-email-auth";
import { getApiAdmin } from "../../../../../admin/admin-auth";
import { applyManualSurveyScores, type SurveyAnswers } from "../../../../../../lib/surveys";
import { surveyFromRow, surveySelect, type SurveyDbRow } from "../../../../../../lib/survey-d1";

type UpdateInput = { responseId?: unknown; scores?: unknown };

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  if (!await getApiAdmin()) return Response.json({ error: "请先登录管理员账户" }, { status: 401 });
  try {
    const { id } = await context.params;
    const body = await request.json() as { updates?: unknown };
    if (!Array.isArray(body.updates) || body.updates.length < 1 || body.updates.length > 100) throw new Error("请提交 1–100 份人工评分");
    await ensureDatabaseSchema();
    const db = await getD1();
    const row = await db.prepare(`${surveySelect} WHERE s.id = ? LIMIT 1`).bind(id).first<SurveyDbRow>();
    if (!row) return Response.json({ error: "问卷不存在" }, { status: 404 });
    const survey = surveyFromRow(row);
    if (survey.kind !== "exam") throw new Error("只有考试答卷可以评分");
    const manualQuestions = survey.questions.filter((question) => question.type === "short_text" && question.scoringMode === "manual" && question.points > 0);
    if (!manualQuestions.length) throw new Error("此考试没有人工评分题");
    const seen = new Set<string>();
    const updates = [];
    const results = [];
    for (const raw of body.updates as UpdateInput[]) {
      const responseId = typeof raw.responseId === "string" ? raw.responseId : "";
      if (!responseId || seen.has(responseId) || !raw.scores || typeof raw.scores !== "object" || Array.isArray(raw.scores)) throw new Error("批量评分数据无效或重复");
      seen.add(responseId);
      const response = await db.prepare("SELECT answers_json AS answersJson FROM survey_responses WHERE id = ? AND survey_id = ? LIMIT 1").bind(responseId, id).first<{ answersJson: string }>();
      if (!response) throw new Error(`答卷 ${responseId} 不存在`);
      const scores: Record<string, number> = {};
      for (const question of manualQuestions) {
        const value = Number((raw.scores as Record<string, unknown>)[question.id]);
        if (!Number.isSafeInteger(value) || value < 0 || value > question.points) throw new Error(`“${question.title}”评分需为 0–${question.points} 的整数`);
        scores[question.id] = value;
      }
      const grading = applyManualSurveyScores(survey.questions, JSON.parse(response.answersJson) as SurveyAnswers, scores);
      updates.push(db.prepare("UPDATE survey_responses SET manual_scores_json = ?, score = ?, max_score = ? WHERE id = ? AND survey_id = ?").bind(JSON.stringify(scores), grading.score, grading.maxScore, responseId, id));
      results.push({ responseId, scores, ...grading });
    }
    await db.batch(updates);
    return Response.json({ results }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "批量评分保存失败" }, { status: 400 });
  }
}

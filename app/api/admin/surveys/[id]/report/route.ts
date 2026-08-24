import { ensureDatabaseSchema, getD1 } from "../../../../../../db/runtime";
import { getApiAdmin } from "../../../../../admin/admin-auth";
import { safeCsvFilename, surveyResponsesCsv, type SurveyAnswers } from "../../../../../../lib/surveys";
import { surveyFromRow, surveySelect, type SurveyDbRow } from "../../../../../../lib/survey-d1";

type Context = { params: Promise<{ id: string }> };
type ResponseRow = { id: string; answersJson: string; score: number | null; maxScore: number | null; createdAt: number };

export async function GET(_request: Request, context: Context) {
  if (!await getApiAdmin()) return Response.json({ error: "请先登录管理员账户" }, { status: 401 });
  const { id } = await context.params;
  await ensureDatabaseSchema();
  const db = await getD1();
  const row = await db.prepare(`${surveySelect} WHERE s.id = ? LIMIT 1`).bind(id).first<SurveyDbRow>();
  if (!row) return Response.json({ error: "问卷不存在" }, { status: 404 });
  const result = await db.prepare(`SELECT id, answers_json AS answersJson, score, max_score AS maxScore, created_at AS createdAt
    FROM survey_responses WHERE survey_id = ? ORDER BY created_at ASC`).bind(id).all<ResponseRow>();
  const survey = surveyFromRow(row);
  const csv = surveyResponsesCsv(survey, (result.results || []).map((item) => ({ id: item.id, answers: JSON.parse(item.answersJson) as SurveyAnswers, createdAt: item.createdAt, score: item.score, maxScore: item.maxScore })));
  const filename = safeCsvFilename(survey.title);
  return new Response(csv, { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="survey-report.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "Cache-Control": "no-store",
  } });
}

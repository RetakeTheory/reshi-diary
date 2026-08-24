import { ensureDatabaseSchema, getD1 } from "../../../../../db/runtime";
import { hashValue, sameOrigin } from "../../../../../lib/admin-email-auth";
import { normalizeSurveyLookupValue, type SurveyFeedback } from "../../../../../lib/surveys";
import { surveyFromRow, surveySelect, type SurveyDbRow } from "../../../../../lib/survey-d1";
import { readerFromRequest } from "../../../../../lib/reader-auth";

type Context = { params: Promise<{ slug: string }> };
type QueryRow = { id: string; score: number | null; maxScore: number | null; feedbackJson: string | null; feedbackUpdatedAt: number | null; createdAt: number };
function result(row: QueryRow) { return { id: row.id, createdAt: row.createdAt, score: row.score, maxScore: row.maxScore, feedback: row.feedbackJson ? { ...JSON.parse(row.feedbackJson) as SurveyFeedback, updatedAt: row.feedbackUpdatedAt } : { status: "pending", title: "等待管理员反馈", modules: [], updatedAt: null } }; }
function clientIp(request: Request) { return request.headers.get("cf-connecting-ip")?.trim() || request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip")?.trim() || "unknown"; }

async function surveyForQuery(slug: string) {
  await ensureDatabaseSchema(); const db = await getD1();
  const row = await db.prepare(`${surveySelect} WHERE s.slug = ? AND s.kind = 'information_query' AND s.status IN ('published', 'closed') LIMIT 1`).bind(slug).first<SurveyDbRow>();
  if (!row) throw new Error("信息查询问卷不存在");
  return { db, survey: surveyFromRow(row) };
}

export async function GET(request: Request, context: Context) {
  try {
    const { slug } = await context.params; const { db, survey } = await surveyForQuery(slug);
    if (survey.access !== "registered") return Response.json({ survey: { title: survey.title, access: survey.access, identityLabel: survey.questions.find((item) => item.id === survey.queryIdentityQuestionId)?.title || "查询凭证" } });
    const reader = await readerFromRequest(request);
    if (!reader) return Response.json({ error: "请先登录填写问卷时使用的账号", requiresLogin: true }, { status: 401 });
    const rows = await db.prepare("SELECT id, score, max_score AS maxScore, feedback_json AS feedbackJson, feedback_updated_at AS feedbackUpdatedAt, created_at AS createdAt FROM survey_responses WHERE survey_id = ? AND user_id = ? ORDER BY created_at DESC").bind(survey.id, reader.id).all<QueryRow>();
    return Response.json({ survey: { title: survey.title, access: survey.access }, results: (rows.results || []).map(result) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "查询失败" }, { status: 404 }); }
}

export async function POST(request: Request, context: Context) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  try {
    const { slug } = await context.params; const { db, survey } = await surveyForQuery(slug);
    if (survey.access !== "public") return Response.json({ error: "此问卷需登录后查询" }, { status: 400 });
    const body = await request.json() as { identity?: unknown }; const identity = normalizeSurveyLookupValue(typeof body.identity === "string" ? body.identity : "");
    if (!identity) return Response.json({ error: "请输入查询凭证" }, { status: 400 });
    const lookupHash = await hashValue(`${survey.id}:lookup:${identity}`);
    const now = Date.now(); const ipHash = await hashValue(`${survey.id}:query-ip:${clientIp(request)}`);
    const recentIp = await db.prepare("SELECT COUNT(*) AS count FROM survey_query_attempts WHERE survey_id = ? AND ip_hash = ? AND created_at > ?").bind(survey.id, ipHash, now - 10 * 60_000).first<{ count: number }>();
    const repeatedFailure = await db.prepare("SELECT COUNT(*) AS count FROM survey_query_attempts WHERE survey_id = ? AND lookup_hash = ? AND success = 0 AND created_at > ?").bind(survey.id, lookupHash, now - 30 * 60_000).first<{ count: number }>();
    if ((recentIp?.count || 0) >= 20 || (repeatedFailure?.count || 0) >= 5) return Response.json({ error: "查询尝试过多，请稍后再试" }, { status: 429, headers: { "Retry-After": "600" } });
    const rows = await db.prepare("SELECT id, score, max_score AS maxScore, feedback_json AS feedbackJson, feedback_updated_at AS feedbackUpdatedAt, created_at AS createdAt FROM survey_responses WHERE survey_id = ? AND lookup_hash = ? ORDER BY created_at DESC").bind(survey.id, lookupHash).all<QueryRow>();
    await db.prepare("INSERT INTO survey_query_attempts (id, survey_id, ip_hash, lookup_hash, success, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), survey.id, ipHash, lookupHash, rows.results?.length ? 1 : 0, now).run();
    return Response.json({ survey: { title: survey.title, access: survey.access }, results: (rows.results || []).map(result) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "查询失败" }, { status: 400 }); }
}

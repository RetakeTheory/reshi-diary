import { ensureDatabaseSchema, getD1 } from "../../../../db/runtime";
import { hashValue, sameOrigin } from "../../../../lib/admin-email-auth";
import { validateSurveyAnswers } from "../../../../lib/surveys";
import { surveyFromRow, surveySelect, type SurveyDbRow } from "../../../../lib/survey-d1";
import { readerFromRequest } from "../../../../lib/reader-auth";

type Context = { params: Promise<{ slug: string }> };

function clientIp(request: Request) {
  return request.headers.get("cf-connecting-ip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
}

export async function GET(request: Request, context: Context) {
  const { slug } = await context.params;
  await ensureDatabaseSchema();
  const db = await getD1();
  const row = await db.prepare(`${surveySelect} WHERE s.slug = ? AND s.status IN ('published', 'closed') LIMIT 1`).bind(slug).first<SurveyDbRow>();
  if (!row) return Response.json({ error: "问卷不存在或尚未发布" }, { status: 404 });
  if (row.access === "registered" && !await readerFromRequest(request)) return Response.json({ error: "此问卷仅限注册用户填写", requiresLogin: true }, { status: 401 });
  const full = surveyFromRow(row);
  const survey = {
    id: full.id, slug: full.slug, title: full.title, description: full.description,
    status: full.status, access: full.access, ipLimit: full.ipLimit, submitLabel: full.submitLabel,
    successMode: full.successMode, questions: full.questions, createdAt: full.createdAt, updatedAt: full.updatedAt,
  };
  return Response.json({ survey }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: Context) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  try {
    const { slug } = await context.params;
    await ensureDatabaseSchema();
    const db = await getD1();
    const row = await db.prepare(`${surveySelect} WHERE s.slug = ? AND s.status = 'published' LIMIT 1`).bind(slug).first<SurveyDbRow>();
    if (!row) return Response.json({ error: "问卷不存在、未发布或已结束" }, { status: 404 });
    if (row.access === "registered" && !await readerFromRequest(request)) return Response.json({ error: "此问卷仅限注册用户填写", requiresLogin: true }, { status: 401 });
    const survey = surveyFromRow(row);
    const body = await request.json() as { answers?: unknown };
    const answers = validateSurveyAnswers(survey.questions, body.answers);
    const serialized = JSON.stringify(answers);
    if (serialized.length > 100_000) return Response.json({ error: "答卷内容过大" }, { status: 413 });
    const ipHash = await hashValue(`${survey.id}:${clientIp(request)}`);
    const id = crypto.randomUUID();
    try {
      await db.prepare("INSERT INTO survey_responses (id, survey_id, ip_hash, answers_json, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(id, survey.id, ipHash, serialized, Date.now()).run();
    } catch (error) {
      if (error instanceof Error && error.message.includes("survey_ip_limit")) return Response.json({ error: `此 IP 最多可提交 ${survey.ipLimit} 次` }, { status: 429 });
      throw error;
    }
    return Response.json({
      ok: true,
      responseId: id,
      completion: survey.successMode === "redirect"
        ? { mode: "redirect", redirectUrl: survey.successRedirectUrl }
        : { mode: "message", content: survey.successContent },
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "提交失败" }, { status: 400 });
  }
}

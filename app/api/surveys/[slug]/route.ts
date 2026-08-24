import { ensureDatabaseSchema, getD1 } from "../../../../db/runtime";
import { hashValue, sameOrigin } from "../../../../lib/admin-email-auth";
import { publicSurveyQuestions, scoreSurveyAnswers, surveyLookupValue, validateSurveyAnswers, type SurveyFileAnswer } from "../../../../lib/surveys";
import { surveyFromRow, surveySelect, type SurveyDbRow } from "../../../../lib/survey-d1";
import { readerFromRequest } from "../../../../lib/reader-auth";
import { headS3Object } from "../../../../lib/s3-storage";

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
  const reader = await readerFromRequest(request);
  if (row.access === "registered" && !reader) return Response.json({ error: "此问卷仅限注册用户填写", requiresLogin: true }, { status: 401 });
  const full = surveyFromRow(row);
  const survey = {
    id: full.id, slug: full.slug, title: full.title, description: full.description,
    status: full.status, access: full.access, kind: full.kind, queryEnabled: full.queryEnabled, durationMinutes: full.durationMinutes, examInstructions: full.examInstructions, examStartAt: full.examStartAt, ipLimit: full.ipLimit, submitLabel: full.submitLabel,
    successMode: full.successMode, questions: publicSurveyQuestions(full.questions), createdAt: full.createdAt, updatedAt: full.updatedAt,
  };
  return Response.json({ survey, serverNow: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: Context) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  try {
    const { slug } = await context.params;
    await ensureDatabaseSchema();
    const db = await getD1();
    const row = await db.prepare(`${surveySelect} WHERE s.slug = ? AND s.status = 'published' LIMIT 1`).bind(slug).first<SurveyDbRow>();
    if (!row) return Response.json({ error: "问卷不存在、未发布或已结束" }, { status: 404 });
    const reader = await readerFromRequest(request);
    if (row.access === "registered" && !reader) return Response.json({ error: "此问卷仅限注册用户填写", requiresLogin: true }, { status: 401 });
    const survey = surveyFromRow(row);
    const body = await request.json() as { answers?: unknown; attemptId?: unknown; timedOut?: unknown };
    const ipHash = await hashValue(`${survey.id}:${clientIp(request)}`);
    const now = Date.now(); const actorKey = reader ? `user:${reader.id}` : `ip:${ipHash}`;
    let timedOut = false;
    if (survey.kind === "exam") {
      const attemptId = typeof body.attemptId === "string" ? body.attemptId : "";
      const attempt = await db.prepare("SELECT id, expires_at AS expiresAt, submitted_at AS submittedAt FROM survey_attempts WHERE id = ? AND survey_id = ? AND actor_key = ? LIMIT 1").bind(attemptId, survey.id, actorKey).first<{ id: string; expiresAt: number; submittedAt: number | null }>();
      if (!attempt || attempt.submittedAt) return Response.json({ error: "考试作答凭证无效或已经提交" }, { status: 400 });
      timedOut = body.timedOut === true && now >= attempt.expiresAt;
      if (body.timedOut === true && !timedOut) return Response.json({ error: "考试尚未到交卷时间" }, { status: 400 });
      if (!timedOut && now > attempt.expiresAt) return Response.json({ error: "考试时间已结束，请等待自动交卷" }, { status: 408 });
      if (now > attempt.expiresAt + 5 * 60_000) return Response.json({ error: "考试已超时，答卷无法提交" }, { status: 408 });
    }
    const answers = validateSurveyAnswers(survey.questions, body.answers, { allowIncomplete: timedOut });
    const serialized = JSON.stringify(answers);
    if (serialized.length > 100_000) return Response.json({ error: "答卷内容过大" }, { status: 413 });
    const id = crypto.randomUUID();
    const score = survey.kind === "exam" ? scoreSurveyAnswers(survey.questions, answers) : { score: 0, maxScore: 0 };
    const lookupValue = surveyLookupValue(survey, answers);
    const lookupHash = lookupValue ? await hashValue(`${survey.id}:lookup:${lookupValue}`) : null;
    const fileAnswers = survey.questions.filter((question) => question.type === "file" && answers[question.id]).map((question) => ({ question, file: answers[question.id] as SurveyFileAnswer }));
    for (const { question, file } of fileAnswers) {
      const reservation = await db.prepare(`SELECT key, size, content_type FROM survey_file_uploads
        WHERE key = ? AND survey_id = ? AND question_id = ? AND ip_hash = ? AND used_at IS NULL AND created_at > ? LIMIT 1`)
        .bind(file.key, survey.id, question.id, ipHash, Date.now() - 60 * 60_000).first<{ key: string; size: number; content_type: string }>();
      if (!reservation || reservation.size !== file.size || reservation.content_type !== file.type) return Response.json({ error: `题目“${question.title}”的文件上传记录无效或已过期` }, { status: 400 });
      const object = await headS3Object(file.key);
      if (!object.ok || Number(object.headers.get("content-length")) !== file.size) return Response.json({ error: `题目“${question.title}”的文件尚未上传完成` }, { status: 400 });
    }
    try {
      await db.batch([
        db.prepare("INSERT INTO survey_responses (id, survey_id, ip_hash, user_id, lookup_hash, answers_json, score, max_score, attempt_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, survey.id, ipHash, reader?.id || null, lookupHash, serialized, survey.kind === "exam" ? score.score : null, survey.kind === "exam" ? score.maxScore : null, survey.kind === "exam" ? String(body.attemptId || "") : null, now),
        ...(survey.kind === "exam" ? [db.prepare("UPDATE survey_attempts SET submitted_at = ? WHERE id = ? AND submitted_at IS NULL").bind(now, String(body.attemptId || ""))] : []),
        ...fileAnswers.map(({ file }) => db.prepare("UPDATE survey_file_uploads SET used_at = ?, response_id = ? WHERE key = ? AND used_at IS NULL").bind(now, id, file.key)),
      ]);
    } catch (error) {
      if (error instanceof Error && error.message.includes("survey_ip_limit")) return Response.json({ error: `此 IP 最多可提交 ${survey.ipLimit} 次` }, { status: 429 });
      if (error instanceof Error && (error.message.includes("idx_survey_responses_attempt") || error.message.includes("survey_responses.attempt_id"))) return Response.json({ error: "考试已经提交，请勿重复交卷" }, { status: 409 });
      throw error;
    }
    return Response.json({
      ok: true,
      responseId: id,
      completion: { ...(survey.successMode === "redirect"
        ? { mode: "redirect", redirectUrl: survey.successRedirectUrl }
        : { mode: "message", content: survey.successContent }), ...(survey.queryEnabled ? { queryUrl: `/surveys/${survey.slug}/query` } : {}) },
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "提交失败" }, { status: 400 });
  }
}

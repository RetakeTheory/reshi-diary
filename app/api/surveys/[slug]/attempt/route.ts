import { ensureDatabaseSchema, getD1 } from "../../../../../db/runtime";
import { hashValue, sameOrigin } from "../../../../../lib/admin-email-auth";
import { readerFromRequest } from "../../../../../lib/reader-auth";
import { surveyFromRow, surveySelect, type SurveyDbRow } from "../../../../../lib/survey-d1";

function clientIp(request: Request) {
  return request.headers.get("cf-connecting-ip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const { slug } = await context.params;
  await ensureDatabaseSchema();
  const db = await getD1();
  const row = await db.prepare(`${surveySelect} WHERE s.slug = ? AND s.status = 'published' LIMIT 1`).bind(slug).first<SurveyDbRow>();
  if (!row) return Response.json({ error: "考试不存在、未发布或已经结束" }, { status: 404 });
  const survey = surveyFromRow(row);
  if (survey.kind !== "exam") return Response.json({ error: "此页面不是考试" }, { status: 400 });
  const reader = await readerFromRequest(request);
  if (survey.access === "registered" && !reader) return Response.json({ error: "此考试仅限注册用户参加", requiresLogin: true }, { status: 401 });
  const now = Date.now();
  if (survey.examStartAt && now < survey.examStartAt) return Response.json({ error: "考试尚未开放", opensAt: survey.examStartAt, serverNow: now }, { status: 425 });
  const ipHash = await hashValue(`${survey.id}:${clientIp(request)}`);
  const actorKey = reader ? `user:${reader.id}` : `ip:${ipHash}`;
  let attempt = await db.prepare("SELECT id, expires_at AS expiresAt FROM survey_attempts WHERE survey_id = ? AND actor_key = ? AND submitted_at IS NULL AND expires_at > ? ORDER BY started_at DESC LIMIT 1").bind(survey.id, actorKey, now).first<{ id: string; expiresAt: number }>();
  if (!attempt) {
    attempt = { id: crypto.randomUUID(), expiresAt: now + survey.durationMinutes * 60_000 };
    await db.prepare("INSERT INTO survey_attempts (id, survey_id, actor_key, started_at, expires_at) VALUES (?, ?, ?, ?, ?)").bind(attempt.id, survey.id, actorKey, now, attempt.expiresAt).run();
  }
  return Response.json({ attempt, serverNow: now }, { status: 201, headers: { "Cache-Control": "no-store" } });
}

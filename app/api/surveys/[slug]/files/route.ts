import { ensureDatabaseSchema, getD1 } from "../../../../../db/runtime";
import { hashValue, sameOrigin } from "../../../../../lib/admin-email-auth";
import { previewModeFor } from "../../../../../lib/file-preview";
import { readerFromRequest } from "../../../../../lib/reader-auth";
import { presignS3PutObject } from "../../../../../lib/s3-storage";
import { surveyFromRow, surveySelect, type SurveyDbRow } from "../../../../../lib/survey-d1";

const MAX_BYTES = 100 * 1024 * 1024;
function clientIp(request: Request) { return request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"; }
function safeName(value: string) { return [...value].map((character) => character.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(character) ? "-" : character).slice(0, 180).join("") || "文件"; }

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { questionId?: string; name?: string; size?: number; type?: string };
  const name = safeName(body.name?.trim() || ""); const size = Number(body.size); const contentType = (body.type || "application/octet-stream").slice(0, 160);
  if (!body.questionId || !Number.isSafeInteger(size) || size < 1 || size > MAX_BYTES) return Response.json({ error: "文件无效或超过 100 MB" }, { status: 413 });
  await ensureDatabaseSchema(); const db = await getD1(); const { slug } = await context.params;
  const row = await db.prepare(`${surveySelect} WHERE s.slug = ? AND s.status = 'published' LIMIT 1`).bind(slug).first<SurveyDbRow>();
  if (!row) return Response.json({ error: "问卷不存在或未开放" }, { status: 404 });
  if (row.access === "registered" && !await readerFromRequest(request)) return Response.json({ error: "此问卷仅限注册用户填写" }, { status: 401 });
  const survey = surveyFromRow(row); const question = survey.questions.find((item) => item.id === body.questionId);
  if (!question || question.type !== "file" || size > question.maxSizeMb * 1024 * 1024) return Response.json({ error: `文件超过题目允许的 ${question?.type === "file" ? question.maxSizeMb : 100} MB` }, { status: 413 });
  const key = `survey-files/${survey.id}/${crypto.randomUUID()}`; const now = Date.now();
  await db.prepare("INSERT INTO survey_file_uploads (key, survey_id, question_id, filename, content_type, size, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(key, survey.id, question.id, name, contentType, size, await hashValue(`${survey.id}:${clientIp(request)}`), now).run();
  try {
    const signed = await presignS3PutObject(key, { filename: name, contentType, previewable: previewModeFor(contentType, name) !== null });
    return Response.json({ key, name, size, type: contentType, ...signed }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    await db.prepare("DELETE FROM survey_file_uploads WHERE key = ?").bind(key).run();
    return Response.json({ error: error instanceof Error && error.message === "S3_STORAGE_NOT_CONFIGURED" ? "文件存储尚未配置" : "暂时无法创建上传任务" }, { status: 503 });
  }
}

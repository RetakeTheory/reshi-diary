import { ensureDatabaseSchema, getD1 } from "../../../../../db/runtime";
import { hashValue, sameOrigin } from "../../../../../lib/admin-email-auth";
import { previewModeFor } from "../../../../../lib/file-preview";
import { readerFromRequest } from "../../../../../lib/reader-auth";
import { putS3Object } from "../../../../../lib/s3-storage";
import { surveyFromRow, surveySelect, type SurveyDbRow } from "../../../../../lib/survey-d1";
import { SURVEY_FILE_STORAGE_PREFIX } from "../../../../../lib/survey-file-key";

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
  // Keep survey objects below the already-authorized uploads/ IAM prefix.
  // The nested surveys/ namespace remains private in the file-serving routes.
  const key = `${SURVEY_FILE_STORAGE_PREFIX}/${survey.id}/${crypto.randomUUID()}`; const now = Date.now();
  await db.prepare("INSERT INTO survey_file_uploads (key, survey_id, question_id, filename, content_type, size, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(key, survey.id, question.id, name, contentType, size, await hashValue(`${survey.id}:${clientIp(request)}`), now).run();
  const uploadUrl = `/api/surveys/${encodeURIComponent(slug)}/files?key=${encodeURIComponent(key)}`;
  return Response.json({ key, name, size, type: contentType, uploadUrl, headers: { "content-type": contentType }, expiresAt: now + 60 * 60_000 }, { status: 201, headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request, context: { params: Promise<{ slug: string }> }) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const { slug } = await context.params;
  const key = new URL(request.url).searchParams.get("key") || "";
  await ensureDatabaseSchema(); const db = await getD1();
  const row = await db.prepare(`${surveySelect} WHERE s.slug = ? AND s.status = 'published' LIMIT 1`).bind(slug).first<SurveyDbRow>();
  if (!row) return Response.json({ error: "问卷不存在或未开放" }, { status: 404 });
  if (row.access === "registered" && !await readerFromRequest(request)) return Response.json({ error: "此问卷仅限注册用户填写" }, { status: 401 });
  const ipHash = await hashValue(`${row.id}:${clientIp(request)}`);
  const reservation = await db.prepare(`SELECT filename, content_type, size FROM survey_file_uploads
    WHERE key = ? AND survey_id = ? AND ip_hash = ? AND used_at IS NULL AND created_at > ? LIMIT 1`)
    .bind(key, row.id, ipHash, Date.now() - 60 * 60_000).first<{ filename: string; content_type: string; size: number }>();
  if (!reservation) return Response.json({ error: "上传任务无效或已过期，请重新选择文件" }, { status: 400 });
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 0 && contentLength !== reservation.size) return Response.json({ error: "文件大小与上传任务不一致" }, { status: 400 });
  const body = await request.arrayBuffer();
  if (body.byteLength !== reservation.size || body.byteLength > MAX_BYTES) return Response.json({ error: "文件大小与上传任务不一致" }, { status: 400 });
  try {
    const uploaded = await putS3Object(key, { body, filename: reservation.filename, contentType: reservation.content_type, previewable: previewModeFor(reservation.content_type, reservation.filename) !== null });
    if (!uploaded.ok) {
      const responseBody = await uploaded.text().catch(() => "");
      const storageCode = responseBody.match(/<Code>([^<]{1,120})<\/Code>/)?.[1] || "unknown";
      console.error(JSON.stringify({ event: "survey_file_upload_failed", status: uploaded.status, storageCode }));
      return Response.json({ error: "文件存储暂时拒绝上传，请稍后重试" }, { status: 502 });
    }
    return Response.json({ ok: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error && error.message === "S3_STORAGE_NOT_CONFIGURED" ? "文件存储尚未配置" : "文件上传服务暂时不可用" }, { status: 503 });
  }
}

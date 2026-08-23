import { ensureDatabaseSchema, getD1 } from "../../../../../db/runtime";
import { sameOrigin } from "../../../../../lib/admin-email-auth";
import { getApiAdmin } from "../../../../admin/admin-auth";
import { normalizeSurveyInput } from "../../../../../lib/surveys";
import { surveyFromRow, surveySelect, type SurveyDbRow } from "../../../../../lib/survey-d1";
import { sanitizeRichHtml } from "../../../../../lib/rich-content";
import { deleteS3Object } from "../../../../../lib/s3-storage";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  if (!await getApiAdmin()) return Response.json({ error: "请先登录管理员账户" }, { status: 401 });
  try {
    const { id } = await context.params;
    let input = normalizeSurveyInput(await request.json());
    input = normalizeSurveyInput({ ...input, successContent: sanitizeRichHtml(input.successContent) });
    await ensureDatabaseSchema();
    const db = await getD1();
    const result = await db.prepare(`UPDATE surveys SET slug = ?, title = ?, description = ?, status = ?, access = ?, ip_limit = ?, submit_label = ?, success_mode = ?, success_content = ?, success_redirect_url = ?, questions_json = ?, updated_at = ? WHERE id = ?`)
      .bind(input.slug, input.title, input.description, input.status, input.access, input.ipLimit, input.submitLabel, input.successMode, input.successContent, input.successRedirectUrl, JSON.stringify(input.questions), Date.now(), id).run();
    if (!result.meta.changes) return Response.json({ error: "问卷不存在" }, { status: 404 });
    const row = await db.prepare(`${surveySelect} WHERE s.id = ? LIMIT 1`).bind(id).first<SurveyDbRow>();
    return Response.json({ survey: surveyFromRow(row!) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存失败";
    return Response.json({ error: /unique/i.test(message) ? "公开地址已被使用" : message }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: Context) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  if (!await getApiAdmin()) return Response.json({ error: "请先登录管理员账户" }, { status: 401 });
  const { id } = await context.params;
  await ensureDatabaseSchema();
  const db = await getD1();
  const files = await db.prepare("SELECT key FROM survey_file_uploads WHERE survey_id = ?").bind(id).all<{ key: string }>();
  await db.batch([
    db.prepare("DELETE FROM survey_file_uploads WHERE survey_id = ?").bind(id),
    db.prepare("DELETE FROM survey_responses WHERE survey_id = ?").bind(id),
    db.prepare("DELETE FROM surveys WHERE id = ?").bind(id),
  ]);
  await Promise.allSettled((files.results || []).map((file) => deleteS3Object(file.key)));
  return Response.json({ ok: true });
}

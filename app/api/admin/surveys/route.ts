import { ensureDatabaseSchema, getD1 } from "../../../../db/runtime";
import { sameOrigin } from "../../../../lib/admin-email-auth";
import { getApiAdmin } from "../../../admin/admin-auth";
import { normalizeSurveyInput } from "../../../../lib/surveys";
import { surveyFromRow, surveySelect, type SurveyDbRow } from "../../../../lib/survey-d1";
import { sanitizeRichHtml } from "../../../../lib/rich-content";

export async function GET() {
  if (!await getApiAdmin()) return Response.json({ error: "请先登录管理员账户" }, { status: 401 });
  await ensureDatabaseSchema();
  const db = await getD1();
  const result = await db.prepare(`${surveySelect} ORDER BY s.updated_at DESC`).all<SurveyDbRow>();
  return Response.json({ surveys: (result.results || []).map(surveyFromRow) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  if (!await getApiAdmin()) return Response.json({ error: "请先登录管理员账户" }, { status: 401 });
  try {
    let input = normalizeSurveyInput(await request.json());
    input = normalizeSurveyInput({ ...input, successContent: sanitizeRichHtml(input.successContent), examInstructions: sanitizeRichHtml(input.examInstructions) });
    await ensureDatabaseSchema();
    const db = await getD1();
    const id = crypto.randomUUID();
    const now = Date.now();
    await db.prepare(`INSERT INTO surveys (id, slug, title, description, status, access, kind, duration_minutes, exam_instructions, exam_start_at, query_identity_question_id, ip_limit, submit_label, success_mode, success_content, success_redirect_url, questions_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, input.slug, input.title, input.description, input.status, input.access, input.kind, input.durationMinutes, input.examInstructions, input.examStartAt, input.queryIdentityQuestionId, input.ipLimit, input.submitLabel, input.successMode, input.successContent, input.successRedirectUrl, JSON.stringify(input.questions), now, now).run();
    const row = await db.prepare(`${surveySelect} WHERE s.id = ? LIMIT 1`).bind(id).first<SurveyDbRow>();
    return Response.json({ survey: surveyFromRow(row!) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建失败";
    return Response.json({ error: /unique/i.test(message) ? "公开地址已被使用" : message }, { status: 400 });
  }
}

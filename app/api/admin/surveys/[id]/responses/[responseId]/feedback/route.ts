import { ensureDatabaseSchema, getD1 } from "../../../../../../../../db/runtime";
import { sameOrigin } from "../../../../../../../../lib/admin-email-auth";
import { getApiAdmin } from "../../../../../../../admin/admin-auth";
import type { SurveyFeedbackModule } from "../../../../../../../../lib/surveys";

function clean(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }

export async function PUT(request: Request, context: { params: Promise<{ id: string; responseId: string }> }) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  if (!await getApiAdmin()) return Response.json({ error: "请先登录管理员账户" }, { status: 401 });
  try {
    const raw = await request.json() as { title?: unknown; modules?: unknown };
    const title = clean(raw.title, 120) || "查询结果";
    if (!Array.isArray(raw.modules) || raw.modules.length < 1 || raw.modules.length > 20) throw new Error("反馈需包含 1–20 个模块");
    const modules: SurveyFeedbackModule[] = raw.modules.map((item, index) => {
      const moduleInput = item && typeof item === "object" ? item as Partial<SurveyFeedbackModule> : {};
      const moduleTitle = clean(moduleInput.title, 120); const content = clean(moduleInput.content, 5000);
      if (!moduleTitle || !content) throw new Error(`请完善第 ${index + 1} 个反馈模块`);
      const backgroundColor = clean(moduleInput.backgroundColor, 7) || "#f3f0ff";
      if (!/^#[0-9a-f]{6}$/i.test(backgroundColor)) throw new Error(`第 ${index + 1} 个反馈模块底色无效`);
      return { id: clean(moduleInput.id, 80) || crypto.randomUUID(), title: moduleTitle, content, tone: moduleInput.tone === "positive" || moduleInput.tone === "warning" ? moduleInput.tone : "neutral", backgroundColor };
    });
    const { id, responseId } = await context.params; const now = Date.now();
    await ensureDatabaseSchema(); const db = await getD1();
    const result = await db.prepare("UPDATE survey_responses SET feedback_json = ?, feedback_updated_at = ? WHERE id = ? AND survey_id = ?").bind(JSON.stringify({ status: "ready", title, modules }), now, responseId, id).run();
    if (!result.meta.changes) return Response.json({ error: "答卷不存在" }, { status: 404 });
    return Response.json({ feedback: { status: "ready", title, modules, updatedAt: now } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "保存反馈失败" }, { status: 400 }); }
}

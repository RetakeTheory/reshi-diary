import { ensureDatabaseSchema, getD1 } from "../../../../../../db/runtime";
import { sameOrigin } from "../../../../../../lib/admin-email-auth";
import { getApiAdmin } from "../../../../../admin/admin-auth";

type GroupRow = { id: string; feedbackJson: string; feedbackUpdatedAt: number | null };

function groupName(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 60) : "";
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  if (!await getApiAdmin()) return Response.json({ error: "请先登录管理员账户" }, { status: 401 });
  try {
    const body = await request.json() as { responseIds?: unknown; group?: unknown };
    const responseIds = Array.isArray(body.responseIds) ? [...new Set(body.responseIds.filter((value): value is string => typeof value === "string" && value.length > 0))] : [];
    const group = groupName(body.group);
    if (responseIds.length < 1 || responseIds.length > 100) throw new Error("请选择 1–100 份答卷");
    const { id } = await context.params;
    await ensureDatabaseSchema(); const db = await getD1();
    const placeholders = responseIds.map(() => "?").join(",");
    const selected = await db.prepare(`SELECT id, feedback_json AS feedbackJson, feedback_updated_at AS feedbackUpdatedAt FROM survey_responses WHERE survey_id = ? AND id IN (${placeholders})`).bind(id, ...responseIds).all<GroupRow>();
    if ((selected.results || []).length !== responseIds.length) throw new Error("部分答卷不存在或不属于当前问卷");
    if (!group) {
      await db.batch(responseIds.map((responseId) => db.prepare("UPDATE survey_responses SET feedback_group = NULL WHERE survey_id = ? AND id = ?").bind(id, responseId)));
      return Response.json({ group: null, responseIds }, { headers: { "Cache-Control": "no-store" } });
    }
    const existing = await db.prepare("SELECT id, feedback_json AS feedbackJson, feedback_updated_at AS feedbackUpdatedAt FROM survey_responses WHERE survey_id = ? AND feedback_group = ? ORDER BY feedback_updated_at DESC LIMIT 1").bind(id, group).first<GroupRow>();
    const source = existing || [...(selected.results || [])].sort((left, right) => (right.feedbackUpdatedAt || 0) - (left.feedbackUpdatedAt || 0))[0];
    const feedbackJson = source?.feedbackJson || '{"status":"pending","title":"","modules":[],"includeReport":false}';
    const feedbackUpdatedAt = source?.feedbackUpdatedAt || null;
    await db.batch(responseIds.map((responseId) => db.prepare("UPDATE survey_responses SET feedback_group = ?, feedback_json = ?, feedback_updated_at = ? WHERE survey_id = ? AND id = ?").bind(group, feedbackJson, feedbackUpdatedAt, id, responseId)));
    return Response.json({ group, responseIds, feedback: JSON.parse(feedbackJson) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "答卷分组失败" }, { status: 400 });
  }
}

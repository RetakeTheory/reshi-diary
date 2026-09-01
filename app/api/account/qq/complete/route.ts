import { ensureDatabaseSchema, getD1 } from "../../../../../db/runtime";
import { sameOrigin } from "../../../../../lib/admin-email-auth";
import { readerFromRequest } from "../../../../../lib/reader-auth";
import { getQqChallenge, oneBotErrorResponse, OneBotHttpError, pendingChallengeResponse } from "../../../../../lib/onebot-cloudflare";

function changed(result: D1Result) {
  return Number(result.meta.changes || 0) > 0;
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  try {
    const user = await readerFromRequest(request);
    if (!user) throw new OneBotHttpError(401, "请先登录");
    const body = await request.json().catch(() => ({})) as { flowId?: string };
    const row = await getQqChallenge(body.flowId || "");
    if (row.purpose !== "bind" || row.user_id !== user.id) throw new OneBotHttpError(403, "无权完成此验证请求");
    const waiting = pendingChallengeResponse(row);
    if (waiting) return waiting;
    const qqId = row.verified_qq_id;
    if (!qqId) throw new OneBotHttpError(409, "QQ 验证结果缺失");

    await ensureDatabaseSchema();
    const db = await getD1();
    const [owner, current] = await Promise.all([
      db.prepare("SELECT user_id FROM qq_bindings WHERE qq_id = ? LIMIT 1").bind(qqId).first<{ user_id: string }>(),
      db.prepare("SELECT qq_id FROM qq_bindings WHERE user_id = ? LIMIT 1").bind(user.id).first<{ qq_id: string }>(),
    ]);
    if (owner && owner.user_id !== user.id) throw new OneBotHttpError(409, "该 QQ 已绑定其他网站账户");
    if (current && current.qq_id !== qqId) throw new OneBotHttpError(409, "当前网站账户已绑定其他 QQ");
    const now = Date.now();
    const results = await db.batch([
      db.prepare("INSERT INTO qq_bindings (user_id, qq_id, bot_id, bound_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO NOTHING")
        .bind(user.id, qqId, row.bot_id, now),
      db.prepare("DELETE FROM qq_auth_challenges WHERE flow_id = ? AND status = 'verified'").bind(row.flow_id),
    ]);
    if (!changed(results[1])) throw new OneBotHttpError(409, "验证请求已使用");
    return Response.json({ ok: true, status: "complete", binding: { qqId, botId: row.bot_id, boundAt: now } }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return oneBotErrorResponse(error);
  }
}

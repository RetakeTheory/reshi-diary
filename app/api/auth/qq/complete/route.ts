import { ensureDatabaseSchema, getD1 } from "../../../../../db/runtime";
import { sameOrigin } from "../../../../../lib/admin-email-auth";
import { displayNameKey, issueReaderSession, uniqueReaderUid } from "../../../../../lib/reader-auth";
import { getQqChallenge, oneBotErrorResponse, OneBotHttpError, pendingChallengeResponse, syntheticQqEmail } from "../../../../../lib/onebot-cloudflare";

function changed(result: D1Result) {
  return Number(result.meta.changes || 0) > 0;
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  try {
    const body = await request.json().catch(() => ({})) as { flowId?: string };
    const row = await getQqChallenge(body.flowId || "");
    const waiting = pendingChallengeResponse(row);
    if (waiting) return waiting;
    if (row.purpose !== "login" && row.purpose !== "register") throw new OneBotHttpError(409, "验证请求用途无效");
    const qqId = row.verified_qq_id;
    if (!qqId) throw new OneBotHttpError(409, "QQ 验证结果缺失");

    await ensureDatabaseSchema();
    const db = await getD1();
    const binding = await db.prepare(`SELECT q.user_id, u.is_banned FROM qq_bindings q
      JOIN users u ON u.id = q.user_id WHERE q.qq_id = ? LIMIT 1`).bind(qqId).first<{ user_id: string; is_banned: number }>();
    if (binding?.is_banned) throw new OneBotHttpError(403, "此账户已被封禁");
    if (!binding && row.purpose === "login") throw new OneBotHttpError(404, "该 QQ 尚未注册，请切换到 QQ 注册");

    let userId = binding?.user_id || "";
    if (!userId) {
      userId = crypto.randomUUID();
      const uid = await uniqueReaderUid(db);
      const name = row.display_name || `QQ用户${qqId.slice(-4)}`;
      try {
        const results = await db.batch([
          db.prepare(`INSERT INTO users (id, uid, email, display_name, display_name_key, points, is_banned, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`).bind(userId, uid, syntheticQqEmail(qqId), name, displayNameKey(name), Date.now(), Date.now()),
          db.prepare("INSERT INTO qq_bindings (user_id, qq_id, bot_id, bound_at) VALUES (?, ?, ?, ?)")
            .bind(userId, qqId, row.bot_id, Date.now()),
          db.prepare("DELETE FROM qq_auth_challenges WHERE flow_id = ? AND status = 'verified'").bind(row.flow_id),
        ]);
        if (!changed(results[2])) throw new OneBotHttpError(409, "验证请求已使用");
      } catch (error) {
        if (error instanceof OneBotHttpError) throw error;
        if (error instanceof Error && /unique|constraint/i.test(error.message)) {
          throw new OneBotHttpError(409, "QQ 或昵称已被使用，请重新开始注册");
        }
        throw error;
      }
    } else {
      const consumed = await db.prepare("DELETE FROM qq_auth_challenges WHERE flow_id = ? AND status = 'verified'").bind(row.flow_id).run();
      if (!changed(consumed)) throw new OneBotHttpError(409, "验证请求已使用");
    }
    const cookie = await issueReaderSession(userId);
    return Response.json({ ok: true, status: "complete" }, {
      headers: { "Set-Cookie": cookie, "Cache-Control": "no-store" },
    });
  } catch (error) {
    return oneBotErrorResponse(error);
  }
}

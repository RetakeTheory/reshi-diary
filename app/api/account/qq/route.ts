import { ensureDatabaseSchema, getD1 } from "../../../../db/runtime";
import { sameOrigin } from "../../../../lib/admin-email-auth";
import { readerFromRequest } from "../../../../lib/reader-auth";
import { availableOneBot, createQqChallenge, isSyntheticQqEmail, oneBotErrorResponse, OneBotHttpError } from "../../../../lib/onebot-cloudflare";

export async function GET(request: Request) {
  try {
    const user = await readerFromRequest(request);
    if (!user) throw new OneBotHttpError(401, "请先登录");
    await ensureDatabaseSchema();
    const db = await getD1();
    const binding = await db.prepare("SELECT qq_id, bot_id, bound_at FROM qq_bindings WHERE user_id = ? LIMIT 1")
      .bind(user.id).first<{ qq_id: string; bot_id: string; bound_at: number }>();
    const configured = Boolean(await db.prepare("SELECT 1 FROM onebot_bots WHERE enabled = 1 LIMIT 1").first());
    let botId: string | null = null;
    try { botId = await availableOneBot(); } catch { /* Offline is a valid status response. */ }
    return Response.json({
      binding: binding ? { qqId: binding.qq_id, botId: binding.bot_id, boundAt: binding.bound_at } : null,
      botId,
      configured,
      online: Boolean(botId),
      canUnbind: Boolean(binding) && !isSyntheticQqEmail(user.email),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return oneBotErrorResponse(error);
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  try {
    const user = await readerFromRequest(request);
    if (!user) throw new OneBotHttpError(401, "请先登录");
    await ensureDatabaseSchema();
    const db = await getD1();
    if (await db.prepare("SELECT 1 FROM qq_bindings WHERE user_id = ? LIMIT 1").bind(user.id).first()) {
      throw new OneBotHttpError(409, "当前账户已绑定 QQ");
    }
    const botId = await availableOneBot();
    return Response.json(await createQqChallenge({ request, purpose: "bind", botId, userId: user.id }), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return oneBotErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  try {
    const user = await readerFromRequest(request);
    if (!user) throw new OneBotHttpError(401, "请先登录");
    if (isSyntheticQqEmail(user.email)) throw new OneBotHttpError(409, "QQ 是当前账户唯一登录方式，添加邮箱登录后才能解绑");
    await ensureDatabaseSchema();
    const db = await getD1();
    await db.prepare("DELETE FROM qq_bindings WHERE user_id = ?").bind(user.id).run();
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return oneBotErrorResponse(error);
  }
}

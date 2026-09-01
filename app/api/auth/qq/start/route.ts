import { ensureDatabaseSchema, getD1 } from "../../../../../db/runtime";
import { sameOrigin } from "../../../../../lib/admin-email-auth";
import { displayNameKey, normalizeDisplayName } from "../../../../../lib/reader-auth";
import { availableOneBot, createQqChallenge, oneBotErrorResponse, OneBotHttpError } from "../../../../../lib/onebot-cloudflare";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  try {
    const body = await request.json().catch(() => ({})) as { intent?: string; displayName?: string };
    const purpose = body.intent === "register" ? "register" : "login";
    let name: string | null = null;
    if (purpose === "register") {
      name = normalizeDisplayName(body.displayName || "");
      if ([...name].length < 2 || [...name].length > 40) throw new OneBotHttpError(400, "昵称需为 2–40 个字符");
      await ensureDatabaseSchema();
      const db = await getD1();
      if (await db.prepare("SELECT 1 FROM users WHERE display_name_key = ? LIMIT 1").bind(displayNameKey(name)).first()) {
        throw new OneBotHttpError(409, "该昵称已被使用");
      }
    }
    const botId = await availableOneBot();
    return Response.json(await createQqChallenge({ request, purpose, botId, displayName: name }), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return oneBotErrorResponse(error);
  }
}

import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { ensureDatabaseSchema, getD1 } from "../../../../../db/runtime";
import { ADMIN_EMAIL, sameOrigin } from "../../../../../lib/admin-email-auth";
import { getPasskeyContext, parseTransports, storePasskeyChallenge } from "../../../../../lib/admin-passkeys";

type PasskeyRow = { id: string; transports: string };

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  try {
    const { rpID } = getPasskeyContext(request);
    await ensureDatabaseSchema();
    const db = await getD1();
    const rows = await db.prepare("SELECT id, transports FROM admin_passkeys WHERE email = ? ORDER BY created_at")
      .bind(ADMIN_EMAIL).all<PasskeyRow>();
    if (!rows.results.length) return Response.json({ error: "尚未登记 Passkey，请先使用邮箱登录后在后台添加" }, { status: 404 });

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: rows.results.map((row) => ({ id: row.id, transports: parseTransports(row.transports) })),
      userVerification: "required",
      timeout: 60_000,
    });
    const flowId = await storePasskeyChallenge("authentication", options.challenge);
    return Response.json({ flowId, options }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "无法启动 Passkey 登录" }, { status: 400 });
  }
}

import { generateRegistrationOptions } from "@simplewebauthn/server";
import { getApiAdmin } from "../../../../admin/admin-auth";
import { ensureDatabaseSchema, getD1 } from "../../../../../db/runtime";
import { ADMIN_EMAIL, sameOrigin } from "../../../../../lib/admin-email-auth";
import { getPasskeyContext, parseTransports, PASSKEY_RP_NAME, storePasskeyChallenge } from "../../../../../lib/admin-passkeys";

type PasskeyRow = { id: string; transports: string };

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  if (!await getApiAdmin()) return Response.json({ error: "请先登录管理员账号" }, { status: 401 });

  try {
    const { rpID } = getPasskeyContext(request);
    await ensureDatabaseSchema();
    const db = await getD1();
    const rows = await db.prepare("SELECT id, transports FROM admin_passkeys WHERE email = ? ORDER BY created_at")
      .bind(ADMIN_EMAIL).all<PasskeyRow>();
    const options = await generateRegistrationOptions({
      rpName: PASSKEY_RP_NAME,
      rpID,
      userName: ADMIN_EMAIL,
      userDisplayName: "reshi",
      userID: new TextEncoder().encode("reshi-admin"),
      attestationType: "none",
      excludeCredentials: rows.results.map((row) => ({ id: row.id, transports: parseTransports(row.transports) })),
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
      supportedAlgorithmIDs: [-7, -257],
      timeout: 60_000,
    });
    const flowId = await storePasskeyChallenge("registration", options.challenge);
    return Response.json({ flowId, options }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "无法创建 Passkey" }, { status: 400 });
  }
}

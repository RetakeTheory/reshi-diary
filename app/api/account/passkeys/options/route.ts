import { generateRegistrationOptions } from "@simplewebauthn/server";
import { ensureDatabaseSchema, getD1 } from "../../../../../db/runtime";
import { sameOrigin } from "../../../../../lib/admin-email-auth";
import { getPasskeyContext, parseTransports, PASSKEY_RP_NAME } from "../../../../../lib/admin-passkeys";
import { readerFromRequest } from "../../../../../lib/reader-auth";
import { storeReaderPasskeyChallenge } from "../../../../../lib/reader-passkeys";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const user = await readerFromRequest(request);
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  try {
    await ensureDatabaseSchema(); const db = await getD1();
    const rows = await db.prepare("SELECT id, transports FROM reader_passkeys WHERE user_id = ? ORDER BY created_at").bind(user.id).all<{ id: string; transports: string }>();
    const { rpID } = getPasskeyContext(request);
    const options = await generateRegistrationOptions({ rpName: PASSKEY_RP_NAME, rpID, userName: user.email, userDisplayName: user.display_name, userID: new TextEncoder().encode(user.id), attestationType: "none", excludeCredentials: rows.results.map((row) => ({ id: row.id, transports: parseTransports(row.transports) })), authenticatorSelection: { residentKey: "required", userVerification: "required" }, supportedAlgorithmIDs: [-7, -257], timeout: 60_000 });
    return Response.json({ flowId: await storeReaderPasskeyChallenge(user.id, "registration", options.challenge), options }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "无法创建 Passkey" }, { status: 400 }); }
}

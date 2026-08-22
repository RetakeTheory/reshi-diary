import { verifyRegistrationResponse, type RegistrationResponseJSON } from "@simplewebauthn/server";
import { ensureDatabaseSchema, getD1 } from "../../../../../db/runtime";
import { sameOrigin } from "../../../../../lib/admin-email-auth";
import { getPasskeyContext } from "../../../../../lib/admin-passkeys";
import { readerFromRequest } from "../../../../../lib/reader-auth";
import { consumeReaderPasskeyChallenge } from "../../../../../lib/reader-passkeys";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const user = await readerFromRequest(request);
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const input = await request.json().catch(() => null) as { flowId?: string; response?: RegistrationResponseJSON; name?: string } | null;
  if (!input?.flowId || !input.response) return Response.json({ error: "Passkey 响应不完整" }, { status: 400 });
  const flow = await consumeReaderPasskeyChallenge(input.flowId, "registration");
  if (!flow || flow.userId !== user.id) return Response.json({ error: "Passkey 请求已过期" }, { status: 400 });
  try {
    const { rpID, origin } = getPasskeyContext(request);
    const verification = await verifyRegistrationResponse({ response: input.response, expectedChallenge: flow.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true, supportedAlgorithmIDs: [-7, -257] });
    if (!verification.verified) return Response.json({ error: "Passkey 登记失败" }, { status: 400 });
    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    await ensureDatabaseSchema(); const db = await getD1();
    await db.prepare(`INSERT INTO reader_passkeys (id, user_id, public_key, counter, device_type, backed_up, transports, name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET public_key = excluded.public_key, counter = excluded.counter,
      device_type = excluded.device_type, backed_up = excluded.backed_up, transports = excluded.transports, name = excluded.name`)
      .bind(credential.id, user.id, credential.publicKey, credential.counter, credentialDeviceType, credentialBackedUp ? 1 : 0, JSON.stringify(credential.transports || input.response.response.transports || []), input.name?.trim().slice(0, 40) || "我的设备", Date.now()).run();
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { console.error("Reader Passkey registration failed", error); return Response.json({ error: "Passkey 登记失败，请重试" }, { status: 400 }); }
}

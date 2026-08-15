import { verifyRegistrationResponse, type RegistrationResponseJSON } from "@simplewebauthn/server";
import { getApiAdmin } from "../../../../admin/admin-auth";
import { ensureDatabaseSchema, getD1 } from "../../../../../db/runtime";
import { ADMIN_EMAIL, sameOrigin } from "../../../../../lib/admin-email-auth";
import { consumePasskeyChallenge, getPasskeyContext } from "../../../../../lib/admin-passkeys";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  if (!await getApiAdmin()) return Response.json({ error: "请先登录管理员账号" }, { status: 401 });
  const body = await request.json().catch(() => null) as { flowId?: string; response?: RegistrationResponseJSON; name?: string } | null;
  if (!body?.flowId || !body.response) return Response.json({ error: "Passkey 响应不完整" }, { status: 400 });

  const challenge = await consumePasskeyChallenge(body.flowId, "registration");
  if (!challenge) return Response.json({ error: "Passkey 请求已过期，请重试" }, { status: 400 });

  try {
    const { rpID, origin } = getPasskeyContext(request);
    const verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      supportedAlgorithmIDs: [-7, -257],
    });
    if (!verification.verified) return Response.json({ error: "Passkey 登记失败" }, { status: 400 });

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    await ensureDatabaseSchema();
    const db = await getD1();
    const safeName = body.name?.trim().slice(0, 40) || "我的 Passkey";
    await db.prepare(`INSERT INTO admin_passkeys
      (id, email, webauthn_user_id, public_key, counter, device_type, backed_up, transports, name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET public_key = excluded.public_key, counter = excluded.counter,
        device_type = excluded.device_type, backed_up = excluded.backed_up, transports = excluded.transports, name = excluded.name`)
      .bind(
        credential.id,
        ADMIN_EMAIL,
        "reshi-admin",
        credential.publicKey,
        credential.counter,
        credentialDeviceType,
        credentialBackedUp ? 1 : 0,
        JSON.stringify(credential.transports || body.response.response.transports || []),
        safeName,
        Date.now(),
      ).run();
    return Response.json({ ok: true, name: safeName }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Passkey registration failed", error);
    return Response.json({ error: "Passkey 登记失败，请重试" }, { status: 400 });
  }
}

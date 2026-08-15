import { verifyAuthenticationResponse, type AuthenticationResponseJSON } from "@simplewebauthn/server";
import { ensureDatabaseSchema, getD1 } from "../../../../../db/runtime";
import { ADMIN_EMAIL, sameOrigin } from "../../../../../lib/admin-email-auth";
import { consumePasskeyChallenge, getPasskeyContext, parseTransports, toUint8Array, type StoredPasskey } from "../../../../../lib/admin-passkeys";
import { issueAdminSession } from "../../../../../lib/admin-session";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const body = await request.json().catch(() => null) as { flowId?: string; response?: AuthenticationResponseJSON } | null;
  if (!body?.flowId || !body.response?.id) return Response.json({ error: "Passkey 响应不完整" }, { status: 400 });

  const challenge = await consumePasskeyChallenge(body.flowId, "authentication");
  if (!challenge) return Response.json({ error: "Passkey 请求已过期，请重试" }, { status: 400 });

  try {
    const { rpID, origin } = getPasskeyContext(request);
    await ensureDatabaseSchema();
    const db = await getD1();
    const passkey = await db.prepare("SELECT id, public_key, counter, transports, name FROM admin_passkeys WHERE id = ? AND email = ? LIMIT 1")
      .bind(body.response.id, ADMIN_EMAIL).first<StoredPasskey>();
    if (!passkey) return Response.json({ error: "未找到这个 Passkey" }, { status: 404 });

    const verification = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: passkey.id,
        publicKey: toUint8Array(passkey.public_key),
        counter: passkey.counter,
        transports: parseTransports(passkey.transports),
      },
      requireUserVerification: true,
    });
    if (!verification.verified) return Response.json({ error: "Passkey 验证失败" }, { status: 401 });

    await db.prepare("UPDATE admin_passkeys SET counter = ?, last_used_at = ? WHERE id = ?")
      .bind(verification.authenticationInfo.newCounter, Date.now(), passkey.id).run();
    return Response.json({ ok: true }, { headers: { "Set-Cookie": await issueAdminSession(), "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Passkey authentication failed", error);
    return Response.json({ error: "Passkey 验证失败，请重试" }, { status: 401 });
  }
}

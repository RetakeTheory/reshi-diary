import { verifyAuthenticationResponse, type AuthenticationResponseJSON } from "@simplewebauthn/server";
import { ensureDatabaseSchema, getD1 } from "../../../../db/runtime";
import { sameOrigin } from "../../../../lib/admin-email-auth";
import { getPasskeyContext, parseTransports, toUint8Array, type StoredPasskey } from "../../../../lib/admin-passkeys";
import { issueReaderSession } from "../../../../lib/reader-auth";
import { consumeReaderPasskeyChallenge } from "../../../../lib/reader-passkeys";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const input = await request.json().catch(() => null) as { flowId?: string; response?: AuthenticationResponseJSON } | null;
  if (!input?.flowId || !input.response?.id) return Response.json({ error: "Passkey 响应不完整" }, { status: 400 });
  const flow = await consumeReaderPasskeyChallenge(input.flowId, "authentication");
  if (!flow) return Response.json({ error: "Passkey 请求已过期" }, { status: 400 });
  try {
    await ensureDatabaseSchema(); const db = await getD1();
    const passkey = await db.prepare("SELECT id, public_key, counter, transports, name FROM reader_passkeys WHERE id = ? AND user_id = ? LIMIT 1")
      .bind(input.response.id, flow.userId).first<StoredPasskey>();
    if (!passkey) return Response.json({ error: "未找到这个 Passkey" }, { status: 404 });
    const { rpID, origin } = getPasskeyContext(request);
    const verification = await verifyAuthenticationResponse({ response: input.response, expectedChallenge: flow.challenge, expectedOrigin: origin, expectedRPID: rpID, credential: { id: passkey.id, publicKey: toUint8Array(passkey.public_key), counter: passkey.counter, transports: parseTransports(passkey.transports) }, requireUserVerification: true });
    if (!verification.verified) return Response.json({ error: "Passkey 验证失败" }, { status: 401 });
    await db.prepare("UPDATE reader_passkeys SET counter = ?, last_used_at = ? WHERE id = ?").bind(verification.authenticationInfo.newCounter, Date.now(), passkey.id).run();
    return Response.json({ ok: true }, { headers: { "Set-Cookie": await issueReaderSession(flow.userId), "Cache-Control": "no-store" } });
  } catch (error) { console.error("Reader Passkey authentication failed", error); return Response.json({ error: "Passkey 验证失败，请重试" }, { status: 401 }); }
}

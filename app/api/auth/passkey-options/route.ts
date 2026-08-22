import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { ensureDatabaseSchema, getD1 } from "../../../../db/runtime";
import { sameOrigin } from "../../../../lib/admin-email-auth";
import { getPasskeyContext, parseTransports } from "../../../../lib/admin-passkeys";
import { normalizeReaderEmail } from "../../../../lib/reader-auth";
import { storeReaderPasskeyChallenge } from "../../../../lib/reader-passkeys";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const input = await request.json().catch(() => ({})) as { email?: string };
  await ensureDatabaseSchema();
  const db = await getD1();
  const user = await db.prepare("SELECT id FROM users WHERE email = ? LIMIT 1").bind(normalizeReaderEmail(input.email || "")).first<{ id: string }>();
  if (!user) return Response.json({ error: "账户不存在" }, { status: 404 });
  const rows = await db.prepare("SELECT id, transports FROM reader_passkeys WHERE user_id = ? ORDER BY created_at").bind(user.id).all<{ id: string; transports: string }>();
  if (!rows.results.length) return Response.json({ error: "此账户尚未添加 Passkey" }, { status: 404 });
  try {
    const { rpID } = getPasskeyContext(request);
    const options = await generateAuthenticationOptions({ rpID, allowCredentials: rows.results.map((row) => ({ id: row.id, transports: parseTransports(row.transports) })), userVerification: "required", timeout: 60_000 });
    return Response.json({ flowId: await storeReaderPasskeyChallenge(user.id, "authentication", options.challenge), options }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "无法启动 Passkey 登录" }, { status: 400 }); }
}

import { ensureDatabaseSchema, getD1 } from "../db/runtime";
import { randomToken } from "./admin-email-auth";
import { PASSKEY_CHALLENGE_TTL_MS, type PasskeyPurpose } from "./admin-passkeys";

export async function storeReaderPasskeyChallenge(userId: string, purpose: PasskeyPurpose, challenge: string) {
  await ensureDatabaseSchema();
  const db = await getD1();
  const flowId = randomToken(24);
  const now = Date.now();
  await db.batch([
    db.prepare("DELETE FROM reader_passkey_challenges WHERE expires_at <= ?").bind(now),
    db.prepare("INSERT INTO reader_passkey_challenges (flow_id, user_id, purpose, challenge, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(flowId, userId, purpose, challenge, now, now + PASSKEY_CHALLENGE_TTL_MS),
  ]);
  return flowId;
}

export async function consumeReaderPasskeyChallenge(flowId: string, purpose: PasskeyPurpose) {
  if (!/^[a-f0-9]{48}$/.test(flowId)) return null;
  await ensureDatabaseSchema();
  const db = await getD1();
  return db.prepare(`DELETE FROM reader_passkey_challenges WHERE flow_id = ? AND purpose = ? AND expires_at > ?
    RETURNING challenge, user_id AS userId`).bind(flowId, purpose, Date.now()).first<{ challenge: string; userId: string }>();
}

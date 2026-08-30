import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { ensureDatabaseSchema, getD1 } from "../db/runtime";
import { randomToken } from "./admin-email-auth";

export const PASSKEY_RP_NAME = "reshi 的日记本";
export const PASSKEY_CHALLENGE_TTL_MS = 5 * 60 * 1000;
export type PasskeyPurpose = "registration" | "authentication";

export type StoredPasskey = {
  id: string;
  public_key: ArrayBuffer | Uint8Array | number[];
  counter: number;
  transports: string;
  name: string;
};

export function getPasskeyContext(request: Request) {
  const url = new URL(request.url);
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    return { rpID: url.hostname, origin: url.origin };
  }
  if (url.hostname !== "rettheory.top" && url.hostname !== "admin.rettheory.top") throw new Error("请通过 rettheory.top 管理端使用 Passkey");
  return { rpID: "rettheory.top", origin: url.origin };
}

export async function storePasskeyChallenge(purpose: PasskeyPurpose, challenge: string) {
  await ensureDatabaseSchema();
  const db = await getD1();
  const flowId = randomToken(24);
  const now = Date.now();
  await db.batch([
    db.prepare("DELETE FROM admin_passkey_challenges WHERE expires_at <= ?").bind(now),
    db.prepare("INSERT INTO admin_passkey_challenges (flow_id, purpose, challenge, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
      .bind(flowId, purpose, challenge, now, now + PASSKEY_CHALLENGE_TTL_MS),
  ]);
  return flowId;
}

export async function consumePasskeyChallenge(flowId: string, purpose: PasskeyPurpose) {
  if (!/^[a-f0-9]{48}$/.test(flowId)) return null;
  await ensureDatabaseSchema();
  const db = await getD1();
  const row = await db.prepare("DELETE FROM admin_passkey_challenges WHERE flow_id = ? AND purpose = ? AND expires_at > ? RETURNING challenge")
    .bind(flowId, purpose, Date.now()).first<{ challenge: string }>();
  return row?.challenge || null;
}

export function parseTransports(value: string | null | undefined): AuthenticatorTransportFuture[] {
  const allowed = new Set<AuthenticatorTransportFuture>(["ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"]);
  try {
    const values = JSON.parse(value || "[]");
    return Array.isArray(values) ? values.filter((item): item is AuthenticatorTransportFuture => allowed.has(item)) : [];
  } catch {
    return [];
  }
}

export function toUint8Array(value: StoredPasskey["public_key"]): Uint8Array<ArrayBuffer> {
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array(value);
}

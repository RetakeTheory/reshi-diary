import test from "node:test";
import assert from "node:assert/strict";
import { resolveRollCallIdentity } from "../lib/roll-call-auth.ts";

const token = "a".repeat(64);
const request = (cookies = `reshi_user_session=${token}`) => new Request("https://rettheory.top/api/roll-call", { headers: { Cookie: cookies } });
const providers = (overrides = {}) => ({ d1Reader: async () => null, rustReader: async () => null, admin: async () => null, ...overrides });

test("existing D1 reader keeps the original history owner ID", async () => {
  const identity = await resolveRollCallIdentity(request(), providers({ d1Reader: async () => ({ id: "reader-1", display_name: "读者" }), rustReader: () => { throw new Error("must not call Rust"); } }));
  assert.deepEqual(identity, { id: "reader-1", displayName: "读者", kind: "reader" });
});

test("a website Rust session can use the D1 plugin without another login", async () => {
  const identity = await resolveRollCallIdentity(request(), providers({ rustReader: async (value) => {
    assert.equal(value, token);
    return Response.json({ user: { id: "reader-1", displayName: "网站读者" } });
  } }));
  assert.deepEqual(identity, { id: "rust:reader-1", displayName: "网站读者", kind: "reader" });
});

test("validated admin sessions use a separate owner namespace", async () => {
  assert.deepEqual(await resolveRollCallIdentity(request("reshi_admin_session=valid-session"), providers({ admin: async () => ({ email: "admin@example.com", displayName: "管理员" }) })), { id: "admin:admin@example.com", displayName: "管理员", kind: "admin" });
});

test("missing, invalid, expired or denied credentials do not grant access", async () => {
  for (const cookies of ["", "reshi_user_session=invalid", "unrelated=1"]) {
    assert.equal(await resolveRollCallIdentity(request(cookies), providers({ d1Reader: () => { throw new Error("must not query"); }, rustReader: () => { throw new Error("must not query"); } })), null);
  }
  for (const status of [401, 403]) assert.equal(await resolveRollCallIdentity(request(), providers({ rustReader: async () => new Response(null, { status }) })), null);
  assert.equal(await resolveRollCallIdentity(request("reshi_admin_session=expired"), providers()), null);
});

test("upstream failures and malformed identities fail closed instead of creating owners", async () => {
  for (const response of [new Response(null, { status: 503 }), Response.json({ user: { displayName: "missing ID" } }), Response.json({ user: { id: "", displayName: "empty ID" } })]) {
    await assert.rejects(resolveRollCallIdentity(request(), providers({ rustReader: async () => response })));
  }
});

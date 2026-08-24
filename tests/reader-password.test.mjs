import test from "node:test";
import assert from "node:assert/strict";
import { hashReaderPassword, validReaderPassword, verifyReaderPassword } from "../lib/reader-password.ts";

test("reader passwords round-trip with the Worker-safe PBKDF2 cost", async () => {
  const hash = await hashReaderPassword("correct-horse-2026");
  assert.match(hash, /^pbkdf2-sha256\$210000\$/);
  assert.equal(await verifyReaderPassword("correct-horse-2026", hash), true);
  assert.equal(await verifyReaderPassword("wrong-password", hash), false);
  assert.equal(validReaderPassword("short"), false);
});

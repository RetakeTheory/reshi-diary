// 210k keeps PBKDF2 above the accepted legacy floor while avoiding Worker CPU
// exhaustion on desktop password setup. Existing 600k hashes remain verifiable.
const ITERATIONS = 210_000;
const encoder = new TextEncoder();

function hex(bytes: Uint8Array) { return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join(""); }
function unhex(value: string) { return Uint8Array.from(value.match(/.{2}/g)?.map((part) => Number.parseInt(part, 16)) || []); }

export function validReaderPassword(value: string) {
  return value.length >= 8 && value.length <= 128;
}

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256));
}

export async function hashReaderPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${ITERATIONS}$${hex(salt)}$${hex(await derive(password, salt, ITERATIONS))}`;
}

export async function verifyReaderPassword(password: string, stored: string) {
  const [algorithm, iterationsRaw, saltRaw, expectedRaw] = stored.split("$");
  const iterations = Number(iterationsRaw);
  if (algorithm !== "pbkdf2-sha256" || !Number.isSafeInteger(iterations) || iterations < 100_000 || !/^[a-f0-9]{32}$/.test(saltRaw || "") || !/^[a-f0-9]{64}$/.test(expectedRaw || "")) return false;
  const actual = await derive(password, unhex(saltRaw), iterations);
  const expected = unhex(expectedRaw);
  if (actual.length !== expected.length) return false;
  let difference = 0; for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
  return difference === 0;
}

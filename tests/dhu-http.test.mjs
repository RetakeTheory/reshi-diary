import test from "node:test";
import assert from "node:assert/strict";
import { constants, generateKeyPairSync, privateDecrypt } from "node:crypto";
import {
  SchoolHttp, authPrefixFrom, encryptSchoolPassword, schoolRedirect, validateCoursePageUrl,
} from "../lib/dhu-http.ts";

test("school fetch keeps the Workers global invocation context", async () => {
  const state = { cookies: [], stage: "passport", updatedAt: 0 };
  const http = new SchoolHttp(state, async function (url) {
    assert.equal(this, globalThis);
    assert.equal(String(url), "https://webproxy.dhu.edu.cn/login");
    return new Response("ok");
  });
  const result = await http.request("https://webproxy.dhu.edu.cn/login");
  assert.equal(result.response.status, 200);
});

test("MFA request retains the school's full application Referer", async () => {
  const state = { cookies: [], stage: "mfa", updatedAt: 0 };
  const mfaPageUrl = "https://webproxy.dhu.edu.cn/https/abcdef/login/mfaLogin.html?appId=123&appUrl=https%3A%2F%2Fcas.dhu.edu.cn%2Fesc-sso%2Flogin";
  const http = new SchoolHttp(state, async (_url, init) => {
    const headers = new Headers(init.headers);
    assert.equal(headers.get("Referer"), mfaPageUrl);
    assert.equal(headers.get("Accept"), "application/json, text/plain, */*");
    return Response.json({ code: "0", data: {} });
  });
  await http.json("https://webproxy.dhu.edu.cn/https/abcdef/esc-sso/authn/app/enhance/ext/login", "POST", {}, mfaPageUrl);
});

test("school requests retain cookies across redirects and reject off-site targets", async () => {
  const visited = [];
  const state = { cookies: [], stage: "passport", updatedAt: 0 };
  const http = new SchoolHttp(state, async (url, init) => {
    visited.push({ url: String(url), cookie: new Headers(init.headers).get("Cookie") });
    if (visited.length === 1) return new Response(null, {
      status: 302,
      headers: { Location: "/https/abcdef/identity/login?app=webproxy443", "Set-Cookie": "ticket=abc; Path=/; HttpOnly" },
    });
    return new Response("ok");
  });
  const landing = await http.request("https://webproxy.dhu.edu.cn/login");
  assert.equal(authPrefixFrom(landing.url), "/https/abcdef");
  assert.equal(visited[1].cookie, "ticket=abc");
  await assert.rejects(() => http.request("https://example.com/login"), /跳转地址无效/);
});

test("school password uses the school's RSA key and is recoverable with its private key", () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 1024 });
  const der = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  const encrypted = encryptSchoolPassword("test-password", der, "key-1");
  assert.equal(encrypted.publicKeyId, "key-1");
  assert.equal(privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(encrypted.password, "base64")).toString(), "test-password");
});

test("dynamic course and auth URLs are restricted to the school's gateway", () => {
  assert.equal(validateCoursePageUrl("https://webproxy.dhu.edu.cn/https/abcdef/dhu/selectcourse/toSH"),
    "https://webproxy.dhu.edu.cn/https/abcdef/dhu/selectcourse/toSH");
  assert.throws(() => validateCoursePageUrl("https://example.com/https/abcdef/dhu/selectcourse/toSH"), /学校跳转地址无效/);
  assert.throws(() => validateCoursePageUrl("https://webproxy.dhu.edu.cn/https/abcdef/dhu/selectcourse/toSCC"), /toSH/);
  assert.equal(schoolRedirect({ redirect: "https://cas.dhu.edu.cn/esc-sso/login" }, "/https/abcdef"),
    "https://webproxy.dhu.edu.cn/https/abcdef/esc-sso/login");
});

import test from "node:test";
import assert from "node:assert/strict";
import { constants, generateKeyPairSync, privateDecrypt } from "node:crypto";
import {
  SchoolHttp, authPrefixFrom, discoverCoursePageUrls, encryptSchoolPassword, schoolRedirect, validateCoursePageUrl,
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

test("MFA request retains the school's full application Referer and browser headers", async () => {
  const state = { cookies: [{ name: "XSRF-TOKEN", value: "csrf-token", path: "/" }], stage: "mfa", updatedAt: 0, userAgent: "ClientBrowser/1" };
  const mfaPageUrl = "https://webproxy.dhu.edu.cn/https/abcdef/login/mfaLogin.html?appId=123&appUrl=https%3A%2F%2Fcas.dhu.edu.cn%2Fesc-sso%2Flogin";
  const http = new SchoolHttp(state, async (url, init) => {
    const headers = new Headers(init.headers);
    assert.match(String(url), /[?&]_=\d+/);
    assert.equal(headers.get("User-Agent"), "ClientBrowser/1");
    assert.equal(headers.get("Referer"), mfaPageUrl);
    assert.equal(headers.get("Accept"), "application/json, text/plain, */*");
    assert.equal(headers.get("language"), "zh-CN");
    assert.equal(headers.get("browserid"), "");
    assert.equal(headers.get("X-XSRF-TOKEN"), "csrf-token");
    return Response.json({ code: "0", data: {} });
  });
  await http.json("https://webproxy.dhu.edu.cn/https/abcdef/esc-sso/app/enhance/login", "POST", {}, mfaPageUrl);
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

test("course links are discovered from the live gateway page without a fixed resource id", () => {
  const a = "a".repeat(64), b = "b".repeat(64);
  const links = discoverCoursePageUrls(`<a href="/https/${a}/dhu/selectcourse/toSH">选课</a>
    <script>location.href="https:\\/\\/webproxy.dhu.edu.cn\\/https\\/${b}\\/dhu\\/selectcourse\\/toSH"</script>
    <a href="https://example.com/https/${a}/dhu/selectcourse/toSH">外站</a>`);
  assert.deepEqual(links, [
    `https://webproxy.dhu.edu.cn/https/${a}/dhu/selectcourse/toSH`,
    `https://webproxy.dhu.edu.cn/https/${b}/dhu/selectcourse/toSH`,
  ]);
});

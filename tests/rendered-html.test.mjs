import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the reshi diary homepage", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /reshi的日记本/);
  assert.match(html, /欢迎来到 reshi 的私人存档点/);
  assert.match(html, /<path d="M3\.5 12h16\.25M13\.5 5\.75 19\.75 12l-6\.25 6\.25"><\/path>/);
});

test("keeps email and Passkey admin login available", async () => {
  const [login, mail, passkey] = await Promise.all([
    readFile(new URL("../app/admin/login/EmailLogin.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/admin-mail.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/auth/passkey-verify/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(login, /发送邮箱验证码/);
  assert.match(login, /使用 Passkey 登录/);
  assert.match(mail, /https:\/\/api\.resend\.com\/emails/);
  assert.match(mail, /RESEND_API_KEY/);
  assert.match(passkey, /requireUserVerification:\s*true/);
  assert.match(passkey, /issueAdminSession/);
});

test("renders the reader entry points and separate article directory", async () => {
  const [loginResponse, postsResponse] = await Promise.all([render("/login"), render("/posts")]);
  assert.equal(loginResponse.status, 200);
  assert.equal(postsResponse.status, 200);
  assert.match(await loginResponse.text(), /邮箱验证码无需密码/);
  assert.match(await postsResponse.text(), /STORY INDEX \/ 文章目录/);
});

test("fails API requests closed when the required Rust origin is missing", async () => {
  const response = await render("/api/auth/me");
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Rust 后端尚未配置" });
});

test("ships Rust community, reader Passkey and notification routes", async () => {
  const [main, users, community, notifications, nav] = await Promise.all([
    readFile(new URL("../backend/src/main.rs", import.meta.url), "utf8"),
    readFile(new URL("../backend/src/users.rs", import.meta.url), "utf8"),
    readFile(new URL("../backend/src/community.rs", import.meta.url), "utf8"),
    readFile(new URL("../backend/src/notifications.rs", import.meta.url), "utf8"),
    readFile(new URL("../app/SiteNav.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(main, /\/api\/auth\/passkey-options/);
  assert.match(main, /\/api\/posts\/\{slug\}\/comments/);
  assert.match(main, /\/api\/admin\/notification/);
  assert.match(users, /start_passkey_registration/);
  assert.match(community, /parent_id/);
  assert.match(notifications, /background_color/);
  assert.match(nav, /mobile-menu-trigger/);
});

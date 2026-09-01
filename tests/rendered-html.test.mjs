import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";

register(new URL("./cloudflare-loader.mjs", import.meta.url));

async function render(pathname = "/", { origin = "http://localhost", env = {} } = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`${origin}${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) }, ...env },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the reshi diary homepage", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /reshi的日记本/);
  assert.match(html, /data-module-id="home-hero"/);
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
  assert.match(await loginResponse.text(), /data-module-id="login-intro"/);
  assert.match(await postsResponse.text(), /data-module-id="posts-header"/);
});

test("falls back to the built-in D1 API when Rust origin is missing", async () => {
  const response = await render("/api/auth/me");
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "请先登录" });
});

test("routes the admin subdomain to the protected online editor", async () => {
  const [page, api, configText] = await Promise.all([
    render("/", { origin: "https://admin.rettheory.top" }),
    render("/api/admin/site-pages", {
      origin: "https://admin.rettheory.top",
      env: { RUST_BACKEND_ORIGIN: "https://rust.example.test" },
    }),
    readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
  ]);
  const config = JSON.parse(configText);

  assert.ok([302, 307].includes(page.status));
  assert.match(page.headers.get("location") ?? "", /\/admin\/login$/);
  assert.equal(api.status, 401);
  assert.deepEqual(await api.json(), { ok: false, error: "请先登录管理端" });
  assert.ok(config.routes.some((route) => route.pattern === "admin.rettheory.top/*"));
  assert.ok(config.secrets.required.includes("GITHUB_TOKEN"));
});

test("ships Rust community, profile, ticket, Passkey, survey and notification routes", async () => {
  const [main, users, community, account, notifications, surveys, nav] = await Promise.all([
    readFile(new URL("../backend/src/main.rs", import.meta.url), "utf8"),
    readFile(new URL("../backend/src/users.rs", import.meta.url), "utf8"),
    readFile(new URL("../backend/src/community.rs", import.meta.url), "utf8"),
    readFile(new URL("../backend/src/account.rs", import.meta.url), "utf8"),
    readFile(new URL("../backend/src/notifications.rs", import.meta.url), "utf8"),
    readFile(new URL("../backend/src/surveys.rs", import.meta.url), "utf8"),
    readFile(new URL("../app/SiteNav.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(main, /\/api\/auth\/passkey-options/);
  assert.match(main, /\/api\/posts\/\{slug\}\/comments/);
  assert.match(main, /\/api\/admin\/notification/);
  assert.match(main, /\/api\/account\/avatar/);
  assert.match(main, /\/api\/admin\/tickets/);
  assert.match(users, /start_passkey_registration/);
  assert.match(community, /parent_id/);
  assert.match(account, /award_daily_points/);
  assert.match(account, /LEVEL_COLORS/);
  assert.match(notifications, /background_color/);
  assert.match(main, /\/api\/surveys\/\{slug\}/);
  assert.match(main, /\/api\/admin\/surveys\/\{id\}\/report/);
  assert.match(main, /\/api\/admin\/surveys\/\{id\}\/scores/);
  assert.match(surveys, /enforce_survey_ip_limit|survey_ip_limit/);
  assert.match(surveys, /build_csv/);
  assert.match(surveys, /survey_query_attempts/);
  assert.match(surveys, /idx_survey_responses_attempt/);
  assert.match(nav, /mobile-menu-trigger/);
});

test("ships Cloudflare-native OneBot with zero Durable Object storage rows", async () => {
  const [worker, session, runtime, authRoute, adminRoute, schema, login, manager, styles, docs, configText] = await Promise.all([
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/onebot-session.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/onebot-cloudflare.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/qq/start/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/onebot/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/runtime.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/login/UserLogin.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/OneBotManager.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../docs/onebot-11.md", import.meta.url), "utf8"),
    readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
  ]);
  const config = JSON.parse(configText);
  assert.match(worker, /url\.pathname === "\/api\/onebot\/ws"/);
  assert.match(worker, /cloudflareOneBotApi/);
  assert.match(session, /extends DurableObject/);
  assert.match(session, /acceptWebSocket/);
  assert.match(session, /serializeAttachment/);
  assert.match(session, /send_private_msg/);
  assert.match(session, /payloadSelfId && payloadSelfId !== attachment\.botId/);
  assert.match(session, /OneBot action responses normally contain echo\/status\/retcode but no/);
  assert.doesNotMatch(session, /jsonId\(payload\.self_id\) !== attachment\.botId/);
  assert.doesNotMatch(session, /ctx\.storage|setAlarm|deleteAlarm/);
  assert.match(runtime, /oneBotStub/);
  assert.match(authRoute, /createQqChallenge/);
  assert.doesNotMatch(adminRoute, /type: "share"/);
  assert.match(adminRoute, /send_group_msg/);
  assert.match(adminRoute, /Number\(payload\.retcode\) === 0/);
  assert.match(adminRoute, /cardImage/);
  assert.match(adminRoute, /card-image/);
  assert.match(adminRoute, /oneBotFailureDetail/);
  assert.match(adminRoute, /MAX_IMAGE_BYTES/);
  assert.match(schema, /groups_json/);
  assert.match(schema, /onebot_delivery_daily/);
  assert.doesNotMatch(schema, /CREATE TABLE IF NOT EXISTS onebot_groups/);
  assert.match(login, /使用 QQ 注册/);
  assert.match(manager, /添加 Bot/);
  assert.match(manager, /轮换令牌/);
  assert.match(manager, /SurveyRichEditor/);
  assert.match(manager, /renderOneBotCardPng/);
  assert.match(manager, /富文本图片卡片/);
  assert.match(manager, /cardShowUrl/);
  assert.match(manager, /type="color"/);
  assert.match(manager, /CARD_TONES/);
  assert.match(manager, /Resource Han Rounded SC Bold|正文、列表和图片会排版进 PNG/);
  assert.match(styles, /resource-han-rounded-sc-bold\.woff2/);
  assert.match(styles, /noto-sans-sc-bold-latin\.woff2/);
  assert.match(docs, /wss:\/\/rettheory\.top\/api\/onebot\/ws/);
  assert.ok(config.durable_objects.bindings.some((binding) => binding.name === "ONEBOT" && binding.class_name === "OneBotSession"));
  assert.ok(config.migrations.some((migration) => migration.new_sqlite_classes?.includes("OneBotSession")));
});

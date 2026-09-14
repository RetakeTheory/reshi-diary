import test from "node:test";
import assert from "node:assert/strict";
import { OneBotChaoxing, CX_MENU } from "../lib/onebot-chaoxing-recovered.ts";

function fixture() {
  const values = new Map();
  const sent = [];
  const course = { courseId: "11", classId: "22", cpi: "33", name: "测试课程" };
  const storage = {
    async get(key) { return structuredClone(values.get(key)); },
    async put(key, value) { values.set(key, structuredClone(value)); },
    async delete(key) { return values.delete(key); },
    async list({ prefix }) { return new Map([...values].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key, structuredClone(value)])); },
  };
  const client = { cookies: { _uid: "123" }, async courses() { return [course]; } };
  const bot = new OneBotChaoxing(storage, async (...message) => sent.push(message), () => client);
  values.set("cx:account:12345", {
    session: { cookies: client.cookies, courses: [course] }, enabled: true,
    nextAt: Date.now() + 60_000, refreshedAt: Date.now(), cursor: 0,
    failures: 0, receipts: {}, outbox: [], lastStatus: "已连接",
  });
  return { bot, values, sent, course };
}

test("recovered menu and list show the original numbered course command", async () => {
  const f = fixture();
  assert.match(CX_MENU, /\/list/);
  assert.match(CX_MENU, /\/pass\+课程序号/);
  assert.equal(await f.bot.command("12345", "/list", false, async () => {}), true);
  assert.match(f.sent.at(-1)[1], /1\. 测试课程/);
  assert.match(f.sent.at(-1)[1], /\/pass\+课程序号/);
});

test("pass mounts the selected video course without erasing the existing account", async () => {
  const f = fixture();
  assert.equal(await f.bot.command("12345", "/pass+1", false, async () => {}), true);
  const account = f.values.get("cx:account:12345");
  assert.equal(account.video.course.courseId, "11");
  assert.equal(account.video.course.cpi, "33");
  assert.equal(account.enabled, true);
  assert.equal(account.session.cookies._uid, "123");
  assert.match(f.sent.at(-1)[1], /已挂载：测试课程/);
  assert.equal(f.sent.at(-1)[2], true);
});

test("pass rejects an invalid course number and keeps the current mount", async () => {
  const f = fixture();
  await f.bot.command("12345", "/pass+1", false, async () => {});
  const before = structuredClone(f.values.get("cx:account:12345").video);
  await f.bot.command("12345", "/pass+2", false, async () => {});
  assert.deepEqual(f.values.get("cx:account:12345").video, before);
  assert.match(f.sent.at(-1)[1], /课程序号无效/);
});

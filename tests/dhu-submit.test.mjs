import test from "node:test";
import assert from "node:assert/strict";
import { submitDhuCourse } from "../lib/dhu-submit.ts";

const page = "https://webproxy.dhu.edu.cn/https/abcdef/dhu/selectcourse/toSH";

function school(reply) {
  const calls = [];
  return { calls, async postForm(url, fields, referer) {
    calls.push({ url, fields, referer });
    return reply[calls.length - 1];
  } };
}

test("school submit follows conflict check with the exact form fields and textbook choice", async () => {
  const client = school([{ success: true }, { success: true, msg: "" }]);
  assert.deepEqual(await submitDhuCourse(client, page, "288543", true),
    { outcome: "success", message: "学校返回选课成功" });
  assert.deepEqual(client.calls.map(({ url, fields }) => [new URL(url).pathname.split("/").at(-1), fields]), [
    ["scConflictCheck", { cttId: "288543" }],
    ["scSubmit", { cttId: "288543", needMaterial: "true", capCode: "" }],
  ]);
  assert.ok(client.calls.every(({ referer }) => referer === page));
});

test("conflicts and school captcha stop without blind resubmission", async () => {
  const conflict = school([{ success: false, msg: "课程冲突" }]);
  assert.equal((await submitDhuCourse(conflict, page, "288543", true)).outcome, "blocked");
  assert.equal(conflict.calls.length, 1);
  const captcha = school([{ success: true }, { success: true, msg: "F" }]);
  assert.equal((await submitDhuCourse(captcha, page, "288543", false)).outcome, "blocked");
  assert.equal(captcha.calls[1].fields.needMaterial, "false");
});

test("only explicit school availability failures are retryable", async () => {
  assert.equal((await submitDhuCourse(school([{ success: true }, { success: false, msg: "选课尚未开放" }]),
    page, "288543", true)).outcome, "retry");
  assert.equal((await submitDhuCourse(school([{ success: true }, { success: false, msg: "未知原因" }]),
    page, "288543", true)).outcome, "unknown");
});

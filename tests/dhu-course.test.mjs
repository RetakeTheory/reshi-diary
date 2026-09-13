import test from "node:test";
import assert from "node:assert/strict";
import { classifySchoolResult, isSchoolCoursePage, normalizeDhuTask } from "../lib/dhu-course.ts";

test("reservation requires exact codes, future time and explicit textbook choice", () => {
  const now = 1_000_000;
  const task = normalizeDhuTask({ courseCode: "030158", sectionNumber: "288755", buyMaterial: false, scheduledAt: now + 60_000 }, now);
  assert.equal(task.buyMaterial, false);
  assert.equal(task.nextAt, now + 1000);
  assert.throws(() => normalizeDhuTask({ courseCode: "030158", sectionNumber: "288755", scheduledAt: now + 60_000 }, now), /教材/);
  assert.throws(() => normalizeDhuTask({ courseCode: "030158", sectionNumber: "288755", buyMaterial: true, scheduledAt: now + 10_000 }, now), /时间/);
});

test("school page and success detection fail closed", () => {
  assert.equal(isSchoolCoursePage("https://webproxy.dhu.edu.cn/https/opaque/dhu/selectcourse/toSCC", true), true);
  assert.equal(isSchoolCoursePage("https://example.com/dhu/selectcourse/toSCC", true), false);
  assert.equal(classifySchoolResult(["本次选课申请成功"]), "success");
  assert.equal(classifySchoolResult(["选课失败：时间冲突"]), "failed");
  assert.equal(classifySchoolResult(["请求已受理"]), "unknown");
});

import test from "node:test";
import assert from "node:assert/strict";
import { classifySchoolResult, isSchoolCoursePage, normalizeDhuTask, parseDhuCourseOptions, parseDhuSectionOptions } from "../lib/dhu-course.ts";

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

test("toSH course table yields selectable course codes", () => {
  const html = '<table id="tsCoursesTbl"><tbody><tr><td>通识教育</td><td><a onclick="selectScope(this)">016051</a></td><td>线性代数</td><td>3.0</td><td>未读</td></tr><tr><td>合计</td></tr></tbody></table>';
  assert.deepEqual(parseDhuCourseOptions(html), [{ courseCode: "016051", name: "线性代数", status: "未读" }]);
  assert.deepEqual(parseDhuCourseOptions("<p>login</p>"), []);
});

test("expanded class table maps a section to its parent course and capacity", () => {
  const html = '<span id="curCourseCode">016051</span><table id="accessClassTbl"><tbody><tr><th>选课序号</th></tr><tr><td><a onclick="openSCC(this)">288537</a></td><td>1</td><td>85</td><td>25</td><td>83</td><td>卓越服装</td><td><a>王澜</a></td><td>1-16周</td><td>周三.7.8.9节</td><td>1教109</td></tr></tbody></table>';
  assert.deepEqual(parseDhuSectionOptions(html), [{
    courseCode: "016051", sectionNumber: "288537", classNumber: "1", capacity: 85,
    applicants: 25, admitted: 83, teacher: "王澜", schedule: "1-16周 周三.7.8.9节", location: "1教109",
  }]);
  assert.deepEqual(parseDhuSectionOptions('<table id="accessClassTbl"></table>'), []);
});

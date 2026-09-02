import assert from "node:assert/strict";
import test from "node:test";
import { groupReminderCommand, oneBotMessageText, parseReminderCommand } from "../lib/onebot-reminder.ts";

const NOW = Date.UTC(2026, 7, 31, 16); // 2026-09-01 00:00:00 Asia/Shanghai

test("parses relative OneBot reminders", () => {
  assert.deepEqual(parseReminderCommand("30秒后提醒我喝水", NOW), { dueAt: NOW + 30_000, text: "喝水" });
  assert.deepEqual(parseReminderCommand("20分钟后 提醒我 取快递", NOW), { dueAt: NOW + 1_200_000, text: "取快递" });
  assert.deepEqual(parseReminderCommand("2小时后提醒我开会", NOW), { dueAt: NOW + 7_200_000, text: "开会" });
  assert.deepEqual(parseReminderCommand("8个小时后提醒我起床", NOW), { dueAt: NOW + 28_800_000, text: "起床" });
  assert.deepEqual(parseReminderCommand("3天后提醒我交材料", NOW), { dueAt: NOW + 259_200_000, text: "交材料" });
});

test("accepts a group reminder after mentioning the connected bot", () => {
  const command = groupReminderCommand("[CQ:at,qq=3794729228] 20分钟后提醒我集合", "3794729228");
  assert.deepEqual(parseReminderCommand(command, NOW), { dueAt: NOW + 1_200_000, text: "集合" });
  assert.equal(groupReminderCommand("[CQ:at,qq=12345678] 20分钟后提醒我集合", "3794729228"), "[CQ:at,qq=12345678] 20分钟后提醒我集合");
});

test("reads commands from OneBot array messages when raw_message is empty", () => {
  const command = oneBotMessageText("", [
    { type: "at", data: { qq: 3794729228 } },
    { type: "text", data: { text: " 5秒后提醒我切群测试" } },
  ]);
  assert.equal(command, "[CQ:at,qq=3794729228] 5秒后提醒我切群测试");
  assert.deepEqual(parseReminderCommand(groupReminderCommand(command, "3794729228"), NOW), {
    dueAt: NOW + 5_000,
    text: "切群测试",
  });
});

test("parses fixed and tomorrow reminders in China Standard Time", () => {
  assert.deepEqual(parseReminderCommand("9月4日提醒我缴费", NOW), { dueAt: Date.UTC(2026, 8, 4, 1), text: "缴费" });
  assert.deepEqual(parseReminderCommand("9/4 12:00提醒我吃饭", NOW), { dueAt: Date.UTC(2026, 8, 4, 4), text: "吃饭" });
  assert.deepEqual(parseReminderCommand("9月4日上午9点提醒我签到", NOW), { dueAt: Date.UTC(2026, 8, 4, 1), text: "签到" });
  assert.deepEqual(parseReminderCommand("9月4日下午3点提醒我开会", NOW), { dueAt: Date.UTC(2026, 8, 4, 7), text: "开会" });
  assert.deepEqual(parseReminderCommand("9月4日晚上8点提醒我睡觉", NOW), { dueAt: Date.UTC(2026, 8, 4, 12), text: "睡觉" });
  assert.deepEqual(parseReminderCommand("晚上8点提醒我关灯", NOW), { dueAt: Date.UTC(2026, 8, 1, 12), text: "关灯" });
  assert.deepEqual(parseReminderCommand("上午九点半提醒我吃早饭", NOW), { dueAt: Date.UTC(2026, 8, 1, 1, 30), text: "吃早饭" });
  assert.deepEqual(parseReminderCommand("9月4日下午九点一刻提醒我签到", NOW), { dueAt: Date.UTC(2026, 8, 4, 13, 15), text: "签到" });
  assert.deepEqual(parseReminderCommand("九点三刻提醒我出门", NOW), { dueAt: Date.UTC(2026, 8, 1, 1, 45), text: "出门" });
  assert.deepEqual(parseReminderCommand("明天12点提醒我签到", NOW), { dueAt: Date.UTC(2026, 8, 2, 4), text: "签到" });
});

test("rejects invalid reminder commands and rolls past dates forward", () => {
  assert.equal(parseReminderCommand("2月30日提醒我无效", NOW), null);
  assert.equal(parseReminderCommand("0秒后提醒我无效", NOW), null);
  assert.equal(parseReminderCommand("9/4 25:00提醒我无效", NOW), null);
  assert.deepEqual(parseReminderCommand("8/31提醒我明年见", NOW), { dueAt: Date.UTC(2027, 7, 31, 1), text: "明年见" });
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  deleteR2ReminderById,
  deleteR2RemindersForBot,
  deleteR2RemindersForGroup,
  listR2Reminders,
  putR2Reminder,
} from "../lib/onebot-reminder-r2.ts";

class FakeBucket {
  objects = new Map();

  async put(key, value) { this.objects.set(key, value); }
  async get(key) {
    const value = this.objects.get(key);
    return value === undefined ? null : { json: async () => JSON.parse(value) };
  }
  async delete(keys) {
    for (const key of Array.isArray(keys) ? keys : [keys]) this.objects.delete(key);
  }
  async list({ prefix = "", cursor } = {}) {
    const keys = [...this.objects.keys()].filter((key) => key.startsWith(prefix)).sort();
    const start = cursor ? Number(cursor) : 0;
    const page = keys.slice(start, start + 1);
    const next = start + page.length;
    return { objects: page.map((key) => ({ key })), truncated: next < keys.length, cursor: String(next) };
  }
}

function reminder(id, overrides = {}) {
  return {
    id,
    bot_id: "10001",
    target_type: "group",
    target_id: "20001",
    delivery_mode: "card-image",
    summary: id,
    message_text: `提醒 ${id}`,
    image_key: null,
    admin_email: null,
    mention_user_id: "30001",
    due_at: 2_000,
    attempts: 0,
    claimed_at: null,
    created_at: 1_000,
    ...overrides,
  };
}

test("R2 reminders can be listed in due order across pages", async () => {
  const bucket = new FakeBucket();
  await putR2Reminder(bucket, reminder("late", { due_at: 3_000 }));
  await putR2Reminder(bucket, reminder("early", { due_at: 1_500 }));
  await putR2Reminder(bucket, reminder("other", { bot_id: "10002", due_at: 1_000 }));
  assert.deepEqual((await listR2Reminders(bucket, "10001")).map((row) => row.id), ["early", "late"]);
});

test("R2 reminder cancellation respects target type and cleanup scope", async () => {
  const bucket = new FakeBucket();
  await putR2Reminder(bucket, reminder("group-a"));
  await putR2Reminder(bucket, reminder("group-b", { target_id: "20002" }));
  await putR2Reminder(bucket, reminder("private", { target_type: "private", target_id: "30001", delivery_mode: "text", mention_user_id: null }));
  assert.equal(await deleteR2ReminderById(bucket, "private", "group"), false);
  assert.equal(await deleteR2ReminderById(bucket, "private", "private"), true);
  await deleteR2RemindersForGroup(bucket, "10001", "20001");
  assert.deepEqual((await listR2Reminders(bucket, "10001")).map((row) => row.id), ["group-b"]);
  await deleteR2RemindersForBot(bucket, "10001");
  assert.equal((await listR2Reminders(bucket, "10001")).length, 0);
});


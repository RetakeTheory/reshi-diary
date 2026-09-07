export type R2StoredReminder = {
  id: string;
  bot_id: string;
  target_type: "private" | "group";
  target_id: string;
  delivery_mode: "text" | "card-image";
  summary: string;
  message_text: string;
  image_key: null;
  admin_email: null;
  mention_user_id: string | null;
  due_at: number;
  attempts: number;
  claimed_at: null;
  created_at: number;
};

type R2ObjectLike = { key: string };
type R2ListLike = { objects: R2ObjectLike[]; truncated: boolean; cursor?: string };

export type ReminderR2Bucket = {
  put(key: string, value: string, options?: Record<string, unknown>): Promise<unknown>;
  get(key: string): Promise<{ json<T>(): Promise<T> } | null>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<R2ListLike>;
};

const ROOT = "onebot-reminders/";

function prefix(botId?: string) {
  return botId ? `${ROOT}${botId}/` : ROOT;
}

function keyFor(row: Pick<R2StoredReminder, "bot_id" | "id">) {
  return `${prefix(row.bot_id)}${row.id}.json`;
}

function validReminder(value: unknown): value is R2StoredReminder {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<R2StoredReminder>;
  return typeof row.id === "string" && typeof row.bot_id === "string"
    && (row.target_type === "private" || row.target_type === "group")
    && typeof row.target_id === "string" && typeof row.message_text === "string"
    && Number.isFinite(row.due_at) && Number.isFinite(row.created_at);
}

async function listedKeys(bucket: ReminderR2Bucket, botId?: string) {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: prefix(botId), cursor, limit: 1000 });
    keys.push(...page.objects.map((object) => object.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return keys;
}

export async function putR2Reminder(bucket: ReminderR2Bucket, row: R2StoredReminder) {
  await bucket.put(keyFor(row), JSON.stringify(row), {
    httpMetadata: { contentType: "application/json" },
    customMetadata: { botId: row.bot_id, targetType: row.target_type, targetId: row.target_id },
  });
}

export async function listR2Reminders(bucket: ReminderR2Bucket, botId?: string) {
  const keys = await listedKeys(bucket, botId);
  const rows: R2StoredReminder[] = [];
  for (let index = 0; index < keys.length; index += 25) {
    const objects = await Promise.all(keys.slice(index, index + 25).map((key) => bucket.get(key)));
    const values = await Promise.all(objects.map((object) => object?.json<unknown>().catch(() => null) ?? null));
    for (const value of values) if (validReminder(value)) rows.push(value);
  }
  return rows.sort((left, right) => left.due_at - right.due_at || left.created_at - right.created_at);
}

export async function deleteR2Reminder(bucket: ReminderR2Bucket, row: Pick<R2StoredReminder, "bot_id" | "id">) {
  await bucket.delete(keyFor(row));
}

export async function deleteR2ReminderById(bucket: ReminderR2Bucket, id: string, targetType: "group" | "private") {
  const suffix = `/${id}.json`;
  const key = (await listedKeys(bucket)).find((candidate) => candidate.endsWith(suffix));
  if (!key) return false;
  const object = await bucket.get(key);
  const row = await object?.json<unknown>().catch(() => null);
  if (!validReminder(row) || row.target_type !== targetType) return false;
  await bucket.delete(key);
  return true;
}

export async function deleteR2RemindersForBot(bucket: ReminderR2Bucket, botId: string) {
  const keys = await listedKeys(bucket, botId);
  for (let index = 0; index < keys.length; index += 1000) await bucket.delete(keys.slice(index, index + 1000));
}

export async function deleteR2RemindersForGroup(bucket: ReminderR2Bucket, botId: string, groupId: string) {
  const rows = (await listR2Reminders(bucket, botId))
    .filter((row) => row.target_type === "group" && row.target_id === groupId);
  if (rows.length) await bucket.delete(rows.map(keyFor));
}


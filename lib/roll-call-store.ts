import { RollCallInputError } from "./roll-call.ts";
import type { RollCallConfig, RollCallRecord } from "./roll-call";

export async function ensureRollCallSchema(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS roll_call_lists (
      owner_id TEXT NOT NULL, title TEXT NOT NULL, config_json TEXT NOT NULL, updated_at INTEGER NOT NULL,
      PRIMARY KEY (owner_id, title)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS roll_call_history (
      id TEXT NOT NULL, owner_id TEXT NOT NULL, title TEXT NOT NULL, record_json TEXT NOT NULL,
      created_at INTEGER NOT NULL, PRIMARY KEY (owner_id, id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_roll_call_history_owner_time ON roll_call_history (owner_id, created_at DESC, id DESC)"),
  ]);
}

export async function saveRollCallList(db: D1Database, owner: string, config: RollCallConfig) {
  const row = await db.prepare(`INSERT INTO roll_call_lists (owner_id, title, config_json, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(owner_id, title) DO UPDATE SET config_json = json_set(excluded.config_json, '$.revision', COALESCE(json_extract(roll_call_lists.config_json, '$.revision'), 0) + 1), updated_at = excluded.updated_at
    RETURNING config_json`)
    .bind(owner, config.title, JSON.stringify({ ...config, revision: 1 }), Date.now()).first<{ config_json: string }>();
  return JSON.parse(row!.config_json) as RollCallConfig;
}

export async function saveRollCallRecord(db: D1Database, owner: string, record: RollCallRecord) {
  const results = await db.batch<{ record_json: string }>([
    db.prepare(`INSERT OR IGNORE INTO roll_call_history (id, owner_id, title, record_json, created_at)
      SELECT ?, ?, ?, ?, ? WHERE COALESCE((SELECT json_extract(config_json, '$.revision') FROM roll_call_lists WHERE owner_id = ? AND title = ?), 0) = ?`)
      .bind(record.id, owner, record.title, JSON.stringify(record), record.createdAt, owner, record.title, record.revision),
    db.prepare(`INSERT INTO roll_call_lists (owner_id, title, config_json, updated_at)
      SELECT ?, ?, ?, ? WHERE changes() > 0
      ON CONFLICT(owner_id, title) DO UPDATE SET config_json = excluded.config_json, updated_at = excluded.updated_at`)
      .bind(owner, record.title, JSON.stringify({ title: record.title, names: record.names, required: record.required, count: record.count, cursor: record.nextCursor, mode: record.mode, drawn: record.mode === "random" ? [...record.drawn, ...record.results] : record.drawn, revision: record.revision + 1 }), record.createdAt),
    db.prepare("SELECT record_json FROM roll_call_history WHERE owner_id = ? AND id = ?").bind(owner, record.id),
  ]);
  // A retry with the same request ID returns the original committed draw.
  if (!results[2].results.length) throw new RollCallInputError("名单已在其他页面更新，请重新读取已保存名单后继续");
  return JSON.parse(String(results[2].results[0].record_json)) as RollCallRecord;
}

export async function queryRollCallHistory(db: D1Database, owner: string, query: { q: string; from: number; to: number; page: number }) {
  const where = "owner_id = ? AND created_at >= ? AND created_at <= ? AND (? = '' OR instr(lower(record_json), lower(?)) > 0)";
  const args = [owner, query.from, query.to, query.q, query.q];
  const result = await db.batch<{ record_json?: string; total?: number }>([
    db.prepare(`SELECT record_json FROM roll_call_history WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT 20 OFFSET ?`).bind(...args, (query.page - 1) * 20),
    db.prepare(`SELECT COUNT(*) AS total FROM roll_call_history WHERE ${where}`).bind(...args),
  ]);
  return { records: result[0].results.map((row) => JSON.parse(String(row.record_json)) as RollCallRecord), total: Number(result[1].results[0].total), page: query.page };
}

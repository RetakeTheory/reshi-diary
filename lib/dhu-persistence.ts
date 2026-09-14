import type { DhuSubmissionRecord, DhuTask } from "./dhu-course";
import type { SchoolState } from "./dhu-http";

type Db = Cloudflare.Env["DB"];

// School cookies stay in the visitor's Durable Object. D1 only holds searchable
// account metadata and course history; passwords and one-time codes are never saved.
export async function ensureDhuTables(db: Db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS dhu_course_accounts (
      owner_id TEXT NOT NULL, username TEXT NOT NULL, stage TEXT NOT NULL,
      last_session_at INTEGER, updated_at INTEGER NOT NULL,
      PRIMARY KEY (owner_id, username))`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_dhu_course_accounts_username
      ON dhu_course_accounts (username, updated_at DESC)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS dhu_course_appointments (
      id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, username TEXT NOT NULL,
      course_code TEXT NOT NULL, section_number TEXT NOT NULL,
      buy_material INTEGER NOT NULL, scheduled_at INTEGER NOT NULL,
      next_at INTEGER NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      last_attempt_at INTEGER, message TEXT NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_dhu_course_appointments_account
      ON dhu_course_appointments (username, owner_id, scheduled_at DESC)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS dhu_course_submissions (
      id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, username TEXT NOT NULL,
      task_id TEXT NOT NULL, attempt INTEGER NOT NULL,
      course_code TEXT NOT NULL, section_number TEXT NOT NULL,
      buy_material INTEGER NOT NULL, scheduled_at INTEGER NOT NULL,
      recorded_at INTEGER NOT NULL, outcome TEXT NOT NULL, message TEXT NOT NULL)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_dhu_course_submissions_account
      ON dhu_course_submissions (username, owner_id, recorded_at DESC)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS dhu_protocol_samples (
      script_sha256 TEXT PRIMARY KEY NOT NULL, checked_at INTEGER NOT NULL,
      submit_context TEXT NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS dhu_protocol_verifications (
      script_sha256 TEXT PRIMARY KEY NOT NULL, verified_at INTEGER NOT NULL,
      verification_method TEXT NOT NULL)`),
  ]);
}

export async function isDhuProtocolVerified(db: Db, sha256: string) {
  const row = await db.prepare(`SELECT verified_at FROM dhu_protocol_verifications
    WHERE script_sha256 = ? LIMIT 1`).bind(sha256).first<{ verified_at: number }>();
  return Boolean(row?.verified_at);
}

// This holds only a short excerpt of the school's public static JS asset.
// It has no account key, session cookie, page HTML, password, or MFA code.
export async function saveDhuProtocolSample(db: Db, sha256: string, checkedAt: number, context: string) {
  await db.prepare(`INSERT INTO dhu_protocol_samples (script_sha256, checked_at, submit_context)
    VALUES (?, ?, ?) ON CONFLICT(script_sha256) DO UPDATE SET
      checked_at = excluded.checked_at, submit_context = excluded.submit_context`)
    .bind(sha256, checkedAt, context).run();
}

export async function saveDhuAccount(db: Db, ownerId: string, state: SchoolState) {
  if (!state.username) return;
  await db.prepare(`INSERT INTO dhu_course_accounts
    (owner_id, username, stage, last_session_at, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(owner_id, username) DO UPDATE SET
      stage = excluded.stage, last_session_at = excluded.last_session_at,
      updated_at = excluded.updated_at`)
    .bind(ownerId, state.username, state.stage,
      state.stage === "ready" ? state.updatedAt : null, state.updatedAt).run();
}

export async function saveDhuTask(db: Db, ownerId: string, username: string, task: DhuTask) {
  await db.prepare(`INSERT INTO dhu_course_appointments
    (id, owner_id, username, course_code, section_number, buy_material, scheduled_at,
      next_at, status, attempts, last_attempt_at, message, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET next_at = excluded.next_at, status = excluded.status,
      attempts = excluded.attempts, last_attempt_at = excluded.last_attempt_at,
      message = excluded.message, updated_at = excluded.updated_at`)
    .bind(task.id, ownerId, username, task.courseCode, task.sectionNumber,
      task.buyMaterial ? 1 : 0, task.scheduledAt, task.nextAt, task.status,
      task.attempts || 0, task.lastAttemptAt || null, task.message, task.createdAt, task.updatedAt).run();
}

export async function saveDhuSubmission(db: Db, ownerId: string, item: DhuSubmissionRecord) {
  await db.prepare(`INSERT INTO dhu_course_submissions
    (id, owner_id, username, task_id, attempt, course_code, section_number,
      buy_material, scheduled_at, recorded_at, outcome, message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      recorded_at = excluded.recorded_at, outcome = excluded.outcome, message = excluded.message`)
    .bind(item.id, ownerId, item.username, item.taskId, item.attempt || 0,
      item.courseCode, item.sectionNumber, item.buyMaterial ? 1 : 0,
      item.scheduledAt, item.recordedAt, item.outcome, item.message).run();
}

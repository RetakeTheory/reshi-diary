CREATE TABLE IF NOT EXISTS dhu_course_accounts (
  owner_id TEXT NOT NULL, username TEXT NOT NULL, stage TEXT NOT NULL,
  last_session_at INTEGER, updated_at INTEGER NOT NULL,
  PRIMARY KEY (owner_id, username)
);
CREATE INDEX IF NOT EXISTS idx_dhu_course_accounts_username
  ON dhu_course_accounts (username, updated_at DESC);

CREATE TABLE IF NOT EXISTS dhu_course_appointments (
  id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, username TEXT NOT NULL,
  course_code TEXT NOT NULL, section_number TEXT NOT NULL,
  buy_material INTEGER NOT NULL, scheduled_at INTEGER NOT NULL,
  next_at INTEGER NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at INTEGER, message TEXT NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dhu_course_appointments_account
  ON dhu_course_appointments (username, owner_id, scheduled_at DESC);

CREATE TABLE IF NOT EXISTS dhu_course_submissions (
  id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, username TEXT NOT NULL,
  task_id TEXT NOT NULL, attempt INTEGER NOT NULL,
  course_code TEXT NOT NULL, section_number TEXT NOT NULL,
  buy_material INTEGER NOT NULL, scheduled_at INTEGER NOT NULL,
  recorded_at INTEGER NOT NULL, outcome TEXT NOT NULL, message TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dhu_course_submissions_account
  ON dhu_course_submissions (username, owner_id, recorded_at DESC);

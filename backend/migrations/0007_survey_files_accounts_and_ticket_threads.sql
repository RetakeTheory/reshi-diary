ALTER TABLE users ADD COLUMN uid TEXT;
ALTER TABLE users ADD COLUMN display_name_key TEXT;
ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN is_banned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN ban_reason TEXT;
ALTER TABLE users ADD COLUMN banned_at INTEGER;

UPDATE users SET uid = printf('%08d', abs(random()) % 100000000) WHERE uid IS NULL;
UPDATE users SET display_name_key = lower(trim(display_name)) WHERE display_name_key IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_uid ON users(uid);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_display_name_key ON users(display_name_key);

CREATE TABLE IF NOT EXISTS reader_password_attempts (
  key_hash TEXT PRIMARY KEY NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_started_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'admin')),
  sender_id TEXT,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_created_at ON ticket_messages(ticket_id, created_at);
INSERT INTO ticket_messages (ticket_id, sender_type, sender_id, body, created_at)
SELECT id, 'user', user_id, body, created_at FROM tickets;
INSERT INTO ticket_messages (ticket_id, sender_type, sender_id, body, created_at)
SELECT id, 'admin', NULL, admin_reply, updated_at FROM tickets WHERE admin_reply IS NOT NULL AND admin_reply <> '';

CREATE TABLE IF NOT EXISTS survey_file_uploads (
  key TEXT PRIMARY KEY NOT NULL,
  survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  ip_hash TEXT NOT NULL,
  disk_path TEXT,
  created_at INTEGER NOT NULL,
  used_at INTEGER,
  response_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_survey_file_uploads_survey_created ON survey_file_uploads(survey_id, created_at DESC);

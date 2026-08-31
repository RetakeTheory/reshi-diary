CREATE TABLE IF NOT EXISTS onebot_bots (
  bot_id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  access_token_hash TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS onebot_groups (
  bot_id TEXT NOT NULL REFERENCES onebot_bots(bot_id) ON DELETE CASCADE,
  group_id TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (bot_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_onebot_groups_bot
  ON onebot_groups (bot_id, created_at);

ALTER TABLE qq_auth_challenges ADD COLUMN bot_id TEXT;

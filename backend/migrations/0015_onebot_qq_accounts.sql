CREATE TABLE IF NOT EXISTS qq_bindings (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  qq_id TEXT NOT NULL UNIQUE,
  bot_id TEXT NOT NULL,
  bound_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS qq_auth_challenges (
  flow_id TEXT PRIMARY KEY NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK (purpose IN ('login', 'register', 'bind')),
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT,
  request_key_hash TEXT NOT NULL,
  verified_qq_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'failed', 'consumed')),
  error TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  verified_at INTEGER,
  consumed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_qq_auth_challenges_request_created
  ON qq_auth_challenges (request_key_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qq_auth_challenges_expiry
  ON qq_auth_challenges (expires_at);

CREATE TABLE IF NOT EXISTS onebot_delivery_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  admin_email TEXT NOT NULL,
  bot_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  message_id TEXT,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_onebot_delivery_created
  ON onebot_delivery_log (created_at DESC);

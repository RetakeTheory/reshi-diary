CREATE TABLE IF NOT EXISTS admin_passkeys (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  user_id TEXT NOT NULL,
  passkey_json TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_admin_passkeys_email_created_at
  ON admin_passkeys (email, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_passkey_challenges (
  flow_id TEXT PRIMARY KEY NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('registration', 'authentication')),
  state_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_passkey_challenges_expires_at
  ON admin_passkey_challenges (expires_at);

CREATE TABLE user_login_codes_next (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  email TEXT NOT NULL,
  intent TEXT NOT NULL CHECK (intent IN ('register', 'login', 'set_password', 'reset_password')),
  display_name TEXT,
  code_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  used_at INTEGER
);

INSERT INTO user_login_codes_next (
  id, email, intent, display_name, code_hash, salt, attempts, expires_at, created_at, used_at
)
SELECT id, email, intent, display_name, code_hash, salt, attempts, expires_at, created_at, used_at
FROM user_login_codes;

DROP TABLE user_login_codes;
ALTER TABLE user_login_codes_next RENAME TO user_login_codes;

CREATE INDEX idx_user_login_codes_email_created_at
  ON user_login_codes (email, created_at DESC);

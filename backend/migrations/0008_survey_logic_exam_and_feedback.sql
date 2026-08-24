ALTER TABLE surveys ADD COLUMN kind TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE surveys ADD COLUMN duration_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE surveys ADD COLUMN query_identity_question_id TEXT NOT NULL DEFAULT '';

ALTER TABLE survey_responses ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE survey_responses ADD COLUMN lookup_hash TEXT;
ALTER TABLE survey_responses ADD COLUMN score INTEGER;
ALTER TABLE survey_responses ADD COLUMN max_score INTEGER;
ALTER TABLE survey_responses ADD COLUMN feedback_json TEXT;
ALTER TABLE survey_responses ADD COLUMN feedback_updated_at INTEGER;
ALTER TABLE survey_responses ADD COLUMN attempt_id TEXT;

CREATE INDEX idx_survey_responses_user ON survey_responses(survey_id, user_id, created_at DESC);
CREATE INDEX idx_survey_responses_lookup ON survey_responses(survey_id, lookup_hash, created_at DESC);
CREATE UNIQUE INDEX idx_survey_responses_attempt ON survey_responses(attempt_id);

CREATE TABLE survey_attempts (
  id TEXT PRIMARY KEY,
  survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  actor_key TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  submitted_at INTEGER
);
CREATE INDEX idx_survey_attempts_actor ON survey_attempts(survey_id, actor_key, submitted_at, expires_at DESC);

CREATE TABLE survey_query_attempts (
  id TEXT PRIMARY KEY,
  survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  ip_hash TEXT NOT NULL,
  lookup_hash TEXT NOT NULL,
  success INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_survey_query_attempts_ip ON survey_query_attempts(survey_id, ip_hash, created_at DESC);
CREATE INDEX idx_survey_query_attempts_lookup ON survey_query_attempts(survey_id, lookup_hash, success, created_at DESC);

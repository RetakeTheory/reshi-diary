CREATE TABLE IF NOT EXISTS surveys (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
  ip_limit INTEGER NOT NULL DEFAULT 1 CHECK (ip_limit BETWEEN 1 AND 1000),
  questions_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_surveys_status_updated_at ON surveys (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS survey_responses (
  id TEXT PRIMARY KEY NOT NULL,
  survey_id TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  answers_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_survey_responses_survey_created_at ON survey_responses (survey_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_survey_responses_ip ON survey_responses (survey_id, ip_hash);

CREATE TRIGGER IF NOT EXISTS enforce_survey_ip_limit
BEFORE INSERT ON survey_responses
WHEN (SELECT COUNT(*) FROM survey_responses WHERE survey_id = NEW.survey_id AND ip_hash = NEW.ip_hash)
  >= (SELECT ip_limit FROM surveys WHERE id = NEW.survey_id)
BEGIN
  SELECT RAISE(ABORT, 'survey_ip_limit');
END;

ALTER TABLE surveys ADD COLUMN exam_instructions TEXT NOT NULL DEFAULT '';
ALTER TABLE surveys ADD COLUMN exam_start_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE survey_responses ADD COLUMN manual_scores_json TEXT NOT NULL DEFAULT '{}';

CREATE TABLE food_rankings (
  id TEXT PRIMARY KEY NOT NULL,
  list_type TEXT NOT NULL CHECK (list_type IN ('red', 'black')),
  restaurant TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_food_rankings_type_updated ON food_rankings(list_type, updated_at DESC);

ALTER TABLE food_rankings ADD COLUMN image_url TEXT NOT NULL DEFAULT '';

CREATE TABLE food_ranking_votes (
  entry_id TEXT NOT NULL REFERENCES food_rankings(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote TEXT NOT NULL CHECK (vote IN ('up', 'down')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (entry_id, user_id)
);

CREATE INDEX idx_food_ranking_votes_entry ON food_ranking_votes(entry_id, vote);

ALTER TABLE surveys ADD COLUMN query_enabled INTEGER NOT NULL DEFAULT 0;

UPDATE surveys
SET query_enabled = 1,
    kind = 'standard'
WHERE kind = 'information_query';

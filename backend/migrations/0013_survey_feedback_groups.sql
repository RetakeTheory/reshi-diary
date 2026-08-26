ALTER TABLE survey_responses ADD COLUMN feedback_group TEXT;

CREATE INDEX idx_survey_responses_feedback_group
ON survey_responses(survey_id, feedback_group);

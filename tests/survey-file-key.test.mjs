import test from "node:test";
import assert from "node:assert/strict";
import { isSurveyFileKey, SURVEY_FILE_STORAGE_PREFIX } from "../lib/survey-file-key.ts";

test("new survey files use the existing uploads IAM namespace", () => {
  assert.equal(SURVEY_FILE_STORAGE_PREFIX, "uploads/surveys");
  assert.equal(isSurveyFileKey("uploads/surveys/form_1/550e8400-e29b-41d4-a716-446655440000"), true);
});

test("historical survey file keys remain valid and unrelated uploads stay public", () => {
  assert.equal(isSurveyFileKey("survey-files/form_1/550e8400-e29b-41d4-a716-446655440000"), true);
  assert.equal(isSurveyFileKey("uploads/550e8400-e29b-41d4-a716-446655440000"), false);
  assert.equal(isSurveyFileKey("uploads/surveys/../secret"), false);
});

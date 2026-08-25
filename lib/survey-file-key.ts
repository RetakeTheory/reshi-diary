export const SURVEY_FILE_STORAGE_PREFIX = "uploads/surveys";

const SURVEY_FILE_KEY_PATTERN = /^(?:survey-files|uploads\/surveys)\/[A-Za-z0-9_-]{1,80}\/[a-f0-9-]{20,80}$/;

export function isSurveyFileKey(key: string) {
  return SURVEY_FILE_KEY_PATTERN.test(key);
}

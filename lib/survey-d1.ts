import type { Survey, SurveyQuestion } from "./surveys";

export type SurveyDbRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: "draft" | "published" | "closed";
  access: "public" | "registered";
  kind: "standard" | "exam" | "information_query";
  durationMinutes: number;
  examInstructions: string;
  examStartAt: number;
  queryIdentityQuestionId: string;
  ipLimit: number;
  submitLabel: string;
  successMode: "message" | "redirect";
  successContent: string;
  successRedirectUrl: string;
  questionsJson: string;
  responseCount?: number;
  createdAt: number;
  updatedAt: number;
};

export function surveyFromRow(row: SurveyDbRow): Survey {
  const questions = (JSON.parse(row.questionsJson) as SurveyQuestion[]).map((question) => question.type === "short_text" && !question.scoringMode ? { ...question, scoringMode: "exact" as const } : question);
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    status: row.status,
    access: row.access,
    kind: row.kind || "standard",
    durationMinutes: Number(row.durationMinutes || 0),
    examInstructions: row.examInstructions || "",
    examStartAt: Number(row.examStartAt || 0),
    queryIdentityQuestionId: row.queryIdentityQuestionId || "",
    ipLimit: row.ipLimit,
    submitLabel: row.submitLabel,
    successMode: row.successMode,
    successContent: row.successContent,
    successRedirectUrl: row.successRedirectUrl,
    questions,
    responseCount: Number(row.responseCount || 0),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const surveySelect = `SELECT s.id, s.slug, s.title, s.description, s.status, s.access, s.ip_limit AS ipLimit,
  s.kind, s.duration_minutes AS durationMinutes, s.exam_instructions AS examInstructions, s.exam_start_at AS examStartAt, s.query_identity_question_id AS queryIdentityQuestionId,
  s.submit_label AS submitLabel, s.success_mode AS successMode, s.success_content AS successContent,
  s.success_redirect_url AS successRedirectUrl,
  s.questions_json AS questionsJson, s.created_at AS createdAt, s.updated_at AS updatedAt,
  (SELECT COUNT(*) FROM survey_responses r WHERE r.survey_id = s.id) AS responseCount FROM surveys s`;

import type { Survey, SurveyQuestion } from "./surveys";

export type SurveyDbRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: "draft" | "published" | "closed";
  access: "public" | "registered";
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
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    status: row.status,
    access: row.access,
    ipLimit: row.ipLimit,
    submitLabel: row.submitLabel,
    successMode: row.successMode,
    successContent: row.successContent,
    successRedirectUrl: row.successRedirectUrl,
    questions: JSON.parse(row.questionsJson) as SurveyQuestion[],
    responseCount: Number(row.responseCount || 0),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const surveySelect = `SELECT s.id, s.slug, s.title, s.description, s.status, s.access, s.ip_limit AS ipLimit,
  s.submit_label AS submitLabel, s.success_mode AS successMode, s.success_content AS successContent,
  s.success_redirect_url AS successRedirectUrl,
  s.questions_json AS questionsJson, s.created_at AS createdAt, s.updated_at AS updatedAt,
  (SELECT COUNT(*) FROM survey_responses r WHERE r.survey_id = s.id) AS responseCount FROM surveys s`;

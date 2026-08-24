import type { SurveyAnswers, SurveyFeedback, SurveyQuestion } from "./surveys";

export type SurveyResponseResult = { id: string; answers: SurveyAnswers; createdAt: number; score?: number; maxScore?: number; manualScores?: Record<string, number>; manualPending?: boolean; feedback?: SurveyFeedback };
export type SurveyQuestionReport = {
  id: string; title: string; type: SurveyQuestion["type"]; answered: number; total: number;
  options?: Array<{ id: string; label: string; count: number }>;
  rows?: Array<{ id: string; label: string; options: Array<{ id: string; label: string; count: number }> }>;
  textAnswers?: Array<{ responseId: string; value: string }>;
  fileAnswers?: Array<{ responseId: string; key: string; name: string; size: number; type: string }>;
};

export function buildSurveyQuestionReports(questions: SurveyQuestion[], responses: SurveyResponseResult[]): SurveyQuestionReport[] {
  return questions.filter((question) => question.type !== "heading").map((question) => {
    const values = responses.map((response) => ({ responseId: response.id, value: response.answers[question.id] })).filter((entry) => entry.value !== undefined && entry.value !== null && entry.value !== "");
    const base = { id: question.id, title: question.title, type: question.type, answered: values.length, total: responses.length };
    if (question.type === "single" || question.type === "multiple") {
      const options = [...question.options, ...(question.allowOther ? [{ id: "__other", label: "其他" }] : [])].map((option) => ({ ...option, count: values.filter(({ value }) => { const selected = (value as { selected?: string | string[] })?.selected; return Array.isArray(selected) ? selected.includes(option.id) : selected === option.id; }).length }));
      return { ...base, options };
    }
    if (question.type === "matrix_single" || question.type === "matrix_multiple") {
      const rows = question.rows.map((row) => ({ ...row, options: question.columns.map((column) => ({ ...column, count: values.filter(({ value }) => { const selected = (value as Record<string, string | string[]>)[row.id]; return Array.isArray(selected) ? selected.includes(column.id) : selected === column.id; }).length })) }));
      return { ...base, rows };
    }
    if (question.type === "file") return { ...base, fileAnswers: values.map(({ responseId, value }) => ({ responseId, ...(value as { key: string; name: string; size: number; type: string }) })) };
    return { ...base, textAnswers: values.map(({ responseId, value }) => ({ responseId, value: String(value) })) };
  });
}

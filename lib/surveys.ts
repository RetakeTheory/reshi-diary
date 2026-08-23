export type SurveyStatus = "draft" | "published" | "closed";
export type SurveyAccess = "public" | "registered";
export type SurveySuccessMode = "message" | "redirect";
export type QuestionType = "single" | "multiple" | "matrix_single" | "matrix_multiple" | "short_text";
export type ShortTextType = "text" | "digits_fixed" | "id_card" | "name" | "english";

export type ChoiceItem = { id: string; label: string };
type QuestionBase<T extends QuestionType> = { id: string; type: T; title: string; description: string; required: boolean };
export type ChoiceQuestion = (QuestionBase<"single"> | QuestionBase<"multiple">) & {
  options: ChoiceItem[];
  allowOther: boolean;
  otherRequired: boolean;
};
export type MatrixQuestion = (QuestionBase<"matrix_single"> | QuestionBase<"matrix_multiple">) & {
  rows: ChoiceItem[];
  columns: ChoiceItem[];
};
export type ShortTextQuestion = QuestionBase<"short_text"> & {
  maxLength: number;
  textType: ShortTextType;
  fixedDigits: number;
};
export type SurveyQuestion = ChoiceQuestion | MatrixQuestion | ShortTextQuestion;

export type Survey = {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: SurveyStatus;
  access: SurveyAccess;
  ipLimit: number;
  submitLabel: string;
  successMode: SurveySuccessMode;
  successContent: string;
  successRedirectUrl: string;
  questions: SurveyQuestion[];
  responseCount: number;
  createdAt: number;
  updatedAt: number;
};

export type SurveyInput = Pick<Survey, "slug" | "title" | "description" | "status" | "access" | "ipLimit" | "submitLabel" | "successMode" | "successContent" | "successRedirectUrl" | "questions">;
export type SurveyAnswers = Record<string, unknown>;

const idPattern = /^[A-Za-z0-9_-]{1,80}$/;
const slugPattern = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])$/;
const shortTextTypes = new Set<ShortTextType>(["text", "digits_fixed", "id_card", "name", "english"]);
const questionTypes = new Set<QuestionType>(["single", "multiple", "matrix_single", "matrix_multiple", "short_text"]);

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeItems(value: unknown, label: string, min: number, max: number) {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new Error(`${label}需为 ${min}–${max} 项`);
  const seen = new Set<string>();
  return value.map((raw, index) => {
    const item = raw as Partial<ChoiceItem>;
    const id = text(item.id, 80);
    const itemLabel = text(item.label, 120);
    if (!idPattern.test(id) || seen.has(id) || !itemLabel) throw new Error(`${label}第 ${index + 1} 项无效或重复`);
    seen.add(id);
    return { id, label: itemLabel };
  });
}

export function normalizeSurveyInput(raw: unknown): SurveyInput {
  if (!raw || typeof raw !== "object") throw new Error("问卷内容无效");
  const input = raw as Partial<SurveyInput>;
  const slug = text(input.slug, 64).toLowerCase();
  const title = text(input.title, 120);
  const description = text(input.description, 2000);
  const status: SurveyStatus = input.status === "published" || input.status === "closed" ? input.status : "draft";
  const access: SurveyAccess = input.access === "registered" ? "registered" : "public";
  const submitLabel = text(input.submitLabel, 40) || "提交答卷";
  const successMode: SurveySuccessMode = input.successMode === "redirect" ? "redirect" : "message";
  const successContent = typeof input.successContent === "string" ? input.successContent.slice(0, 100_000) : "<h2>提交成功</h2><p>感谢填写，你的答卷已记录。</p>";
  const successRedirectUrl = text(input.successRedirectUrl, 2000);
  const ipLimit = Number(input.ipLimit);
  if (!slugPattern.test(slug)) throw new Error("公开地址需为 3–64 位小写字母、数字或连字符");
  if (!title) throw new Error("请填写问卷标题");
  if (successMode === "message" && !successContent.trim()) throw new Error("请填写提交后的提示内容");
  if (successMode === "redirect" && !isSafeSurveyRedirect(successRedirectUrl)) throw new Error("跳转网址需为站内路径或 HTTPS 网址");
  if (!Number.isSafeInteger(ipLimit) || ipLimit < 1 || ipLimit > 1000) throw new Error("单 IP 作答次数需为 1–1000");
  if (!Array.isArray(input.questions) || input.questions.length < 1 || input.questions.length > 200) throw new Error("问卷需包含 1–200 道题");
  const ids = new Set<string>();
  const questions = input.questions.map((rawQuestion, index): SurveyQuestion => {
    if (!rawQuestion || typeof rawQuestion !== "object") throw new Error(`第 ${index + 1} 题无效`);
    const question = rawQuestion as Partial<SurveyQuestion>;
    const id = text(question.id, 80);
    const type = question.type;
    const questionTitle = text(question.title, 300);
    if (!idPattern.test(id) || ids.has(id)) throw new Error(`第 ${index + 1} 题编号无效或重复`);
    if (!type || !questionTypes.has(type) || !questionTitle) throw new Error(`请完善第 ${index + 1} 题`);
    ids.add(id);
    const base = { id, type, title: questionTitle, description: text(question.description, 500), required: question.required === true };
    if (type === "single" || type === "multiple") {
      const choice = question as Partial<ChoiceQuestion>;
      return { ...base, type, options: normalizeItems(choice.options, `第 ${index + 1} 题选项`, 2, 50), allowOther: choice.allowOther === true, otherRequired: choice.allowOther === true && choice.otherRequired === true };
    }
    if (type === "matrix_single" || type === "matrix_multiple") {
      const matrix = question as Partial<MatrixQuestion>;
      return { ...base, type, rows: normalizeItems(matrix.rows, `第 ${index + 1} 题行`, 1, 50), columns: normalizeItems(matrix.columns, `第 ${index + 1} 题列`, 2, 30) };
    }
    const short = question as Partial<ShortTextQuestion>;
    const maxLength = Number(short.maxLength);
    const fixedDigits = Number(short.fixedDigits || 1);
    if (!Number.isSafeInteger(maxLength) || maxLength < 1 || maxLength > 5000) throw new Error(`第 ${index + 1} 题字数限制需为 1–5000`);
    if (!short.textType || !shortTextTypes.has(short.textType)) throw new Error(`第 ${index + 1} 题字段类型无效`);
    if (short.textType === "digits_fixed" && (!Number.isSafeInteger(fixedDigits) || fixedDigits < 1 || fixedDigits > 64)) throw new Error(`第 ${index + 1} 题固定位数需为 1–64`);
    return { ...base, type: "short_text", maxLength, textType: short.textType, fixedDigits };
  });
  return { slug, title, description, status, access, ipLimit, submitLabel, successMode, successContent, successRedirectUrl, questions };
}

export function isSafeSurveyRedirect(value: string) {
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

export function validChineseIdCard(value: string) {
  if (!/^\d{17}[\dXx]$/.test(value)) return false;
  if (value.slice(0, 6) === "000000") return false;
  const year = Number(value.slice(6, 10));
  const month = Number(value.slice(10, 12));
  const day = Number(value.slice(12, 14));
  const birthDate = new Date(Date.UTC(year, month - 1, day));
  if (birthDate.getUTCFullYear() !== year || birthDate.getUTCMonth() + 1 !== month || birthDate.getUTCDate() !== day) return false;
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checks = "10X98765432";
  const sum = weights.reduce((total, weight, index) => total + Number(value[index]) * weight, 0);
  return checks[sum % 11] === value[17].toUpperCase();
}

export function validateSurveyAnswers(questions: SurveyQuestion[], raw: unknown): SurveyAnswers {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("答卷内容无效");
  const input = raw as SurveyAnswers;
  const answers: SurveyAnswers = {};
  for (const [index, question] of questions.entries()) {
    const value = input[question.id];
    const prefix = `第 ${index + 1} 题`;
    if (question.type === "single") {
      const answer = value && typeof value === "object" && !Array.isArray(value) ? value as { selected?: unknown; otherText?: unknown } : {};
      const selected = text(answer.selected, 80);
      const otherText = text(answer.otherText, 500);
      const normalIds = new Set(question.options.map((item) => item.id));
      if (!selected) { if (question.required) throw new Error(`${prefix}为必答题`); continue; }
      if (selected !== "__other" && !normalIds.has(selected)) throw new Error(`${prefix}选项无效`);
      if (selected === "__other" && !question.allowOther) throw new Error(`${prefix}不允许其他选项`);
      if (selected === "__other" && question.otherRequired && !otherText) throw new Error(`${prefix}请填写其他选项`);
      answers[question.id] = { selected, ...(selected === "__other" ? { otherText } : {}) };
      continue;
    }
    if (question.type === "multiple") {
      const answer = value && typeof value === "object" && !Array.isArray(value) ? value as { selected?: unknown; otherText?: unknown } : {};
      const selected = Array.isArray(answer.selected) ? [...new Set(answer.selected.map((item) => text(item, 80)).filter(Boolean))] : [];
      const allowed = new Set([...question.options.map((item) => item.id), ...(question.allowOther ? ["__other"] : [])]);
      if (!selected.length) { if (question.required) throw new Error(`${prefix}为必答题`); continue; }
      if (selected.length > allowed.size || selected.some((item) => !allowed.has(item))) throw new Error(`${prefix}选项无效`);
      const otherText = text(answer.otherText, 500);
      if (selected.includes("__other") && question.otherRequired && !otherText) throw new Error(`${prefix}请填写其他选项`);
      answers[question.id] = { selected, ...(selected.includes("__other") ? { otherText } : {}) };
      continue;
    }
    if (question.type === "matrix_single" || question.type === "matrix_multiple") {
      const answer = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
      const rowIds = new Set(question.rows.map((item) => item.id));
      const columnIds = new Set(question.columns.map((item) => item.id));
      const normalized: Record<string, string | string[]> = {};
      for (const row of question.rows) {
        if (question.type === "matrix_single") {
          const selected = text(answer[row.id], 80);
          if (!selected) { if (question.required) throw new Error(`${prefix}的“${row.label}”未作答`); continue; }
          if (!columnIds.has(selected)) throw new Error(`${prefix}选项无效`);
          normalized[row.id] = selected;
        } else {
          const rawSelected = answer[row.id];
          const selected = Array.isArray(rawSelected) ? [...new Set(rawSelected.map((item: unknown) => text(item, 80)).filter(Boolean))] : [];
          if (!selected.length) { if (question.required) throw new Error(`${prefix}的“${row.label}”未作答`); continue; }
          if (selected.some((item) => !columnIds.has(item))) throw new Error(`${prefix}选项无效`);
          normalized[row.id] = selected;
        }
      }
      if (Object.keys(answer).some((rowId) => !rowIds.has(rowId))) throw new Error(`${prefix}矩阵行无效`);
      if (Object.keys(normalized).length) answers[question.id] = normalized;
      continue;
    }
    const answer = text(value, 5001);
    if (!answer) { if (question.required) throw new Error(`${prefix}为必答题`); continue; }
    if ([...answer].length > question.maxLength) throw new Error(`${prefix}不能超过 ${question.maxLength} 字`);
    if (question.textType === "digits_fixed" && !new RegExp(`^\\d{${question.fixedDigits}}$`).test(answer)) throw new Error(`${prefix}需填写 ${question.fixedDigits} 位数字`);
    if (question.textType === "id_card" && !validChineseIdCard(answer)) throw new Error(`${prefix}身份证号码无效`);
    if (question.textType === "name" && !/^[\p{Script=Han}A-Za-z·.\s]{2,50}$/u.test(answer)) throw new Error(`${prefix}姓名格式无效`);
    if (question.textType === "english" && !/^[A-Za-z][A-Za-z\s.'-]*$/.test(answer)) throw new Error(`${prefix}只能填写英文字母及常用姓名符号`);
    answers[question.id] = answer;
  }
  return answers;
}

function displayAnswer(question: SurveyQuestion, value: unknown, rowId?: string) {
  if (question.type === "short_text") return typeof value === "string" ? value : "";
  if (question.type === "single" || question.type === "multiple") {
    const answer = value && typeof value === "object" ? value as { selected?: string | string[]; otherText?: string } : {};
    const ids = Array.isArray(answer.selected) ? answer.selected : answer.selected ? [answer.selected] : [];
    return ids.map((id) => id === "__other" ? `其他：${answer.otherText || ""}` : question.options.find((item) => item.id === id)?.label || id).join("；");
  }
  const matrix = value && typeof value === "object" ? value as Record<string, string | string[]> : {};
  const selected = rowId ? matrix[rowId] : undefined;
  const ids = Array.isArray(selected) ? selected : selected ? [selected] : [];
  return ids.map((id) => question.columns.find((item) => item.id === id)?.label || id).join("；");
}

function csvCell(value: unknown) {
  const raw = String(value ?? "");
  const safe = /^[=+@-]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function surveyResponsesCsv(survey: Pick<Survey, "title" | "questions">, rows: Array<{ id: string; answers: SurveyAnswers; createdAt: number }>) {
  const columns: Array<{ heading: string; value: (answers: SurveyAnswers) => string }> = [];
  survey.questions.forEach((question, index) => {
    if (question.type === "matrix_single" || question.type === "matrix_multiple") {
      question.rows.forEach((row) => columns.push({ heading: `${index + 1}. ${question.title} / ${row.label}`, value: (answers) => displayAnswer(question, answers[question.id], row.id) }));
    } else {
      columns.push({ heading: `${index + 1}. ${question.title}`, value: (answers) => displayAnswer(question, answers[question.id]) });
    }
  });
  const lines = [
    ["答卷编号", "提交时间", ...columns.map((column) => column.heading)].map(csvCell).join(","),
    ...rows.map((row) => [row.id, new Date(row.createdAt).toISOString(), ...columns.map((column) => column.value(row.answers))].map(csvCell).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}`;
}

export function safeCsvFilename(title: string) {
  const safe = [...title].map((character) => character.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(character) ? "-" : character).join("").slice(0, 80);
  return `${safe || "survey"}-答卷.csv`;
}

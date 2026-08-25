import { isSurveyFileKey } from "./survey-file-key.ts";

export type SurveyStatus = "draft" | "published" | "closed";
export type SurveyAccess = "public" | "registered";
export type SurveySuccessMode = "message" | "redirect";
export type SurveyKind = "standard" | "exam";
export type QuestionType = "single" | "multiple" | "matrix_single" | "matrix_multiple" | "short_text" | "personal_info" | "heading" | "file";
export type ShortTextType = "text" | "digits_fixed" | "id_card" | "name" | "english";
export type ShortTextScoringMode = "exact" | "contains" | "manual";
export type PersonalInfoType = "name" | "email" | "phone" | "student_id" | "id_card" | "custom";
export type QuestionLogic = { sourceQuestionId: string; optionIds: string[]; optionId?: string };

export type ChoiceItem = { id: string; label: string };
type QuestionBase<T extends QuestionType> = { id: string; type: T; title: string; description: string; required: boolean; logic: QuestionLogic | null; points: number };
export type ChoiceQuestion = (QuestionBase<"single"> | QuestionBase<"multiple">) & {
  options: ChoiceItem[];
  allowOther: boolean;
  otherRequired: boolean;
  correctOptionIds: string[];
};
export type MatrixQuestion = (QuestionBase<"matrix_single"> | QuestionBase<"matrix_multiple">) & {
  rows: ChoiceItem[];
  columns: ChoiceItem[];
};
export type ShortTextQuestion = QuestionBase<"short_text"> & {
  maxLength: number;
  textType: ShortTextType;
  fixedDigits: number;
  correctAnswer: string;
  scoringMode: ShortTextScoringMode;
};
export type PersonalInfoQuestion = QuestionBase<"personal_info"> & { infoType: PersonalInfoType; maxLength: number };
export type HeadingQuestion = QuestionBase<"heading">;
export type FileQuestion = QuestionBase<"file"> & { maxSizeMb: number };
export type SurveyFileAnswer = { key: string; name: string; size: number; type: string };
export type SurveyQuestion = ChoiceQuestion | MatrixQuestion | ShortTextQuestion | PersonalInfoQuestion | HeadingQuestion | FileQuestion;
export type SurveyFeedbackModule = { id: string; title: string; content: string; tone: "neutral" | "positive" | "warning"; backgroundColor: string };
export type SurveyFeedback = { status: "pending" | "ready"; title: string; modules: SurveyFeedbackModule[]; updatedAt: number | null };

export type Survey = {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: SurveyStatus;
  access: SurveyAccess;
  kind: SurveyKind;
  queryEnabled: boolean;
  durationMinutes: number;
  examInstructions: string;
  examStartAt: number;
  queryIdentityQuestionId: string;
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

export type SurveyInput = Pick<Survey, "slug" | "title" | "description" | "status" | "access" | "kind" | "queryEnabled" | "durationMinutes" | "examInstructions" | "examStartAt" | "queryIdentityQuestionId" | "ipLimit" | "submitLabel" | "successMode" | "successContent" | "successRedirectUrl" | "questions">;
export type SurveyAnswers = Record<string, unknown>;

const idPattern = /^[A-Za-z0-9_-]{1,80}$/;
const slugPattern = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])$/;
const shortTextTypes = new Set<ShortTextType>(["text", "digits_fixed", "id_card", "name", "english"]);
const personalInfoTypes = new Set<PersonalInfoType>(["name", "email", "phone", "student_id", "id_card", "custom"]);
const questionTypes = new Set<QuestionType>(["single", "multiple", "matrix_single", "matrix_multiple", "short_text", "personal_info", "heading", "file"]);

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
  const input = raw as Partial<Omit<SurveyInput, "kind">> & { kind?: SurveyKind | "information_query" };
  const slug = text(input.slug, 64).toLowerCase();
  const title = text(input.title, 120);
  const description = text(input.description, 2000);
  const status: SurveyStatus = input.status === "published" || input.status === "closed" ? input.status : "draft";
  const access: SurveyAccess = input.access === "registered" ? "registered" : "public";
  const legacyInformationQuery = input.kind === "information_query";
  const kind: SurveyKind = input.kind === "exam" ? "exam" : "standard";
  const queryEnabled = input.queryEnabled === true || legacyInformationQuery;
  const durationMinutes = kind === "exam" ? Number(input.durationMinutes || 60) : 0;
  const examInstructions = kind === "exam" && typeof input.examInstructions === "string" ? input.examInstructions.slice(0, 100_000) : "";
  const examStartAt = kind === "exam" ? Number(input.examStartAt || 0) : 0;
  const queryIdentityQuestionId = queryEnabled && access === "public" ? text(input.queryIdentityQuestionId, 80) : "";
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
  if (kind === "exam" && (!Number.isSafeInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440)) throw new Error("考试作答时间需为 1–1440 分钟");
  if (kind === "exam" && (!Number.isSafeInteger(examStartAt) || examStartAt < 0)) throw new Error("考试开放时间无效");
  if (kind === "exam" && !examInstructions.trim()) throw new Error("请填写考试说明");
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
    const rawLogic = question.logic && typeof question.logic === "object" ? question.logic as Partial<QuestionLogic> : null;
    const legacyOptionId = rawLogic ? text(rawLogic.optionId, 80) : "";
    const optionIds = rawLogic && Array.isArray(rawLogic.optionIds)
      ? [...new Set(rawLogic.optionIds.map((item) => text(item, 80)).filter(Boolean))].slice(0, 50)
      : legacyOptionId ? [legacyOptionId] : [];
    const logic = rawLogic ? { sourceQuestionId: text(rawLogic.sourceQuestionId, 80), optionIds } : null;
    const rawPoints = Number(question.points || 0);
    if (!Number.isSafeInteger(rawPoints) || rawPoints < 0 || rawPoints > 1000) throw new Error(`第 ${index + 1} 题分数需为 0–1000`);
    const points = kind === "exam" ? rawPoints : 0;
    const base = { id, type, title: questionTitle, description: text(question.description, 500), required: question.required === true, logic, points };
    if (type === "heading") return { ...base, type, description: "", required: false, logic: null, points: 0 };
    if (type === "single" || type === "multiple") {
      const choice = question as Partial<ChoiceQuestion>;
      const options = normalizeItems(choice.options, `第 ${index + 1} 题选项`, 2, 50);
      const allowed = new Set(options.map((item) => item.id));
      const correctOptionIds = Array.isArray(choice.correctOptionIds) ? [...new Set(choice.correctOptionIds.map((item) => text(item, 80)).filter(Boolean))] : [];
      if (correctOptionIds.some((item) => !allowed.has(item)) || type === "single" && correctOptionIds.length > 1) throw new Error(`第 ${index + 1} 题正确答案无效`);
      if (points > 0 && !correctOptionIds.length) throw new Error(`第 ${index + 1} 题设置分数后需选择正确答案`);
      return { ...base, type, options, allowOther: choice.allowOther === true, otherRequired: choice.allowOther === true && choice.otherRequired === true, correctOptionIds };
    }
    if (type === "matrix_single" || type === "matrix_multiple") {
      const matrix = question as Partial<MatrixQuestion>;
      return { ...base, type, points: 0, rows: normalizeItems(matrix.rows, `第 ${index + 1} 题行`, 1, 50), columns: normalizeItems(matrix.columns, `第 ${index + 1} 题列`, 2, 30) };
    }
    if (type === "file") {
      const file = question as Partial<FileQuestion>;
      const maxSizeMb = Number(file.maxSizeMb || 100);
      if (!Number.isSafeInteger(maxSizeMb) || maxSizeMb < 1 || maxSizeMb > 100) throw new Error(`第 ${index + 1} 题文件上限需为 1–100 MB`);
      return { ...base, type: "file", points: 0, maxSizeMb };
    }
    if (type === "personal_info") {
      const personal = question as Partial<PersonalInfoQuestion>;
      const infoType = personal.infoType && personalInfoTypes.has(personal.infoType) ? personal.infoType : "custom";
      const maxLength = Number(personal.maxLength || 120);
      if (!Number.isSafeInteger(maxLength) || maxLength < 1 || maxLength > 500) throw new Error(`第 ${index + 1} 题个人信息长度需为 1–500`);
      return { ...base, type, points: 0, infoType, maxLength };
    }
    const short = question as Partial<ShortTextQuestion>;
    const maxLength = Number(short.maxLength);
    const fixedDigits = Number(short.fixedDigits || 1);
    if (!Number.isSafeInteger(maxLength) || maxLength < 1 || maxLength > 5000) throw new Error(`第 ${index + 1} 题字数限制需为 1–5000`);
    if (!short.textType || !shortTextTypes.has(short.textType)) throw new Error(`第 ${index + 1} 题字段类型无效`);
    if (short.textType === "digits_fixed" && (!Number.isSafeInteger(fixedDigits) || fixedDigits < 1 || fixedDigits > 64)) throw new Error(`第 ${index + 1} 题固定位数需为 1–64`);
    const scoringMode: ShortTextScoringMode = short.scoringMode === "contains" || short.scoringMode === "manual" ? short.scoringMode : "exact";
    const correctAnswer = text(short.correctAnswer, 5000);
    if (points > 0 && scoringMode !== "manual" && !correctAnswer) throw new Error(`第 ${index + 1} 题设置自动评分后需填写答案字段`);
    return { ...base, type: "short_text", maxLength, textType: short.textType, fixedDigits, correctAnswer, scoringMode };
  });
  questions.forEach((question, index) => {
    if (!question.logic) return;
    const sourceIndex = questions.findIndex((item) => item.id === question.logic!.sourceQuestionId);
    const source = questions[sourceIndex];
    if (sourceIndex < 0 || sourceIndex >= index || !source || source.type !== "single" && source.type !== "multiple") throw new Error(`第 ${index + 1} 题的显示条件必须引用前面的选择题`);
    const allowed = new Set([...source.options.map((item) => item.id), ...(source.allowOther ? ["__other"] : [])]);
    if (!question.logic.optionIds.length || question.logic.optionIds.some((optionId) => !allowed.has(optionId))) throw new Error(`第 ${index + 1} 题的显示条件选项无效`);
  });
  if (queryEnabled && access === "public") {
    const identity = questions.find((question) => question.id === queryIdentityQuestionId);
    if (!identity || !isSurveyQueryIdentityQuestion(identity)) throw new Error("公开信息查询需使用始终显示的必答邮箱、学号/工号或身份证题作为查询凭证");
  }
  return { slug, title, description, status, access, kind, queryEnabled, durationMinutes, examInstructions, examStartAt, queryIdentityQuestionId, ipLimit, submitLabel, successMode, successContent, successRedirectUrl, questions };
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

function selectedOptionIds(value: unknown) {
  const selected = value && typeof value === "object" && !Array.isArray(value) ? (value as { selected?: unknown }).selected : undefined;
  return Array.isArray(selected) ? selected.filter((item): item is string => typeof item === "string") : typeof selected === "string" ? [selected] : [];
}

export function questionIsVisible(question: SurveyQuestion, answers: SurveyAnswers, questions?: SurveyQuestion[]): boolean {
  if (!question.logic) return true;
  const source = questions?.find((item) => item.id === question.logic!.sourceQuestionId);
  const optionIds = question.logic.optionIds?.length ? question.logic.optionIds : question.logic.optionId ? [question.logic.optionId] : [];
  const selected = selectedOptionIds(answers[question.logic.sourceQuestionId]);
  return optionIds.length > 0 && (!source || questionIsVisible(source, answers, questions)) && optionIds.some((optionId) => selected.includes(optionId));
}

export function visibleSurveyQuestions(questions: SurveyQuestion[], answers: SurveyAnswers) {
  return questions.filter((question) => questionIsVisible(question, answers, questions));
}

export function publicSurveyQuestions(questions: SurveyQuestion[]): SurveyQuestion[] {
  return questions.map((question) => {
    if (question.type === "single" || question.type === "multiple") return { ...question, correctOptionIds: [] };
    if (question.type === "short_text") return { ...question, correctAnswer: "" };
    return question;
  });
}

function validatePersonalInfo(question: PersonalInfoQuestion, value: unknown, prefix: string, required = question.required) {
  const answer = text(value, question.maxLength + 1);
  if (!answer) { if (required) throw new Error(`${prefix}为必答题`); return ""; }
  if ([...answer].length > question.maxLength) throw new Error(`${prefix}不能超过 ${question.maxLength} 字`);
  if (question.infoType === "name" && !/^[\p{Script=Han}A-Za-z·.\s]{2,50}$/u.test(answer)) throw new Error(`${prefix}姓名格式无效`);
  if (question.infoType === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answer)) throw new Error(`${prefix}邮箱格式无效`);
  if (question.infoType === "phone" && !/^\+?[0-9 -]{6,24}$/.test(answer)) throw new Error(`${prefix}手机号格式无效`);
  if (question.infoType === "student_id" && !/^[A-Za-z0-9_-]{4,40}$/.test(answer)) throw new Error(`${prefix}学号格式无效`);
  if (question.infoType === "id_card" && !validChineseIdCard(answer)) throw new Error(`${prefix}身份证号码无效`);
  return answer;
}

export function normalizeSurveyLookupValue(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("zh-CN").replace(/\s+/g, " ");
}

export function surveyLookupValue(survey: Pick<Survey, "queryEnabled" | "access" | "queryIdentityQuestionId" | "questions">, answers: SurveyAnswers) {
  if (!survey.queryEnabled || survey.access === "registered") return "";
  const question = survey.questions.find((item) => item.id === survey.queryIdentityQuestionId);
  if (!question || question.type !== "personal_info") return "";
  return normalizeSurveyLookupValue(typeof answers[question.id] === "string" ? answers[question.id] as string : "");
}

export function isSurveyQueryIdentityQuestion(question: SurveyQuestion) {
  return question.type === "personal_info" && question.required && !question.logic && (question.infoType === "email" || question.infoType === "student_id" || question.infoType === "id_card");
}

export function scoreSurveyAnswers(questions: SurveyQuestion[], answers: SurveyAnswers) {
  let score = 0; let maxScore = 0; let manualPending = false;
  for (const question of visibleSurveyQuestions(questions, answers)) {
    if (!question.points) continue;
    maxScore += question.points;
    if (question.type === "single" || question.type === "multiple") {
      const selected = [...new Set(selectedOptionIds(answers[question.id]))].sort();
      const correct = [...question.correctOptionIds].sort();
      if (selected.length === correct.length && selected.every((item, index) => item === correct[index])) score += question.points;
    } else if (question.type === "short_text") {
      const actual = String(answers[question.id] || "").trim();
      const expected = question.correctAnswer.trim();
      if (question.scoringMode === "manual") { manualPending = true; continue; }
      const comparableActual = question.textType === "english" ? actual.toLocaleLowerCase("en") : actual;
      const comparableExpected = question.textType === "english" ? expected.toLocaleLowerCase("en") : expected;
      if (question.scoringMode === "contains" ? comparableActual.includes(comparableExpected) : comparableActual === comparableExpected) score += question.points;
    }
  }
  return { score, maxScore, manualPending };
}

export function applyManualSurveyScores(questions: SurveyQuestion[], answers: SurveyAnswers, manualScores: Record<string, number>) {
  const automatic = scoreSurveyAnswers(questions, answers);
  let manual = 0;
  let pending = false;
  for (const question of visibleSurveyQuestions(questions, answers)) {
    if (question.type !== "short_text" || question.scoringMode !== "manual" || !question.points) continue;
    const value = manualScores[question.id];
    if (!Number.isSafeInteger(value) || value < 0 || value > question.points) pending = true;
    else manual += value;
  }
  return { score: automatic.score + manual, maxScore: automatic.maxScore, manualPending: pending };
}

export function validateSurveyAnswers(questions: SurveyQuestion[], raw: unknown, options: { allowIncomplete?: boolean } = {}): SurveyAnswers {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("答卷内容无效");
  const input = raw as SurveyAnswers;
  const answers: SurveyAnswers = {};
  for (const [index, question] of questions.entries()) {
    if (!questionIsVisible(question, input, questions) || question.type === "heading") continue;
    const value = input[question.id];
    const prefix = `第 ${index + 1} 题`;
    const required = question.required && !options.allowIncomplete;
    if (question.type === "single") {
      const answer = value && typeof value === "object" && !Array.isArray(value) ? value as { selected?: unknown; otherText?: unknown } : {};
      const selected = text(answer.selected, 80);
      const otherText = text(answer.otherText, 500);
      const normalIds = new Set(question.options.map((item) => item.id));
      if (!selected) { if (required) throw new Error(`${prefix}为必答题`); continue; }
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
      if (!selected.length) { if (required) throw new Error(`${prefix}为必答题`); continue; }
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
          if (!selected) { if (required) throw new Error(`${prefix}的“${row.label}”未作答`); continue; }
          if (!columnIds.has(selected)) throw new Error(`${prefix}选项无效`);
          normalized[row.id] = selected;
        } else {
          const rawSelected = answer[row.id];
          const selected = Array.isArray(rawSelected) ? [...new Set(rawSelected.map((item: unknown) => text(item, 80)).filter(Boolean))] : [];
          if (!selected.length) { if (required) throw new Error(`${prefix}的“${row.label}”未作答`); continue; }
          if (selected.some((item) => !columnIds.has(item))) throw new Error(`${prefix}选项无效`);
          normalized[row.id] = selected;
        }
      }
      if (Object.keys(answer).some((rowId) => !rowIds.has(rowId))) throw new Error(`${prefix}矩阵行无效`);
      if (Object.keys(normalized).length) answers[question.id] = normalized;
      continue;
    }
    if (question.type === "file") {
      if (!value) { if (required) throw new Error(`${prefix}为必答题`); continue; }
      const file = value && typeof value === "object" && !Array.isArray(value) ? value as Partial<SurveyFileAnswer> : {};
      const key = text(file.key, 240); const name = text(file.name, 240); const type = text(file.type, 160) || "application/octet-stream"; const size = Number(file.size);
      if (!isSurveyFileKey(key) || !name || !Number.isSafeInteger(size) || size < 1 || size > question.maxSizeMb * 1024 * 1024) throw new Error(`${prefix}文件无效或超过 ${question.maxSizeMb} MB`);
      answers[question.id] = { key, name, size, type } satisfies SurveyFileAnswer;
      continue;
    }
    if (question.type === "personal_info") {
      const answer = validatePersonalInfo(question, value, prefix, required);
      if (answer) answers[question.id] = answer;
      continue;
    }
    const answer = text(value, 5001);
    if (!answer) { if (required) throw new Error(`${prefix}为必答题`); continue; }
    if ([...answer].length > question.maxLength) throw new Error(`${prefix}不能超过 ${question.maxLength} 字`);
    if (question.textType === "digits_fixed" && !new RegExp(`^\\d{${question.fixedDigits}}$`).test(answer)) throw new Error(`${prefix}需填写 ${question.fixedDigits} 位数字`);
    if (question.textType === "id_card" && !validChineseIdCard(answer)) throw new Error(`${prefix}身份证号码无效`);
    if (question.textType === "name" && !/^[\p{Script=Han}A-Za-z·.\s]{2,50}$/u.test(answer)) throw new Error(`${prefix}姓名格式无效`);
    if (question.textType === "english" && !/^[A-Za-z][A-Za-z\s.'-]*$/.test(answer)) throw new Error(`${prefix}只能填写英文字母及常用姓名符号`);
    answers[question.id] = answer;
  }
  return answers;
}

export function displaySurveyAnswer(question: SurveyQuestion, value: unknown, rowId?: string) {
  if (question.type === "file") {
    const file = value && typeof value === "object" ? value as Partial<SurveyFileAnswer> : {};
    return file.name ? `${file.name}（${Math.ceil(Number(file.size || 0) / 1024)} KB）` : "";
  }
  if (question.type === "short_text" || question.type === "personal_info") return typeof value === "string" ? value : "";
  if (question.type === "heading") return "";
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

export function surveyResponsesCsv(survey: Pick<Survey, "title" | "questions">, rows: Array<{ id: string; answers: SurveyAnswers; createdAt: number; score?: number | null; maxScore?: number | null }>) {
  const hasScore = rows.some((row) => row.score !== undefined && row.score !== null);
  const columns: Array<{ heading: string; value: (answers: SurveyAnswers) => string }> = [];
  survey.questions.forEach((question, index) => {
    if (question.type === "heading") return;
    if (question.type === "matrix_single" || question.type === "matrix_multiple") {
      question.rows.forEach((row) => columns.push({ heading: `${index + 1}. ${question.title} / ${row.label}`, value: (answers) => displaySurveyAnswer(question, answers[question.id], row.id) }));
    } else {
      columns.push({ heading: `${index + 1}. ${question.title}`, value: (answers) => displaySurveyAnswer(question, answers[question.id]) });
    }
  });
  const lines = [
    ["答卷编号", "提交时间", ...(hasScore ? ["得分", "满分"] : []), ...columns.map((column) => column.heading)].map(csvCell).join(","),
    ...rows.map((row) => [row.id, new Date(row.createdAt).toISOString(), ...(hasScore ? [row.score ?? "", row.maxScore ?? ""] : []), ...columns.map((column) => column.value(row.answers))].map(csvCell).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}`;
}

export function safeCsvFilename(title: string) {
  const safe = [...title].map((character) => character.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(character) ? "-" : character).join("").slice(0, 80);
  return `${safe || "survey"}-答卷.csv`;
}

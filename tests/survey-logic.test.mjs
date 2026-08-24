import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSurveyInput,
  normalizeSurveyLookupValue,
  publicSurveyQuestions,
  questionIsVisible,
  scoreSurveyAnswers,
  applyManualSurveyScores,
  validateSurveyAnswers,
} from "../lib/surveys.ts";

function exam() {
  return normalizeSurveyInput({
    slug: "exam-demo",
    title: "考试演示",
    description: "",
    status: "published",
    access: "public",
    kind: "exam",
    durationMinutes: 30,
    examInstructions: "<p>请独立完成</p>",
    examStartAt: 0,
    queryIdentityQuestionId: "",
    ipLimit: 1,
    submitLabel: "交卷",
    successMode: "message",
    successContent: "<p>完成</p>",
    successRedirectUrl: "",
    questions: [
      { id: "q1", type: "single", title: "选择 A", description: "", required: true, logic: null, points: 5, options: [{ id: "a", label: "A" }, { id: "b", label: "B" }], allowOther: false, otherRequired: false, correctOptionIds: ["a"] },
      { id: "q2", type: "short_text", title: "条件题", description: "", required: true, logic: { sourceQuestionId: "q1", optionId: "a" }, points: 3, maxLength: 20, textType: "english", fixedDigits: 1, correctAnswer: "Codex", scoringMode: "exact" },
      { id: "h1", type: "heading", title: "说明标题", description: "", required: false, logic: null, points: 0 },
    ],
  });
}

test("conditional questions only appear after their configured option is selected", () => {
  const survey = exam(); const conditional = survey.questions[1];
  assert.equal(questionIsVisible(conditional, { q1: { selected: "b" } }), false);
  assert.equal(questionIsVisible(conditional, { q1: { selected: "a" } }), true);
  assert.doesNotThrow(() => validateSurveyAnswers(survey.questions, { q1: { selected: "b" } }));
  assert.throws(() => validateSurveyAnswers(survey.questions, { q1: { selected: "a" } }), /第 2 题为必答题/);
});

test("exam scoring counts only visible questions and handles English answers case-insensitively", () => {
  const survey = exam();
  assert.deepEqual(scoreSurveyAnswers(survey.questions, { q1: { selected: "a" }, q2: "CODEX" }), { score: 8, maxScore: 8, manualPending: false });
  assert.deepEqual(scoreSurveyAnswers(survey.questions, { q1: { selected: "b" } }), { score: 0, maxScore: 5, manualPending: false });
});

test("short answers support contains matching and bounded manual scoring", () => {
  const survey = exam(); const short = survey.questions[1];
  short.scoringMode = "contains"; short.correctAnswer = "codex";
  assert.equal(scoreSurveyAnswers(survey.questions, { q1: { selected: "a" }, q2: "hello CODEX user" }).score, 8);
  short.scoringMode = "manual"; short.correctAnswer = "";
  const automatic = scoreSurveyAnswers(survey.questions, { q1: { selected: "a" }, q2: "开放回答" });
  assert.equal(automatic.manualPending, true); assert.equal(automatic.score, 5); assert.equal(automatic.maxScore, 8);
  assert.deepEqual(applyManualSurveyScores(survey.questions, { q1: { selected: "a" }, q2: "开放回答" }, { q2: 2 }), { score: 7, maxScore: 8, manualPending: false });
});

test("public exam payloads never expose configured answers", () => {
  const questions = publicSurveyQuestions(exam().questions);
  assert.deepEqual(questions[0].correctOptionIds, []);
  assert.equal(questions[1].correctAnswer, "");
});

test("public information-query credentials normalize consistently", () => {
  assert.equal(normalizeSurveyLookupValue("  Student  001  "), "student 001");
});

test("logic cannot reference a following question", () => {
  const input = exam();
  input.questions[0].logic = { sourceQuestionId: "q2", optionId: "x" };
  assert.throws(() => normalizeSurveyInput(input), /必须引用前面的选择题/);
});

test("public information lookup rejects low-entropy identity fields", () => {
  const input = exam();
  input.kind = "information_query"; input.durationMinutes = 0; input.examInstructions = ""; input.examStartAt = 0; input.queryIdentityQuestionId = "identity";
  input.questions = [{ id: "identity", type: "personal_info", title: "姓名", description: "", required: true, logic: null, points: 0, infoType: "name", maxLength: 50 }];
  assert.throws(() => normalizeSurveyInput(input), /邮箱、学号\/工号或身份证/);
  input.questions[0].infoType = "student_id";
  const normalized = normalizeSurveyInput(input);
  assert.equal(normalized.kind, "standard");
  assert.equal(normalized.queryEnabled, true);
});

test("conditional questions can be triggered by any of several selected options", () => {
  const survey = exam(); const conditional = survey.questions[1];
  conditional.logic = { sourceQuestionId: "q1", optionIds: ["a", "b"] };
  assert.equal(questionIsVisible(conditional, { q1: { selected: "a" } }, survey.questions), true);
  assert.equal(questionIsVisible(conditional, { q1: { selected: "b" } }, survey.questions), true);
  assert.equal(questionIsVisible(conditional, { q1: { selected: "missing" } }, survey.questions), false);
});

test("result query is a companion setting for both surveys and exams", () => {
  const input = exam();
  input.queryEnabled = true;
  input.queryIdentityQuestionId = "identity";
  input.questions.unshift({ id: "identity", type: "personal_info", title: "学号", description: "", required: true, logic: null, points: 0, infoType: "student_id", maxLength: 50 });
  const normalized = normalizeSurveyInput(input);
  assert.equal(normalized.kind, "exam");
  assert.equal(normalized.queryEnabled, true);
  assert.equal(normalized.queryIdentityQuestionId, "identity");
});

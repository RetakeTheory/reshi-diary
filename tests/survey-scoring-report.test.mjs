import test from "node:test";
import assert from "node:assert/strict";
import { readableTextColor } from "../lib/color-contrast.ts";
import {
  applyManualSurveyScores,
  buildSurveyAnswerReport,
  normalizeSurveyInput,
  scoreSurveyAnswers,
} from "../lib/surveys.ts";

function scoringSurvey() {
  return normalizeSurveyInput({
    slug: "file-scoring-demo",
    title: "文件题评分演示",
    description: "",
    status: "published",
    access: "public",
    kind: "exam",
    queryEnabled: false,
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
      { id: "choice", type: "single", title: "选择 A", description: "", required: true, logic: null, points: 5, options: [{ id: "a", label: "A" }, { id: "b", label: "B" }], allowOther: false, otherRequired: false, correctOptionIds: ["a"] },
      { id: "upload", type: "file", title: "上传作答文件", description: "<p><strong>PDF</strong> 或图片</p>", required: true, logic: null, points: 4, maxSizeMb: 20 },
      { id: "text", type: "short_text", title: "填写答案", description: "", required: true, logic: null, points: 3, maxLength: 50, textType: "english", fixedDigits: 1, correctAnswer: "rust", scoringMode: "exact" },
      { id: "note", type: "personal_info", title: "备注", description: "", required: false, logic: null, points: 0, infoType: "custom", maxLength: 50 },
    ],
  });
}

test("exam file questions retain points and wait for manual grading", () => {
  const survey = scoringSurvey();
  const fileQuestion = survey.questions.find((question) => question.id === "upload");
  assert.equal(fileQuestion.points, 4);
  const answers = {
    choice: { selected: "a" },
    upload: { key: "uploads/surveys/demo/file", name: "work.pdf", size: 2048, type: "application/pdf" },
    text: "wrong",
  };
  assert.deepEqual(scoreSurveyAnswers(survey.questions, answers), { score: 5, maxScore: 12, manualPending: true });
  assert.deepEqual(applyManualSurveyScores(survey.questions, answers, { upload: 2 }), { score: 7, maxScore: 12, manualPending: false });
});

test("answer report exposes submitted answers and score states but no answer key", () => {
  const survey = scoringSurvey();
  const report = buildSurveyAnswerReport(survey.questions, {
    choice: { selected: "a" },
    upload: { key: "uploads/surveys/demo/private-key", name: "work.pdf", size: 2048, type: "application/pdf" },
    text: "wrong",
  }, { upload: 2 });
  assert.deepEqual(report.items.map((item) => item.status), ["correct", "partial", "incorrect", "ungraded"]);
  assert.match(report.items[1].answer, /work\.pdf/);
  assert.equal(report.score, 7);
  assert.equal(report.maxScore, 12);
  assert.equal(JSON.stringify(report).includes("private-key"), false);
  assert.equal(JSON.stringify(report).includes("correctOptionIds"), false);
});

test("feedback card contrast stays deterministic across browser themes", () => {
  assert.equal(readableTextColor("#f3f0ff"), "#181927");
  assert.equal(readableTextColor("#0b0d17"), "#ffffff");
});

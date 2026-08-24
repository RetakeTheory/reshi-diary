"use client";

import { useEffect, useMemo, useState } from "react";
import type { Survey, SurveyAnswers, SurveyFeedbackModule, SurveyFileAnswer, SurveyQuestion } from "../../../../../lib/surveys";
import { displaySurveyAnswer } from "../../../../../lib/surveys";
import type { SurveyQuestionReport, SurveyResponseResult } from "../../../../../lib/survey-report";
import Icon from "../../../../Icon";

type Statistics = { average: number | null; median: number | null; highest: number | null; graded: number; total: number };
type ResultsData = { survey: Survey; reports: SurveyQuestionReport[]; responses: SurveyResponseResult[]; total: number; truncated: boolean; statistics: Statistics | null };
type BatchScores = Record<string, Record<string, string>>;

function fileUrl(key: string) { return `/api/files/${key.split("/").map(encodeURIComponent).join("/")}`; }
function blankModule(): SurveyFeedbackModule { return { id: crypto.randomUUID(), title: "", content: "", tone: "neutral", backgroundColor: "#f3f0ff" }; }
function withModuleDefaults(module: SurveyFeedbackModule): SurveyFeedbackModule { return { ...module, backgroundColor: module.backgroundColor || "#f3f0ff" }; }
function scoreText(value: number | null) { return value === null ? "—" : Number.isInteger(value) ? String(value) : value.toFixed(1); }

function Answer({ question, value, unanswered }: { question: SurveyQuestion; value: unknown; unanswered: string }) {
  if (question.type === "heading") return null;
  if (question.type === "file") {
    const file = value as SurveyFileAnswer | undefined;
    return file ? <a href={fileUrl(file.key)} target="_blank" rel="noreferrer"><Icon name="file" />{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</a> : <span>{unanswered}</span>;
  }
  if (question.type === "matrix_single" || question.type === "matrix_multiple") return <div>{question.rows.map((row) => <p key={row.id}><b>{row.label}</b>{displaySurveyAnswer(question, value, row.id) || unanswered}</p>)}</div>;
  return <span>{displaySurveyAnswer(question, value) || unanswered}</span>;
}

export default function SurveyResultsClient({ id, copy }: { id: string; copy: Record<string, string> }) {
  const [data, setData] = useState<ResultsData | null>(null);
  const [selected, setSelected] = useState<SurveyResponseResult | null>(null);
  const [message, setMessage] = useState("");
  const [feedbackTitle, setFeedbackTitle] = useState("查询结果");
  const [modules, setModules] = useState<SurveyFeedbackModule[]>([blankModule()]);
  const [saving, setSaving] = useState(false);
  const [batchScores, setBatchScores] = useState<BatchScores>({});
  const [savingScores, setSavingScores] = useState(false);

  async function refreshData() {
    const response = await fetch(`/api/admin/surveys/${id}/results`, { cache: "no-store" });
    const result = await response.json() as ResultsData & { error?: string };
    if (!response.ok) throw new Error(result.error || copy.loadError);
    setData(result);
    setBatchScores(Object.fromEntries(result.responses.map((item) => [item.id, Object.fromEntries(Object.entries(item.manualScores || {}).map(([questionId, value]) => [questionId, String(value)]))])));
  }

  useEffect(() => {
    fetch(`/api/admin/surveys/${id}/results`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as ResultsData & { error?: string };
        if (!response.ok) throw new Error(result.error || copy.loadError);
        setData(result);
        setBatchScores(Object.fromEntries(result.responses.map((item) => [item.id, Object.fromEntries(Object.entries(item.manualScores || {}).map(([questionId, value]) => [questionId, String(value)]))])));
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : copy.loadError));
  }, [copy.loadError, id]);

  const manualQuestions = useMemo(() => data?.survey.questions.filter((question): question is Extract<SurveyQuestion, { type: "short_text" }> => question.type === "short_text" && question.scoringMode === "manual" && question.points > 0) || [], [data]);

  function choose(response: SurveyResponseResult) {
    setSelected(response);
    setFeedbackTitle(response.feedback?.title || "查询结果");
    setModules(response.feedback?.modules?.length ? response.feedback.modules.map(withModuleDefaults) : [blankModule()]);
    setMessage("");
  }

  function updateModule(index: number, patch: Partial<SurveyFeedbackModule>) {
    setModules((current) => current.map((module, itemIndex) => itemIndex === index ? { ...module, ...patch } : module));
  }

  async function saveFeedback() {
    if (!selected) return;
    setSaving(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/surveys/${id}/responses/${selected.id}/feedback`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: feedbackTitle, modules }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "保存反馈失败");
      const updated = { ...selected, feedback: result.feedback };
      setSelected(updated);
      setData((current) => current ? { ...current, responses: current.responses.map((item) => item.id === updated.id ? updated : item) } : current);
      setMessage("反馈已发布，提交者现在可以查询。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存反馈失败"); } finally { setSaving(false); }
  }

  async function saveBatchScores() {
    if (!data || !manualQuestions.length) return;
    setSavingScores(true); setMessage("");
    try {
      const updates = data.responses.map((response) => ({ responseId: response.id, scores: Object.fromEntries(manualQuestions.map((question) => {
        const raw = batchScores[response.id]?.[question.id];
        if (raw === undefined || raw.trim() === "") throw new Error(`请完成答卷“${question.title}”的评分`);
        return [question.id, Number(raw)];
      })) }));
      const response = await fetch(`/api/admin/surveys/${id}/scores`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ updates }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "批量评分保存失败");
      await refreshData();
      setMessage("本页人工评分已批量保存，成绩统计已更新。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "批量评分保存失败"); } finally { setSavingScores(false); }
  }

  if (!data) return <section className="survey-results-shell"><p>{message || copy.loading}</p></section>;
  return <section className="survey-results-shell">
    <header><div><p>{copy.eyebrow}</p><h1>{data.survey.title}</h1><span>{data.total} 份答卷{data.truncated ? ` · ${copy.truncated}` : ""}</span></div><a className="survey-report-download" href={`/api/admin/surveys/${id}/report`}><Icon name="file" />{copy.download}</a></header>
    {data.statistics && <section className="survey-score-statistics" aria-label="考试成绩统计"><article><span>平均分</span><b>{scoreText(data.statistics.average)}</b></article><article><span>中位分</span><b>{scoreText(data.statistics.median)}</b></article><article><span>最高分</span><b>{scoreText(data.statistics.highest)}</b></article><small>已完成评分 {data.statistics.graded} / {data.statistics.total} 份；未完成人工评分的答卷不计入统计。</small></section>}
    {data.survey.kind === "exam" && manualQuestions.length > 0 && <BatchGrading responses={data.responses} questions={manualQuestions} scores={batchScores} setScores={setBatchScores} unanswered={copy.unanswered} saving={savingScores} save={saveBatchScores} total={data.total} />}
    <div className="survey-results-layout"><div className="survey-report-list">{data.reports.map((report, index) => <Report key={report.id} report={report} index={index} copy={copy} onResponse={(responseId) => { const found = data.responses.find((item) => item.id === responseId); if (found) choose(found); }} />)}</div><aside className="survey-response-list"><h2>{copy.responseTitle}</h2>{data.responses.map((response, index) => <button type="button" key={response.id} className={selected?.id === response.id ? "is-active" : ""} onClick={() => choose(response)}><b>答卷 {data.total - index}{response.maxScore !== undefined ? ` · ${response.score}/${response.maxScore} 分` : ""}</b><small>{new Date(response.createdAt).toLocaleString("zh-CN")}{response.feedback?.status === "ready" ? " · 已反馈" : ""}</small></button>)}</aside></div>
    {message && <p className="notification-message" role="status">{message}</p>}
    {selected && <div className="survey-response-dialog" role="dialog" aria-modal="true" aria-label={copy.responseTitle}><article><header><div><p>{copy.responseEyebrow}</p><h2>{copy.responseTitle}{selected.maxScore !== undefined ? ` · ${selected.score}/${selected.maxScore} 分` : ""}</h2><small>{new Date(selected.createdAt).toLocaleString("zh-CN")} · {selected.id}</small></div><button type="button" onClick={() => setSelected(null)}>{copy.close}</button></header>{data.survey.questions.map((question, index) => question.type === "heading" ? <h3 className="survey-response-heading" key={question.id}>{question.title}</h3> : <section key={question.id}><b>{index + 1}. {question.title}</b><Answer question={question} value={(selected.answers as SurveyAnswers)[question.id]} unanswered={copy.unanswered} /></section>)}{data.survey.queryEnabled && <FeedbackEditor title={feedbackTitle} setTitle={setFeedbackTitle} modules={modules} setModules={setModules} updateModule={updateModule} saving={saving} save={saveFeedback} />}</article></div>}
  </section>;
}

function BatchGrading({ responses, questions, scores, setScores, unanswered, saving, save, total }: { responses: SurveyResponseResult[]; questions: Extract<SurveyQuestion, { type: "short_text" }>[]; scores: BatchScores; setScores: React.Dispatch<React.SetStateAction<BatchScores>>; unanswered: string; saving: boolean; save: () => void; total: number }) {
  return <section className="survey-batch-grading"><header><div><p>MANUAL GRADING</p><h2>批量阅卷</h2><span>在同一页面完成本页全部简答题评分。</span></div><button type="button" disabled={saving} onClick={save}>{saving ? "正在保存…" : "保存本页全部评分"}</button></header>{total > responses.length && <small>当前显示并保存最近 {responses.length} 份答卷。</small>}<div className="survey-batch-table">{responses.map((response, responseIndex) => <article key={response.id}><header><b>答卷 {total - responseIndex}</b><small>{new Date(response.createdAt).toLocaleString("zh-CN")}</small></header>{questions.map((question) => <label key={question.id}><span><b>{question.title}</b><em>{displaySurveyAnswer(question, response.answers[question.id]) || unanswered}</em></span><span className="survey-batch-score-input"><input aria-label={`${question.title}评分`} type="number" min={0} max={question.points} step={1} value={scores[response.id]?.[question.id] ?? ""} onChange={(event) => setScores((current) => ({ ...current, [response.id]: { ...current[response.id], [question.id]: event.target.value } }))} /><i>/ {question.points}</i></span></label>)}</article>)}</div></section>;
}

function Report({ report, index, copy, onResponse }: { report: SurveyQuestionReport; index: number; copy: Record<string, string>; onResponse: (id: string) => void }) {
  return <article><header><span>{index + 1}</span><div><h2>{report.title}</h2><small>{report.answered} / {report.total} {copy.answerCount}</small></div></header>{report.options && <Bars options={report.options} answered={report.answered} />}{report.rows?.map((row) => <div className="survey-report-matrix" key={row.id}><b>{row.label}</b><Bars options={row.options} answered={report.answered} /></div>)}{report.textAnswers && <div className="survey-text-results">{report.textAnswers.slice(0, 12).map((answer) => <button type="button" key={answer.responseId} onClick={() => onResponse(answer.responseId)}>{answer.value}</button>)}</div>}{report.fileAnswers && <div className="survey-text-results">{report.fileAnswers.slice(0, 12).map((file) => <a key={file.responseId} href={fileUrl(file.key)} target="_blank" rel="noreferrer"><Icon name="file" />{file.name}</a>)}</div>}</article>;
}

function Bars({ options, answered }: { options: Array<{ id: string; label: string; count: number }>; answered: number }) { return <div className="survey-bars">{options.map((option) => <div key={option.id}><span>{option.label}</span><i><b style={{ width: `${answered ? option.count / answered * 100 : 0}%` }} /></i><strong>{option.count}</strong></div>)}</div>; }

function FeedbackEditor({ title, setTitle, modules, setModules, updateModule, saving, save }: { title: string; setTitle: (value: string) => void; modules: SurveyFeedbackModule[]; setModules: React.Dispatch<React.SetStateAction<SurveyFeedbackModule[]>>; updateModule: (index: number, patch: Partial<SurveyFeedbackModule>) => void; saving: boolean; save: () => void }) {
  return <section className="survey-feedback-editor"><header><div><b>提交者反馈</b><small>发布后可在本问卷的结果查询页查看；考试成绩也会同时开放。</small></div></header><label><span>结果标题</span><input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} /></label>{modules.map((module, index) => { const validColor = /^#[0-9a-f]{6}$/i.test(module.backgroundColor) ? module.backgroundColor : "#f3f0ff"; return <div className="survey-feedback-editor-module" key={module.id} style={{ backgroundColor: validColor }}><div><b>反馈卡片 {index + 1}</b><button type="button" disabled={modules.length === 1} onClick={() => setModules((current) => current.filter((_, itemIndex) => itemIndex !== index))}>删除</button></div><label><span>卡片标题</span><input value={module.title} maxLength={120} onChange={(event) => updateModule(index, { title: event.target.value })} /></label><label><span>提示类型</span><select value={module.tone} onChange={(event) => updateModule(index, { tone: event.target.value as SurveyFeedbackModule["tone"] })}><option value="neutral">普通信息</option><option value="positive">正向结果</option><option value="warning">注意事项</option></select></label><label className="survey-feedback-color"><span>卡片底色</span><span><input type="color" value={validColor} onChange={(event) => updateModule(index, { backgroundColor: event.target.value })} /><input value={module.backgroundColor} maxLength={7} onChange={(event) => updateModule(index, { backgroundColor: event.target.value })} /></span></label><label><span>卡片内反馈文字</span><textarea value={module.content} maxLength={5000} onChange={(event) => updateModule(index, { content: event.target.value })} /></label></div>; })}<div className="survey-feedback-editor-actions"><button type="button" onClick={() => setModules((current) => [...current, blankModule()])} disabled={modules.length >= 20}>添加反馈卡片</button><button type="button" onClick={save} disabled={saving}>{saving ? "正在发布…" : "发布反馈"}</button></div></section>;
}

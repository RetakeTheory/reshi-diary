"use client";

import { useEffect, useState } from "react";
import type { Survey, SurveyAnswers, SurveyFeedbackModule, SurveyFileAnswer, SurveyQuestion } from "../../../../../lib/surveys";
import { displaySurveyAnswer } from "../../../../../lib/surveys";
import type { SurveyQuestionReport, SurveyResponseResult } from "../../../../../lib/survey-report";
import Icon from "../../../../Icon";

function fileUrl(key: string) { return `/api/files/${key.split("/").map(encodeURIComponent).join("/")}`; }
function blankModule(): SurveyFeedbackModule { return { id: crypto.randomUUID(), title: "", content: "", tone: "neutral" }; }
function Answer({ question, value, unanswered }: { question: SurveyQuestion; value: unknown; unanswered: string }) {
  if (question.type === "heading") return null;
  if (question.type === "file") { const file = value as SurveyFileAnswer | undefined; return file ? <a href={fileUrl(file.key)} target="_blank" rel="noreferrer"><Icon name="file" />{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</a> : <span>{unanswered}</span>; }
  if (question.type === "matrix_single" || question.type === "matrix_multiple") return <div>{question.rows.map((row) => <p key={row.id}><b>{row.label}</b>{displaySurveyAnswer(question, value, row.id) || unanswered}</p>)}</div>;
  return <span>{displaySurveyAnswer(question, value) || unanswered}</span>;
}

export default function SurveyResultsClient({ id, copy }: { id: string; copy: Record<string, string> }) {
  const [data, setData] = useState<{ survey: Survey; reports: SurveyQuestionReport[]; responses: SurveyResponseResult[]; total: number; truncated: boolean } | null>(null);
  const [selected, setSelected] = useState<SurveyResponseResult | null>(null); const [message, setMessage] = useState("");
  const [feedbackTitle, setFeedbackTitle] = useState("查询结果"); const [modules, setModules] = useState<SurveyFeedbackModule[]>([blankModule()]); const [saving, setSaving] = useState(false);
  const [manualScores, setManualScores] = useState<Record<string, number>>({}); const [savingScore, setSavingScore] = useState(false);
  useEffect(() => { fetch(`/api/admin/surveys/${id}/results`, { cache: "no-store" }).then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error || copy.loadError); setData(result); }).catch((error) => setMessage(error instanceof Error ? error.message : copy.loadError)); }, [copy.loadError, id]);
  function choose(response: SurveyResponseResult) { setSelected(response); setFeedbackTitle(response.feedback?.title || "查询结果"); setModules(response.feedback?.modules?.length ? response.feedback.modules : [blankModule()]); setManualScores(response.manualScores || {}); setMessage(""); }
  function updateModule(index: number, patch: Partial<SurveyFeedbackModule>) { setModules((current) => current.map((module, itemIndex) => itemIndex === index ? { ...module, ...patch } : module)); }
  async function saveFeedback() {
    if (!selected) return; setSaving(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/surveys/${id}/responses/${selected.id}/feedback`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: feedbackTitle, modules }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "保存反馈失败");
      const updated = { ...selected, feedback: result.feedback }; setSelected(updated); setData((current) => current ? { ...current, responses: current.responses.map((item) => item.id === updated.id ? updated : item) } : current); setMessage("反馈已发布，提交者现在可以查询。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存反馈失败"); } finally { setSaving(false); }
  }
  async function saveManualScores() {
    if (!selected) return; setSavingScore(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/surveys/${id}/responses/${selected.id}/score`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ scores: manualScores }) });
      const result = await response.json() as { scores?: Record<string, number>; score?: number; maxScore?: number; manualPending?: boolean; error?: string };
      if (!response.ok || !result.scores) throw new Error(result.error || "评分保存失败");
      const updated = { ...selected, manualScores: result.scores, score: result.score, maxScore: result.maxScore, manualPending: result.manualPending };
      setSelected(updated); setData((current) => current ? { ...current, responses: current.responses.map((item) => item.id === updated.id ? updated : item) } : current); setMessage("人工评分已保存。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "评分保存失败"); } finally { setSavingScore(false); }
  }
  if (!data) return <section className="survey-results-shell"><p>{message || copy.loading}</p></section>;
  return <section className="survey-results-shell">
    <header><div><p>{copy.eyebrow}</p><h1>{data.survey.title}</h1><span>{data.total} 份答卷{data.truncated ? ` · ${copy.truncated}` : ""}</span></div><a className="survey-report-download" href={`/api/admin/surveys/${id}/report`}><Icon name="file" />{copy.download}</a></header>
    <div className="survey-results-layout"><div className="survey-report-list">{data.reports.map((report, index) => <Report key={report.id} report={report} index={index} copy={copy} onResponse={(responseId) => { const found = data.responses.find((item) => item.id === responseId); if (found) choose(found); }} />)}</div>
      <aside className="survey-response-list"><h2>{copy.responseTitle}</h2>{data.responses.map((response, index) => <button type="button" key={response.id} className={selected?.id === response.id ? "is-active" : ""} onClick={() => choose(response)}><b>答卷 {data.total - index}{response.maxScore !== undefined ? ` · ${response.score}/${response.maxScore} 分` : ""}</b><small>{new Date(response.createdAt).toLocaleString("zh-CN")}{response.feedback?.status === "ready" ? " · 已反馈" : ""}</small></button>)}</aside>
    </div>
    {message && <p className="notification-message" role="status">{message}</p>}
    {selected && <div className="survey-response-dialog" role="dialog" aria-modal="true" aria-label={copy.responseTitle}><article><header><div><p>{copy.responseEyebrow}</p><h2>{copy.responseTitle}{selected.maxScore !== undefined ? ` · ${selected.score}/${selected.maxScore} 分` : ""}</h2><small>{new Date(selected.createdAt).toLocaleString("zh-CN")} · {selected.id}</small></div><button type="button" onClick={() => setSelected(null)}>{copy.close}</button></header>
      {data.survey.questions.map((question, index) => question.type === "heading" ? <h3 className="survey-response-heading" key={question.id}>{question.title}</h3> : <section key={question.id}><b>{index + 1}. {question.title}</b><Answer question={question} value={(selected.answers as SurveyAnswers)[question.id]} unanswered={copy.unanswered} />{question.type === "short_text" && question.scoringMode === "manual" && question.points > 0 && <label className="survey-manual-score"><span>人工评分（满分 {question.points}）</span><input type="number" min={0} max={question.points} step={1} value={manualScores[question.id] ?? ""} onChange={(event) => setManualScores((current) => ({ ...current, [question.id]: Number(event.target.value) }))} /></label>}</section>)}
      {data.survey.kind === "exam" && data.survey.questions.some((question) => question.type === "short_text" && question.scoringMode === "manual" && question.points > 0) && <button className="survey-save-manual-score" type="button" disabled={savingScore} onClick={saveManualScores}>{savingScore ? "正在保存评分…" : "保存人工评分"}</button>}
      {data.survey.kind === "information_query" && <FeedbackEditor title={feedbackTitle} setTitle={setFeedbackTitle} modules={modules} setModules={setModules} updateModule={updateModule} saving={saving} save={saveFeedback} />}
    </article></div>}
  </section>;
}

function Report({ report, index, copy, onResponse }: { report: SurveyQuestionReport; index: number; copy: Record<string, string>; onResponse: (id: string) => void }) {
  return <article><header><span>{index + 1}</span><div><h2>{report.title}</h2><small>{report.answered} / {report.total} {copy.answerCount}</small></div></header>{report.options && <Bars options={report.options} answered={report.answered} />}{report.rows?.map((row) => <div className="survey-report-matrix" key={row.id}><b>{row.label}</b><Bars options={row.options} answered={report.answered} /></div>)}{report.textAnswers && <div className="survey-text-results">{report.textAnswers.slice(0, 12).map((answer) => <button type="button" key={answer.responseId} onClick={() => onResponse(answer.responseId)}>{answer.value}</button>)}</div>}{report.fileAnswers && <div className="survey-text-results">{report.fileAnswers.slice(0, 12).map((file) => <a key={file.responseId} href={fileUrl(file.key)} target="_blank" rel="noreferrer"><Icon name="file" />{file.name}</a>)}</div>}</article>;
}
function Bars({ options, answered }: { options: Array<{ id: string; label: string; count: number }>; answered: number }) { return <div className="survey-bars">{options.map((option) => <div key={option.id}><span>{option.label}</span><i><b style={{ width: `${answered ? option.count / answered * 100 : 0}%` }} /></i><strong>{option.count}</strong></div>)}</div>; }
function FeedbackEditor({ title, setTitle, modules, setModules, updateModule, saving, save }: { title: string; setTitle: (value: string) => void; modules: SurveyFeedbackModule[]; setModules: React.Dispatch<React.SetStateAction<SurveyFeedbackModule[]>>; updateModule: (index: number, patch: Partial<SurveyFeedbackModule>) => void; saving: boolean; save: () => void }) {
  return <section className="survey-feedback-editor"><header><div><b>提交者反馈</b><small>发布后，提交者可在信息查询页查看</small></div></header><label><span>结果标题</span><input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} /></label>{modules.map((module, index) => <div className="survey-feedback-editor-module" key={module.id}><div><b>模块 {index + 1}</b><button type="button" disabled={modules.length === 1} onClick={() => setModules((current) => current.filter((_, itemIndex) => itemIndex !== index))}>删除</button></div><label><span>模块标题</span><input value={module.title} maxLength={120} onChange={(event) => updateModule(index, { title: event.target.value })} /></label><label><span>提示类型</span><select value={module.tone} onChange={(event) => updateModule(index, { tone: event.target.value as SurveyFeedbackModule["tone"] })}><option value="neutral">普通信息</option><option value="positive">正向结果</option><option value="warning">注意事项</option></select></label><label><span>内容</span><textarea value={module.content} maxLength={5000} onChange={(event) => updateModule(index, { content: event.target.value })} /></label></div>)}<div className="survey-feedback-editor-actions"><button type="button" onClick={() => setModules((current) => [...current, blankModule()])} disabled={modules.length >= 20}>添加模块</button><button type="button" onClick={save} disabled={saving}>{saving ? "正在发布…" : "发布反馈"}</button></div></section>;
}

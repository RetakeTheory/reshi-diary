"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import Icon from "../../../Icon";
import RichPostContent from "../../../posts/[slug]/RichPostContent";
import { readableTextColor } from "../../../../lib/color-contrast";
import type { SurveyAnswerReport, SurveyAnswerStatus, SurveyFeedback } from "../../../../lib/surveys";

type QueryResult = {
  id: string;
  createdAt: number;
  score: number | null;
  maxScore: number | null;
  feedback: SurveyFeedback;
  answerReport: SurveyAnswerReport | null;
};
type QueryData = {
  survey?: { title: string; access: "public" | "registered"; identityLabel?: string };
  results?: QueryResult[];
  error?: string;
  requiresLogin?: boolean;
};

const statusLabels: Record<SurveyAnswerStatus, string> = {
  correct: "正确",
  partial: "部分正确",
  incorrect: "错误",
  ungraded: "不计分",
};

function AnswerReport({ report }: { report: SurveyAnswerReport }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  function jumpTo(questionId: string) {
    document.getElementById(`survey-report-question-${questionId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setSheetOpen(false);
  }
  const answerSheet = <aside className={`survey-report-answer-sheet${sheetOpen ? " is-open" : ""}`} aria-label="作答报告答题卡">
    <header><div><b>答题卡</b><span>{report.items.length} 道题</span></div><button type="button" onClick={() => setSheetOpen(false)} aria-label="关闭答题卡"><Icon name="close" /></button></header>
    <nav>{report.items.map((item) => <button type="button" className={`status-${item.status}`} key={item.id} onClick={() => jumpTo(item.id)}><span>{item.number}</span><small>{item.title}</small><i>{item.status === "ungraded" && item.maxScore > 0 ? "待评分" : statusLabels[item.status]}</i></button>)}</nav>
    <footer><span className="status-correct">正确</span><span className="status-partial">部分正确</span><span className="status-incorrect">错误</span></footer>
  </aside>;
  return <section className="survey-answer-report">
    <header><div><p>ANSWER REPORT</p><h2>逐题作答报告</h2><span>仅展示你的作答与得分，不公开标准答案。</span></div><strong>{report.score} / {report.maxScore} 分</strong></header>
    {report.manualPending && <p className="survey-report-pending-score">仍有题目等待管理员评分，当前总分可能变化。</p>}
    <button className="survey-report-sheet-trigger" type="button" onClick={() => setSheetOpen(true)}><Icon name="table" />打开答题卡</button>
    <div className="survey-answer-report-layout"><div className="survey-answer-report-questions">{report.items.map((item) => {
      const label = item.status === "ungraded" && item.maxScore > 0 ? "待评分" : statusLabels[item.status];
      const score = item.score === null ? item.maxScore > 0 ? `待评分 / ${item.maxScore} 分` : "不计分" : `${item.score} / ${item.maxScore} 分`;
      return <article id={`survey-report-question-${item.id}`} className={`status-${item.status}`} key={item.id}>
        <header><span>{item.number}</span><div><h3>{item.title}</h3><small>{label}</small></div><strong>{score}</strong></header>
        <div><b>你的作答</b><p>{item.answer}</p></div>
      </article>;
    })}</div>{answerSheet}</div>
    {sheetOpen && <button className="survey-report-sheet-backdrop" type="button" aria-label="关闭答题卡" onClick={() => setSheetOpen(false)} />}
  </section>;
}

export default function SurveyQuery({ slug, copy }: { slug: string; copy: Record<string, string> }) {
  const [data, setData] = useState<QueryData | null>(null);
  const [identity, setIdentity] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    fetch(`/api/surveys/${encodeURIComponent(slug)}/query`, { cache: "no-store" }).then(async (response) => {
      const result = await response.json() as QueryData;
      if (response.status === 401) { setData({ ...result, requiresLogin: true }); return; }
      if (!response.ok) throw new Error(result.error || copy.loadError);
      setData(result);
    }).catch((error) => setMessage(error instanceof Error ? error.message : copy.loadError));
  }, [copy.loadError, slug]);

  async function search(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/surveys/${encodeURIComponent(slug)}/query`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identity }) });
      const result = await response.json() as QueryData;
      if (!response.ok) throw new Error(result.error || "查询失败");
      setData((current) => ({ ...result, survey: result.survey ? { ...result.survey, identityLabel: current?.survey?.identityLabel } : result.survey }));
    } catch (error) { setMessage(error instanceof Error ? error.message : "查询失败"); }
    finally { setBusy(false); }
  }

  if (!data && !message) return <section className="survey-query-state"><span className="survey-loader" /><p>{copy.loading}</p></section>;
  if (!data) return <section className="survey-query-state"><Icon name="table" /><h1>{copy.loadError}</h1><p>{message}</p><Link href={`/surveys/${slug}`}>{copy.back}</Link></section>;
  if (data.requiresLogin) return <section className="survey-query-state"><Icon name="user" /><h1>{copy.loginTitle}</h1><p>{data.error}</p><Link href={`/login?returnTo=${encodeURIComponent(`/surveys/${slug}/query`)}`}>{copy.loginAction}</Link></section>;
  const hasAnswerReport = data.results?.some((item) => item.answerReport) === true;
  return <section className={`survey-query-shell${hasAnswerReport ? " has-answer-report" : ""}`}><header><p>{copy.eyebrow}</p><h1>{data.survey?.title}</h1><span>{copy.description}</span></header>
    {data.survey?.access === "public" && <form className="survey-query-form" onSubmit={search}><label><span>{data.survey.identityLabel || "查询凭证"}</span><input required value={identity} onChange={(event) => setIdentity(event.target.value)} autoComplete="off" /></label><button type="submit" disabled={busy}>{busy ? "查询中…" : copy.searchAction}</button></form>}
    {message && <p className="survey-submit-error" role="alert">{message}</p>}
    {data.results && <div className="survey-query-results">{data.results.length ? data.results.map((item) => <article key={item.id}><header><div><b>{item.feedback.status === "ready" ? item.feedback.title : "等待管理员反馈"}</b><small>提交于 {new Date(item.createdAt).toLocaleString("zh-CN")}</small></div></header>{item.feedback.status === "ready" ? <><div className="survey-feedback-modules">{item.maxScore !== null && <section className="survey-feedback-score"><span>考试成绩</span><strong>{item.score} / {item.maxScore} 分</strong></section>}{item.feedback.modules.map((module) => <section className={`tone-${module.tone}`} style={{ backgroundColor: module.backgroundColor || undefined, color: readableTextColor(module.backgroundColor) }} key={module.id}><h2>{module.title}</h2><div className="survey-feedback-rich"><RichPostContent html={module.content} /></div></section>)}</div>{item.answerReport && <AnswerReport report={item.answerReport} />}</> : <p className="survey-query-pending">{copy.pending}</p>}</article>) : <div className="survey-query-empty"><Icon name="search" /><b>{copy.emptyTitle}</b><span>{copy.emptyBody}</span></div>}</div>}
  </section>;
}

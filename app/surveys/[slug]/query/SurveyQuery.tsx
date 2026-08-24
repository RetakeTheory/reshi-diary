"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import Icon from "../../../Icon";
import type { SurveyFeedback } from "../../../../lib/surveys";

type QueryResult = { id: string; createdAt: number; score: number | null; maxScore: number | null; feedback: SurveyFeedback };
type QueryData = { survey?: { title: string; access: "public" | "registered"; identityLabel?: string }; results?: QueryResult[]; error?: string; requiresLogin?: boolean };

export default function SurveyQuery({ slug, copy }: { slug: string; copy: Record<string, string> }) {
  const [data, setData] = useState<QueryData | null>(null); const [identity, setIdentity] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
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
    try { const response = await fetch(`/api/surveys/${encodeURIComponent(slug)}/query`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identity }) }); const result = await response.json() as QueryData; if (!response.ok) throw new Error(result.error || "查询失败"); setData((current) => ({ ...result, survey: result.survey ? { ...result.survey, identityLabel: current?.survey?.identityLabel } : result.survey })); }
    catch (error) { setMessage(error instanceof Error ? error.message : "查询失败"); } finally { setBusy(false); }
  }
  if (!data && !message) return <section className="survey-query-state"><span className="survey-loader" /><p>{copy.loading}</p></section>;
  if (!data) return <section className="survey-query-state"><Icon name="table" /><h1>{copy.loadError}</h1><p>{message}</p><Link href={`/surveys/${slug}`}>{copy.back}</Link></section>;
  if (data.requiresLogin) return <section className="survey-query-state"><Icon name="user" /><h1>{copy.loginTitle}</h1><p>{data.error}</p><Link href={`/login?returnTo=${encodeURIComponent(`/surveys/${slug}/query`)}`}>{copy.loginAction}</Link></section>;
  return <section className="survey-query-shell"><header><Link href={`/surveys/${slug}`}><Icon name="arrow-left" />{copy.back}</Link><p>{copy.eyebrow}</p><h1>{data.survey?.title}</h1><span>{copy.description}</span></header>
    {data.survey?.access === "public" && <form className="survey-query-form" onSubmit={search}><label><span>{data.survey.identityLabel || "查询凭证"}</span><input required value={identity} onChange={(event) => setIdentity(event.target.value)} autoComplete="off" /></label><button type="submit" disabled={busy}>{busy ? "查询中…" : copy.searchAction}</button></form>}
    {message && <p className="survey-submit-error" role="alert">{message}</p>}
    {data.results && <div className="survey-query-results">{data.results.length ? data.results.map((item) => <article key={item.id}><header><div><b>{item.feedback.status === "ready" ? item.feedback.title : "等待管理员反馈"}</b><small>提交于 {new Date(item.createdAt).toLocaleString("zh-CN")}</small></div>{item.maxScore !== null && <strong>{item.score} / {item.maxScore} 分</strong>}</header>{item.feedback.status === "ready" ? <div className="survey-feedback-modules">{item.feedback.modules.map((module) => <section className={`tone-${module.tone}`} key={module.id}><h2>{module.title}</h2><p>{module.content}</p></section>)}</div> : <p className="survey-query-pending">{copy.pending}</p>}</article>) : <div className="survey-query-empty"><Icon name="search" /><b>{copy.emptyTitle}</b><span>{copy.emptyBody}</span></div>}</div>}
  </section>;
}

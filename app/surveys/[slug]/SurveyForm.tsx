"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import type { MatrixQuestion, Survey, SurveyAnswers, SurveyQuestion } from "../../../lib/surveys";
import { validateSurveyAnswers } from "../../../lib/surveys";
import Icon from "../../Icon";
import RichPostContent from "../../posts/[slug]/RichPostContent";

type PublicSurvey = Omit<Survey, "responseCount" | "successContent" | "successRedirectUrl">;
type Completion = { mode: "message"; content: string } | { mode: "redirect"; redirectUrl: string };

function ChoiceField({ question, value, onChange }: { question: Extract<SurveyQuestion, { type: "single" | "multiple" }>; value: unknown; onChange: (value: unknown) => void }) {
  const answer = value && typeof value === "object" ? value as { selected?: string | string[]; otherText?: string } : {};
  const selected = Array.isArray(answer.selected) ? answer.selected : answer.selected ? [answer.selected] : [];
  const multiple = question.type === "multiple";
  function toggle(id: string, checked: boolean) { onChange({ ...answer, selected: multiple ? (checked ? [...new Set([...selected, id])] : selected.filter((item) => item !== id)) : id }); }
  return <div className="survey-choice-list">{question.options.map((option) => <label key={option.id}><input type={multiple ? "checkbox" : "radio"} name={multiple ? `${question.id}-${option.id}` : question.id} checked={selected.includes(option.id)} onChange={(event) => toggle(option.id, event.target.checked)} /><span>{option.label}</span></label>)}{question.allowOther && <label className="survey-other-choice"><span><input type={multiple ? "checkbox" : "radio"} name={multiple ? `${question.id}-other` : question.id} checked={selected.includes("__other")} onChange={(event) => toggle("__other", event.target.checked)} />其他</span>{selected.includes("__other") && <input aria-label="填写其他选项" value={answer.otherText || ""} maxLength={500} required={question.otherRequired} placeholder="请填写" onChange={(event) => onChange({ ...answer, otherText: event.target.value })} />}</label>}</div>;
}

function MatrixField({ question, value, onChange }: { question: MatrixQuestion; value: unknown; onChange: (value: unknown) => void }) {
  const answers = value && typeof value === "object" ? value as Record<string, string | string[]> : {};
  const multiple = question.type === "matrix_multiple";
  function selected(rowId: string, columnId: string) { const row = answers[rowId]; return Array.isArray(row) ? row.includes(columnId) : row === columnId; }
  function toggle(rowId: string, columnId: string, checked: boolean) { const current = answers[rowId]; const values = Array.isArray(current) ? current : current ? [current] : []; onChange({ ...answers, [rowId]: multiple ? (checked ? [...new Set([...values, columnId])] : values.filter((item) => item !== columnId)) : columnId }); }
  return <div className="survey-matrix-wrap"><table><thead><tr><th scope="col">项目</th>{question.columns.map((column) => <th scope="col" key={column.id}>{column.label}</th>)}</tr></thead><tbody>{question.rows.map((row) => <tr key={row.id}><th scope="row">{row.label}</th>{question.columns.map((column) => <td key={column.id}><label><span className="sr-only">{row.label}：{column.label}</span><input type={multiple ? "checkbox" : "radio"} name={multiple ? `${question.id}-${row.id}-${column.id}` : `${question.id}-${row.id}`} checked={selected(row.id, column.id)} onChange={(event) => toggle(row.id, column.id, event.target.checked)} /></label></td>)}</tr>)}</tbody></table></div>;
}

function ShortField({ question, value, onChange }: { question: Extract<SurveyQuestion, { type: "short_text" }>; value: unknown; onChange: (value: string) => void }) {
  const answer = typeof value === "string" ? value : "";
  const numeric = question.textType === "digits_fixed";
  const placeholder = question.textType === "id_card" ? "请输入 18 位身份证号码" : question.textType === "name" ? "请输入姓名" : question.textType === "english" ? "Please enter English text" : numeric ? `请输入 ${question.fixedDigits} 位数字` : "请输入回答";
  return <div className="survey-short-field"><input value={answer} required={question.required} maxLength={numeric ? question.fixedDigits : question.maxLength} inputMode={numeric ? "numeric" : "text"} autoComplete={question.textType === "name" ? "name" : "off"} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /><small>{[...answer].length} / {numeric ? question.fixedDigits : question.maxLength}</small></div>;
}

export default function SurveyForm({ slug }: { slug: string }) {
  const [survey, setSurvey] = useState<PublicSurvey | null>(null);
  const [answers, setAnswers] = useState<SurveyAnswers>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [successContent, setSuccessContent] = useState("");
  const [message, setMessage] = useState("");
  const [requiresLogin, setRequiresLogin] = useState(false);
  useEffect(() => { fetch(`/api/surveys/${encodeURIComponent(slug)}`, { cache: "no-store" }).then(async (response) => { const result = await response.json() as { survey?: PublicSurvey; error?: string; requiresLogin?: boolean }; if (!response.ok || !result.survey) { setRequiresLogin(result.requiresLogin === true); throw new Error(result.error || "问卷加载失败"); } setSurvey(result.survey); }).catch((error) => setMessage(error instanceof Error ? error.message : "问卷加载失败")).finally(() => setLoading(false)); }, [slug]);
  function answer(id: string, value: unknown) { setAnswers((current) => ({ ...current, [id]: value })); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!survey) return; setMessage(""); setBusy(true);
    try {
      const normalized = validateSurveyAnswers(survey.questions, answers);
      const response = await fetch(`/api/surveys/${encodeURIComponent(slug)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers: normalized }) });
      const result = await response.json() as { ok?: boolean; error?: string; completion?: Completion };
      if (!response.ok || !result.ok || !result.completion) throw new Error(result.error || "提交失败");
      if (result.completion.mode === "redirect") { window.location.assign(result.completion.redirectUrl); return; }
      setSuccessContent(result.completion.content);
      setSubmitted(true); window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) { setMessage(error instanceof Error ? error.message : "提交失败"); } finally { setBusy(false); }
  }
  if (loading) return <div className="survey-public-state"><span className="survey-loader" /><p>正在加载问卷…</p></div>;
  if (!survey) return <div className="survey-public-state"><Icon name="table" /><h1>无法打开问卷</h1><p>{message}</p>{requiresLogin ? <Link href={`/login?returnTo=${encodeURIComponent(`/surveys/${slug}`)}`}>登录 / 注册后填写</Link> : <Link href="/">返回首页</Link>}</div>;
  if (submitted) return <div className="survey-public-state survey-success"><Icon name="check" /><RichPostContent html={successContent} /><Link href="/">返回首页</Link></div>;
  return <form className="survey-public-form" onSubmit={submit} noValidate>
    <header><span className={`survey-status status-${survey.status}`}>{survey.status === "published" ? "正在收集" : "已结束"}</span><h1>{survey.title}</h1>{survey.description && <p>{survey.description}</p>}<small>每个 IP 最多提交 {survey.ipLimit} 次 · 标有“必答”的题目必须填写</small></header>
    {survey.status === "closed" ? <div className="survey-closed"><Icon name="check" /><b>问卷已结束收集</b><span>感谢关注。</span></div> : <>
      <div className="survey-public-questions">{survey.questions.map((question, index) => <fieldset key={question.id}><legend><span>{index + 1}</span><b>{question.title}</b>{question.required && <em>必答</em>}</legend>{question.description && <p>{question.description}</p>}{(question.type === "single" || question.type === "multiple") && <ChoiceField question={question} value={answers[question.id]} onChange={(value) => answer(question.id, value)} />}{(question.type === "matrix_single" || question.type === "matrix_multiple") && <MatrixField question={question} value={answers[question.id]} onChange={(value) => answer(question.id, value)} />}{question.type === "short_text" && <ShortField question={question} value={answers[question.id]} onChange={(value) => answer(question.id, value)} />}</fieldset>)}</div>
      {message && <p className="survey-submit-error" role="alert">{message}</p>}
      <button className="survey-submit" type="submit" disabled={busy}>{busy ? "正在提交…" : survey.submitLabel}</button>
    </>}
  </form>;
}

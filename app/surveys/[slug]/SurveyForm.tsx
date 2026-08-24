"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { FileQuestion, MatrixQuestion, PersonalInfoQuestion, Survey, SurveyAnswers, SurveyFileAnswer, SurveyQuestion } from "../../../lib/surveys";
import { questionIsVisible, validateSurveyAnswers } from "../../../lib/surveys";
import Icon from "../../Icon";
import RichPostContent from "../../posts/[slug]/RichPostContent";

type PublicSurvey = Omit<Survey, "responseCount" | "successContent" | "successRedirectUrl">;
type Completion = ({ mode: "message"; content: string } | { mode: "redirect"; redirectUrl: string }) & { score?: number; maxScore?: number; manualPending?: boolean; queryUrl?: string };

const questionTypeLabels: Record<SurveyQuestion["type"], string> = {
  single: "单选题",
  multiple: "多选题",
  matrix_single: "矩阵单选题",
  matrix_multiple: "矩阵多选题",
  short_text: "简答题",
  personal_info: "个人信息",
  heading: "说明",
  file: "文件题",
};

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

function PersonalInfoField({ question, value, onChange }: { question: PersonalInfoQuestion; value: unknown; onChange: (value: string) => void }) {
  const answer = typeof value === "string" ? value : "";
  const placeholders = { name: "请输入姓名", email: "请输入邮箱", phone: "请输入手机号", student_id: "请输入学号或工号", id_card: "请输入 18 位身份证号码", custom: "请输入信息" };
  const inputMode = question.infoType === "email" ? "email" : question.infoType === "phone" || question.infoType === "id_card" ? "numeric" : "text";
  return <div className="survey-short-field"><input value={answer} required={question.required} maxLength={question.maxLength} inputMode={inputMode} autoComplete={question.infoType === "name" ? "name" : question.infoType === "email" ? "email" : question.infoType === "phone" ? "tel" : "off"} placeholder={placeholders[question.infoType]} onChange={(event) => onChange(event.target.value)} /><small>{[...answer].length} / {question.maxLength}</small></div>;
}

function hasAnswer(question: SurveyQuestion, value: unknown) {
  if (question.type === "heading") return true;
  if (question.type === "single" || question.type === "multiple") return Boolean(value && typeof value === "object" && (Array.isArray((value as { selected?: unknown }).selected) ? (value as { selected: unknown[] }).selected.length : (value as { selected?: unknown }).selected));
  if (question.type === "matrix_single" || question.type === "matrix_multiple") return Boolean(value && typeof value === "object" && Object.keys(value).length);
  if (question.type === "file") return Boolean(value && typeof value === "object" && (value as { key?: string }).key);
  return typeof value === "string" && Boolean(value.trim());
}

function FileField({ slug, question, value, onChange }: { slug: string; question: FileQuestion; value: unknown; onChange: (value: SurveyFileAnswer | undefined) => void }) {
  const file = value && typeof value === "object" ? value as SurveyFileAnswer : null;
  const [uploading, setUploading] = useState(false); const [progress, setProgress] = useState(0); const [error, setError] = useState("");
  function putFile(url: string, headers: Record<string, string> | undefined, selected: File) {
    return new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("PUT", url, true);
      Object.entries(headers || {}).forEach(([name, headerValue]) => request.setRequestHeader(name, headerValue));
      request.upload.onprogress = (event) => { if (event.lengthComputable) setProgress(Math.min(99, Math.round(event.loaded / event.total * 100))); };
      request.onerror = () => reject(new Error("文件上传连接失败，请检查网络后重试"));
      request.onabort = () => reject(new Error("文件上传已取消"));
      request.onload = () => {
        if (request.status >= 200 && request.status < 300) { setProgress(100); resolve(); return; }
        let message = "文件上传失败，请稍后重试";
        try { message = (JSON.parse(request.responseText) as { error?: string }).error || message; } catch { /* Keep the stable fallback for non-JSON upstream responses. */ }
        reject(new Error(message));
      };
      request.send(selected);
    });
  }
  async function upload(selected: File) {
    setError("");
    if (selected.size > question.maxSizeMb * 1024 * 1024) { setError(`文件不能超过 ${question.maxSizeMb} MB`); return; }
    setUploading(true); setProgress(0);
    try {
      const response = await fetch(`/api/surveys/${encodeURIComponent(slug)}/files`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ questionId: question.id, name: selected.name, size: selected.size, type: selected.type || "application/octet-stream" }) });
      const result = await response.json() as SurveyFileAnswer & { uploadUrl?: string; headers?: Record<string, string>; error?: string };
      if (!response.ok || !result.uploadUrl) throw new Error(result.error || "无法开始上传");
      await putFile(result.uploadUrl, result.headers, selected);
      onChange({ key: result.key, name: result.name, size: result.size, type: result.type });
    } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : "文件上传失败"); }
    finally { setUploading(false); setProgress(0); }
  }
  return <div className="survey-file-field">{file ? <div className="survey-file-ready"><Icon name="file" /><span><b>{file.name}</b><small>{(file.size / 1024 / 1024).toFixed(2)} MB</small></span><button type="button" onClick={() => onChange(undefined)}>移除</button></div> : <label className={uploading ? "is-uploading" : ""}><Icon name="file" /><span><b>{uploading ? `正在上传… ${progress}%` : "选择文件"}</b><small>单个文件不超过 {question.maxSizeMb} MB</small>{uploading && <i className="survey-file-progress" aria-hidden="true"><span style={{ transform: `scaleX(${progress / 100})` }} /></i>}</span><input type="file" disabled={uploading} required={question.required} onChange={(event) => event.target.files?.[0] && upload(event.target.files[0])} /></label>}{error && <small className="survey-file-error" role="alert">{error}</small>}</div>;
}

export default function SurveyForm({ slug }: { slug: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const timeoutSubmittedRef = useRef(false);
  const timeoutRetryCountRef = useRef(0);
  const [survey, setSurvey] = useState<PublicSurvey | null>(null);
  const [answers, setAnswers] = useState<SurveyAnswers>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [successContent, setSuccessContent] = useState("");
  const [completion, setCompletion] = useState<Completion | null>(null);
  const [message, setMessage] = useState("");
  const [requiresLogin, setRequiresLogin] = useState(false);
  const [attemptId, setAttemptId] = useState("");
  const [expiresAt, setExpiresAt] = useState(0);
  const [now, setNow] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [timeoutRetryTick, setTimeoutRetryTick] = useState(0);
  const [acceptedInstructions, setAcceptedInstructions] = useState(false);
  useEffect(() => { fetch(`/api/surveys/${encodeURIComponent(slug)}`, { cache: "no-store" }).then(async (response) => { const result = await response.json() as { survey?: PublicSurvey; error?: string; requiresLogin?: boolean; serverNow?: number }; if (!response.ok || !result.survey) { setRequiresLogin(result.requiresLogin === true); throw new Error(result.error || "问卷加载失败"); } setSurvey(result.survey); setNow(result.serverNow || Date.now()); }).catch((error) => setMessage(error instanceof Error ? error.message : "问卷加载失败")).finally(() => setLoading(false)); }, [slug]);
  useEffect(() => { if (submitted || !survey || survey.kind !== "exam") return; const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, [submitted, survey]);
  async function startExam() {
    if (!survey || busy || !acceptedInstructions) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/surveys/${encodeURIComponent(slug)}/attempt`, { method: "POST" });
      const result = await response.json() as { attempt?: { id: string; expiresAt: number }; error?: string; requiresLogin?: boolean; serverNow?: number };
      if (!response.ok || !result.attempt) { setRequiresLogin(result.requiresLogin === true); throw new Error(result.error || "无法开始考试"); }
      setAttemptId(result.attempt.id); setExpiresAt(result.attempt.expiresAt); setNow(result.serverNow || Date.now());
    } catch (error) { setMessage(error instanceof Error ? error.message : "无法开始考试"); }
    finally { setBusy(false); }
  }
  function answer(id: string, value: unknown) { setAnswers((current) => ({ ...current, [id]: value })); }
  const submitAnswers = useCallback(async (timedOut = false) => {
    if (!survey || busy || submitted) return; setMessage(""); setBusy(true);
    try {
      const normalized = validateSurveyAnswers(survey.questions, answers, { allowIncomplete: timedOut });
      const response = await fetch(`/api/surveys/${encodeURIComponent(slug)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers: normalized, attemptId, timedOut }) });
      const result = await response.json() as { ok?: boolean; error?: string; completion?: Completion };
      if (!response.ok || !result.ok || !result.completion) throw new Error(result.error || "提交失败");
      if (result.completion.mode === "redirect") { window.location.assign(result.completion.redirectUrl); return; }
      setCompletion(result.completion); setSuccessContent(result.completion.content);
      setSubmitted(true); window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setMessage(timedOut ? "自动交卷失败，正在重试…" : error instanceof Error ? error.message : "提交失败");
      if (timedOut && timeoutRetryCountRef.current < 12) {
        timeoutRetryCountRef.current += 1;
        window.setTimeout(() => { timeoutSubmittedRef.current = false; setTimeoutRetryTick((current) => current + 1); }, 5_000);
      }
    } finally { setBusy(false); }
  }, [answers, attemptId, busy, slug, submitted, survey]);
  function submit(event: FormEvent) { event.preventDefault(); void submitAnswers(false); }
  const visibleQuestions = useMemo(() => survey ? survey.questions.filter((question) => questionIsVisible(question, answers, survey.questions)) : [], [answers, survey]);
  const answerableQuestions = visibleQuestions.filter((question) => question.type !== "heading");
  const allAnswerableQuestions = survey?.questions.filter((question) => question.type !== "heading") || [];
  const answeredCount = answerableQuestions.filter((question) => hasAnswer(question, answers[question.id])).length;
  const remainingSeconds = expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : 0;
  useEffect(() => { if (!survey || survey.kind !== "exam" || !expiresAt || remainingSeconds > 0 || timeoutSubmittedRef.current || submitted) return; timeoutSubmittedRef.current = true; void submitAnswers(true); }, [expiresAt, remainingSeconds, submitAnswers, submitted, survey, timeoutRetryTick]);
  function jumpTo(questionId: string) { document.getElementById(`survey-question-${questionId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); setSheetOpen(false); }
  if (loading) return <div className="survey-public-state"><span className="survey-loader" /><p>正在加载问卷…</p></div>;
  if (!survey) return <div className="survey-public-state"><Icon name="table" /><h1>无法打开问卷</h1><p>{message}</p>{requiresLogin ? <Link href={`/login?returnTo=${encodeURIComponent(`/surveys/${slug}`)}`}>登录 / 注册后填写</Link> : <Link href="/">返回首页</Link>}</div>;
  if (submitted) return <div className="survey-public-state survey-success"><Icon name="check" />{completion?.maxScore !== undefined && <><div className="survey-score-result"><b>{completion.score}</b><span>/ {completion.maxScore} 分</span></div>{completion.manualPending && <p>以上为客观题暂得分，简答题人工评分完成后才是最终成绩。</p>}</>}<RichPostContent html={successContent} />{completion?.queryUrl && <Link className="survey-query-link" href={completion.queryUrl}>查询管理员反馈</Link>}<Link href="/">返回首页</Link></div>;
  const waitingSeconds = survey.examStartAt ? Math.max(0, Math.ceil((survey.examStartAt - now) / 1000)) : 0;
  if (survey.kind === "exam" && !attemptId) return <main className="survey-exam-lobby">
    <section>
      <span className={`survey-status status-${survey.status}`}>{survey.status === "closed" ? "考试已结束" : waitingSeconds ? "等待开放" : "考试候场"}</span>
      <h1>{survey.title}</h1>
      <div className="survey-exam-lobby-meta"><span>限时 {survey.durationMinutes} 分钟</span>{survey.examStartAt > 0 && <span>开放时间 {new Date(survey.examStartAt).toLocaleString("zh-CN")}</span>}</div>
      <article><RichPostContent html={survey.examInstructions} /></article>
      {survey.status === "closed" ? <p className="survey-submit-error">考试已经结束，无法进入答题。</p> : <>
        {waitingSeconds > 0 && <div className="survey-exam-waiting"><span>距离开放还有</span><b>{Math.floor(waitingSeconds / 3600).toString().padStart(2, "0")}:{Math.floor(waitingSeconds % 3600 / 60).toString().padStart(2, "0")}:{(waitingSeconds % 60).toString().padStart(2, "0")}</b></div>}
        <label className="survey-exam-agreement"><input type="checkbox" checked={acceptedInstructions} onChange={(event) => setAcceptedInstructions(event.target.checked)} /><span>我已阅读并同意遵守考试说明；点击开始后计时不会暂停。</span></label>
        {message && <p className="survey-submit-error" role="alert">{message}</p>}
        <button type="button" className="survey-submit" disabled={busy || waitingSeconds > 0 || !acceptedInstructions} onClick={startExam}>{busy ? "正在进入…" : waitingSeconds ? "等待考试开放" : "开始考试"}</button>
        {requiresLogin && <Link href={`/login?returnTo=${encodeURIComponent(`/surveys/${slug}`)}`}>登录后参加考试</Link>}
      </>}
    </section>
  </main>;
  const timerLabel = `${String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:${String(remainingSeconds % 60).padStart(2, "0")}`;
  const answerSheet = <aside className={`survey-answer-sheet${sheetOpen ? " is-open" : ""}`} aria-label="答题卡"><header><div><b>答题卡</b><span>{answeredCount} / {answerableQuestions.length} 已答</span></div><button type="button" onClick={() => setSheetOpen(false)} aria-label="关闭答题卡"><Icon name="close" /></button></header>{survey.kind === "exam" && <div className={`survey-exam-timer${remainingSeconds < 300 ? " is-urgent" : ""}`}><span>剩余时间</span><b>{timerLabel}</b></div>}<div className="survey-answer-progress"><i style={{ width: `${answerableQuestions.length ? answeredCount / answerableQuestions.length * 100 : 0}%` }} /></div><nav>{answerableQuestions.map((question) => <button type="button" className={hasAnswer(question, answers[question.id]) ? "is-answered" : ""} key={question.id} onClick={() => jumpTo(question.id)}><span>{allAnswerableQuestions.findIndex((item) => item.id === question.id) + 1}</span><small>{question.title}</small></button>)}</nav><footer><span><i />已作答</span><span><i />未作答</span></footer></aside>;
  return <form ref={formRef} className="survey-public-form" onSubmit={submit} noValidate>
    <button className="survey-answer-sheet-trigger" type="button" onClick={() => setSheetOpen(true)}><Icon name="table" /><span>{answeredCount}/{answerableQuestions.length}</span></button>
    <div className="survey-form-layout"><div className="survey-form-main">
    <header><span className={`survey-status status-${survey.status}`}>{survey.status === "published" ? survey.kind === "exam" ? "考试进行中" : "正在收集" : "已结束"}</span><h1>{survey.title}</h1>{survey.description && <p>{survey.description}</p>}<small>每个 IP 最多提交 {survey.ipLimit} 次 · 标有“必答”的题目必须填写{survey.kind === "exam" ? ` · 限时 ${survey.durationMinutes} 分钟` : ""}</small></header>
    {survey.status === "closed" ? <div className="survey-closed"><Icon name="check" /><b>问卷已结束收集</b><span>感谢关注。</span></div> : <>
      <div className="survey-public-questions">{visibleQuestions.map((question) => question.type === "heading" ? <section className="survey-section-heading" key={question.id}><h2>{question.title}</h2></section> : <fieldset id={`survey-question-${question.id}`} key={question.id}>
        <legend className="sr-only">第 {allAnswerableQuestions.findIndex((item) => item.id === question.id) + 1} 题：{question.title}{question.required ? "，必答" : ""}</legend>
        <div className="survey-question-heading">
          <span className="survey-question-number" aria-hidden="true">{allAnswerableQuestions.findIndex((item) => item.id === question.id) + 1}</span>
          <div className="survey-question-title-line">
            <b>{question.title}</b>
            <span className="survey-question-tags">
              <span className={`survey-question-type type-${question.type}`}>{questionTypeLabels[question.type]}</span>
              {question.required && <span className="survey-required-tag">必答</span>}
              {survey.kind === "exam" && question.points > 0 && <span className="survey-score-tag">{question.points} 分</span>}
            </span>
          </div>
        </div>
        {question.description && <p>{question.description}</p>}{(question.type === "single" || question.type === "multiple") && <ChoiceField question={question} value={answers[question.id]} onChange={(value) => answer(question.id, value)} />}{(question.type === "matrix_single" || question.type === "matrix_multiple") && <MatrixField question={question} value={answers[question.id]} onChange={(value) => answer(question.id, value)} />}{question.type === "short_text" && <ShortField question={question} value={answers[question.id]} onChange={(value) => answer(question.id, value)} />}{question.type === "personal_info" && <PersonalInfoField question={question} value={answers[question.id]} onChange={(value) => answer(question.id, value)} />}{question.type === "file" && <FileField slug={slug} question={question} value={answers[question.id]} onChange={(value) => answer(question.id, value)} />}
      </fieldset>)}</div>
      {message && <p className="survey-submit-error" role="alert">{message}</p>}
      <button className="survey-submit" type="submit" disabled={busy}>{busy ? "正在提交…" : survey.submitLabel}</button>
    </>}</div>{survey.status !== "closed" && answerSheet}</div>
    {sheetOpen && <button className="survey-answer-sheet-backdrop" type="button" aria-label="关闭答题卡" onClick={() => setSheetOpen(false)} />}
  </form>;
}

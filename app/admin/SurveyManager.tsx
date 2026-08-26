"use client";

import { useEffect, useState } from "react";
import ArrowIcon from "../ArrowIcon";
import Icon from "../Icon";
import type { ChoiceItem, PersonalInfoType, QuestionType, ShortTextScoringMode, ShortTextType, Survey, SurveyInput, SurveyKind, SurveyQuestion } from "../../lib/surveys";
import SurveyRichEditor from "./SurveyRichEditor";

const typeLabels: Record<QuestionType, string> = {
  single: "单选题",
  multiple: "多选题",
  matrix_single: "矩阵单选题",
  matrix_multiple: "矩阵多选题",
  short_text: "简答题",
  personal_info: "个人信息题",
  heading: "文字标题",
  file: "文件题",
};
const textTypeLabels: Record<ShortTextType, string> = {
  text: "普通字段",
  digits_fixed: "固定位数数字",
  id_card: "身份证",
  name: "姓名",
  english: "英文字段",
};
const personalInfoLabels: Record<PersonalInfoType, string> = { name: "姓名", email: "邮箱", phone: "手机号", student_id: "学号 / 工号", id_card: "身份证", custom: "自定义信息" };
const surveyKindLabels: Record<SurveyKind, string> = { standard: "普通问卷", exam: "考试" };
const scoringModeLabels: Record<ShortTextScoringMode, string> = { exact: "完全正确才给分", contains: "包含指定字段给分", manual: "人工评分" };

function localDateTime(value: number) {
  if (!value) return "";
  const date = new Date(value - new Date(value).getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}

function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
}

function blankQuestion(type: QuestionType): SurveyQuestion {
  const base = { id: uid("q"), title: "", description: "", required: true, logic: null, points: 0 };
  if (type === "single" || type === "multiple") return { ...base, type, options: [{ id: uid("o"), label: "选项 1" }, { id: uid("o"), label: "选项 2" }], allowOther: false, otherRequired: false, correctOptionIds: [] };
  if (type === "matrix_single" || type === "matrix_multiple") return { ...base, type, rows: [{ id: uid("r"), label: "项目 1" }], columns: [{ id: uid("c"), label: "选项 1" }, { id: uid("c"), label: "选项 2" }] };
  if (type === "file") return { ...base, type, maxSizeMb: 100 };
  if (type === "personal_info") return { ...base, type, infoType: "name", maxLength: 120 };
  if (type === "heading") return { ...base, type, required: false, points: 0 };
  return { ...base, type, maxLength: 200, textType: "text", fixedDigits: 6, correctAnswer: "", scoringMode: "exact" };
}

function cloneQuestion(question: SurveyQuestion): SurveyQuestion {
  const copy = structuredClone(question);
  copy.id = uid("q"); copy.title = `${copy.title || "未命名题目"}（副本）`;
  if (copy.type === "single" || copy.type === "multiple") copy.options = copy.options.map((item) => ({ ...item, id: uid("o") }));
  if (copy.type === "matrix_single" || copy.type === "matrix_multiple") { copy.rows = copy.rows.map((item) => ({ ...item, id: uid("r") })); copy.columns = copy.columns.map((item) => ({ ...item, id: uid("c") })); }
  return copy;
}

function blankSurvey(): SurveyInput & { id?: string; responseCount?: number } {
  return { slug: `survey-${crypto.randomUUID().slice(0, 8)}`, title: "未命名问卷", description: "", status: "draft", access: "public", kind: "standard", queryEnabled: false, durationMinutes: 60, examInstructions: "<h2>考试说明</h2><p>请在安静的环境中独立完成。点击开始后立即计时，中途退出不会暂停。</p>", examStartAt: 0, queryIdentityQuestionId: "", ipLimit: 1, submitLabel: "提交答卷", successMode: "message", successContent: "<h2>提交成功</h2><p>感谢填写，你的答卷已记录。</p>", successRedirectUrl: "", questions: [blankQuestion("single")] };
}

function ItemEditor({ title, items, onChange, minimum = 1 }: { title: string; items: ChoiceItem[]; onChange: (items: ChoiceItem[]) => void; minimum?: number }) {
  return <div className="survey-item-editor"><span>{title}</span><div>{items.map((item, index) => <div key={item.id}>
    <input aria-label={`${title} ${index + 1}`} value={item.label} maxLength={120} onChange={(event) => onChange(items.map((current) => current.id === item.id ? { ...current, label: event.target.value } : current))} />
    <button type="button" aria-label={`删除${title} ${index + 1}`} disabled={items.length <= minimum} onClick={() => onChange(items.filter((current) => current.id !== item.id))}><Icon name="trash" /></button>
  </div>)}</div><button className="survey-add-item" type="button" onClick={() => onChange([...items, { id: uid("i"), label: `${title} ${items.length + 1}` }])}><Icon name="plus" />添加{title}</button></div>;
}

function QuestionEditor({ question, questions, surveyKind, index, total, onChange, onDelete, onCopy, onMove }: { question: SurveyQuestion; questions: SurveyQuestion[]; surveyKind: SurveyKind; index: number; total: number; onChange: (question: SurveyQuestion) => void; onDelete: () => void; onCopy: () => void; onMove: (offset: number) => void }) {
  const logicSources = questions.slice(0, index).filter((item): item is Extract<SurveyQuestion, { type: "single" | "multiple" }> => item.type === "single" || item.type === "multiple");
  function changeType(type: QuestionType) {
    const fresh = blankQuestion(type);
    onChange({ ...fresh, id: question.id, title: question.title, description: type === "heading" ? "" : question.description, required: type === "heading" ? false : question.required, logic: type === "heading" ? null : question.logic, points: type === "heading" ? 0 : question.points } as SurveyQuestion);
  }
  function setLogicSource(sourceQuestionId: string) {
    if (!sourceQuestionId) { onChange({ ...question, logic: null }); return; }
    const source = logicSources.find((item) => item.id === sourceQuestionId);
    const firstOptionId = source?.options[0]?.id || (source?.allowOther ? "__other" : "");
    onChange({ ...question, logic: firstOptionId ? { sourceQuestionId, optionIds: [firstOptionId] } : null });
  }
  function toggleLogicOption(optionId: string, checked: boolean) {
    if (!question.logic) return;
    const current = question.logic.optionIds?.length ? question.logic.optionIds : question.logic.optionId ? [question.logic.optionId] : [];
    const optionIds = checked ? [...new Set([...current, optionId])] : current.filter((item) => item !== optionId);
    onChange({ ...question, logic: optionIds.length ? { sourceQuestionId: question.logic.sourceQuestionId, optionIds } : null });
  }
  function toggleCorrect(optionId: string, checked: boolean) {
    if (question.type !== "single" && question.type !== "multiple") return;
    onChange({ ...question, correctOptionIds: question.type === "single" ? (checked ? [optionId] : []) : checked ? [...new Set([...question.correctOptionIds, optionId])] : question.correctOptionIds.filter((item) => item !== optionId) });
  }
  return <article className="survey-question-editor">
    <header><b>第 {index + 1} 题</b><div><button type="button" disabled={index === 0} onClick={() => onMove(-1)}>上移</button><button type="button" disabled={index === total - 1} onClick={() => onMove(1)}>下移</button><button type="button" onClick={onCopy}>复制</button><button className="danger" type="button" onClick={onDelete}><Icon name="trash" />删除</button></div></header>
    <div className="survey-question-basics">
      <label><span>题型</span><select value={question.type} onChange={(event) => changeType(event.target.value as QuestionType)}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="survey-question-title"><span>{question.type === "heading" ? "标题文字" : "题目"}</span><input value={question.title} maxLength={300} placeholder={question.type === "heading" ? "输入分段标题" : "输入题目"} onChange={(event) => onChange({ ...question, title: event.target.value })} /></label>
      {question.type !== "heading" && <label className="survey-toggle"><input type="checkbox" checked={question.required} onChange={(event) => onChange({ ...question, required: event.target.checked })} /><span>必答</span></label>}
    </div>
    {question.type !== "heading" && <SurveyRichEditor compact label="问题描述（选填）" placeholder="帮助填写者理解问题……" value={question.description} onChange={(description) => onChange({ ...question, description })} />}
    {(question.type === "single" || question.type === "multiple") && <div className="survey-choice-settings"><ItemEditor title="选项" minimum={2} items={question.options} onChange={(options) => onChange({ ...question, options, correctOptionIds: question.correctOptionIds.filter((id) => options.some((option) => option.id === id)) })} /><div className="survey-inline-toggles"><label><input type="checkbox" checked={question.allowOther} onChange={(event) => onChange({ ...question, allowOther: event.target.checked, otherRequired: event.target.checked && question.otherRequired })} />添加“其他”选项</label><label><input type="checkbox" disabled={!question.allowOther} checked={question.otherRequired} onChange={(event) => onChange({ ...question, otherRequired: event.target.checked })} />选“其他”后必须填写</label>{surveyKind === "exam" && <div className="survey-answer-key"><span>正确答案</span>{question.options.map((option) => <label key={option.id}><input type={question.type === "single" ? "radio" : "checkbox"} name={`correct-${question.id}`} checked={question.correctOptionIds.includes(option.id)} onChange={(event) => toggleCorrect(option.id, event.target.checked)} />{option.label}</label>)}</div>}</div></div>}
    {(question.type === "matrix_single" || question.type === "matrix_multiple") && <div className="survey-matrix-settings"><ItemEditor title="矩阵行" items={question.rows} onChange={(rows) => onChange({ ...question, rows })} /><ItemEditor title="矩阵列" minimum={2} items={question.columns} onChange={(columns) => onChange({ ...question, columns })} /></div>}
    {question.type === "short_text" && <div className="survey-short-settings"><label><span>字段类型</span><select value={question.textType} onChange={(event) => onChange({ ...question, textType: event.target.value as ShortTextType })}>{Object.entries(textTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>最多字数</span><input type="number" min={1} max={5000} value={question.maxLength} onChange={(event) => onChange({ ...question, maxLength: Number(event.target.value) })} /></label>{question.textType === "digits_fixed" && <label><span>固定位数</span><input type="number" min={1} max={64} value={question.fixedDigits} onChange={(event) => onChange({ ...question, fixedDigits: Number(event.target.value) })} /></label>}{surveyKind === "exam" && <><label><span>评分方式</span><select value={question.scoringMode} onChange={(event) => onChange({ ...question, scoringMode: event.target.value as ShortTextScoringMode, correctAnswer: event.target.value === "manual" ? "" : question.correctAnswer })}>{Object.entries(scoringModeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{question.scoringMode !== "manual" && <label><span>{question.scoringMode === "contains" ? "需包含的字段" : "正确答案"}</span><input value={question.correctAnswer} maxLength={5000} onChange={(event) => onChange({ ...question, correctAnswer: event.target.value })} /></label>}</>}</div>}
    {question.type === "personal_info" && <div className="survey-short-settings"><label><span>个人信息类型</span><select value={question.infoType} onChange={(event) => onChange({ ...question, infoType: event.target.value as PersonalInfoType })}>{Object.entries(personalInfoLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>最多字数</span><input type="number" min={1} max={500} value={question.maxLength} onChange={(event) => onChange({ ...question, maxLength: Number(event.target.value) })} /></label></div>}
    {question.type === "file" && <div className="survey-short-settings"><label><span>单个文件上限（MB）</span><input type="number" min={1} max={100} value={question.maxSizeMb} onChange={(event) => onChange({ ...question, maxSizeMb: Number(event.target.value) })} /></label><p>填写者每题可上传 1 个文件，系统硬上限为 100 MB；考试中的文件题由管理员人工评分。</p></div>}
    {surveyKind === "exam" && (question.type === "single" || question.type === "multiple" || question.type === "short_text" || question.type === "file") && <div className="survey-score-settings"><label><span>本题分数</span><input type="number" min={0} max={1000} value={question.points} onChange={(event) => onChange({ ...question, points: Number(event.target.value) })} /></label><small>{question.type === "file" ? "文件题将在答卷报表中人工评分；设为 0 时不计分。" : "设为 0 时不计分。"}</small></div>}
    {question.type !== "heading" && <div className="survey-logic-settings"><label><span>条件显示</span><select value={question.logic?.sourceQuestionId || ""} onChange={(event) => setLogicSource(event.target.value)}><option value="">始终显示</option>{logicSources.map((source) => <option key={source.id} value={source.id}>根据“{source.title || "未命名题目"}”显示</option>)}</select></label>{question.logic && (() => { const source = logicSources.find((item) => item.id === question.logic?.sourceQuestionId); const selected = question.logic.optionIds?.length ? question.logic.optionIds : question.logic.optionId ? [question.logic.optionId] : []; return source ? <fieldset><legend>选择任一以下选项时显示（可多选）</legend>{[...source.options, ...(source.allowOther ? [{ id: "__other", label: "其他" }] : [])].map((option) => <label key={option.id}><input type="checkbox" checked={selected.includes(option.id)} onChange={(event) => toggleLogicOption(option.id, event.target.checked)} />{option.label}</label>)}</fieldset> : null; })()}<small>仅可引用前面的选择题；所选条件满足任意一个即显示。</small></div>}
  </article>;
}

export default function SurveyManager() {
  const [items, setItems] = useState<Survey[]>([]);
  const [draft, setDraft] = useState<(SurveyInput & { id?: string; responseCount?: number }) | null>(null);
  const [addType, setAddType] = useState<QuestionType>("single");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const selected = draft?.id ? items.find((item) => item.id === draft.id) : null;

  useEffect(() => { fetch("/api/admin/surveys", { cache: "no-store" }).then(async (response) => { const result = await response.json() as { surveys?: Survey[]; error?: string }; if (!response.ok) throw new Error(result.error || "问卷加载失败"); setItems(result.surveys || []); }).catch((error) => setMessage(error instanceof Error ? error.message : "问卷加载失败")).finally(() => setLoading(false)); }, []);

  function open(item: Survey) { setDraft({ id: item.id, slug: item.slug, title: item.title, description: item.description, status: item.status, access: item.access, kind: item.kind || "standard", queryEnabled: item.queryEnabled === true, durationMinutes: item.durationMinutes || 60, examInstructions: item.examInstructions || "<h2>考试说明</h2><p>点击开始后立即计时，中途退出不会暂停。</p>", examStartAt: item.examStartAt || 0, queryIdentityQuestionId: item.queryIdentityQuestionId || "", ipLimit: item.ipLimit, submitLabel: item.submitLabel, successMode: item.successMode, successContent: item.successContent, successRedirectUrl: item.successRedirectUrl, questions: structuredClone(item.questions), responseCount: item.responseCount }); setMessage(""); }
  function updateQuestion(index: number, question: SurveyQuestion) {
    setDraft((current) => {
      if (!current) return current;
      const validOptions = question.type === "single" || question.type === "multiple" ? new Set([...question.options.map((item) => item.id), ...(question.allowOther ? ["__other"] : [])]) : null;
      return { ...current, questions: current.questions.map((item, position) => {
        if (position === index || item.logic?.sourceQuestionId !== question.id) return position === index ? question : item;
        if (!validOptions) return { ...item, logic: null };
        const optionIds = (item.logic.optionIds?.length ? item.logic.optionIds : item.logic.optionId ? [item.logic.optionId] : []).filter((optionId) => validOptions.has(optionId));
        return { ...item, logic: optionIds.length ? { sourceQuestionId: question.id, optionIds } : null };
      }) };
    });
  }
  function moveQuestion(index: number, offset: number) {
    setDraft((current) => {
      if (!current) return current;
      const questions = [...current.questions]; const [question] = questions.splice(index, 1); questions.splice(index + offset, 0, question);
      return { ...current, questions: questions.map((item, position) => { if (!item.logic) return item; const sourceIndex = questions.findIndex((source) => source.id === item.logic!.sourceQuestionId); return sourceIndex < position ? item : { ...item, logic: null }; }) };
    });
  }

  async function save() {
    if (!draft) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(draft.id ? `/api/admin/surveys/${draft.id}` : "/api/admin/surveys", { method: draft.id ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) });
      const result = await response.json() as { survey?: Survey; error?: string };
      if (!response.ok || !result.survey) throw new Error(result.error || "保存失败");
      setItems((current) => draft.id ? current.map((item) => item.id === result.survey!.id ? result.survey! : item) : [result.survey!, ...current]);
      open(result.survey); setMessage(draft.status === "published" ? "问卷已发布" : "问卷已保存");
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存失败"); } finally { setBusy(false); }
  }

  async function remove() {
    if (!draft?.id || !confirm("删除问卷会同时删除全部答卷，且无法恢复。确定删除？")) return;
    setBusy(true); setMessage("");
    try { const response = await fetch(`/api/admin/surveys/${draft.id}`, { method: "DELETE" }); if (!response.ok) throw new Error("删除失败"); setItems((current) => current.filter((item) => item.id !== draft.id)); setDraft(null); setMessage("问卷已删除"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "删除失败"); } finally { setBusy(false); }
  }

  async function copyLink() { if (!draft) return; await navigator.clipboard.writeText(`${location.origin}/surveys/${draft.slug}`); setMessage("公开链接已复制"); }

  return <section className="admin-survey-manager" aria-labelledby="survey-manager-title">
    <header><div><h2 id="survey-manager-title">问卷与答卷</h2><span>创建题目、控制 IP 次数、发布并下载 CSV 报表。</span></div><button type="button" onClick={() => { setDraft(blankSurvey()); setMessage(""); }}><Icon name="plus" />新建问卷</button></header>
    <div className="admin-survey-layout">
      <aside className="admin-survey-list" aria-label="问卷列表">{loading ? <p>正在加载问卷…</p> : items.length ? items.map((item) => <button type="button" className={draft?.id === item.id ? "is-active" : ""} key={item.id} onClick={() => open(item)}><span className={`survey-status status-${item.status}`}>{item.status === "published" ? "收集中" : item.status === "closed" ? "已结束" : "草稿"}</span><b>{item.title}</b><small>{item.responseCount} 份答卷 · {new Date(item.updatedAt).toLocaleDateString("zh-CN")}</small></button>) : <p>还没有问卷。</p>}</aside>
      {draft ? <div className="survey-builder">
        <div className="survey-kind-selector"><span>问卷类型</span><div>{Object.entries(surveyKindLabels).map(([value, label]) => <button type="button" className={draft.kind === value ? "is-active" : ""} key={value} onClick={() => setDraft({ ...draft, kind: value as SurveyKind, durationMinutes: value === "exam" ? draft.durationMinutes || 60 : 0 })}>{label}<small>{value === "standard" ? "收集常规答卷" : "计时与评分，成绩可通过配套查询反馈"}</small></button>)}</div></div>
        <section className="survey-query-companion"><label className="survey-toggle"><input type="checkbox" checked={draft.queryEnabled} onChange={(event) => setDraft({ ...draft, queryEnabled: event.target.checked, queryIdentityQuestionId: event.target.checked ? draft.queryIdentityQuestionId : "" })} /><span>开启配套结果查询与管理员反馈</span></label><small>提交者可在本问卷的查询页查看管理员填写的反馈；考试成绩只会在反馈发布后显示。</small></section>
        <div className="survey-meta-fields"><label><span>问卷标题</span><input value={draft.title} maxLength={120} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label><span>公开地址</span><div className="survey-slug"><span>/surveys/</span><input value={draft.slug} maxLength={64} onChange={(event) => setDraft({ ...draft, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} /></div></label><label className="survey-meta-description"><span>问卷说明</span><textarea value={draft.description} maxLength={2000} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label><label><span>访问权限</span><select value={draft.access} onChange={(event) => setDraft({ ...draft, access: event.target.value as SurveyInput["access"], queryIdentityQuestionId: event.target.value === "registered" ? "" : draft.queryIdentityQuestionId })}><option value="public">允许全局访问</option><option value="registered">仅允许注册用户</option></select></label><label><span>每个 IP 最多作答</span><input type="number" min={1} max={1000} value={draft.ipLimit} onChange={(event) => setDraft({ ...draft, ipLimit: Number(event.target.value) })} /></label><label><span>状态</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as SurveyInput["status"] })}><option value="draft">草稿</option><option value="published">发布 / 收集答卷</option><option value="closed">结束收集</option></select></label>{draft.kind === "exam" && <><label><span>作答时间（分钟）</span><input type="number" min={1} max={1440} value={draft.durationMinutes} onChange={(event) => setDraft({ ...draft, durationMinutes: Number(event.target.value) })} /></label><label><span>开放时间（可选）</span><input type="datetime-local" value={localDateTime(draft.examStartAt)} onChange={(event) => setDraft({ ...draft, examStartAt: event.target.value ? new Date(event.target.value).getTime() : 0 })} /></label></>}{draft.queryEnabled && draft.access === "public" && <label><span>查询核验题</span><select value={draft.queryIdentityQuestionId} onChange={(event) => setDraft({ ...draft, queryIdentityQuestionId: event.target.value })}><option value="">请选择必答个人信息题</option>{draft.questions.filter((question) => question.type === "personal_info" && question.required && !question.logic && (question.infoType === "email" || question.infoType === "student_id" || question.infoType === "id_card")).map((question) => <option value={question.id} key={question.id}>{question.title || "未命名个人信息题"}</option>)}</select></label>}<label><span>提交按钮文字</span><input value={draft.submitLabel} maxLength={40} onChange={(event) => setDraft({ ...draft, submitLabel: event.target.value })} /></label><label><span>提交后动作</span><select value={draft.successMode} onChange={(event) => setDraft({ ...draft, successMode: event.target.value as SurveyInput["successMode"] })}><option value="message">显示自定义内容</option><option value="redirect">跳转到指定网址</option></select></label>{draft.successMode === "redirect" && <label className="survey-meta-description"><span>跳转网址</span><input value={draft.successRedirectUrl} maxLength={2000} placeholder="/目标页面 或 https://example.com" onChange={(event) => setDraft({ ...draft, successRedirectUrl: event.target.value })} /></label>}</div>
        {draft.kind === "exam" && <SurveyRichEditor label="考试说明（候场页显示）" value={draft.examInstructions} onChange={(examInstructions) => setDraft({ ...draft, examInstructions })} />}
        {draft.successMode === "message" && <SurveyRichEditor value={draft.successContent} onChange={(successContent) => setDraft({ ...draft, successContent })} />}
        <div className="survey-question-list">{draft.questions.map((question, index) => <QuestionEditor key={question.id} question={question} questions={draft.questions} surveyKind={draft.kind} index={index} total={draft.questions.length} onChange={(next) => updateQuestion(index, next)} onMove={(offset) => moveQuestion(index, offset)} onCopy={() => setDraft({ ...draft, questions: [...draft.questions.slice(0, index + 1), cloneQuestion(question), ...draft.questions.slice(index + 1)] })} onDelete={() => setDraft({ ...draft, questions: draft.questions.filter((_, position) => position !== index).map((item) => item.logic?.sourceQuestionId === question.id ? { ...item, logic: null } : item) })} />)}</div>
        <div className="survey-add-question"><select aria-label="新题型" value={addType} onChange={(event) => setAddType(event.target.value as QuestionType)}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button type="button" onClick={() => setDraft({ ...draft, questions: [...draft.questions, blankQuestion(addType)] })}><Icon name="plus" />添加题目</button></div>
        {message && <p className="survey-message" role="status">{message}</p>}
        <footer>{draft.id && <button className="danger" type="button" disabled={busy} onClick={remove}>删除问卷</button>}<div>{draft.id && <a href={`/admin/surveys/${draft.id}/results`}>在线查看报表</a>}{draft.id && <a href={`/api/admin/surveys/${draft.id}/report`}>下载 CSV（{selected?.responseCount ?? draft.responseCount ?? 0}）</a>}{draft.id && <button className="button-quiet" type="button" onClick={copyLink}>复制公开链接</button>}{draft.id && draft.status !== "draft" && <a className="survey-preview-link" href={`/surveys/${draft.slug}`} target="_blank" rel="noreferrer">打开问卷 <ArrowIcon direction="up-right" /></a>}<button className="survey-save" type="button" disabled={busy} onClick={save}>{busy ? "保存中…" : draft.status === "published" ? "保存并发布" : "保存问卷"}</button></div></footer>
      </div> : <div className="admin-survey-empty"><Icon name="table" /><b>选择或新建问卷</b><span>支持单选、多选、矩阵与字段校验。</span></div>}
    </div>
  </section>;
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeRollCall, parseNames } from "../../../lib/roll-call";
import type { RollCallConfig, RollCallRecord } from "../../../lib/roll-call";

const initial: RollCallConfig = { title: "我的花名册", names: [], required: [], count: 1, cursor: 0, mode: "random", drawn: [], revision: 0 };
const endpoint = "/api/roll-call";
class ApiError extends Error { status: number; constructor(message: string, status: number) { super(message); this.status = status; } }
async function api<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new ApiError(result.error || "请求失败，请稍后重试", response.status);
  return result;
}
function download(records: RollCallRecord[]) {
  const blob = new Blob([JSON.stringify({ version: 1, records }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob); const link = document.createElement("a");
  link.href = url; link.download = "点名历史.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function dateTime(time: number) { return new Date(time).toLocaleString("zh-CN"); }

export default function RollCall() {
  const [config, setConfig] = useState(initial);
  const [namesText, setNamesText] = useState("");
  const [requiredText, setRequiredText] = useState("");
  const [lists, setLists] = useState<RollCallConfig[]>([]);
  const [records, setRecords] = useState<RollCallRecord[]>([]);
  const [result, setResult] = useState<RollCallRecord | null>(null);
  const [tab, setTab] = useState<"draw" | "history">("draw");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [historyError, setHistoryError] = useState("");
  const [pending, setPending] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleClicks = useRef({ count: 0, time: 0 });
  const pendingDraw = useRef<{ requestId: string; config: RollCallConfig } | null>(null);
  const lock = useRef(false);
  const historyRequest = useRef(0);
  const uploadInput = useRef<HTMLInputElement>(null);

  const readLists = useCallback(async () => {
    const data = await api<{ lists: RollCallConfig[] }>(endpoint + "?view=lists"); setLists(data.lists);
  }, []);
  useEffect(() => {
    void readLists().catch((error) => setMessage(error.message));
    const key = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.code === "KeyM") { event.preventDefault(); dialog.current?.showModal(); }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [readLists]);

  function loadConfig(value: RollCallConfig) {
    setConfig(value); setNamesText(value.names.join("\n")); setRequiredText(value.required.join("\n")); setResult(null);
  }
  function currentConfig() {
    return normalizeRollCall({ ...config, names: parseNames(namesText), required: parseNames(requiredText) });
  }
  async function run(task: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage("");
    try { await task(); } catch (error) { setMessage(error instanceof Error ? error.message : "操作失败"); }
    finally { lock.current = false; setBusy(false); }
  }
  async function draw() {
    await run(async () => {
      const request = pendingDraw.current ?? { requestId: crypto.randomUUID(), config: currentConfig() };
      pendingDraw.current = request; setPending(true);
      let data: { record: RollCallRecord };
      try { data = await api<{ record: RollCallRecord }>(endpoint, { action: "draw", ...request }); }
      catch (error) { if (error instanceof ApiError && error.status < 500) { pendingDraw.current = null; setPending(false); } throw error; }
      const record = data.record;
      pendingDraw.current = null; setPending(false); setResult(record);
      const next = { ...request.config, revision: record.revision + 1, cursor: record.nextCursor, drawn: record.mode === "random" ? [...record.drawn, ...record.results] : record.drawn };
      setConfig(next);
      setLists((current) => [next, ...current.filter((list) => list.title !== next.title)]);
      setMessage("本次点名和进度已保存");
    });
  }
  async function save() {
    await run(async () => { const next = currentConfig(); const saved = await api<{ config: RollCallConfig }>(endpoint, { action: "save", config: next }); setConfig(saved.config); await readLists(); setMessage("名单与设置已保存"); });
  }
  async function restart() {
    if (!window.confirm("开启新一轮？已点到的人会重新进入候选，历史记录保留。")) return;
    await run(async () => {
      const next = { ...currentConfig(), cursor: 0, drawn: [] };
      const saved = await api<{ config: RollCallConfig }>(endpoint, { action: "save", config: next }); setConfig(saved.config); setResult(null); await readLists(); setMessage("已开启新一轮");
    });
  }
  async function importNames(file: File, target: "names" | "required") {
    await run(async () => {
      if (file.size > 512 * 1024) throw new Error("名单文件最大 512 KB");
      const text = await file.text();
      const parsed = parseNames(file.name.toLowerCase().endsWith(".json") ? JSON.parse(text.replace(/^\uFEFF/, "")) : text);
      if (target === "names") { setNamesText(parsed.join("\n")); setConfig((current) => ({ ...current, names: parsed, drawn: [], cursor: 0 })); }
      else { setRequiredText(parsed.join("\n")); setConfig((current) => ({ ...current, required: parsed, cursor: 0 })); }
      setMessage(`已导入 ${parsed.length} 人，请保存设置`);
    });
  }
  async function history(nextPage = 1) {
    const request = ++historyRequest.current;
    setLoading(true); setHistoryError("");
    try {
      const params = new URLSearchParams({ q: query, page: String(nextPage) });
      if (from) params.set("from", String(new Date(from + "T00:00:00").getTime()));
      if (to) params.set("to", String(new Date(to + "T23:59:59.999").getTime()));
      const data = await api<{ records: RollCallRecord[]; total: number; page: number }>(endpoint + "?" + params);
      if (historyRequest.current === request) { setRecords(data.records); setTotal(data.total); setPage(data.page); }
    } catch (error) { if (historyRequest.current === request) setHistoryError(error instanceof Error ? error.message : "历史加载失败"); }
    finally { if (historyRequest.current === request) setLoading(false); }
  }
  async function importHistory(file: File) {
    await run(async () => {
      if (file.size > 2 * 1024 * 1024) throw new Error("历史文件最大 2 MB");
      const data = await api<{ imported: number }>(endpoint, { action: "import", data: JSON.parse((await file.text()).replace(/^\uFEFF/, "")) });
      setMessage(`已导入 ${data.imported} 条历史记录`); await history();
    });
  }
  function reuse(record: RollCallRecord, onlyResults: boolean) {
    const next: RollCallConfig = onlyResults
      ? { ...initial, title: record.title + " · 已点名单", names: record.results, count: 1 }
      : { title: record.title, names: record.names, required: record.required, mode: record.mode, count: record.count, revision: lists.find((list) => list.title === record.title)?.revision ?? 0, cursor: record.nextCursor, drawn: record.mode === "random" ? [...record.drawn, ...record.results] : record.drawn };
    loadConfig(next); setTab("draw"); setMessage(onlyResults ? "已将本次结果导入花名册，保存后可复用" : "已恢复本次点名后的名单和进度，可继续点名或开启新一轮");
  }
  const remaining = config.mode === "preset" ? config.required.length - config.cursor : config.names.length - config.drawn.length;
  const disabled = busy || pending;

  return <section className="roll-call shell">
    <header className="roll-call-head"><p>ROLL CALL / 06</p><h1><button type="button" onClick={() => {
      const now = Date.now(); const clicks = titleClicks.current;
      clicks.count = now - clicks.time < 1500 ? clicks.count + 1 : 1; clicks.time = now;
      if (clicks.count >= 5) { clicks.count = 0; dialog.current?.showModal(); }
    }}>今天，轮到谁？</button></h1><p>把名字交给点名器，把每一次相遇留在历史里。</p></header>
    <div className="roll-call-tabs"><button type="button" aria-pressed={tab === "draw"} onClick={() => setTab("draw")}>开始点名</button><button type="button" aria-pressed={tab === "history"} onClick={() => { setTab("history"); void history(); }}>历史记录</button><a href="/login">登录账户</a></div>
    {message && <p className="roll-call-message" role="status">{message}</p>}
    {pending && !busy && <p role="alert">请求结果尚未确认。请点击“重试本次点名”，同一次请求不会重复保存。<button type="button" onClick={() => { pendingDraw.current = null; setPending(false); setMessage("已解除重试状态；请先查询历史并恢复最新进度，再继续点名。"); }}>解除重试状态</button></p>}
    {tab === "draw" ? <div className="roll-call-layout"><section className="roll-call-panel">
      <h2>我的花名册</h2><fieldset disabled={disabled}>
      <label>读取已保存名单<select defaultValue="" onChange={(event) => { const list = lists.find((item) => item.title === event.target.value); if (list) loadConfig(list); event.target.value = ""; }}><option value="">选择一份名单</option>{lists.map((list) => <option key={list.title} value={list.title}>{list.title}</option>)}</select></label>
      <label>名单名称<input value={config.title} maxLength={100} onChange={(event) => setConfig({ ...config, title: event.target.value })} /></label>
      <label>姓名（每行一人）<textarea rows={9} value={namesText} placeholder={"张三\n李四\n王五"} onChange={(event) => { setNamesText(event.target.value); setConfig({ ...config, cursor: 0, drawn: [] }); }} /></label>
      <label className="roll-call-file">导入 TXT / CSV / JSON<input type="file" accept=".txt,.csv,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importNames(file, "names"); event.target.value = ""; }} /></label>
      <small>支持换行、逗号、顿号分隔；自动去重。同名请添加学号区分。每份最多 1000 人。</small>
      <button type="button" onClick={() => void save()}>保存名单</button></fieldset>
    </section><section className="roll-call-stage"><div className="roll-call-stage-top"><span>{config.title}</span><small>本轮剩余 {Math.max(0, remaining)} 人</small></div>
      <div className="roll-call-results" aria-live="polite" aria-busy={busy}>{result ? <ol>{result.results.map((name) => <li key={name}>{name}</li>)}</ol> : <div className="roll-call-empty"><b>?</b><span>准备好，下一位就是你</span></div>}</div>
      <label>本次点名人数<input type="number" min={1} max={1000} value={config.count} disabled={disabled} onChange={(event) => setConfig({ ...config, count: Number(event.target.value) })} /></label>
      <button className="roll-call-primary" type="button" disabled={busy} onClick={() => void draw()}>{busy ? "正在处理…" : pending ? "重试本次点名" : "开始点名"}</button><button type="button" disabled={disabled} onClick={() => void restart()}>开启新一轮</button><small>本轮不重复点名 · 名单用完后手动重开</small>
    </section></div> : <section className="roll-call-panel roll-call-history"><header><h2>点名历史</h2><div><button type="button" disabled={busy} onClick={() => uploadInput.current?.click()}>导入历史 JSON</button><button type="button" disabled={!records.length || loading} onClick={() => download(records)}>导出本页</button><input ref={uploadInput} type="file" accept=".json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importHistory(file); event.target.value = ""; }} /></div></header>
      <form className="roll-call-filters" onSubmit={(event) => { event.preventDefault(); void history(); }}><label>搜索<input value={query} maxLength={100} placeholder="名单名称或姓名" onChange={(event) => setQuery(event.target.value)} /></label><label>开始日期<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>结束日期<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><button type="submit" disabled={loading}>查询</button></form>
      {historyError && <p role="alert">{historyError}</p>}{loading ? <p role="status">正在查询…</p> : !records.length ? <p>暂无记录。登录后点名会自动保存，也可以导入之前导出的历史。</p> : <div className="roll-call-history-list">{records.map((record) => <article key={record.id}><header><h3>{record.title}</h3><time dateTime={new Date(record.createdAt).toISOString()}>{dateTime(record.createdAt)}</time></header><p>{record.mode === "preset" ? "内定顺序" : "随机点名"} · {record.count} 人{record.source === "import" ? " · 文件导入" : ""}</p><ol>{record.results.map((name) => <li key={name}>{name}</li>)}</ol><footer><button type="button" disabled={disabled} onClick={() => reuse(record, false)}>恢复名单与进度</button><button type="button" disabled={disabled} onClick={() => reuse(record, true)}>导入已点名单</button><button type="button" onClick={() => download([record])}>导出记录</button></footer></article>)}</div>}
      <footer className="roll-call-pagination"><span>共 {total} 条 · 第 {page} / {Math.max(1, Math.ceil(total / 20))} 页</span><button type="button" disabled={loading || page <= 1} onClick={() => void history(page - 1)}>上一页</button><button type="button" disabled={loading || page * 20 >= total} onClick={() => void history(page + 1)}>下一页</button></footer>
    </section>}
    <dialog ref={dialog} className="roll-call-settings" aria-labelledby="roll-call-settings-title"><header><h2 id="roll-call-settings-title">点名设置</h2><button type="button" onClick={() => dialog.current?.close()}>关闭</button></header>{message && <p role="status">{message}</p>}<fieldset disabled={disabled}><label>点名模式<select value={config.mode} onChange={(event) => setConfig({ ...config, mode: event.target.value as "random" | "preset" })}><option value="random">随机点名</option><option value="preset">内定点名（仅指定名单，按顺序）</option></select></label><label>指定名单与顺序（每行一人）<textarea rows={8} value={requiredText} onChange={(event) => { setRequiredText(event.target.value); setConfig({ ...config, cursor: 0 }); }} /></label><label>导入指定名单<input type="file" accept=".txt,.csv,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importNames(file, "required"); event.target.value = ""; }} /></label><p>内定模式只点这份名单中的人，严格按从上到下的顺序，本轮已取出 {config.cursor} 人。随机模式使用完整花名册，本轮不重复。修改名单会重置相应进度。</p><button type="button" onClick={() => void save()}>保存设置</button></fieldset></dialog>
  </section>;
}

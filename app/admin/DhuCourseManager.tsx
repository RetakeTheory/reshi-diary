"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DhuTask } from "../../lib/dhu-course";
import styles from "./DhuCourseManager.module.css";

type Status = {
  tasks: DhuTask[];
  schoolSession: { savedAt: number; coursePageUrl: string } | null;
  login: { liveUrl: string; expiresAt: number } | null;
};

const empty: Status = { tasks: [], schoolSession: null, login: null };
const labels: Record<DhuTask["status"], string> = {
  scheduled: "等待执行", watching: "监听中", needs_login: "需重新登录", submitted: "已提交待核实",
  success: "报名成功", failed: "未报名", cancelled: "已取消",
};

function when(timestamp: number) { return new Date(timestamp).toLocaleString("zh-CN", { hour12: false }); }

async function request(action?: string, payload?: Record<string, unknown>) {
  const response = await fetch("/api/appoint", {
    method: action ? "POST" : "GET", credentials: "same-origin", cache: "no-store",
    headers: action ? { "Content-Type": "application/json" } : undefined,
    body: action ? JSON.stringify({ action, ...payload }) : undefined,
  });
  const result = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(String(result.error || "操作失败"));
  return result;
}

export default function DhuCourseManager() {
  const [status, setStatus] = useState<Status>(empty);
  const [courseCode, setCourseCode] = useState("");
  const [sectionNumber, setSectionNumber] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [buyMaterial, setBuyMaterial] = useState<boolean | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const known = useRef<Record<string, DhuTask["status"]>>({});

  const refresh = useCallback(async () => {
    const next = await request() as Status;
    for (const task of next.tasks) {
      if (known.current[task.id] && known.current[task.id] !== "success" && task.status === "success") setToast(`${task.courseCode} / ${task.sectionNumber} 报名成功`);
      known.current[task.id] = task.status;
    }
    setStatus(next);
    setNow(Date.now());
  }, []);

  useEffect(() => {
    queueMicrotask(() => { void refresh().catch((cause) => setError(cause.message)); });
    const timer = window.setInterval(() => { void refresh().catch(() => undefined); }, 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function act(action: string, payload?: Record<string, unknown>) {
    setBusy(true); setError("");
    try { await request(action, payload); await refresh(); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败"); return false; }
    finally { setBusy(false); }
  }

  const planned = new Date(scheduledAt).getTime();
  const canPreview = /^\d{6,12}$/.test(courseCode.trim()) && /^\d{6,12}$/.test(sectionNumber.trim())
    && Number.isFinite(planned) && planned > now + 30_000 && buyMaterial !== null;

  return <div className={styles.root}>
    <div className={styles.intro}>
      <h2>东华大学课程预约</h2>
      <p>在本站完成设置；学校登录与企业微信验证仍由学校页面处理。预约前请先在下方窗口打开目标课程类别列表。</p>
      <p className={styles.notice}>学校会话会过期；系统发现过期后暂停提交并提示重新验证。后端浏览器操作仍可能被学校识别或限制，无法保证名额或精确到毫秒。预约记录与本机浏览器关联，请不要在预约结束前清除本站 Cookie。</p>
    </div>

    <section className={styles.card}>
      <div className={styles.sectionHead}><h3>学校登录</h3><span className={status.schoolSession ? styles.good : styles.warn}>{status.schoolSession ? `已保存 · ${when(status.schoolSession.savedAt)}` : "尚未保存"}</span></div>
      <p>先打开学校通行证，登录后完成学校弹出的企业微信验证，再进入所需课程类别的课程列表。整个过程不需要向本站提交学校密码或验证码。</p>
      <button type="button" disabled={busy} onClick={() => void act("startLogin")}>{status.schoolSession ? "重新验证学校登录" : "打开学校登录窗口"}</button>
      {status.login && <div className={styles.live}>
        <iframe src={status.login.liveUrl} title="学校登录与选课页面" referrerPolicy="no-referrer" />
        <div className={styles.liveFoot}><span>完成验证并打开课程列表后，点击保存登录状态。</span><button type="button" disabled={busy} onClick={() => void act("finishLogin")}>保存登录状态</button></div>
      </div>}
      {status.schoolSession && <small>当前课程类别页面：{status.schoolSession.coursePageUrl}</small>}
    </section>

    <section className={styles.card}>
      <h3>添加课程</h3>
      <form onSubmit={(event) => { event.preventDefault(); if (canPreview) setConfirm(true); }} className={styles.form}>
        <label>课程编号<input inputMode="numeric" pattern="[0-9]{6,12}" value={courseCode} onChange={(event) => setCourseCode(event.target.value)} placeholder="例如 030158" required /></label>
        <label>选课序号<input inputMode="numeric" pattern="[0-9]{6,12}" value={sectionNumber} onChange={(event) => setSectionNumber(event.target.value)} placeholder="例如 288755" required /></label>
        <label>开始报名时间<input type="datetime-local" step="1" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} required /></label>
        <fieldset><legend>是否选教材</legend><label><input type="radio" name="material" checked={buyMaterial === true} onChange={() => setBuyMaterial(true)} /> 需要教材</label><label><input type="radio" name="material" checked={buyMaterial === false} onChange={() => setBuyMaterial(false)} /> 不需要教材</label></fieldset>
        <button type="submit" disabled={!canPreview || busy || !status.schoolSession}>核对报名信息</button>
      </form>
    </section>

    <section className={styles.card}>
      <h3>预约列表</h3>
      {status.tasks.length === 0 ? <p>还没有预约课程。</p> : <div className={styles.tasks}>{status.tasks.map((task) => <article key={task.id} className={styles.task}>
        <div><strong>{task.courseCode} · {task.sectionNumber}</strong><span className={task.status === "success" ? styles.good : task.status === "needs_login" || task.status === "failed" ? styles.warn : ""}>{labels[task.status]}</span></div>
        <small>{when(task.scheduledAt)} · {task.buyMaterial ? "需要教材" : "不需要教材"}</small>
        <p>{task.message}</p>
        {["scheduled", "watching", "needs_login"].includes(task.status) && <button type="button" disabled={busy} onClick={() => void act("cancelTask", { id: task.id })}>取消预约</button>}
      </article>)}</div>}
    </section>

    {confirm && <div className={styles.scrim} role="presentation"><div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="dhu-confirm-title">
      <h3 id="dhu-confirm-title">确认报名信息</h3>
      <p>课程编号：<b>{courseCode.trim()}</b></p><p>选课序号：<b>{sectionNumber.trim()}</b></p>
      <p>开始时间：<b>{when(planned)}</b></p><p>教材：<b>{buyMaterial ? "需要" : "不需要"}</b></p>
      <p>到点后系统会向学校提交该班次；最终以学校返回结果为准。</p>
      <div><button type="button" onClick={() => setConfirm(false)}>返回修改</button><button type="button" disabled={busy} onClick={async () => {
        if (await act("addTask", { courseCode: courseCode.trim(), sectionNumber: sectionNumber.trim(), scheduledAt: planned, buyMaterial })) setConfirm(false);
      }}>确认预约</button></div>
    </div></div>}
    {error && <div role="alert" className={styles.error}>{error}</div>}
    {toast && <div role="status" className={styles.toast}>{toast}</div>}
  </div>;
}

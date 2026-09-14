"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DhuCourseOption, DhuSectionOption, DhuSessionHealth, DhuSubmissionRecord, DhuTask } from "../../lib/dhu-course";
import type { DhuProtocolEvidence } from "../../lib/dhu-protocol";
import styles from "./DhuCourseManager.module.css";

type Status = {
  tasks: DhuTask[];
  courses: DhuCourseOption[];
  sections: DhuSectionOption[];
  schoolSession: { savedAt: number; coursePageUrl: string } | null;
  sessionHealth: DhuSessionHealth | null;
  submissionRecords: DhuSubmissionRecord[];
  submissionReady: boolean;
  protocolEvidence: DhuProtocolEvidence | null;
  login: { stage: "passport" | "mfa" | "verified" | "ready"; username: string | null } | null;
};
type MfaDiagnostic = {
  schoolError?: string;
  schoolStatus?: string; schoolType?: number; schoolSteps?: number;
  applicationParametersPresent?: boolean; applicationParametersMatch?: boolean;
  accountMatches?: boolean; sessionCookieCount?: number;
  methodAvailable: boolean | null; passwordRequired: boolean | null; captchaRequired?: boolean | null;
};

const empty: Status = { tasks: [], courses: [], sections: [], schoolSession: null, sessionHealth: null, submissionRecords: [], submissionReady: false, protocolEvidence: null, login: null };
const labels: Record<DhuTask["status"], string> = {
  scheduled: "等待执行", watching: "监听中", needs_login: "需重新登录", paused: "已暂停", submitted: "已提交待核实",
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
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [relogin, setRelogin] = useState(false);
  const [code, setCode] = useState("");
  const [buyMaterial, setBuyMaterial] = useState<boolean | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [testConfirm, setTestConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [diagnostic, setDiagnostic] = useState<MfaDiagnostic | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const known = useRef<Record<string, DhuTask["status"]>>({});
  const autoConnectAttempted = useRef("");

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

  useEffect(() => {
    const login = status.login;
    if (!login || login.stage === "passport" || login.stage === "mfa") { autoConnectAttempted.current = ""; return; }
    if (status.schoolSession) return;
    const key = `${login.username}:${login.stage}`;
    if (autoConnectAttempted.current === key) return;
    autoConnectAttempted.current = key;
    void act("openCoursePage");
  }, [status.login?.stage, status.login?.username, status.schoolSession]);

  async function inspectMfa() {
    setBusy(true); setError(""); setDiagnostic(null);
    try {
      const result = await request("inspectMfa") as { diagnostic: MfaDiagnostic };
      setDiagnostic(result.diagnostic);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "检查失败"); }
    finally { setBusy(false); }
  }

  async function runControlledSubmit() {
    setBusy(true); setError("");
    try {
      const result = await request("testSubmit") as { testResult: { outcome: string; message: string } };
      await refresh();
      setTestConfirm(false);
      setToast(result.testResult.outcome === "success"
        ? "学校返回选课成功；请到学校已选课程再次核对" : result.testResult.message);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "受控试提交失败"); }
    finally { setBusy(false); }
  }

  const planned = new Date(scheduledAt).getTime();
  const canPreview = /^\d{6,12}$/.test(courseCode.trim()) && /^\d{6,12}$/.test(sectionNumber.trim())
    && Number.isFinite(planned) && planned > now + 30_000 && buyMaterial !== null;
  const passportVerified = status.login?.stage === "mfa" || status.login?.stage === "verified" || status.login?.stage === "ready";

  return <div className={styles.root}>
    <div className={styles.intro}>
      <h2>东华大学课程预约</h2>
      <p>在本站填写学校通行证信息，再用学校发送的企业微信验证码完成验证。本站后端直接请求学校 webproxy 网址。</p>
      <p className={styles.notice}>学校会话保存在当前访问者的服务器会话中；账号状态和预约记录同步保存到 D1。学校要求重新认证时仍需本人输入验证码。请勿清除本站 Cookie，以免失去当前会话入口。</p>
    </div>

    <section className={styles.card}>
      <div className={styles.sectionHead}><h3>学校登录</h3><span className={status.schoolSession && !status.sessionHealth?.loginRequired ? styles.good : styles.warn}>{status.sessionHealth?.loginRequired ? "学校要求重新认证" : status.schoolSession ? `已连接 · ${when(status.schoolSession.savedAt)}` : status.login?.stage === "mfa" ? "等待企业微信验证码" : status.login?.stage === "verified" ? "验证码已通过，待核实课程页" : status.login?.stage === "ready" ? "已验证，待连接课程列表" : "尚未连接"}</span></div>
      <p>密码和验证码经本站传给学校认证接口，仅学校会话 Cookie 保存在当前访问者的独立会话中。本站不保存密码或验证码。</p>
      {passportVerified && !relogin ? <div className={styles.form}>
        <label>学校通行证账号<input value={status.login?.username || username} readOnly /></label>
        <label>学校通行证密码<input value="登录成功" readOnly /></label>
        <button type="button" disabled={busy} onClick={() => setRelogin(true)}>重新登录学校通行证</button>
      </div> : <form className={styles.form} onSubmit={async (event) => {
        event.preventDefault();
        const submittedPassword = password;
        setPassword("");
        if (await act("startLogin", { username: username.trim(), password: submittedPassword })) setRelogin(false);
      }}>
        <label>学校通行证账号<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
        <label>学校通行证密码<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        <button type="submit" disabled={busy || !username.trim() || !password}>登录学校通行证</button>
      </form>}
      {status.login?.stage === "mfa" && <form className={styles.form} onSubmit={async (event) => {
        event.preventDefault();
        const submittedCode = code;
        setCode("");
        await act("finishLogin", { code: submittedCode });
      }}>
        <label>学校企业微信验证码<input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} required /></label>
        <button type="button" disabled={busy} onClick={() => void act("sendCode")}>通过学校发送验证码</button>
        <button type="submit" disabled={busy || !code.trim()}>验证并登录</button>
        <button type="button" disabled={busy} onClick={() => void inspectMfa()}>检查企业微信认证状态</button>
      </form>}
      {diagnostic && <p className={styles.notice}>{diagnostic.schoolError
        ? `学校拒绝当前认证状态查询：${diagnostic.schoolError}。请稍后重新登录学校通行证。`
        : `学校状态 ${diagnostic.schoolStatus} · 验证类型 ${diagnostic.schoolType} · 步骤数 ${diagnostic.schoolSteps} · 应用参数${diagnostic.applicationParametersPresent ? "已读取" : "缺失"} · 前后${diagnostic.applicationParametersMatch ? "一致" : "不一致"} · 账号${diagnostic.accountMatches ? "一致" : "不一致"} · 会话 Cookie ${diagnostic.sessionCookieCount} 个 · 企业微信短信方式${diagnostic.methodAvailable === null ? "未知" : diagnostic.methodAvailable ? "可用" : "未列出"} · 二次密码${diagnostic.passwordRequired === null ? "未知" : diagnostic.passwordRequired ? "必填" : "不需要"} · 图形验证${diagnostic.captchaRequired == null ? "未确认" : diagnostic.captchaRequired ? "必填" : "不需要"}`}</p>}
      {(status.login?.stage === "mfa" || status.login?.stage === "verified" || status.login?.stage === "ready") && !status.schoolSession && <div className={styles.form}>
        <p className={styles.notice}>{status.login.stage === "verified" ? "学校已接受验证码，本站正在自动查找并核实课程页。" : "本站会自动读取学校选课入口；如果验证码已通过但网关跳转失败，也可以在此重试。"}</p>
        <button type="button" disabled={busy} onClick={() => void act("openCoursePage")}>自动连接课程列表</button>
      </div>}
      {status.schoolSession && <small>当前课程类别页面：{status.schoolSession.coursePageUrl}</small>}
      {status.sessionHealth && <p className={styles.notice}>服务器会话检查：{status.sessionHealth.message} · {when(status.sessionHealth.checkedAt)}</p>}
      {status.schoolSession && <details>
        <summary>学校提交接口核验</summary>
        <p className={styles.notice}>本站只读取学校课程页及其静态脚本，不会在此步骤提交选课申请。</p>
        <button type="button" disabled={busy} onClick={() => void act("inspectProtocol")}>重新读取学校提交脚本</button>
        {status.protocolEvidence ? <div className={styles.notice}>
          <p>静态脚本已读取 · SHA-256 {status.protocolEvidence.scriptSha256.slice(0, 16)}… · {when(status.protocolEvidence.checkedAt)}</p>
          <p>POST 调用线索 {status.protocolEvidence.postCallCount} 处；字段线索：{status.protocolEvidence.fieldHints.join("、") || "未识别"}。</p>
          <p>候选路径：{status.protocolEvidence.endpointCandidates.join("、") || "未识别"}。</p>
          <p>这些只是静态线索；完成受控提交和学校结果核验前，自动报名仍关闭。</p>
          {status.protocolEvidence.scriptSha256 === "d44c415774df8e9c5160048380bf5b335de879783315ea75fe7c2ee8df92e9ba"
            && status.sections.some((section) => section.courseCode === "016051" && section.sectionNumber === "288543")
            && <button type="button" disabled={busy} onClick={() => setTestConfirm(true)}>受控试提交：线性代数 288543</button>}
        </div> : <p className={styles.notice}>尚未取得可核验的学校提交脚本。</p>}
      </details>}
    </section>

    <section className={styles.card}>
      <h3>添加课程</h3>
      <p className={styles.notice}>{status.submissionReady
        ? "自动提交已启用：到点后若未报名成功，每 2 秒最多提交一次，最多 10 次。"
        : "目前可以保存预约意向和报名参数。学校提交接口尚未核验，自动提交未启用；保存意向不会向学校报名。"}</p>
      <form onSubmit={(event) => { event.preventDefault(); if (canPreview) setConfirm(true); }} className={styles.form}>
        {status.courses.length > 0 && <label>从学校课程列表选择（已读取 {status.courses.length} 门）<select value={status.courses.some((course) => course.courseCode === courseCode) ? courseCode : ""} onChange={(event) => setCourseCode(event.target.value)}>
          <option value="">请选择课程</option>
          {status.courses.map((course) => <option key={course.courseCode} value={course.courseCode}>{course.courseCode} · {course.name} · {course.status}</option>)}
        </select></label>}
        <label>课程编号<input inputMode="numeric" pattern="[0-9]{6,12}" value={courseCode} onChange={(event) => setCourseCode(event.target.value)} placeholder="例如 030158" required /></label>
        {status.schoolSession && /^\d{6,12}$/.test(courseCode.trim()) && <button type="button" disabled={busy} onClick={() => void act("loadSections", { courseCode: courseCode.trim() })}>读取该课程的选课序号</button>}
        {status.sections.some((section) => section.courseCode === courseCode) && <label>从班次列表选择<select value={status.sections.some((section) => section.courseCode === courseCode && section.sectionNumber === sectionNumber) ? sectionNumber : ""} onChange={(event) => setSectionNumber(event.target.value)}>
          <option value="">请选择选课序号</option>
          {status.sections.filter((section) => section.courseCode === courseCode).map((section) => <option key={section.sectionNumber} value={section.sectionNumber}>{section.sectionNumber} · {section.teacher} · {section.schedule} · 已录 {section.admitted}/{section.capacity}</option>)}
        </select></label>}
        <label>选课序号<input inputMode="numeric" pattern="[0-9]{6,12}" value={sectionNumber} onChange={(event) => setSectionNumber(event.target.value)} placeholder="例如 288755" required /></label>
        <label>开始报名时间<input type="datetime-local" step="1" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} required /></label>
        <fieldset><legend>是否选教材</legend><label><input type="radio" name="material" checked={buyMaterial === true} onChange={() => setBuyMaterial(true)} /> 需要教材</label><label><input type="radio" name="material" checked={buyMaterial === false} onChange={() => setBuyMaterial(false)} /> 不需要教材</label></fieldset>
        <button type="submit" disabled={busy || !canPreview || !status.schoolSession}>核对报名信息</button>
      </form>
    </section>

    <section className={styles.card}>
      <h3>预约列表</h3>
      {status.tasks.length === 0 ? <p>还没有预约课程。</p> : <div className={styles.tasks}>{status.tasks.map((task) => <article key={task.id} className={styles.task}>
        <div><strong>{task.courseCode} · {task.sectionNumber}</strong><span className={task.status === "success" ? styles.good : task.status === "needs_login" || task.status === "paused" || task.status === "failed" ? styles.warn : ""}>{labels[task.status]}</span></div>
        <small>{when(task.scheduledAt)} · {task.buyMaterial ? "需要教材" : "不需要教材"}</small>
        <p>{task.message}{task.attempts ? ` · 已尝试 ${task.attempts}/10 次` : ""}</p>
        {["scheduled", "watching", "needs_login", "paused"].includes(task.status) && <button type="button" disabled={busy} onClick={() => void act("cancelTask", { id: task.id })}>取消预约</button>}
      </article>)}</div>}
    </section>

    <section className={styles.card}>
      <h3>服务器提交记录</h3>
      {status.submissionRecords.length === 0 ? <p>尚无学校提交记录。</p> : <div className={styles.tasks}>{status.submissionRecords.map((record) => <article key={record.id} className={styles.task}>
        <div><strong>{record.courseCode} · {record.sectionNumber}</strong><span className={record.outcome === "accepted" ? styles.good : styles.warn}>{record.outcome === "accepted" ? "学校已接受" : record.outcome === "rejected" ? "学校已拒绝" : record.outcome === "unknown" ? "结果待核实" : "未发送"}</span></div>
        <small>{when(record.recordedAt)} · {record.buyMaterial ? "需要教材" : "不需要教材"}</small>
        <p>{record.message}</p>
      </article>)}</div>}
    </section>

    {confirm && <div className={styles.scrim} role="presentation"><div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="dhu-confirm-title">
      <h3 id="dhu-confirm-title">确认报名信息</h3>
      <p>课程编号：<b>{courseCode.trim()}</b></p><p>选课序号：<b>{sectionNumber.trim()}</b></p>
      <p>开始时间：<b>{when(planned)}</b></p><p>教材：<b>{buyMaterial ? "需要" : "不需要"}</b></p>
      <p>{status.submissionReady ? "到点后将每隔至少 2 秒尝试一次，最多 10 次，报名成功即停止；最终以学校返回结果为准。" : "当前仅保存预约意向。学校提交接口未核验，不会在预约时间自动向学校报名。"}</p>
      <div><button type="button" onClick={() => setConfirm(false)}>返回修改</button><button type="button" disabled={busy} onClick={async () => {
        if (await act("addTask", { courseCode: courseCode.trim(), sectionNumber: sectionNumber.trim(), scheduledAt: planned, buyMaterial })) {
          setConfirm(false);
          setToast(status.submissionReady ? "预约已保存" : "预约意向已保存，自动提交尚未启用");
        }
      }}>确认预约</button></div>
    </div></div>}
    {testConfirm && <div className={styles.scrim} role="presentation"><div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="dhu-test-title">
      <h3 id="dhu-test-title">确认受控试提交</h3>
      <p>学校将收到一次真实选课申请：线性代数 <b>016051</b>，选课序号 <b>288543</b>，需要教材。</p>
      <p>遇到冲突或图形验证码会停止。学校返回成功后，请在学校已选课程再次核对。</p>
      <div><button type="button" disabled={busy} onClick={() => setTestConfirm(false)}>返回</button>
        <button type="button" disabled={busy} onClick={() => void runControlledSubmit()}>确认发送一次</button></div>
    </div></div>}
    {error && <div role="alert" className={styles.error}>{error}</div>}
    {toast && <div role="status" className={styles.toast}>{toast}</div>}
  </div>;
}

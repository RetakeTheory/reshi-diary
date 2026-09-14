"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import "./query.css";

type Snapshot = {
  enabled: boolean; courseCount: number; lastStatus: string;
  mount: null | { courseName: string; status: string; total: number; completed: number; scanning: boolean;
    current: null | { name: string; playingTime: number; duration: number } };
  signIns: { activityId: string; courseName: string; activityName: string; result: string; checkedAt: number }[];
};
function clock(seconds: number) {
  const value = Math.max(0, Math.floor(seconds)), h = Math.floor(value / 3600), m = Math.floor(value % 3600 / 60), s = value % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function time(value: number) {
  return value ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(value) : "历史记录";
}
export default function QueryPage() {
  const [view, setView] = useState<"loading" | "login" | "dashboard">("loading");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [refreshedAt, setRefreshedAt] = useState(0);
  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setBusy(true);
    try {
      const response = await fetch("/api/query/status", { cache: "no-store", credentials: "include" });
      const result = await response.json() as { snapshot?: Snapshot; error?: string };
      if (response.status === 401) { setSnapshot(null); setView("login"); return; }
      if (!response.ok || !result.snapshot) throw new Error(result.error || "查询失败，请稍后重试");
      setSnapshot(result.snapshot); setRefreshedAt(Date.now()); setView("dashboard"); setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "查询失败，请稍后重试"); setView((previous) => previous === "loading" ? "login" : previous); }
    finally { if (!quiet) setBusy(false); }
  }, []);
  useEffect(() => {
    document.body.classList.add("cx-query-body");
    const initial = window.setTimeout(() => void refresh(true), 0);
    const polling = window.setInterval(() => void refresh(true), 30_000);
    return () => { document.body.classList.remove("cx-query-body"); window.clearTimeout(initial); window.clearInterval(polling); };
  }, [refresh]);
  async function login(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/query/login", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ account, password }) });
      const result = await response.json() as { snapshot?: Snapshot; error?: string };
      if (!response.ok || !result.snapshot) throw new Error(result.error || "登录失败");
      setPassword(""); setSnapshot(result.snapshot); setRefreshedAt(Date.now()); setView("dashboard");
    } catch (error) { setMessage(error instanceof Error ? error.message : "登录失败"); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true); await fetch("/api/query/logout", { method: "POST", credentials: "include" }).catch(() => undefined);
    setSnapshot(null); setView("login"); setBusy(false); setMessage("");
  }
  async function repair() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/query/repair", { method: "POST", credentials: "include" });
      const result = await response.json() as { snapshot?: Snapshot; message?: string; error?: string };
      if (response.status === 401) { setSnapshot(null); setView("login"); return; }
      if (result.snapshot) { setSnapshot(result.snapshot); setRefreshedAt(Date.now()); }
      if (!response.ok) throw new Error(result.error || "自助修复提交失败");
      setMessage(result.message || "修复请求已提交");
    } catch (error) { setMessage(error instanceof Error ? error.message : "自助修复提交失败"); }
    finally { setBusy(false); }
  }
  const nodes = useMemo(() => {
    const mount = snapshot?.mount;
    return mount?.total ? Array.from({ length: Math.min(mount.total, 80) }, (_, index) => index < mount.completed ? "done" : index === mount.completed && mount.current ? snapshot.enabled ? "active" : "failed" : "waiting") : [];
  }, [snapshot]);
  if (view === "loading") return <main className="cx-query-page"><section className="cx-query-login"><div className="cx-query-mark" /><p>正在读取…</p></section></main>;
  if (view === "login") return <main className="cx-query-page"><section className="cx-query-login">
    <header><div className="cx-query-mark" /><div><small>QUERY.RETTHEORY.TOP</small><h1>学习进度查询</h1></div></header>
    <p>使用已在 QQ Bot 注册的学习通账号登录。</p>
    <form onSubmit={login} aria-busy={busy}>
      <label><span>账号</span><input value={account} onChange={(event) => setAccount(event.target.value)} autoComplete="username" maxLength={100} required /></label>
      <label><span>密码</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" maxLength={128} required /></label>
      <button type="submit" disabled={busy}>{busy ? "正在验证…" : "登录查询"}</button>
    </form>
    {message && <p className="cx-query-message" role="status">{message}</p>}
    <small className="cx-query-privacy">密码仅用于本次学习通验证，不会保存。</small>
  </section></main>;
  if (!snapshot) return null;
  const mount = snapshot.mount;
  const currentProgress = mount?.current?.duration ? Math.min(100, mount.current.playingTime / mount.current.duration * 100) : 0;
  const totalProgress = mount?.total ? Math.min(100, mount.completed / mount.total * 100) : 0;
  return <main className="cx-query-page"><div className="cx-query-shell">
    <header className="cx-query-top"><div><span className="cx-query-mark" /><div><small>学习通助手</small><h1>课程概览</h1></div></div>
      <div className="cx-query-actions"><span>{refreshedAt ? `刷新于 ${time(refreshedAt)}` : ""}</span>
        <button type="button" className="repair" onClick={() => void repair()} disabled={busy || !mount}>{busy ? "处理中…" : "自助修复"}</button>
        <button type="button" onClick={() => void refresh()} disabled={busy}>{busy ? "刷新中…" : "刷新"}</button>
        <button type="button" className="quiet" onClick={() => void logout()} disabled={busy}>退出</button>
      </div></header>
    <section className="cx-query-card"><div className="cx-query-section-title"><span>课程</span><strong>{mount?.courseName || "当前没有挂载课程"}</strong><em className={snapshot.enabled ? "online" : "paused"}>{snapshot.enabled ? "正在挂载" : "已暂停"}</em></div>
      <div className="cx-query-stats"><div><span>视频任务点</span><b>{mount?.total || 0}</b></div><div><span>已完成</span><b>{mount?.completed || 0}</b></div><div><span>课程数量</span><b>{snapshot.courseCount}</b></div></div>
      {nodes.length > 0 && <><div className="cx-query-nodes" aria-label={`已完成 ${mount?.completed || 0}，总数 ${mount?.total || 0}`}>{nodes.map((state, index) => <i key={index} className={state} />)}</div>
        <div className="cx-query-legend"><span><i className="done" />已完成</span><span><i className="active" />正在挂载</span><span><i className="waiting" />等待挂载</span><span><i className="failed" />已暂停</span></div></>}
      <div className="cx-query-total"><span>{mount?.scanning ? "任务点总进度（扫描中）" : "任务点总进度"}<b>{mount?.completed || 0}/{mount?.total || 0}</b></span><div><i style={{ width: `${totalProgress}%` }} /></div></div>
    </section>
    <section className="cx-query-card cx-query-current"><h2><span className="cx-query-mark" />挂载明细</h2>
      {mount?.current ? <><div className="cx-query-current-row"><span>当前播放</span><strong>{mount.current.name}</strong></div><div className="cx-query-time"><span>播放进度</span><b>{clock(mount.current.playingTime)} / {clock(mount.current.duration)}</b></div><div className="cx-query-progress"><i style={{ width: `${currentProgress}%` }} /></div></> : <p className="cx-query-empty">{mount?.status || "目前没有正在播放的视频"}</p>}
      {mount && <p className="cx-query-status">{mount.status}</p>}
      {mount && <button type="button" className="cx-query-repair-mobile" onClick={() => void repair()} disabled={busy}>{busy ? "处理中…" : "自助修复"}</button>}
    </section>
    <section className="cx-query-card cx-query-signins"><h2><span className="cx-query-mark" />签到记录</h2>
      {snapshot.signIns.length ? <div className="cx-query-records">{snapshot.signIns.map((item) => <article key={`${item.activityId}-${item.checkedAt}`}><div><strong>{item.activityName}</strong><span>{item.courseName}</span></div><em className={/成功|已签到/.test(item.result) ? "success" : "notice"}>{item.result}</em><time>{time(item.checkedAt)}</time></article>)}</div> : <p className="cx-query-empty">暂无签到处理记录</p>}
    </section>
    {message && <p className="cx-query-message floating" role="status">{message}</p>}
  </div></main>;
}

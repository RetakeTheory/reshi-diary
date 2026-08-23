"use client";

import { FormEvent, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { browserSupportsWebAuthn, startRegistration, type PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import Icon from "../Icon";
import ReaderAvatar from "../ReaderAvatar";
import AvatarCropper from "./AvatarCropper";
import EditableModule from "../EditableModule";
import { pageDocument, pageModule } from "../../lib/site-pages";

type User = { id: string; displayName: string; email: string; avatarUrl: string | null; points: number; level: number; levelColor: string; createdAt: number };
type Passkey = { id: string; name: string; createdAt: number; lastUsedAt: number | null };
type Task = { key: "check_in" | "comment" | "reaction"; label: string; points: number; completed: boolean };
type Ticket = { id: number; category: string; title: string; body: string; status: string; adminReply: string | null; createdAt: number; updatedAt: number };
const statusLabel: Record<string, string> = { open: "待处理", in_progress: "处理中", resolved: "已解决", closed: "已关闭" };
const editablePage = pageDocument("account");
const headerCopy = pageModule("account", "account-header").fields;

export default function AccountClient() {
  const supported = useSyncExternalStore(() => () => undefined, browserSupportsWebAuthn, () => false);
  const [user, setUser] = useState<User | null>(null);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [name, setName] = useState("我的设备");
  const [ticket, setTicket] = useState({ category: "feedback", title: "", body: "" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const meResponse = await fetch("/api/auth/me", { cache: "no-store" });
    if (!meResponse.ok) { setLoading(false); return; }
    setUser(((await meResponse.json()) as { user: User }).user);
    const [passkeyResponse, taskResponse, ticketResponse] = await Promise.all([
      fetch("/api/account/passkeys", { cache: "no-store" }), fetch("/api/account/tasks", { cache: "no-store" }), fetch("/api/account/tickets", { cache: "no-store" }),
    ]);
    if (passkeyResponse.ok) setPasskeys(((await passkeyResponse.json()) as { passkeys: Passkey[] }).passkeys);
    if (taskResponse.ok) { const result = await taskResponse.json() as { user: User; tasks: Task[] }; setUser(result.user); setTasks(result.tasks); }
    if (ticketResponse.ok) setTickets(((await ticketResponse.json()) as { tickets: Ticket[] }).tickets);
    setLoading(false);
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load().catch(() => { setMessage("账户信息加载失败"); setLoading(false); }), 0); return () => window.clearTimeout(timer); }, [load]);

  async function addPasskey() {
    setBusy(true); setMessage("");
    try {
      const optionsResponse = await fetch("/api/account/passkeys/options", { method: "POST" });
      const optionsResult = await optionsResponse.json() as { flowId?: string; options?: PublicKeyCredentialCreationOptionsJSON; error?: string };
      if (!optionsResponse.ok || !optionsResult.flowId || !optionsResult.options) throw new Error(optionsResult.error || "无法创建 Passkey");
      const registration = await startRegistration({ optionsJSON: optionsResult.options });
      const verifyResponse = await fetch("/api/account/passkeys/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ flowId: optionsResult.flowId, response: registration, name }) });
      const result = await verifyResponse.json() as { error?: string };
      if (!verifyResponse.ok) throw new Error(result.error || "Passkey 保存失败");
      setMessage("Passkey 已添加"); await load();
    } catch (error) { setMessage(error instanceof Error && error.name === "NotAllowedError" ? "已取消创建 Passkey" : error instanceof Error ? error.message : "Passkey 创建失败"); }
    finally { setBusy(false); }
  }
  async function checkIn() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/account/check-in", { method: "POST" }); const result = await response.json() as { awarded?: boolean; user?: User; tasks?: Task[]; error?: string };
      if (!response.ok || !result.user || !result.tasks) throw new Error(result.error || "签到失败");
      setUser(result.user); setTasks(result.tasks); setMessage(result.awarded ? "签到成功，积分 +2" : "今天已经签到过了");
    } catch (error) { setMessage(error instanceof Error ? error.message : "签到失败"); } finally { setBusy(false); }
  }
  async function submitTicket(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/account/tickets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ticket) });
      const result = await response.json() as { ticket?: Ticket; error?: string }; if (!response.ok || !result.ticket) throw new Error(result.error || "工单提交失败");
      setTickets((current) => [result.ticket!, ...current]); setTicket({ category: "feedback", title: "", body: "" }); setMessage("工单已提交");
    } catch (error) { setMessage(error instanceof Error ? error.message : "工单提交失败"); } finally { setBusy(false); }
  }
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); window.location.assign("/"); }

  if (loading) return <section className="account-shell shell"><div className="account-loading" role="status">正在读取账户…</div></section>;
  if (!user) return <section className="account-shell shell"><div className="account-login-required"><Icon name="user" /><h1>{headerCopy.loginRequiredTitle}</h1><p>{headerCopy.loginRequiredDescription}</p><a href="/login?next=/account">{headerCopy.loginRequiredCta}</a></div></section>;
  const progress = user.level === 16 ? 100 : user.points % 100;

  return <section className="account-shell shell">
    {editablePage.modules.map((module) => {
      const copy = module.fields;
      if (module.id === "account-header") return <EditableModule module={module} key={module.id}><header className="account-head reader-profile-head"><div className="reader-profile"><ReaderAvatar src={user.avatarUrl} name={user.displayName} size={92} /><div><p>{copy.eyebrow}</p><h1>{user.displayName}</h1><span>{user.email}</span><AvatarCropper onUploaded={(value) => setUser(value as User)} /></div></div><button type="button" onClick={logout}>{copy.logout}</button></header></EditableModule>;
      if (module.id === "account-level") return <EditableModule module={module} key={module.id}><section className="level-card" style={{ "--level-color": user.levelColor } as React.CSSProperties}><div><span className="level-badge">LV.{user.level}</span><div><b>{user.points} 积分</b><small>{user.level === 16 ? copy.highest : `${copy.distance} LV.${user.level + 1} 还差 ${100 - progress} 分`}</small></div></div><div className="level-progress" aria-label={`等级进度 ${progress}%`}><i style={{ width: `${progress}%` }} /></div></section></EditableModule>;
      if (module.id === "account-tasks") return <EditableModule module={module} key={module.id}><section className="daily-tasks"><header><p>{copy.eyebrow}</p><h2>{copy.title}</h2><span>{copy.description}</span></header><div>{tasks.map((task) => <article key={task.key} className={task.completed ? "is-complete" : ""}><Icon name={task.completed ? "check" : task.key === "comment" ? "comment" : task.key === "reaction" ? "heart" : "spark"} /><div><b>{task.label}</b><span>+{task.points} 积分</span></div>{task.key === "check_in" && !task.completed ? <button type="button" disabled={busy} onClick={checkIn}>{copy.checkIn}</button> : <small>{task.completed ? copy.complete : copy.goPost}</small>}</article>)}</div></section></EditableModule>;
      if (module.id === "account-passkeys") return <EditableModule module={module} key={module.id}><div className="account-passkeys"><div><Icon name="key" /><p>{copy.eyebrow}</p><h2>{copy.title}</h2><span>{copy.description}</span></div><div>{supported ? <div className="account-passkey-add"><label><span>{copy.deviceLabel}</span><input value={name} maxLength={40} onChange={(event) => setName(event.target.value)} /></label><button type="button" disabled={busy} onClick={addPasskey}>{busy ? "正在添加…" : copy.add}</button></div> : <p>当前浏览器不支持 Passkey。</p>}<ul>{passkeys.map((item) => <li key={item.id}><span><Icon name="check" /></span><div><b>{item.name}</b><small>添加于 {new Date(item.createdAt).toLocaleDateString("zh-CN")}</small></div></li>)}</ul>{!passkeys.length && <p className="account-passkey-empty">{copy.empty}</p>}</div></div></EditableModule>;
      if (module.id === "account-tickets") return <EditableModule module={module} key={module.id}><section className="ticket-center"><header><p>{copy.eyebrow}</p><h2>{copy.title}</h2><span>{copy.description}</span></header><div className="ticket-layout"><form onSubmit={submitTicket}><label><span>类型</span><select value={ticket.category} onChange={(event) => setTicket({ ...ticket, category: event.target.value })}><option value="feedback">意见建议</option><option value="problem">遇到问题</option><option value="question">使用咨询</option></select></label><label><span>标题</span><input maxLength={80} value={ticket.title} onChange={(event) => setTicket({ ...ticket, title: event.target.value })} required /></label><label><span>详细描述</span><textarea maxLength={2000} value={ticket.body} onChange={(event) => setTicket({ ...ticket, body: event.target.value })} required /></label><button type="submit" disabled={busy}>{copy.submit}</button></form><div className="ticket-list">{tickets.length ? tickets.map((item) => <article key={item.id}><div><span className={`ticket-status status-${item.status}`}>{statusLabel[item.status] || item.status}</span><time>{new Date(item.updatedAt).toLocaleDateString("zh-CN")}</time></div><h3>{item.title}</h3><p>{item.body}</p>{item.adminReply && <blockquote><b>管理员回复</b>{item.adminReply}</blockquote>}</article>) : <div className="ticket-empty">{copy.empty}</div>}</div></div></section></EditableModule>;
      return null;
    })}
    {message && <p className="account-message account-global-message" role="status">{message}</p>}
  </section>;
}

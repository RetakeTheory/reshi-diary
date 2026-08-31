"use client";

import { FormEvent, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { browserSupportsWebAuthn, startRegistration, type PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import Icon from "../Icon";
import ReaderAvatar from "../ReaderAvatar";
import AvatarCropper from "./AvatarCropper";
import EditableModule from "../EditableModule";
import { pageDocument, pageModule } from "../../lib/site-pages";
import { readJsonOrEmpty } from "../../lib/http-response";

type User = { id: string; uid: string; displayName: string; email: string; passwordSet: boolean; avatarUrl: string | null; points: number; level: number; levelColor: string; createdAt: number };
type Passkey = { id: string; name: string; createdAt: number; lastUsedAt: number | null };
type Task = { key: "check_in" | "comment" | "reaction"; label: string; points: number; completed: boolean };
type TicketMessage = { id: number; ticketId: number; senderType: "user" | "admin"; body: string; createdAt: number };
type Ticket = { id: number; category: string; title: string; body: string; status: string; adminReply: string | null; createdAt: number; updatedAt: number; messages: TicketMessage[] };
type QqBinding = { qqId: string; botId: string; boundAt: number };
type QqInfo = { binding: QqBinding | null; botId: string | null; configured: boolean; online?: boolean; canUnbind: boolean };
type QqFlow = { flowId: string; botId: string; command: string; expiresAt: number };
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
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState({ code: "", value: "", sent: false });
  const [ticketReplies, setTicketReplies] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [qqInfo, setQqInfo] = useState<QqInfo>({ binding: null, botId: null, configured: false, online: false, canUnbind: false });
  const [qqFlow, setQqFlow] = useState<QqFlow | null>(null);

  const load = useCallback(async () => {
    const meResponse = await fetch("/api/auth/me", { cache: "no-store" });
    if (!meResponse.ok) { setLoading(false); return; }
    const loadedUser = ((await meResponse.json()) as { user: User }).user; setUser(loadedUser); setNickname(loadedUser.displayName);
    const [passkeyResponse, taskResponse, ticketResponse, qqResponse] = await Promise.all([
      fetch("/api/account/passkeys", { cache: "no-store" }), fetch("/api/account/tasks", { cache: "no-store" }), fetch("/api/account/tickets", { cache: "no-store" }), fetch("/api/account/qq", { cache: "no-store" }),
    ]);
    if (passkeyResponse.ok) setPasskeys(((await passkeyResponse.json()) as { passkeys: Passkey[] }).passkeys);
    if (taskResponse.ok) { const result = await taskResponse.json() as { user: User; tasks: Task[] }; setUser(result.user); setTasks(result.tasks); }
    if (ticketResponse.ok) setTickets(((await ticketResponse.json()) as { tickets: Ticket[] }).tickets);
    if (qqResponse.ok) setQqInfo(await qqResponse.json() as QqInfo);
    setLoading(false);
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load().catch(() => { setMessage("账户信息加载失败"); setLoading(false); }), 0); return () => window.clearTimeout(timer); }, [load]);

  useEffect(() => {
    if (!qqFlow) return;
    let stopped = false;
    async function complete() {
      if (Date.now() >= qqFlow!.expiresAt) { stopped = true; setQqFlow(null); setMessage("QQ 绑定验证已过期，请重新开始"); return; }
      try {
        const response = await fetch("/api/account/qq/complete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ flowId: qqFlow!.flowId }) });
        const result = await readJsonOrEmpty<{ status?: string; binding?: QqBinding; error?: string }>(response);
        if (response.status === 202) return;
        if (!response.ok || !result.binding) throw new Error(result.error || "QQ 绑定失败");
        stopped = true; setQqFlow(null); setQqInfo((current) => ({ ...current, binding: { ...result.binding!, botId: qqFlow!.botId }, canUnbind: !user?.email.endsWith("@qq.rettheory.local") })); setMessage("QQ 账号已绑定");
      } catch (error) { stopped = true; setQqFlow(null); setMessage(error instanceof Error ? error.message : "QQ 绑定失败"); }
    }
    const timer = window.setInterval(() => { if (!stopped) void complete(); }, 1800);
    void complete();
    return () => { stopped = true; window.clearInterval(timer); };
  }, [qqFlow, user?.email]);

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
  async function startQqBinding() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/account/qq", { method: "POST" });
      const result = await readJsonOrEmpty<QqFlow & { error?: string }>(response);
      if (!response.ok || !result.flowId) throw new Error(result.error || "无法启动 QQ 绑定");
      setQqFlow(result); setMessage("请私聊 Bot 发送验证指令，本页会自动完成绑定");
    } catch (error) { setMessage(error instanceof Error ? error.message : "无法启动 QQ 绑定"); }
    finally { setBusy(false); }
  }
  async function copyQqCommand() {
    if (!qqFlow) return;
    await navigator.clipboard.writeText(qqFlow.command); setMessage("绑定指令已复制");
  }
  async function unbindQq() {
    if (!window.confirm("确定解除 QQ 绑定吗？")) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/account/qq", { method: "DELETE" });
      const result = await readJsonOrEmpty<{ error?: string }>(response);
      if (!response.ok) throw new Error(result.error || "解除绑定失败");
      setQqInfo((current) => ({ ...current, binding: null, canUnbind: false })); setMessage("QQ 绑定已解除");
    } catch (error) { setMessage(error instanceof Error ? error.message : "解除绑定失败"); }
    finally { setBusy(false); }
  }
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); window.location.assign("/"); }

  async function saveProfile(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try { const response = await fetch("/api/account/profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName: nickname }) }); const result = await response.json() as { user?: User; error?: string }; if (!response.ok || !result.user) throw new Error(result.error || "昵称保存失败"); setUser(result.user); setNickname(result.user.displayName); setMessage("昵称已更新"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "昵称保存失败"); } finally { setBusy(false); }
  }
  async function sendPasswordCode() {
    if (!user) return; setBusy(true); setMessage("");
    try { const response = await fetch("/api/auth/send-code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: user.email, intent: "set_password" }) }); const result = await readJsonOrEmpty<{ error?: string }>(response); if (!response.ok) throw new Error(result.error || "验证码发送失败"); setPassword((current) => ({ ...current, sent: true })); setMessage("验证邮件已发送"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "验证码发送失败"); } finally { setBusy(false); }
  }
  async function setAccountPassword(event: FormEvent) {
    event.preventDefault(); if (!user) return; setBusy(true); setMessage("");
    try { const response = await fetch("/api/auth/password-reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: user.email, intent: "set_password", code: password.code, password: password.value }) }); const result = await readJsonOrEmpty<{ error?: string }>(response); if (!response.ok) throw new Error(result.error || "密码设置失败"); setPassword({ code: "", value: "", sent: false }); setUser({ ...user, passwordSet: true }); setMessage("登录密码已更新"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "密码设置失败"); } finally { setBusy(false); }
  }
  async function replyTicket(ticketId: number) {
    const body = ticketReplies[ticketId]?.trim(); if (!body) return; setBusy(true); setMessage("");
    try { const response = await fetch(`/api/account/tickets/${ticketId}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body }) }); const result = await response.json() as { message?: TicketMessage; status?: string; updatedAt?: number; error?: string }; if (!response.ok || !result.message) throw new Error(result.error || "回复失败"); setTickets((items) => items.map((item) => item.id === ticketId ? { ...item, messages: [...item.messages, result.message!], status: result.status || item.status, updatedAt: result.updatedAt || item.updatedAt } : item)); setTicketReplies((items) => ({ ...items, [ticketId]: "" })); setMessage("回复已发送"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "回复失败"); } finally { setBusy(false); }
  }

  if (loading) return <section className="account-shell shell"><div className="account-loading" role="status">正在读取账户…</div></section>;
  if (!user) return <section className="account-shell shell"><div className="account-login-required"><Icon name="user" /><h1>{headerCopy.loginRequiredTitle}</h1><p>{headerCopy.loginRequiredDescription}</p><a href="/login?next=/account">{headerCopy.loginRequiredCta}</a></div></section>;
  const progress = user.level === 16 ? 100 : user.points % 100;

  return <section className="account-shell shell">
    {editablePage.modules.map((module) => {
      const copy = module.fields;
      if (module.id === "account-header") return <EditableModule module={module} key={module.id}><header className="account-head reader-profile-head"><div className="reader-profile"><ReaderAvatar src={user.avatarUrl} name={user.displayName} size={92} /><div><p>{copy.eyebrow}</p><h1>{user.displayName}</h1><span>{user.email.endsWith("@qq.rettheory.local") ? "QQ 注册用户" : user.email} · UID {user.uid}</span><AvatarCropper onUploaded={(value) => setUser(value as User)} /></div></div><button type="button" onClick={logout}>{copy.logout}</button></header></EditableModule>;
      if (module.id === "account-level") return <EditableModule module={module} key={module.id}><section className="level-card" style={{ "--level-color": user.levelColor } as React.CSSProperties}><div><span className="level-badge">LV.{user.level}</span><div><b>{user.points} 积分</b><small>{user.level === 16 ? copy.highest : `${copy.distance} LV.${user.level + 1} 还差 ${100 - progress} 分`}</small></div></div><div className="level-progress" aria-label={`等级进度 ${progress}%`}><i style={{ width: `${progress}%` }} /></div></section></EditableModule>;
      if (module.id === "account-tasks") return <EditableModule module={module} key={module.id}><section className="daily-tasks"><header><p>{copy.eyebrow}</p><h2>{copy.title}</h2><span>{copy.description}</span></header><div>{tasks.map((task) => <article key={task.key} className={task.completed ? "is-complete" : ""}><Icon name={task.completed ? "check" : task.key === "comment" ? "comment" : task.key === "reaction" ? "heart" : "spark"} /><div><b>{task.label}</b><span>+{task.points} 积分</span></div>{task.key === "check_in" && !task.completed ? <button type="button" disabled={busy} onClick={checkIn}>{copy.checkIn}</button> : <small>{task.completed ? copy.complete : copy.goPost}</small>}</article>)}</div></section></EditableModule>;
      if (module.id === "account-passkeys") return <EditableModule module={module} key={module.id}><div className="account-passkeys"><div><Icon name="key" /><p>{copy.eyebrow}</p><h2>{copy.title}</h2><span>{copy.description}</span></div><div>{supported ? <div className="account-passkey-add"><label><span>{copy.deviceLabel}</span><input value={name} maxLength={40} onChange={(event) => setName(event.target.value)} /></label><button type="button" disabled={busy} onClick={addPasskey}>{busy ? "正在添加…" : copy.add}</button></div> : <p>当前浏览器不支持 Passkey。</p>}<ul>{passkeys.map((item) => <li key={item.id}><span><Icon name="check" /></span><div><b>{item.name}</b><small>添加于 {new Date(item.createdAt).toLocaleDateString("zh-CN")}</small></div></li>)}</ul>{!passkeys.length && <p className="account-passkey-empty">{copy.empty}</p>}</div></div></EditableModule>;
      if (module.id === "account-tickets") return <EditableModule module={module} key={module.id}><section className="ticket-center"><header><p>{copy.eyebrow}</p><h2>{copy.title}</h2><span>提交后可在同一工单内继续与管理员沟通。</span></header><div className="ticket-layout"><form onSubmit={submitTicket}><label><span>类型</span><select value={ticket.category} onChange={(event) => setTicket({ ...ticket, category: event.target.value })}><option value="feedback">意见建议</option><option value="problem">遇到问题</option><option value="question">使用咨询</option></select></label><label><span>标题</span><input maxLength={80} value={ticket.title} onChange={(event) => setTicket({ ...ticket, title: event.target.value })} required /></label><label><span>详细描述</span><textarea maxLength={2000} value={ticket.body} onChange={(event) => setTicket({ ...ticket, body: event.target.value })} required /></label><button type="submit" disabled={busy}>{copy.submit}</button></form><div className="ticket-list">{tickets.length ? tickets.map((item) => <article key={item.id}><div><span className={`ticket-status status-${item.status}`}>{statusLabel[item.status] || item.status}</span><time>{new Date(item.updatedAt).toLocaleDateString("zh-CN")}</time></div><h3>{item.title}</h3><div className="ticket-thread">{item.messages.map((entry) => <section className={`ticket-message from-${entry.senderType}`} key={entry.id}><span>{entry.senderType === "admin" ? "管理员" : "我"}</span><p>{entry.body}</p><time>{new Date(entry.createdAt).toLocaleString("zh-CN")}</time></section>)}</div>{item.status !== "closed" && <div className="ticket-reply-box"><textarea maxLength={2000} value={ticketReplies[item.id] || ""} onChange={(event) => setTicketReplies({ ...ticketReplies, [item.id]: event.target.value })} placeholder="继续补充情况或回复管理员…" /><button type="button" disabled={busy || !ticketReplies[item.id]?.trim()} onClick={() => replyTicket(item.id)}>发送</button></div>}</article>) : <div className="ticket-empty">{copy.empty}</div>}</div></div></section></EditableModule>;
      return null;
    })}
    <section className="account-qq" aria-labelledby="account-qq-title"><div className="account-qq-copy"><span className="account-qq-icon"><Icon name="bot" /></span><p>ONEBOT / QQ 账号</p><h2 id="account-qq-title">QQ 登录与绑定</h2><span>验证由指定 Bot 的私聊事件完成，不会读取 QQ 密码。</span></div><div className="account-qq-action">{qqInfo.binding ? <div className="qq-binding-state"><span><Icon name="check" /></span><div><b>已绑定 QQ {qqInfo.binding.qqId}</b><small>由 Bot {qqInfo.binding.botId} 验证 · {new Date(qqInfo.binding.boundAt).toLocaleDateString("zh-CN")}</small></div>{qqInfo.canUnbind && <button type="button" disabled={busy} onClick={unbindQq}>解除绑定</button>}</div> : qqFlow ? <div className="qq-binding-flow"><div><small>私聊 Bot {qqFlow.botId} 发送</small><strong>{qqFlow.command}</strong></div><button type="button" onClick={copyQqCommand}>复制指令</button><p>等待验证中，本页会自动刷新状态。</p></div> : <><div className={`qq-bot-state ${qqInfo.online ? "is-online" : ""}`}><i aria-hidden="true" /><span>{!qqInfo.configured ? "Bot 尚未配置" : qqInfo.online ? `Bot ${qqInfo.botId} 在线` : `Bot ${qqInfo.botId} 离线`}</span></div><button type="button" disabled={busy || !qqInfo.configured || !qqInfo.online} onClick={startQqBinding}>{busy ? "正在创建…" : "绑定 QQ 账号"}</button></>}</div></section>
    <section className="account-profile-settings"><header><div><p>PROFILE / 资料与登录</p><h2>访客资料</h2><span>UID 创建后不可更改；昵称在全站不可重复。</span></div><span className="account-uid">UID {user.uid}</span></header><div className="account-profile-grid"><form onSubmit={saveProfile}><h3>修改昵称</h3><label><span>唯一昵称</span><input value={nickname} minLength={2} maxLength={40} onChange={(event) => setNickname(event.target.value)} required /></label><button type="submit" disabled={busy || nickname.trim() === user.displayName}>保存昵称</button></form>{user.email.endsWith("@qq.rettheory.local") ? <div className="qq-only-login-note"><Icon name="shield" /><div><h3>QQ 注册账户</h3><p>当前由 QQ Bot 验证登录。建议再添加 Passkey，作为设备上的快捷登录方式。</p></div></div> : <form onSubmit={setAccountPassword}><h3>{user.passwordSet ? "更新登录密码" : "设置登录密码"}</h3><p>修改密码前必须通过账户邮箱验证。</p>{password.sent ? <><label><span>邮箱验证码</span><input value={password.code} inputMode="numeric" maxLength={6} onChange={(event) => setPassword({ ...password, code: event.target.value.replace(/\D/g, "").slice(0, 6) })} required /></label><label><span>新密码</span><input type="password" minLength={8} maxLength={128} autoComplete="new-password" value={password.value} onChange={(event) => setPassword({ ...password, value: event.target.value })} required /></label><button type="submit" disabled={busy || password.code.length !== 6 || password.value.length < 8}>验证并保存</button></> : <button type="button" disabled={busy} onClick={sendPasswordCode}>发送验证邮件</button>}</form>}</div></section>
    {message && <p className="account-message account-global-message" role="status">{message}</p>}
  </section>;
}

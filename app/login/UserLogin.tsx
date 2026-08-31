"use client";

import { FormEvent, useEffect, useState, useSyncExternalStore } from "react";
import { browserSupportsWebAuthn, startAuthentication, type PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import ArrowIcon from "../ArrowIcon";
import Icon from "../Icon";
import { pageModule } from "../../lib/site-pages";
import { readJsonOrEmpty } from "../../lib/http-response";

type Intent = "login" | "register";
type QqFlow = { flowId: string; botId: string; command: string; expiresAt: number };
const copy = pageModule("login", "login-form").fields;

export default function UserLogin({ next }: { next: string }) {
  const supported = useSyncExternalStore(() => () => undefined, browserSupportsWebAuthn, () => false);
  const [intent, setIntent] = useState<Intent>("login");
  const [loginMode, setLoginMode] = useState<"code" | "password" | "reset" | "qq">("code");
  const [step, setStep] = useState<"details" | "code" | "qq">("details");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [qqFlow, setQqFlow] = useState<QqFlow | null>(null);

  function switchIntent(value: Intent) { setIntent(value); setLoginMode("code"); setStep("details"); setCode(""); setPassword(""); setQqFlow(null); setMessage(""); }

  useEffect(() => {
    if (step !== "qq" || !qqFlow) return;
    let stopped = false;
    async function complete() {
      if (Date.now() >= qqFlow!.expiresAt) { setMessage("QQ 验证已过期，请重新开始。"); setStep("details"); setQqFlow(null); return; }
      try {
        const response = await fetch("/api/auth/qq/complete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ flowId: qqFlow!.flowId }) });
        const result = await readJsonOrEmpty<{ status?: string; error?: string }>(response);
        if (response.status === 202) return;
        if (!response.ok) throw new Error(result.error || "QQ 验证失败");
        stopped = true; window.location.assign(next);
      } catch (error) { stopped = true; setMessage(error instanceof Error ? error.message : "QQ 验证失败"); setStep("details"); setQqFlow(null); }
    }
    const timer = window.setInterval(() => { if (!stopped) void complete(); }, 1800);
    void complete();
    return () => { stopped = true; window.clearInterval(timer); };
  }, [next, qqFlow, step]);

  async function startQq(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/auth/qq/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ intent, displayName: intent === "register" ? displayName : undefined }) });
      const result = await readJsonOrEmpty<QqFlow & { error?: string }>(response);
      if (!response.ok || !result.flowId) throw new Error(result.error || "无法启动 QQ 验证");
      setQqFlow(result); setStep("qq"); setMessage("等待 Bot 验证；完成私聊后本页会自动继续。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "无法启动 QQ 验证"); }
    finally { setBusy(false); }
  }

  async function copyQqCommand() {
    if (!qqFlow) return;
    await navigator.clipboard.writeText(qqFlow.command);
    setMessage("验证指令已复制，请私聊发送给 Bot。");
  }

  async function sendCode(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/auth/send-code", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, intent: loginMode === "reset" ? "reset_password" : intent, displayName: intent === "register" ? displayName : undefined }),
      });
      const result = await readJsonOrEmpty<{ error?: string }>(response);
      if (!response.ok) throw new Error(result.error || "验证码发送失败");
      setStep("code"); setMessage("验证码已发送，请检查收件箱和垃圾邮件。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "验证码发送失败"); }
    finally { setBusy(false); }
  }

  async function verify(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/auth/verify-code", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, code, intent }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "验证码验证失败");
      window.location.assign(next);
    } catch (error) { setMessage(error instanceof Error ? error.message : "验证码验证失败"); }
    finally { setBusy(false); }
  }

  async function signInWithPassword(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try { const response = await fetch("/api/auth/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifier: email, password }) }); const result = await readJsonOrEmpty<{ error?: string }>(response); if (!response.ok) throw new Error(result.error || "登录失败"); window.location.assign(next); }
    catch (error) { setMessage(error instanceof Error ? error.message : "登录失败"); } finally { setBusy(false); }
  }

  async function resetPassword(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try { const response = await fetch("/api/auth/password-reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, code, password, intent: "reset_password" }) }); const result = await readJsonOrEmpty<{ error?: string }>(response); if (!response.ok) throw new Error(result.error || "密码重置失败"); setLoginMode("password"); setStep("details"); setCode(""); setMessage("密码已重置，现在可以直接登录。"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "密码重置失败"); } finally { setBusy(false); }
  }

  async function signInWithPasskey() {
    if (!email.trim()) { setMessage("先填写登记 Passkey 时使用的邮箱。"); return; }
    setBusy(true); setMessage("");
    try {
      const optionsResponse = await fetch("/api/auth/passkey-options", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }),
      });
      const optionsResult = await optionsResponse.json() as { flowId?: string; options?: PublicKeyCredentialRequestOptionsJSON; error?: string };
      if (!optionsResponse.ok || !optionsResult.flowId || !optionsResult.options) throw new Error(optionsResult.error || "无法启动 Passkey 登录");
      const authentication = await startAuthentication({ optionsJSON: optionsResult.options });
      const verifyResponse = await fetch("/api/auth/passkey-verify", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ flowId: optionsResult.flowId, response: authentication }),
      });
      const result = await verifyResponse.json() as { error?: string };
      if (!verifyResponse.ok) throw new Error(result.error || "Passkey 验证失败");
      window.location.assign(next);
    } catch (error) {
      setMessage(error instanceof Error && error.name === "NotAllowedError" ? "已取消 Passkey 验证。" : error instanceof Error ? error.message : "Passkey 登录失败");
    } finally { setBusy(false); }
  }

  return <div className="user-auth-card">
    <div className="auth-tabs" role="tablist" aria-label="账户操作">
      <button type="button" role="tab" aria-selected={intent === "login"} onClick={() => switchIntent("login")}>{copy.loginTab}</button>
      <button type="button" role="tab" aria-selected={intent === "register"} onClick={() => switchIntent("register")}>{copy.registerTab}</button>
    </div>
    {step === "details" && loginMode !== "reset" && <div className="login-methods" role="tablist" aria-label="登录方式"><button type="button" role="tab" aria-selected={loginMode === "code"} className={loginMode === "code" ? "is-active" : ""} onClick={() => setLoginMode("code")}>邮箱验证码</button>{intent === "login" && <button type="button" role="tab" aria-selected={loginMode === "password"} className={loginMode === "password" ? "is-active" : ""} onClick={() => setLoginMode("password")}>密码登录</button>}<button type="button" role="tab" aria-selected={loginMode === "qq"} className={loginMode === "qq" ? "is-active" : ""} onClick={() => setLoginMode("qq")}><Icon name="bot" /> QQ Bot</button></div>}
    {step === "qq" && qqFlow ? <section className="qq-auth-wait" aria-live="polite"><span className="qq-auth-bot"><Icon name="bot" /></span><div><small>验证 Bot</small><strong>QQ {qqFlow.botId}</strong></div><p>私聊这个 Bot，发送下面的指令。本页会自动检测验证结果。</p><button type="button" className="qq-auth-command" onClick={copyQqCommand}><code>{qqFlow.command}</code><span>复制指令</span></button><button className="login-resend" type="button" onClick={() => { setStep("details"); setQqFlow(null); setMessage(""); }}>取消并返回</button></section> : step === "details" && loginMode === "qq" ? <form onSubmit={startQq} aria-busy={busy} className="qq-auth-start">
      {intent === "register" && <label><span>{copy.displayName}</span><input value={displayName} minLength={2} maxLength={40} autoComplete="nickname" onChange={(event) => setDisplayName(event.target.value)} placeholder="大家怎么称呼你？" required /></label>}
      <div className="qq-auth-intro"><Icon name="shield" /><p>验证由指定 QQ Bot 完成。网站不会读取你的 QQ 密码，也不会要求邮箱验证码。</p></div>
      <button className="login-action" type="submit" disabled={busy}>{busy ? "正在连接 Bot…" : <>{intent === "register" ? "使用 QQ 注册" : "使用 QQ 登录"}<ArrowIcon /></>}</button>
    </form> : step === "details" && loginMode === "password" && intent === "login" ? <form onSubmit={signInWithPassword} aria-busy={busy}><label><span>邮箱或 8 位 UID</span><input value={email} autoComplete="username" onChange={(event) => setEmail(event.target.value)} required /></label><label><span>密码</span><input type="password" value={password} minLength={8} maxLength={128} autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} required /></label><button className="login-action" type="submit" disabled={busy}>{busy ? "正在登录…" : <>登录 <ArrowIcon /></>}</button><button className="login-resend" type="button" onClick={() => { setLoginMode("reset"); setStep("details"); setMessage(""); }}>忘记密码？通过邮箱重置</button>{supported && <><div className="login-divider"><span>或</span></div><button className="login-passkey" type="button" disabled={busy} onClick={signInWithPasskey}><Icon name="key" /> {copy.passkey}</button></>}</form> : step === "details" ? <form onSubmit={sendCode} aria-busy={busy}>
      {intent === "register" && <label><span>{copy.displayName}</span><input value={displayName} maxLength={40} autoComplete="nickname" onChange={(event) => setDisplayName(event.target.value)} placeholder="大家怎么称呼你？" required /></label>}
      <label><span>{copy.email}</span><input type="email" value={email} autoComplete="email" onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></label>
      <button className="login-action" type="submit" disabled={busy}>{busy ? "正在发送…" : <>{intent === "register" ? copy.register : loginMode === "reset" ? "发送重置验证码" : copy.sendCode}<ArrowIcon /></>}</button>
      {intent === "login" && loginMode === "code" && supported && <><div className="login-divider"><span>或</span></div><button className="login-passkey" type="button" disabled={busy} onClick={signInWithPasskey}><Icon name="key" /> {copy.passkey}</button></>}
    </form> : <form onSubmit={loginMode === "reset" ? resetPassword : verify} aria-busy={busy}>
      <label><span>已发送至</span><input value={email} readOnly /></label>
      <label><span>6 位验证码</span><input className="user-code-input" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required /></label>
      {loginMode === "reset" && <label><span>新密码</span><input type="password" value={password} minLength={8} maxLength={128} autoComplete="new-password" onChange={(event) => setPassword(event.target.value)} required /></label>}
      <button className="login-action" type="submit" disabled={busy || code.length !== 6 || (loginMode === "reset" && password.length < 8)}>{busy ? "正在验证…" : <>{loginMode === "reset" ? "验证并重置密码" : "验证并继续"} <ArrowIcon /></>}</button>
      <button className="login-resend" type="button" onClick={() => setStep("details")}>返回修改邮箱</button>
    </form>}
    {message && <p className="user-auth-message" role="status">{message}</p>}
    <small>{copy.agreement}</small>
  </div>;
}

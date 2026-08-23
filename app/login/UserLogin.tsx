"use client";

import { FormEvent, useState, useSyncExternalStore } from "react";
import { browserSupportsWebAuthn, startAuthentication, type PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import ArrowIcon from "../ArrowIcon";
import Icon from "../Icon";
import { pageModule } from "../../lib/site-pages";

type Intent = "login" | "register";
const copy = pageModule("login", "login-form").fields;

export default function UserLogin({ next }: { next: string }) {
  const supported = useSyncExternalStore(() => () => undefined, browserSupportsWebAuthn, () => false);
  const [intent, setIntent] = useState<Intent>("login");
  const [step, setStep] = useState<"details" | "code">("details");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function switchIntent(value: Intent) { setIntent(value); setStep("details"); setCode(""); setMessage(""); }

  async function sendCode(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/auth/send-code", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, intent, displayName: intent === "register" ? displayName : undefined }),
      });
      const result = await response.json() as { error?: string };
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
    {step === "details" ? <form onSubmit={sendCode} aria-busy={busy}>
      {intent === "register" && <label><span>{copy.displayName}</span><input value={displayName} maxLength={40} autoComplete="nickname" onChange={(event) => setDisplayName(event.target.value)} placeholder="大家怎么称呼你？" required /></label>}
      <label><span>{copy.email}</span><input type="email" value={email} autoComplete="email" onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></label>
      <button className="login-action" type="submit" disabled={busy}>{busy ? "正在发送…" : <>{intent === "register" ? copy.register : copy.sendCode}<ArrowIcon /></>}</button>
      {intent === "login" && supported && <><div className="login-divider"><span>或</span></div><button className="login-passkey" type="button" disabled={busy} onClick={signInWithPasskey}><Icon name="key" /> {copy.passkey}</button></>}
    </form> : <form onSubmit={verify} aria-busy={busy}>
      <label><span>已发送至</span><input value={email} readOnly /></label>
      <label><span>6 位验证码</span><input className="user-code-input" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required /></label>
      <button className="login-action" type="submit" disabled={busy || code.length !== 6}>{busy ? "正在验证…" : <>验证并继续 <ArrowIcon /></>}</button>
      <button className="login-resend" type="button" onClick={() => setStep("details")}>返回修改邮箱</button>
    </form>}
    {message && <p className="user-auth-message" role="status">{message}</p>}
    <small>{copy.agreement}</small>
  </div>;
}

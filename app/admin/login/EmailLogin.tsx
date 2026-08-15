"use client";

import { FormEvent, useEffect, useState } from "react";

export default function EmailLogin({ email }: { email: string }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function sendCode() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/auth/send-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const result = await response.json() as { ok?: boolean; error?: string; retryAfter?: number };
      if (!response.ok) throw new Error(result.error || "发送失败");
      setStep("code"); setCooldown(60); setMessage("验证码已发送，请检查收件箱和垃圾邮件");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "验证码发送失败");
    } finally { setBusy(false); }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) { setMessage("请输入 6 位验证码"); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/auth/verify-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code }) });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok) throw new Error(result.error || "验证失败");
      window.location.assign("/admin");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "验证码验证失败");
    } finally { setBusy(false); }
  }

  return (
    <form className="login-form" onSubmit={verify}>
      <label><span>管理员邮箱</span><input value={email} readOnly aria-label="管理员邮箱" /></label>
      {step === "code" && <label><span>6 位验证码</span><input className="otp-input" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" autoFocus /></label>}
      {message && <div className={`login-status ${message.startsWith("验证码已发送") ? "success" : ""}`} role="status">{message}</div>}
      {step === "email" ? <button className="login-action" type="button" disabled={busy} onClick={sendCode}>{busy ? "正在发送…" : "发送邮箱验证码 →"}</button> : <>
        <button className="login-action" type="submit" disabled={busy}>{busy ? "正在验证…" : "验证并进入后台 →"}</button>
        <button className="login-resend" type="button" disabled={busy || cooldown > 0} onClick={sendCode}>{cooldown > 0 ? `${cooldown} 秒后可重新发送` : "重新发送验证码"}</button>
      </>}
    </form>
  );
}

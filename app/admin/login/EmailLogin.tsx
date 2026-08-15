"use client";

import { ClipboardEvent, FormEvent, KeyboardEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { browserSupportsWebAuthn, startAuthentication, type PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import ArrowIcon from "../../ArrowIcon";

const CODE_LENGTH = 6;

export default function EmailLogin({ email }: { email: string }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [code, setCode] = useState<string[]>(() => Array(CODE_LENGTH).fill(""));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const passkeySupported = useSyncExternalStore(() => () => undefined, browserSupportsWebAuthn, () => false);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const verifyingRef = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    if (step === "code") inputRefs.current[0]?.focus();
  }, [step]);

  async function sendCode() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/auth/send-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const result = await response.json() as { ok?: boolean; error?: string; retryAfter?: number };
      if (!response.ok) throw new Error(result.error || "发送失败");
      setCode(Array(CODE_LENGTH).fill("")); setStep("code"); setCooldown(60); setMessage("验证码已发送，请检查收件箱和垃圾邮件");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "验证码发送失败");
    } finally { setBusy(false); }
  }

  async function verifyCode(value: string) {
    if (!/^\d{6}$/.test(value)) { setMessage("请输入 6 位验证码"); return; }
    if (verifyingRef.current) return;
    verifyingRef.current = true;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/auth/verify-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code: value }) });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok) throw new Error(result.error || "验证失败");
      window.location.assign("/admin");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "验证码验证失败");
      inputRefs.current[0]?.focus();
      inputRefs.current[0]?.select();
    } finally { verifyingRef.current = false; setBusy(false); }
  }

  async function signInWithPasskey() {
    setBusy(true); setMessage("");
    try {
      const optionsResponse = await fetch("/api/admin/auth/passkey-options", { method: "POST" });
      const optionsResult = await optionsResponse.json() as {
        flowId?: string;
        options?: PublicKeyCredentialRequestOptionsJSON;
        error?: string;
      };
      if (!optionsResponse.ok || !optionsResult.flowId || !optionsResult.options) {
        throw new Error(optionsResult.error || "暂时无法使用 Passkey 登录");
      }

      const authentication = await startAuthentication({ optionsJSON: optionsResult.options });
      const verifyResponse = await fetch("/api/admin/auth/passkey-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flowId: optionsResult.flowId, response: authentication }),
      });
      const verifyResult = await verifyResponse.json() as { ok?: boolean; error?: string };
      if (!verifyResponse.ok) throw new Error(verifyResult.error || "Passkey 验证失败");
      window.location.assign("/admin");
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      setMessage(name === "NotAllowedError" ? "已取消 Passkey 验证" : error instanceof Error ? error.message : "Passkey 登录失败");
    } finally { setBusy(false); }
  }

  function verify(event: FormEvent) {
    event.preventDefault();
    void verifyCode(code.join(""));
  }

  function applyDigits(index: number, value: string) {
    const incoming = value.replace(/\D/g, "");
    const next = [...code];

    if (!incoming) {
      next[index] = "";
      setCode(next);
      return;
    }

    incoming.slice(0, CODE_LENGTH - index).split("").forEach((digit, offset) => {
      next[index + offset] = digit;
    });
    setCode(next);

    const nextEmptyIndex = next.findIndex((digit, digitIndex) => digitIndex > index && !digit);
    const focusIndex = nextEmptyIndex === -1 ? Math.min(index + incoming.length, CODE_LENGTH - 1) : nextEmptyIndex;
    inputRefs.current[focusIndex]?.focus();

    const completedCode = next.join("");
    if (next.every(Boolean)) void verifyCode(completedCode);
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !code[index] && index > 0) {
      const next = [...code];
      next[index - 1] = "";
      setCode(next);
      inputRefs.current[index - 1]?.focus();
    } else if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (event.key === "ArrowRight" && index < CODE_LENGTH - 1) {
      event.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const pastedCode = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!pastedCode) return;
    event.preventDefault();
    const next = Array(CODE_LENGTH).fill("");
    pastedCode.split("").forEach((digit, index) => { next[index] = digit; });
    setCode(next);
    inputRefs.current[Math.min(pastedCode.length, CODE_LENGTH) - 1]?.focus();
    if (pastedCode.length === CODE_LENGTH) void verifyCode(pastedCode);
  }

  return (
    <form className="login-form" onSubmit={verify}>
      <label><span>管理员邮箱</span><input value={email} readOnly aria-label="管理员邮箱" /></label>
      {step === "code" && <div className="otp-field">
        <span id="otp-label">6 位验证码</span>
        <div className="otp-inputs" role="group" aria-labelledby="otp-label" onPaste={handlePaste}>
          {code.map((digit, index) => <input
            key={index}
            ref={(element) => { inputRefs.current[index] = element; }}
            className="otp-input"
            value={digit}
            onChange={(event) => applyDigits(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onFocus={(event) => event.target.select()}
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            aria-label={`验证码第 ${index + 1} 位`}
            maxLength={index === 0 ? CODE_LENGTH : 1}
            disabled={busy}
          />)}
        </div>
      </div>}
      {message && <div className={`login-status ${message.startsWith("验证码已发送") ? "success" : ""}`} role="status">{message}</div>}
      {step === "email" ? <>
        <button className="login-action" type="button" disabled={busy} onClick={sendCode}>{busy ? "正在发送…" : <>发送邮箱验证码 <ArrowIcon /></>}</button>
        {passkeySupported && <>
          <div className="login-divider"><span>或</span></div>
          <button className="login-passkey" type="button" disabled={busy} onClick={signInWithPasskey}><span className="passkey-symbol" aria-hidden="true">⌁</span> 使用 Passkey 登录</button>
        </>}
      </> : <>
        <button className="login-action" type="submit" disabled={busy}>{busy ? "正在验证…" : <>验证并进入后台 <ArrowIcon /></>}</button>
        <button className="login-resend" type="button" disabled={busy || cooldown > 0} onClick={sendCode}>{cooldown > 0 ? `${cooldown} 秒后可重新发送` : "重新发送验证码"}</button>
      </>}
    </form>
  );
}

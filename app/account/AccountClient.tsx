"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { browserSupportsWebAuthn, startRegistration, type PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import Icon from "../Icon";

type User = { id: string; displayName: string; email: string; createdAt: number };
type Passkey = { id: string; name: string; createdAt: number; lastUsedAt: number | null };

export default function AccountClient() {
  const supported = useSyncExternalStore(() => () => undefined, browserSupportsWebAuthn, () => false);
  const [user, setUser] = useState<User | null>(null);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [name, setName] = useState("我的设备");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const meResponse = await fetch("/api/auth/me", { cache: "no-store" });
    if (!meResponse.ok) { setLoading(false); return; }
    setUser(((await meResponse.json()) as { user: User }).user);
    const passkeyResponse = await fetch("/api/account/passkeys", { cache: "no-store" });
    if (passkeyResponse.ok) setPasskeys(((await passkeyResponse.json()) as { passkeys: Passkey[] }).passkeys);
    setLoading(false);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load().catch(() => { setMessage("账户信息加载失败"); setLoading(false); }), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function addPasskey() {
    setBusy(true); setMessage("");
    try {
      const optionsResponse = await fetch("/api/account/passkeys/options", { method: "POST" });
      const optionsResult = await optionsResponse.json() as { flowId?: string; options?: PublicKeyCredentialCreationOptionsJSON; error?: string };
      if (!optionsResponse.ok || !optionsResult.flowId || !optionsResult.options) throw new Error(optionsResult.error || "无法创建 Passkey");
      const registration = await startRegistration({ optionsJSON: optionsResult.options });
      const verifyResponse = await fetch("/api/account/passkeys/verify", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ flowId: optionsResult.flowId, response: registration, name }),
      });
      const result = await verifyResponse.json() as { error?: string };
      if (!verifyResponse.ok) throw new Error(result.error || "Passkey 保存失败");
      setMessage("Passkey 已添加"); await load();
    } catch (error) { setMessage(error instanceof Error && error.name === "NotAllowedError" ? "已取消创建 Passkey" : error instanceof Error ? error.message : "Passkey 创建失败"); }
    finally { setBusy(false); }
  }

  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); window.location.assign("/"); }

  if (loading) return <section className="account-shell shell"><div className="account-loading" role="status">正在读取账户…</div></section>;
  if (!user) return <section className="account-shell shell"><div className="account-login-required"><Icon name="user" /><h1>还没有登录</h1><p>登录后可以管理 Passkey，并参与文章讨论。</p><a href="/login?next=/account">登录 / 注册</a></div></section>;

  return <section className="account-shell shell">
    <header className="account-head"><div><p>READER ACCOUNT / 读者账户</p><h1>{user.displayName}</h1><span>{user.email}</span></div><button type="button" onClick={logout}>退出登录</button></header>
    <div className="account-passkeys">
      <div><Icon name="key" /><p>PASSKEY</p><h2>更快、更安全地回来</h2><span>Passkey 使用指纹、面容或设备 PIN；邮箱验证码仍可用于恢复。</span></div>
      <div>
        {supported ? <div className="account-passkey-add"><label><span>设备名称</span><input value={name} maxLength={40} onChange={(event) => setName(event.target.value)} /></label><button type="button" disabled={busy} onClick={addPasskey}>{busy ? "正在添加…" : "添加 Passkey"}</button></div> : <p>当前浏览器不支持 Passkey。</p>}
        <ul>{passkeys.map((item) => <li key={item.id}><span><Icon name="check" /></span><div><b>{item.name}</b><small>添加于 {new Date(item.createdAt).toLocaleDateString("zh-CN")}{item.lastUsedAt ? ` · 最近使用 ${new Date(item.lastUsedAt).toLocaleDateString("zh-CN")}` : ""}</small></div></li>)}</ul>
        {!passkeys.length && <p className="account-passkey-empty">尚未添加 Passkey。</p>}
        {message && <p className="account-message" role="status">{message}</p>}
      </div>
    </div>
  </section>;
}

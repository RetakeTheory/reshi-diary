"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { browserSupportsWebAuthn, startRegistration, type PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";

type PasskeyItem = {
  id: string;
  name: string;
  deviceType: string;
  backedUp: boolean;
  createdAt: number;
  lastUsedAt: number | null;
};

export default function PasskeyManager() {
  const supported = useSyncExternalStore(() => () => undefined, browserSupportsWebAuthn, () => false);
  const [items, setItems] = useState<PasskeyItem[]>([]);
  const [name, setName] = useState("我的设备");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function loadPasskeys() {
    const response = await fetch("/api/admin/passkeys", { cache: "no-store" });
    if (!response.ok) return;
    const result = await response.json() as { passkeys?: PasskeyItem[] };
    setItems(result.passkeys || []);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPasskeys(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function addPasskey() {
    setBusy(true); setMessage("");
    try {
      const optionsResponse = await fetch("/api/admin/passkeys/options", { method: "POST" });
      const optionsResult = await optionsResponse.json() as {
        flowId?: string;
        options?: PublicKeyCredentialCreationOptionsJSON;
        error?: string;
      };
      if (!optionsResponse.ok || !optionsResult.flowId || !optionsResult.options) {
        throw new Error(optionsResult.error || "无法创建 Passkey");
      }

      const registration = await startRegistration({ optionsJSON: optionsResult.options });
      const verifyResponse = await fetch("/api/admin/passkeys/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flowId: optionsResult.flowId, response: registration, name: name.trim() || "我的设备" }),
      });
      const verifyResult = await verifyResponse.json() as { ok?: boolean; error?: string };
      if (!verifyResponse.ok) throw new Error(verifyResult.error || "Passkey 保存失败");
      setMessage("Passkey 已添加，下次可以直接用指纹、面容或设备 PIN 登录。");
      await loadPasskeys();
    } catch (error) {
      const errorName = error instanceof Error ? error.name : "";
      setMessage(errorName === "NotAllowedError" ? "已取消创建 Passkey" : error instanceof Error ? error.message : "Passkey 创建失败");
    } finally { setBusy(false); }
  }

  return (
    <section className="passkey-manager" aria-labelledby="passkey-title">
      <div className="passkey-copy">
        <p>SECURITY / 登录安全</p>
        <h2 id="passkey-title">Passkey</h2>
        <span>添加后可用指纹、面容或设备 PIN 登录；邮箱验证码仍可作为备用方式。</span>
      </div>
      <div className="passkey-controls">
        {supported ? <>
          <div className="passkey-add">
            <input value={name} maxLength={40} onChange={(event) => setName(event.target.value)} aria-label="Passkey 设备名称" />
            <button type="button" disabled={busy} onClick={addPasskey}>{busy ? "正在添加…" : "添加 Passkey"}</button>
          </div>
          {message && <p className="passkey-message" role="status">{message}</p>}
          <div className="passkey-list">
            {items.length ? items.map((item) => <div className="passkey-item" key={item.id}>
              <div><b>{item.name}</b><span>{item.backedUp ? "已同步" : "仅此设备"} · {new Date(item.createdAt).toLocaleDateString("zh-CN")}</span></div>
              <i aria-hidden="true">✓</i>
            </div>) : <span className="passkey-empty">尚未添加 Passkey</span>}
          </div>
        </> : <p className="passkey-message">当前浏览器不支持 Passkey。</p>}
      </div>
    </section>
  );
}

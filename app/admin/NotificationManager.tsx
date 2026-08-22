"use client";

import { FormEvent, useEffect, useState } from "react";
import Icon from "../Icon";

type Notification = { id: number; text: string; backgroundColor: string; createdAt: number; updatedAt: number };
const presets = ["#7657F6", "#2F7D67", "#B94C64", "#C4682D", "#245F9E"];

function foregroundFor(background: string) {
  const channels = [1, 3, 5].map((start) => Number.parseInt(background.slice(start, start + 2), 16) || 0);
  return channels[0] * 0.299 + channels[1] * 0.587 + channels[2] * 0.114 > 155 ? "#171326" : "#FFFFFF";
}

export default function NotificationManager() {
  const [current, setCurrent] = useState<Notification | null>(null);
  const [text, setText] = useState("");
  const [color, setColor] = useState("#7657F6");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/admin/notification", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const result = await response.json() as { notification: Notification | null };
      setCurrent(result.notification);
      if (result.notification) { setText(result.notification.text); setColor(result.notification.backgroundColor); }
    }).catch(() => setMessage("通知功能暂时不可用"));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/notification", {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, backgroundColor: color }),
      });
      const result = await response.json() as { notification?: Notification; error?: string };
      if (!response.ok || !result.notification) throw new Error(result.error || "通知发布失败");
      setCurrent(result.notification); setMessage("通知已发布，现已显示在全站顶部");
    } catch (error) { setMessage(error instanceof Error ? error.message : "通知发布失败"); }
    finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/notification", { method: "DELETE" });
      if (!response.ok) throw new Error("通知撤下失败");
      setCurrent(null); setText(""); setMessage("通知已撤下");
    } catch (error) { setMessage(error instanceof Error ? error.message : "通知撤下失败"); }
    finally { setBusy(false); }
  }

  return <section className="notification-manager" aria-labelledby="notification-title">
    <div className="notification-copy"><p>NOTICE / 站内通知</p><h2 id="notification-title">顶部 Banner</h2><span>发布后立即显示在全站顶部；长文字会自动滚动。</span></div>
    <form onSubmit={save}>
      <label><span>通知内容</span><textarea value={text} maxLength={300} onChange={(event) => setText(event.target.value)} placeholder="例如：今晚 22:00 进行短暂维护。" required /></label>
      <div className="notification-colors"><span>底色</span><div>{presets.map((preset) => <button type="button" key={preset} className={color === preset ? "is-active" : ""} style={{ backgroundColor: preset }} aria-label={`选择颜色 ${preset}`} aria-pressed={color === preset} onClick={() => setColor(preset)} />)}<label><span className="sr-only">自定义底色</span><input type="color" value={color} onChange={(event) => setColor(event.target.value.toUpperCase())} /></label></div></div>
      <div className="notification-preview" style={{ backgroundColor: color, color: foregroundFor(color) }}><Icon name="spark" /><span>{text || "通知预览"}</span></div>
      {message && <p className="notification-message" role="status">{message}</p>}
      <div className="notification-actions">{current && <button type="button" className="button-quiet" disabled={busy} onClick={remove}>撤下当前通知</button>}<button type="submit" disabled={busy}>{busy ? "正在保存…" : current ? "更新通知" : "发布通知"}</button></div>
    </form>
  </section>;
}

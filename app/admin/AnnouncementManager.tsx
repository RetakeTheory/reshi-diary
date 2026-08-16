"use client";

import { FormEvent, useEffect, useState } from "react";

type Announcement = { id: number; content: string; link_url: string; link_label: string; published: number; updated_at: number };

export default function AnnouncementManager() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [content, setContent] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const response = await fetch("/api/admin/announcements");
    const result = await response.json() as { announcements?: Announcement[]; error?: string };
    if (response.ok) setItems(result.announcements || []); else setMessage(result.error || "通知读取失败");
  }
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, []);
  async function publish(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/announcements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content, linkUrl, linkLabel }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "发布失败");
      setContent(""); setLinkUrl(""); setLinkLabel(""); setMessage("首页通知已发布"); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "发布失败"); }
    finally { setBusy(false); }
  }
  async function setPublished(id: number, published: boolean) {
    const response = await fetch(`/api/admin/announcements/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ published }) });
    if (response.ok) { setMessage(published ? "通知已重新发布" : "通知已撤回"); await refresh(); }
  }
  return <section className="announcement-manager">
    <div className="announcement-admin-head"><div><small>NOTICE BANNER</small><h2>首页通知</h2></div><span>发布后显示在首页最上方</span></div>
    <form onSubmit={publish}><label><span>通知内容</span><input value={content} onChange={(event) => setContent(event.target.value)} placeholder="例如：网站将于今晚 23:00 维护" maxLength={240} required /></label><label><span>跳转链接（可选）</span><input value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="/posts/... 或 https://..." /></label><label><span>链接文字</span><input value={linkLabel} onChange={(event) => setLinkLabel(event.target.value)} placeholder="了解更多" maxLength={30} /></label><button type="submit" disabled={busy}>{busy ? "发布中…" : "发布通知"}</button></form>
    {message && <p className="announcement-admin-message">{message}</p>}
    <div className="announcement-history">{items.map((item) => <article key={item.id}><div><span className={item.published ? "live" : "offline"}>{item.published ? "展示中" : "已撤回"}</span><p>{item.content}</p><small>{new Date(item.updated_at).toLocaleString("zh-CN")}</small></div><button onClick={() => setPublished(item.id, !item.published)}>{item.published ? "取消发布" : "重新发布"}</button></article>)}</div>
  </section>;
}

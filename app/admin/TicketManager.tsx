"use client";

import { useEffect, useState } from "react";
import Icon from "../Icon";

type Ticket = { id: number; category: string; title: string; body: string; status: string; adminReply: string | null; createdAt: number; updatedAt: number; displayName: string; email: string };
const statuses = [{ value: "open", label: "待处理" }, { value: "in_progress", label: "处理中" }, { value: "resolved", label: "已解决" }, { value: "closed", label: "已关闭" }];

export default function TicketManager() {
  const [items, setItems] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState("open");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { fetch("/api/admin/tickets", { cache: "no-store" }).then(async (response) => { if (response.ok) setItems(((await response.json()) as { tickets: Ticket[] }).tickets); }).catch(() => setMessage("工单暂时无法加载")); }, []);
  function open(item: Ticket) { setSelected(item); setReply(item.adminReply || ""); setStatus(item.status); setMessage(""); }
  async function save() {
    if (!selected) return; setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/tickets/${selected.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, adminReply: reply }) });
      const result = await response.json() as { ticket?: Ticket; error?: string }; if (!response.ok || !result.ticket) throw new Error(result.error || "保存失败");
      const updated = { ...selected, ...result.ticket }; setSelected(updated); setItems((current) => current.map((item) => item.id === updated.id ? updated : item)); setMessage("工单已更新");
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存失败"); } finally { setBusy(false); }
  }
  return <section className="admin-ticket-manager"><header><div><p>SUPPORT / 读者工单</p><h2>意见与问题</h2><span>{items.filter((item) => item.status === "open").length} 条待处理</span></div><Icon name="comment" /></header><div className="admin-ticket-layout"><div className="admin-ticket-list">{items.length ? items.map((item) => <button type="button" className={selected?.id === item.id ? "is-active" : ""} key={item.id} onClick={() => open(item)}><span className={`ticket-status status-${item.status}`}>{statuses.find((entry) => entry.value === item.status)?.label}</span><b>{item.title}</b><small>{item.displayName} · {new Date(item.updatedAt).toLocaleDateString("zh-CN")}</small></button>) : <p>暂无工单。</p>}</div>{selected ? <div className="admin-ticket-detail"><div><span>{selected.displayName} · {selected.email}</span><h3>{selected.title}</h3><p>{selected.body}</p></div><label><span>处理状态</span><select value={status} onChange={(event) => setStatus(event.target.value)}>{statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label><span>回复读者</span><textarea maxLength={2000} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="说明处理结果或下一步…" /></label><button type="button" disabled={busy} onClick={save}>{busy ? "正在保存…" : "保存处理结果"}</button></div> : <div className="admin-ticket-empty">选择一条工单查看详情。</div>}</div>{message && <p className="notification-message" role="status">{message}</p>}</section>;
}

"use client";

import { FormEvent, useEffect, useState } from "react";
import type { FoodRankingEntry, FoodRankingType } from "../../lib/food-rankings";
import Icon from "../Icon";

type Draft = { id?: string; listType: FoodRankingType; restaurant: string; location: string; category: string; summary: string; details: string; tags: string };
const blank: Draft = { listType: "red", restaurant: "", location: "", category: "", summary: "", details: "", tags: "" };

export default function FoodRankingManager() {
  const [items, setItems] = useState<FoodRankingEntry[]>([]); const [draft, setDraft] = useState<Draft>(blank); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  useEffect(() => { fetch("/api/admin/food-rankings", { cache: "no-store" }).then(async (response) => { const result = await response.json() as { entries?: FoodRankingEntry[]; error?: string }; if (!response.ok) throw new Error(result.error || "榜单加载失败"); setItems(result.entries || []); }).catch((error) => setMessage(error instanceof Error ? error.message : "榜单加载失败")); }, []);
  function edit(item: FoodRankingEntry) { setDraft({ id: item.id, listType: item.listType, restaurant: item.restaurant, location: item.location, category: item.category, summary: item.summary, details: item.details, tags: item.tags.join("、") }); setMessage(""); }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch(draft.id ? `/api/admin/food-rankings/${draft.id}` : "/api/admin/food-rankings", { method: draft.id ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...draft, tags: draft.tags.split(/[、,，]/).map((item) => item.trim()).filter(Boolean) }) });
      const result = await response.json() as { entry?: FoodRankingEntry; error?: string }; if (!response.ok || !result.entry) throw new Error(result.error || "保存失败");
      setItems((current) => draft.id ? current.map((item) => item.id === result.entry!.id ? result.entry! : item) : [result.entry!, ...current]); setDraft(blank); setMessage("榜单内容已保存");
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存失败"); } finally { setBusy(false); }
  }
  async function remove() {
    if (!draft.id || !confirm("确定删除这家餐厅的榜单模块？")) return; setBusy(true);
    try { const response = await fetch(`/api/admin/food-rankings/${draft.id}`, { method: "DELETE" }); if (!response.ok) throw new Error("删除失败"); setItems((current) => current.filter((item) => item.id !== draft.id)); setDraft(blank); setMessage("榜单条目已删除"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "删除失败"); } finally { setBusy(false); }
  }
  return <section className="admin-food-rankings">
    <header><div><h2>学校干饭红黑榜</h2><span>榜单内容仅管理员可添加；每家餐厅会作为独立模块展示。</span></div><a href="/plugins/food-rankings" target="_blank" rel="noreferrer">查看公开榜单</a></header>
    <div className="admin-food-layout"><aside>{items.length ? items.map((item) => <button type="button" className={draft.id === item.id ? "is-active" : ""} key={item.id} onClick={() => edit(item)}><span className={`food-ranking-badge is-${item.listType}`}>{item.listType === "red" ? "红榜" : "黑榜"}</span><b>{item.restaurant}</b><small>{item.location || item.category || "未填写位置"}</small></button>) : <p>还没有榜单内容。</p>}</aside>
      <form onSubmit={save}><div className="food-ranking-kind"><button type="button" className={draft.listType === "red" ? "is-active" : ""} onClick={() => setDraft({ ...draft, listType: "red" })}>红榜 · 绿色展示</button><button type="button" className={draft.listType === "black" ? "is-active" : ""} onClick={() => setDraft({ ...draft, listType: "black" })}>黑榜 · 红色展示</button></div><label><span>餐厅名称</span><input value={draft.restaurant} maxLength={100} onChange={(event) => setDraft({ ...draft, restaurant: event.target.value })} required /></label><div className="admin-food-row"><label><span>位置</span><input value={draft.location} maxLength={120} onChange={(event) => setDraft({ ...draft, location: event.target.value })} /></label><label><span>分类</span><input value={draft.category} maxLength={60} placeholder="食堂 / 外卖 / 饮品" onChange={(event) => setDraft({ ...draft, category: event.target.value })} /></label></div><label><span>榜单摘要</span><input value={draft.summary} maxLength={300} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} required /></label><label><span>详细说明</span><textarea value={draft.details} maxLength={4000} onChange={(event) => setDraft({ ...draft, details: event.target.value })} /></label><label><span>标签（顿号或逗号分隔）</span><input value={draft.tags} maxLength={400} placeholder="性价比、夜宵、排队快" onChange={(event) => setDraft({ ...draft, tags: event.target.value })} /></label>{message && <p role="status">{message}</p>}<footer>{draft.id && <button className="danger" type="button" disabled={busy} onClick={remove}><Icon name="trash" />删除</button>}<button type="button" onClick={() => setDraft(blank)}>新建条目</button><button type="submit" disabled={busy}>{busy ? "保存中…" : "保存榜单模块"}</button></footer></form></div>
  </section>;
}

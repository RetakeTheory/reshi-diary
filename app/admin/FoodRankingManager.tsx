"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import type { FoodRankingEntry } from "../../lib/food-rankings";
import Icon from "../Icon";
import FoodRankingMap from "../plugins/food-rankings/FoodRankingMap";

type Draft = { id?: string; adminRating: string; restaurant: string; location: string; category: string; summary: string; details: string; tags: string; imageUrl: string; latitude: string; longitude: string };
const blank: Draft = { adminRating: "", restaurant: "", location: "", category: "", summary: "", details: "", tags: "", imageUrl: "", latitude: "", longitude: "" };

export default function FoodRankingManager() {
  const [items, setItems] = useState<FoodRankingEntry[]>([]); const [draft, setDraft] = useState<Draft>(blank); const [busy, setBusy] = useState(false); const [photoUploading, setPhotoUploading] = useState(false); const [message, setMessage] = useState("");
  useEffect(() => { fetch("/api/admin/food-rankings", { cache: "no-store" }).then(async (response) => { const result = await response.json() as { entries?: FoodRankingEntry[]; error?: string }; if (!response.ok) throw new Error(result.error || "餐厅加载失败"); setItems(result.entries || []); }).catch((error) => setMessage(error instanceof Error ? error.message : "餐厅加载失败")); }, []);
  function edit(item: FoodRankingEntry) { setDraft({ id: item.id, adminRating: item.adminRating === null ? "" : String(item.adminRating), restaurant: item.restaurant, location: item.location, category: item.category, summary: item.summary, details: item.details, tags: item.tags.join("、"), imageUrl: item.imageUrl, latitude: item.latitude === null ? "" : String(item.latitude), longitude: item.longitude === null ? "" : String(item.longitude) }); setMessage(""); }
  async function uploadPhoto(file: File) {
    if (!file.type.startsWith("image/")) { setMessage("请选择照片文件"); return; }
    if (file.size > 20 * 1024 * 1024) { setMessage("饭菜照片不能超过 20 MB"); return; }
    setPhotoUploading(true); setMessage("");
    try {
      const form = new FormData(); form.set("file", file); form.set("previewable", "true");
      const response = await fetch("/api/admin/uploads", { method: "POST", body: form });
      const result = await response.json() as { url?: string; isImage?: boolean; error?: string };
      if (!response.ok || !result.url || !result.isImage) throw new Error(result.error || "照片上传失败");
      setDraft((current) => ({ ...current, imageUrl: result.url! })); setMessage("饭菜照片已上传，保存餐厅模块后生效");
    } catch (error) { setMessage(error instanceof Error ? error.message : "照片上传失败"); } finally { setPhotoUploading(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch(draft.id ? `/api/admin/food-rankings/${draft.id}` : "/api/admin/food-rankings", { method: draft.id ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...draft, adminRating: draft.adminRating === "" ? null : Number(draft.adminRating), latitude: draft.latitude || null, longitude: draft.longitude || null, tags: draft.tags.split(/[、,，]/).map((item) => item.trim()).filter(Boolean) }) });
      const result = await response.json() as { entry?: FoodRankingEntry; error?: string }; if (!response.ok || !result.entry) throw new Error(result.error || "保存失败");
      setItems((current) => draft.id ? current.map((item) => item.id === result.entry!.id ? result.entry! : item) : [result.entry!, ...current]); setDraft(blank); setMessage("餐厅内容已保存");
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存失败"); } finally { setBusy(false); }
  }
  async function remove() {
    if (!draft.id || !confirm("确定删除这家餐厅的餐厅模块？")) return; setBusy(true);
    try { const response = await fetch(`/api/admin/food-rankings/${draft.id}`, { method: "DELETE" }); if (!response.ok) throw new Error("删除失败"); setItems((current) => current.filter((item) => item.id !== draft.id)); setDraft(blank); setMessage("餐厅条目已删除"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "删除失败"); } finally { setBusy(false); }
  }
  return <section className="admin-food-rankings">
    <header><div><h2>学校干饭评分</h2><span>餐厅内容仅管理员可添加；每家餐厅会作为独立模块展示。</span></div><a href="/plugins/food-rankings" target="_blank" rel="noreferrer">查看公开餐厅</a></header>
    <div className="admin-food-layout"><aside>{items.length ? items.map((item) => <button type="button" className={draft.id === item.id ? "is-active" : ""} key={item.id} onClick={() => edit(item)}><span className="food-ranking-badge">{item.adminRating === null ? "未评分" : `${item.adminRating} / 5`}</span><b>{item.restaurant}</b><small>{item.location || item.category || "未填写位置"}</small></button>) : <p>还没有餐厅内容。</p>}</aside>
      <form onSubmit={save}><label><span>管理员评分（独立于用户评分）</span><select value={draft.adminRating} onChange={(event) => setDraft({ ...draft, adminRating: event.target.value })}><option value="">暂不评分</option>{[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score} 分</option>)}</select></label><label><span>餐厅名称</span><input value={draft.restaurant} maxLength={100} onChange={(event) => setDraft({ ...draft, restaurant: event.target.value })} required /></label><div className="admin-food-row"><label><span>文字位置</span><input value={draft.location} maxLength={120} placeholder="例如：第一食堂东门" onChange={(event) => setDraft({ ...draft, location: event.target.value })} /></label><label><span>分类</span><input value={draft.category} maxLength={60} placeholder="食堂 / 外卖 / 饮品" onChange={(event) => setDraft({ ...draft, category: event.target.value })} /></label></div><div className="admin-food-location-picker"><div className="admin-food-location-copy"><div><b>地图定位</b><small>点击地图放置标记，或拖动标记调整餐厅位置。</small></div>{(draft.latitude || draft.longitude) && <button type="button" onClick={() => setDraft({ ...draft, latitude: "", longitude: "" })}>清除定位</button>}</div><FoodRankingMap editable editablePosition={draft.latitude && draft.longitude ? { latitude: Number(draft.latitude), longitude: Number(draft.longitude) } : null} onPositionChange={(position) => setDraft({ ...draft, latitude: position.latitude.toFixed(6), longitude: position.longitude.toFixed(6) })} /><div className="admin-food-row"><label><span>纬度</span><input type="number" step="0.000001" min="-90" max="90" value={draft.latitude} placeholder="可选" onChange={(event) => setDraft({ ...draft, latitude: event.target.value })} /></label><label><span>经度</span><input type="number" step="0.000001" min="-180" max="180" value={draft.longitude} placeholder="可选" onChange={(event) => setDraft({ ...draft, longitude: event.target.value })} /></label></div></div><label><span>餐厅摘要</span><input value={draft.summary} maxLength={300} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} required /></label><label><span>详细说明</span><textarea value={draft.details} maxLength={4000} onChange={(event) => setDraft({ ...draft, details: event.target.value })} /></label><label><span>标签（顿号或逗号分隔）</span><input value={draft.tags} maxLength={400} placeholder="性价比、夜宵、排队快" onChange={(event) => setDraft({ ...draft, tags: event.target.value })} /></label><div className="food-photo-editor"><label><span>饭菜照片（选填，可直接拍摄）</span><input type="file" accept="image/*" capture="environment" disabled={photoUploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadPhoto(file); event.target.value = ""; }} /></label>{draft.imageUrl && <figure><Image src={draft.imageUrl} alt="饭菜照片预览" width={960} height={640} unoptimized /><button type="button" onClick={() => setDraft({ ...draft, imageUrl: "" })}>移除照片</button></figure>}<small>{photoUploading ? "照片上传中…" : "支持相机拍摄或从相册选择，最大 20 MB。"}</small></div>{message && <p role="status">{message}</p>}<footer>{draft.id && <button className="danger" type="button" disabled={busy} onClick={remove}><Icon name="trash" />删除</button>}<button type="button" onClick={() => setDraft(blank)}>新建条目</button><button type="submit" disabled={busy || photoUploading}>{busy ? "保存中…" : "保存餐厅模块"}</button></footer></form></div>
  </section>;
}


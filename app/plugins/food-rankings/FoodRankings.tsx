"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import type { FoodRankingEntry } from "../../../lib/food-rankings";
import Icon from "../../Icon";
import FoodRankingMap from "./FoodRankingMap";

function hasPosition(item: FoodRankingEntry) { return Number.isFinite(item.latitude) && Number.isFinite(item.longitude); }

function NavigationActions({ item }: { item: FoodRankingEntry }) {
  if (!hasPosition(item)) return <span className="food-ranking-no-navigation">管理员尚未设置地图位置</span>;
  const nativeUrl = `geo:${item.latitude},${item.longitude}?q=${encodeURIComponent(item.restaurant)}`;
  const amapUrl = `https://uri.amap.com/navigation?to=${item.longitude},${item.latitude},${encodeURIComponent(item.restaurant)}&mode=car&policy=1`;
  const googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${item.latitude},${item.longitude}`;
  return <details className="food-ranking-navigation"><summary><Icon name="map" />前往</summary><div><a href={nativeUrl}>系统原生导航</a><a href={amapUrl} target="_blank" rel="noreferrer">高德地图</a><a href={googleUrl} target="_blank" rel="noreferrer">Google Maps</a></div></details>;
}

function RatingSummary({ item }: { item: FoodRankingEntry }) {
  return <div className="food-rating-summary"><div><small>管理员评分</small><b>{item.adminRating === null ? "暂未评分" : item.adminRating.toFixed(1) + " / 5"}</b></div><div><small>用户平均分 · {item.ratingCount} 人</small><b>{item.averageRating === null ? "暂无评分" : item.averageRating.toFixed(1) + " / 5"}</b></div></div>;
}

function VoteButtons({ item, busy, onVote }: { item: FoodRankingEntry; busy: boolean; onVote: (item: FoodRankingEntry, rating: number | null) => void }) {
  return <div className="food-star-rating"><span>{item.myRating === null ? "给这家餐厅打分" : "我的评分：" + item.myRating + " 分"}</span><div role="group" aria-label="我的评分，满分5分">{[1, 2, 3, 4, 5].map((score) => <button key={score} type="button" disabled={busy} aria-label={score + " 分"} aria-pressed={item.myRating === score} className={score <= (item.myRating || 0) ? "is-filled" : ""} onClick={() => onVote(item, score)}><Icon name="star" /></button>)}</div>{item.myRating !== null && <button type="button" disabled={busy} onClick={() => onVote(item, null)}>撤回评分</button>}</div>;
}

export default function FoodRankings() {
  const [items, setItems] = useState<FoodRankingEntry[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("latest");
  const voteLock = useRef(false);
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState<FoodRankingEntry | null>(null);
  const [canVote, setCanVote] = useState(false);
  const [votingId, setVotingId] = useState("");
  const [message, setMessage] = useState("正在读取餐厅…");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    fetch("/api/food-rankings", { cache: "no-store" }).then(async (response) => {
      const result = await response.json() as { entries?: FoodRankingEntry[]; canVote?: boolean; error?: string };
      if (!response.ok) throw new Error(result.error || "餐厅加载失败");
      setItems(result.entries || []); setCanVote(result.canVote === true); setMessage("");
    }).catch((error) => setMessage(error instanceof Error ? error.message : "餐厅加载失败"));
  }, []);

  const categories = useMemo(() => [...new Set(items.map((item) => item.category).filter(Boolean))], [items]);
  const shown = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("zh-CN");
    return items.filter((item) => (category === "all" || item.category === category) && (!needle || [item.restaurant, item.location, item.category, item.summary, item.details, ...item.tags].join(" ").toLocaleLowerCase("zh-CN").includes(needle))).sort((a, b) => sort === "users" ? (b.averageRating ?? -1) - (a.averageRating ?? -1) || b.ratingCount - a.ratingCount : sort === "admin" ? (b.adminRating ?? -1) - (a.adminRating ?? -1) : b.updatedAt - a.updatedAt);
  }, [category, items, query, sort]);

  async function vote(item: FoodRankingEntry, nextVote: number | null) {
    if (!canVote) { setNotice("请先登录注册用户账户，再为餐厅打 1–5 分。"); return; }
    if (voteLock.current) return;
    voteLock.current = true;
    setVotingId(item.id); setNotice("");
    try {
      const response = await fetch(`/api/food-rankings/${item.id}/vote`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ rating: nextVote }) });
      const result = await response.json() as { averageRating: number | null; ratingCount: number; myRating: number | null; error?: string };
      if (!response.ok) throw new Error(result.error || "评分提交失败");
      const patch = { averageRating: result.averageRating, ratingCount: result.ratingCount, myRating: result.myRating };
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, ...patch } : entry));
      setSelected((current) => current?.id === item.id ? { ...current, ...patch } : current);
    } catch (error) { setNotice(error instanceof Error ? error.message : "评分提交失败"); } finally { voteLock.current = false; setVotingId(""); }
  }

  return <section className="food-rankings-widget"><div className="food-rankings-tools"><label><Icon name="search" /><span className="sr-only">搜索餐厅</span><input type="search" value={query} placeholder="搜索餐厅、位置或标签" onChange={(event) => setQuery(event.target.value)} /></label><select aria-label="评分排序" value={sort} onChange={(event) => setSort(event.target.value)}><option value="latest">最近更新</option><option value="users">用户评分优先</option><option value="admin">管理员评分优先</option></select><select aria-label="按分类筛选" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">全部分类</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></div>
    {notice && <p className="food-ranking-notice" role="status">{notice}</p>}
    {!message && <section className="food-ranking-map-panel"><header><div><span>地图定位</span><h2>按位置发现好味道</h2></div><aside><b>{shown.filter(hasPosition).length} 个已定位</b></aside></header><FoodRankingMap entries={shown} onSelect={setSelected} /></section>}
    {message ? <div className="food-rankings-empty"><p>{message}</p></div> : shown.length ? <div className="food-ranking-grid">{shown.map((item) => <article className="food-ranking-card is-rating" key={item.id}>{item.imageUrl && <button className="food-ranking-photo" type="button" onClick={() => setSelected(item)} aria-label={`查看${item.restaurant}详情`}><Image src={item.imageUrl} alt={`${item.restaurant}饭菜照片`} width={960} height={640} unoptimized /></button>}<header><span className="food-ranking-badge">餐厅评分</span>{item.category && <small>{item.category}</small>}</header><h2>{item.restaurant}</h2>{item.location && <p className="food-ranking-location">{item.location}</p>}<strong>{item.summary}</strong>{item.tags.length > 0 && <footer>{item.tags.map((tag) => <button type="button" key={tag} onClick={() => setSelected(item)} title={`查看“${tag}”相关详情`}>{tag}</button>)}</footer>}<RatingSummary item={item} /><VoteButtons item={item} busy={Boolean(votingId)} onVote={(entry, nextVote) => void vote(entry, nextVote)} /></article>)}</div> : <div className="food-rankings-empty"><Icon name="search" /><b>没有找到符合条件的餐厅</b><span>换个关键词或清除筛选试试。</span></div>}
    {selected && <div className="food-ranking-dialog" role="dialog" aria-modal="true" aria-label={`${selected.restaurant}详情`}><article className="is-rating">{selected.imageUrl && <Image src={selected.imageUrl} alt={`${selected.restaurant}饭菜照片`} width={960} height={640} unoptimized />}<header><div><span className="food-ranking-badge">餐厅评分</span><h2>{selected.restaurant}</h2></div><button type="button" aria-label="关闭详情" onClick={() => setSelected(null)}><Icon name="close" /></button></header>{selected.location && <p className="food-ranking-location">{selected.location}</p>}<strong>{selected.summary}</strong><p>{selected.details || "管理员暂未填写更多说明。"}</p>{selected.tags.length > 0 && <footer>{selected.tags.map((tag) => <span key={tag}>{tag}</span>)}</footer>}<NavigationActions item={selected} /><RatingSummary item={selected} /><VoteButtons item={selected} busy={Boolean(votingId)} onVote={(entry, nextVote) => void vote(entry, nextVote)} /></article></div>}
  </section>;
}


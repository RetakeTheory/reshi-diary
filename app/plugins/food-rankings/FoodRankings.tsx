"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import type { FoodRankingEntry, FoodRankingType, FoodRankingVote } from "../../../lib/food-rankings";
import Icon from "../../Icon";

function VoteButtons({ item, busy, onVote }: { item: FoodRankingEntry; busy: boolean; onVote: (item: FoodRankingEntry, vote: FoodRankingVote) => void }) {
  return <div className="food-ranking-votes" aria-label="用户意见"><button type="button" className={item.myVote === "up" ? "is-active is-up" : ""} disabled={busy} aria-pressed={item.myVote === "up"} onClick={() => onVote(item, "up")}><Icon name="thumb-up" />赞 <b>{item.likes}</b></button><button type="button" className={item.myVote === "down" ? "is-active is-down" : ""} disabled={busy} aria-pressed={item.myVote === "down"} onClick={() => onVote(item, "down")}><Icon name="thumb-down" />踩 <b>{item.dislikes}</b></button></div>;
}

export default function FoodRankings() {
  const [items, setItems] = useState<FoodRankingEntry[]>([]);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"all" | FoodRankingType>("all");
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState<FoodRankingEntry | null>(null);
  const [canVote, setCanVote] = useState(false);
  const [votingId, setVotingId] = useState("");
  const [message, setMessage] = useState("正在读取榜单…");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    fetch("/api/food-rankings", { cache: "no-store" }).then(async (response) => {
      const result = await response.json() as { entries?: FoodRankingEntry[]; canVote?: boolean; error?: string };
      if (!response.ok) throw new Error(result.error || "榜单加载失败");
      setItems(result.entries || []); setCanVote(result.canVote === true); setMessage("");
    }).catch((error) => setMessage(error instanceof Error ? error.message : "榜单加载失败"));
  }, []);

  const categories = useMemo(() => [...new Set(items.map((item) => item.category).filter(Boolean))], [items]);
  const shown = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("zh-CN");
    return items.filter((item) => (type === "all" || item.listType === type) && (category === "all" || item.category === category) && (!needle || [item.restaurant, item.location, item.category, item.summary, item.details, ...item.tags].join(" ").toLocaleLowerCase("zh-CN").includes(needle)));
  }, [category, items, query, type]);

  async function vote(item: FoodRankingEntry, nextVote: FoodRankingVote) {
    if (!canVote) { setNotice("请先登录注册用户账户，再对榜单意见赞或踩。"); return; }
    const voteValue = item.myVote === nextVote ? null : nextVote;
    setVotingId(item.id); setNotice("");
    try {
      const response = await fetch(`/api/food-rankings/${item.id}/vote`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ vote: voteValue }) });
      const result = await response.json() as { likes?: number; dislikes?: number; myVote?: FoodRankingVote | null; error?: string };
      if (!response.ok) throw new Error(result.error || "意见提交失败");
      const patch = { likes: result.likes || 0, dislikes: result.dislikes || 0, myVote: result.myVote || null };
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, ...patch } : entry));
      setSelected((current) => current?.id === item.id ? { ...current, ...patch } : current);
    } catch (error) { setNotice(error instanceof Error ? error.message : "意见提交失败"); } finally { setVotingId(""); }
  }

  return <section className="food-rankings-widget"><div className="food-rankings-tools"><label><Icon name="search" /><span className="sr-only">搜索餐厅</span><input type="search" value={query} placeholder="搜索餐厅、位置或标签" onChange={(event) => setQuery(event.target.value)} /></label><div className="food-ranking-filters" aria-label="筛选榜单"><button type="button" className={type === "all" ? "is-active" : ""} onClick={() => setType("all")}>全部</button><button type="button" className={type === "red" ? "is-active is-red" : ""} onClick={() => setType("red")}>红榜</button><button type="button" className={type === "black" ? "is-active is-black" : ""} onClick={() => setType("black")}>黑榜</button></div><select aria-label="按分类筛选" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">全部分类</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></div>
    {notice && <p className="food-ranking-notice" role="status">{notice}</p>}
    {message ? <div className="food-rankings-empty"><p>{message}</p></div> : shown.length ? <div className="food-ranking-grid">{shown.map((item) => <article className={`food-ranking-card is-${item.listType}`} key={item.id}>{item.imageUrl && <button className="food-ranking-photo" type="button" onClick={() => setSelected(item)} aria-label={`查看${item.restaurant}详情`}><Image src={item.imageUrl} alt={`${item.restaurant}饭菜照片`} width={960} height={640} unoptimized /></button>}<header><span className={`food-ranking-badge is-${item.listType}`}>{item.listType === "red" ? "红榜推荐" : "黑榜避雷"}</span>{item.category && <small>{item.category}</small>}</header><h2>{item.restaurant}</h2>{item.location && <p className="food-ranking-location">{item.location}</p>}<strong>{item.summary}</strong>{item.tags.length > 0 && <footer>{item.tags.map((tag) => <button type="button" key={tag} onClick={() => setSelected(item)} title={`查看“${tag}”相关详情`}>{tag}</button>)}</footer>}<VoteButtons item={item} busy={votingId === item.id} onVote={(entry, nextVote) => void vote(entry, nextVote)} /></article>)}</div> : <div className="food-rankings-empty"><Icon name="search" /><b>没有找到符合条件的餐厅</b><span>换个关键词或清除筛选试试。</span></div>}
    {selected && <div className="food-ranking-dialog" role="dialog" aria-modal="true" aria-label={`${selected.restaurant}详情`}><article className={`is-${selected.listType}`}>{selected.imageUrl && <Image src={selected.imageUrl} alt={`${selected.restaurant}饭菜照片`} width={960} height={640} unoptimized />}<header><div><span className={`food-ranking-badge is-${selected.listType}`}>{selected.listType === "red" ? "红榜推荐" : "黑榜避雷"}</span><h2>{selected.restaurant}</h2></div><button type="button" aria-label="关闭详情" onClick={() => setSelected(null)}><Icon name="close" /></button></header>{selected.location && <p className="food-ranking-location">{selected.location}</p>}<strong>{selected.summary}</strong><p>{selected.details || "管理员暂未填写更多说明。"}</p>{selected.tags.length > 0 && <footer>{selected.tags.map((tag) => <span key={tag}>{tag}</span>)}</footer>}<VoteButtons item={selected} busy={votingId === selected.id} onVote={(entry, nextVote) => void vote(entry, nextVote)} /></article></div>}
  </section>;
}

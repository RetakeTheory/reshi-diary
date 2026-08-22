"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Icon, { type IconName } from "../../Icon";

type User = { id: string; displayName: string; email: string };
type Comment = { id: number; parentId: number | null; body: string; createdAt: number; userId: string; displayName: string };
type Reaction = { kind: "heart" | "spark" | "insight"; count: number };
const reactionMeta: Array<{ kind: Reaction["kind"]; label: string; icon: IconName }> = [
  { kind: "heart", label: "喜欢", icon: "heart" },
  { kind: "spark", label: "有共鸣", icon: "spark" },
  { kind: "insight", label: "有启发", icon: "insight" },
];

export default function Community({ slug }: { slug: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [mine, setMine] = useState<string[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [reactionBusy, setReactionBusy] = useState<Reaction["kind"] | null>(null);

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const [communityResponse, meResponse] = await Promise.all([
        fetch(`/api/posts/${encodeURIComponent(slug)}/community`, { cache: "no-store" }),
        fetch("/api/auth/me", { cache: "no-store" }),
      ]);
      if (!communityResponse.ok) throw new Error("暂时无法加载讨论，请稍后重试。");
      const data = await communityResponse.json() as { comments: Comment[]; reactions: Reaction[]; myReactions: string[] };
      setComments(data.comments); setReactions(data.reactions); setMine(data.myReactions);
      if (meResponse.ok) setUser(((await meResponse.json()) as { user: User }).user);
      setLoadState("ready");
    } catch (error) {
      setLoadState("error");
      setMessage(error instanceof Error ? error.message : "暂时无法加载讨论，请稍后重试。");
    }
  }, [slug]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const children = useMemo(() => {
    const map = new Map<number | null, Comment[]>();
    comments.forEach((comment) => map.set(comment.parentId, [...(map.get(comment.parentId) || []), comment]));
    return map;
  }, [comments]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/posts/${encodeURIComponent(slug)}/comments`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ body, parentId: replyTo?.id || null }),
      });
      const result = await response.json() as { comment?: Comment; error?: string };
      if (!response.ok || !result.comment) throw new Error(result.error || "评论发布失败");
      setComments((current) => [...current, result.comment!]); setBody(""); setReplyTo(null); setMessage("评论已发布");
    } catch (error) { setMessage(error instanceof Error ? error.message : "评论发布失败"); }
    finally { setBusy(false); }
  }

  async function react(kind: Reaction["kind"]) {
    if (!user) { window.location.assign(`/login?next=${encodeURIComponent(`/posts/${slug}`)}`); return; }
    setReactionBusy(kind); setMessage("");
    try {
      const response = await fetch(`/api/posts/${encodeURIComponent(slug)}/reactions`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind }),
      });
      const result = await response.json() as { active?: boolean; reactions?: Reaction[]; error?: string };
      if (!response.ok || !result.reactions) throw new Error(result.error || "回应失败");
      setReactions(result.reactions);
      setMine((current) => result.active ? [...new Set([...current, kind])] : current.filter((item) => item !== kind));
    } catch (error) { setMessage(error instanceof Error ? error.message : "回应失败"); }
    finally { setReactionBusy(null); }
  }

  function count(kind: string) { return reactions.find((item) => item.kind === kind)?.count || 0; }
  function renderComments(parentId: number | null, depth = 0): React.ReactNode {
    return (children.get(parentId) || []).map((comment) => <article className="comment-item" data-depth={Math.min(depth, 2)} key={comment.id}>
      <header><span className="comment-avatar"><Icon name="user" /></span><div><b>{comment.displayName}</b><time>{new Date(comment.createdAt).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" })}</time></div></header>
      <p>{comment.body}</p>
      {user && <button type="button" className="comment-reply" onClick={() => setReplyTo(comment)}><Icon name="reply" /> 回复</button>}
      {renderComments(comment.id, depth + 1)}
    </article>);
  }

  return <section className="community" aria-labelledby="community-title">
    <div className="reaction-panel">
      <div><p>REACTIONS / 添加回应</p><h2>这篇文章让你想到什么？</h2></div>
      <div className="reaction-actions">
        {reactionMeta.map((item) => <button type="button" key={item.kind} disabled={reactionBusy !== null || loadState === "loading"} className={mine.includes(item.kind) ? "is-active" : ""} aria-pressed={mine.includes(item.kind)} onClick={() => react(item.kind)}><Icon name={item.icon} /><span>{reactionBusy === item.kind ? "处理中…" : item.label}</span><b>{count(item.kind)}</b></button>)}
      </div>
    </div>
    <div className="comments-panel">
      <header><div><p>COMMENTS / 评论</p><h2 id="community-title">一起聊聊</h2></div><span>{comments.length} 条</span></header>
      {user ? <form className="comment-form" onSubmit={submit}>
        <label htmlFor="comment-body">{replyTo ? `回复 ${replyTo.displayName}` : `以 ${user.displayName} 的身份评论`}</label>
        <textarea id="comment-body" value={body} maxLength={1000} onChange={(event) => setBody(event.target.value)} placeholder="写下你的想法……" required />
        <div><span>{body.length} / 1000</span>{replyTo && <button type="button" className="button-quiet" onClick={() => setReplyTo(null)}>取消回复</button>}<button type="submit" disabled={busy}>{busy ? "正在发布…" : "发布评论"}</button></div>
      </form> : <div className="comment-login"><Icon name="comment" /><div><b>登录后参与讨论</b><p>支持邮箱验证码和 Passkey。</p></div><a href={`/login?next=${encodeURIComponent(`/posts/${slug}`)}`}>登录 / 注册</a></div>}
      {message && <p className="community-message" role="status">{message}</p>}
      <div className="comment-list" aria-busy={loadState === "loading"}>
        {loadState === "loading" ? <div className="comment-empty"><span className="community-loader" /><p>正在加载讨论…</p></div>
          : loadState === "error" ? <div className="comment-empty"><Icon name="comment" /><p>讨论暂时没有加载成功。</p><button type="button" className="button-quiet" onClick={() => void load()}>重新加载</button></div>
            : comments.length ? renderComments(null) : <div className="comment-empty"><Icon name="comment" /><p>还没有评论，来写第一条吧。</p></div>}
      </div>
    </div>
  </section>;
}

"use client";

import { SyntheticEvent, useMemo, useState } from "react";

type AdminPost = {
  id: number; title: string; slug: string; excerpt: string; content: string; category: string;
  status: "draft" | "published"; createdAt: number; updatedAt: number; publishedAt: number | null;
};

type FormState = { title: string; slug: string; excerpt: string; content: string; category: string };
const emptyForm: FormState = { title: "", slug: "", excerpt: "", content: "", category: "日常" };

export default function AdminEditor({ initialPosts }: { initialPosts: AdminPost[] }) {
  const [items, setItems] = useState(initialPosts);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const counts = useMemo(() => ({
    published: items.filter((item) => item.status === "published").length,
    draft: items.filter((item) => item.status === "draft").length,
  }), [items]);

  function update(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function edit(post: AdminPost) {
    setEditingId(post.id);
    setForm({ title: post.title, slug: post.slug, excerpt: post.excerpt, content: post.content, category: post.category });
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function reset() {
    setEditingId(null); setForm(emptyForm); setMessage("");
  }

  async function save(event: SyntheticEvent, status: "draft" | "published") {
    event.preventDefault(); setBusy(true); setMessage("");
    const endpoint = editingId ? `/api/admin/posts/${editingId}` : "/api/admin/posts";
    try {
      const response = await fetch(endpoint, {
        method: editingId ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, status }),
      });
      const result = await response.json() as { post?: AdminPost; error?: string };
      if (!response.ok || !result.post) throw new Error(result.error || "保存失败");
      setItems((current) => editingId
        ? current.map((item) => item.id === editingId ? result.post! : item)
        : [result.post!, ...current]);
      setMessage(status === "published" ? "文章已发布" : "草稿已保存");
      setEditingId(null); setForm(emptyForm);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally { setBusy(false); }
  }

  async function remove(id: number) {
    if (!window.confirm("确定删除这篇文章吗？此操作无法撤销。")) return;
    const response = await fetch(`/api/admin/posts/${id}`, { method: "DELETE" });
    if (response.ok) setItems((current) => current.filter((item) => item.id !== id));
    else setMessage("删除失败，请稍后重试");
  }

  return (
    <div className="admin-workspace">
      <section className="editor-panel">
        <div className="admin-heading"><div><p>EDITOR / 文章编辑器</p><h1>{editingId ? "编辑这篇日记" : "写一篇新日记"}</h1></div><div className="admin-stats"><span>{counts.published} 已发布</span><span>{counts.draft} 草稿</span></div></div>
        <form className="editor-form" onSubmit={(event) => save(event, "published")}>
          <label><span>文章标题</span><input value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="今天想写点什么？" required /></label>
          <div className="form-row">
            <label><span>分类</span><input value={form.category} onChange={(e) => update("category", e.target.value)} placeholder="例如：校园生活" /></label>
            <label><span>链接名称</span><input value={form.slug} onChange={(e) => update("slug", e.target.value)} placeholder="留空则自动生成" /></label>
          </div>
          <label><span>摘要</span><textarea className="excerpt-field" value={form.excerpt} onChange={(e) => update("excerpt", e.target.value)} placeholder="用一两句话介绍这篇文章（可留空）" /></label>
          <label><span>正文</span><textarea className="content-field" value={form.content} onChange={(e) => update("content", e.target.value)} placeholder="开始写作……" required /></label>
          {message && <p className="form-message" role="status">{message}</p>}
          <div className="form-actions">
            {editingId && <button type="button" className="button-quiet" onClick={reset}>取消编辑</button>}
            <button type="button" className="button-draft" disabled={busy} onClick={(event) => save(event, "draft")}>保存草稿</button>
            <button type="submit" className="button-publish" disabled={busy}>{busy ? "正在保存…" : "发布文章 ↗"}</button>
          </div>
        </form>
      </section>

      <aside className="post-manager">
        <div className="manager-head"><p>你的文章</p><span>{items.length} 篇</span></div>
        <div className="manager-list">
          {items.length === 0 && <div className="empty-posts"><b>✦</b><p>还没有文章<br />从左边写下第一篇吧</p></div>}
          {items.map((post) => (
            <article key={post.id} className="manager-item">
              <div className="manager-meta"><span className={post.status}>{post.status === "published" ? "已发布" : "草稿"}</span><time>{new Date(post.updatedAt).toLocaleDateString("zh-CN")}</time></div>
              <h2>{post.title}</h2><p>{post.category} · {post.excerpt || "暂无摘要"}</p>
              <div><button type="button" onClick={() => edit(post)}>编辑</button>{post.status === "published" && <a href={`/posts/${post.slug}`}>查看 ↗</a>}<button type="button" className="danger" onClick={() => remove(post.id)}>删除</button></div>
            </article>
          ))}
        </div>
      </aside>
    </div>
  );
}

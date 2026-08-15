"use client";

import { MouseEvent, SyntheticEvent, useMemo, useRef, useState } from "react";
import katex from "katex";

type AdminPost = {
  id: number; title: string; slug: string; excerpt: string; content: string; category: string;
  status: "draft" | "published"; createdAt: number; updatedAt: number; publishedAt: number | null;
};
type FormState = { title: string; excerpt: string; category: string };
type UploadResult = { name: string; url: string; downloadUrl: string; type: string; size: number; previewable: boolean; isImage: boolean };
const emptyForm: FormState = { title: "", excerpt: "", category: "日常" };

function looksLikeHtml(value: string) { return /<[a-z][\s\S]*>/i.test(value); }
function escapeHtml(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function legacyContent(value: string) {
  return value.split(/\n\s*\n/).map((part) => `<p>${escapeHtml(part).replace(/\n/g, "<br>")}</p>`).join("");
}
function hydrateFormulas(container: HTMLElement | null) {
  container?.querySelectorAll<HTMLElement>("[data-latex]").forEach((node) => {
    katex.render(node.dataset.latex || "", node, { throwOnError: false, displayMode: node.dataset.display === "block" });
  });
}

export default function AdminEditor({ initialPosts }: { initialPosts: AdminPost[] }) {
  const [items, setItems] = useState(initialPosts);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [formulaOpen, setFormulaOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableColumns, setTableColumns] = useState(3);
  const [latex, setLatex] = useState("E = mc^2");
  const [displayFormula, setDisplayFormula] = useState(true);
  const [attachmentPreview, setAttachmentPreview] = useState(true);
  const [uploading, setUploading] = useState("");
  const editorRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const savedRangeRef = useRef<Range | null>(null);

  const counts = useMemo(() => ({
    published: items.filter((item) => item.status === "published").length,
    draft: items.filter((item) => item.status === "draft").length,
  }), [items]);

  function update(field: keyof FormState, value: string) { setForm((current) => ({ ...current, [field]: value })); }

  function rememberSelection() {
    const selection = window.getSelection();
    if (selection?.rangeCount && editorRef.current?.contains(selection.anchorNode)) savedRangeRef.current = selection.getRangeAt(0).cloneRange();
  }

  function restoreSelection() {
    const selection = window.getSelection();
    if (!selection || !savedRangeRef.current) return false;
    selection.removeAllRanges(); selection.addRange(savedRangeRef.current); return true;
  }

  function runCommand(command: string) {
    restoreSelection(); editorRef.current?.focus(); document.execCommand(command, false); rememberSelection();
  }

  function toolbarMouseDown(event: MouseEvent<HTMLButtonElement>, command: string) {
    event.preventDefault(); runCommand(command);
  }

  function insertNode(node: Node) {
    const editor = editorRef.current;
    if (!editor) return;
    if (restoreSelection()) {
      const selection = window.getSelection();
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      if (range && editor.contains(range.commonAncestorContainer)) {
        range.deleteContents(); range.insertNode(node); range.setStartAfter(node); range.collapse(true);
        selection?.removeAllRanges(); selection?.addRange(range);
      } else editor.append(node);
    } else editor.append(node);
    editor.focus(); rememberSelection();
  }

  function insertFormula(event: SyntheticEvent) {
    event.preventDefault();
    if (!latex.trim()) return;
    const node = document.createElement(displayFormula ? "div" : "span");
    node.className = "latex-formula"; node.dataset.latex = latex.trim(); node.dataset.display = displayFormula ? "block" : "inline"; node.textContent = latex.trim();
    insertNode(node); katex.render(latex.trim(), node, { throwOnError: false, displayMode: displayFormula });
    if (displayFormula) insertNode(document.createElement("p"));
    setFormulaOpen(false);
  }

  function insertTable(event: SyntheticEvent) {
    event.preventDefault();
    const rows = Math.min(12, Math.max(1, tableRows));
    const columns = Math.min(8, Math.max(1, tableColumns));
    const table = document.createElement("table");
    table.className = "content-table";
    const body = document.createElement("tbody");
    for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
      const row = document.createElement("tr");
      for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
        const cell = document.createElement(rowIndex === 0 ? "th" : "td");
        cell.textContent = rowIndex === 0 ? `标题 ${columnIndex + 1}` : "内容";
        row.append(cell);
      }
      body.append(row);
    }
    table.append(body);
    insertNode(table);
    insertNode(document.createElement("p"));
    setTableOpen(false);
  }

  function insertCodeBlock(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    restoreSelection();
    const selection = window.getSelection();
    const selectedText = selection?.rangeCount ? selection.getRangeAt(0).toString() : "";
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = selectedText || "在这里输入代码";
    pre.append(code);
    insertNode(pre);
    insertNode(document.createElement("p"));
  }

  async function upload(file: File, previewable: boolean) {
    setUploading(`正在上传 ${file.name}…`);
    const body = new FormData(); body.append("file", file); body.append("previewable", previewable ? "true" : "false");
    const response = await fetch("/api/admin/uploads", { method: "POST", body });
    const result = await response.json() as UploadResult & { error?: string };
    if (!response.ok) throw new Error(result.error || "上传失败");
    return result;
  }

  async function addImage(file: File) {
    try {
      const result = await upload(file, true);
      const figure = document.createElement("figure"); figure.className = "editor-image";
      const image = document.createElement("img"); image.src = result.url; image.alt = result.name.replace(/\.[^.]+$/, "");
      const caption = document.createElement("figcaption"); caption.textContent = result.name.replace(/\.[^.]+$/, "");
      figure.append(image, caption); insertNode(figure); insertNode(document.createElement("p"));
      setMessage("图片已插入，页面会自动适配尺寸");
    } catch (error) { setMessage(error instanceof Error ? error.message : "图片上传失败"); }
    finally { setUploading(""); if (imageInputRef.current) imageInputRef.current.value = ""; }
  }

  async function addAttachment(file: File) {
    try {
      const result = await upload(file, attachmentPreview);
      const card = document.createElement("div"); card.className = "attachment-card"; card.dataset.previewable = result.previewable ? "true" : "false";
      const icon = document.createElement("span"); icon.className = "attachment-icon"; icon.textContent = "↓";
      const copy = document.createElement("div");
      const title = document.createElement("strong"); title.textContent = result.name;
      const detail = document.createElement("small"); detail.textContent = `${result.previewable ? "可在线预览 · " : "仅下载 · "}${Math.max(1, Math.ceil(result.size / 1024))} KB`;
      copy.append(title, detail);
      const link = document.createElement("a"); link.href = result.previewable ? result.url : result.downloadUrl; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = result.previewable ? "预览 / 下载" : "下载文件";
      card.append(icon, copy, link); insertNode(card); insertNode(document.createElement("p")); setMessage("附件已插入文章");
    } catch (error) { setMessage(error instanceof Error ? error.message : "文件上传失败"); }
    finally { setUploading(""); if (fileInputRef.current) fileInputRef.current.value = ""; }
  }

  function editorHtml() {
    const clone = editorRef.current?.cloneNode(true) as HTMLElement | undefined;
    clone?.querySelectorAll<HTMLElement>("[data-latex]").forEach((node) => { node.textContent = node.dataset.latex || ""; });
    clone?.querySelectorAll("p").forEach((node) => { if (!node.textContent && !node.querySelector("img,br")) node.innerHTML = "<br>"; });
    return clone?.innerHTML.trim() || "";
  }

  function edit(post: AdminPost) {
    setEditingId(post.id); setForm({ title: post.title, excerpt: post.excerpt, category: post.category });
    if (editorRef.current) { editorRef.current.innerHTML = looksLikeHtml(post.content) ? post.content : legacyContent(post.content); hydrateFormulas(editorRef.current); }
    setMessage(""); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function reset() {
    setEditingId(null); setForm(emptyForm); setMessage(""); if (editorRef.current) editorRef.current.innerHTML = "";
  }

  async function save(event: SyntheticEvent, status: "draft" | "published") {
    event.preventDefault(); setBusy(true); setMessage("");
    const endpoint = editingId ? `/api/admin/posts/${editingId}` : "/api/admin/posts";
    try {
      const response = await fetch(endpoint, { method: editingId ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, content: editorHtml(), status }) });
      const result = await response.json() as { post?: AdminPost; error?: string };
      if (!response.ok || !result.post) throw new Error(result.error || "保存失败");
      setItems((current) => editingId ? current.map((item) => item.id === editingId ? result.post! : item) : [result.post!, ...current]);
      setMessage(status === "published" ? "文章已发布" : "草稿已保存"); setEditingId(null); setForm(emptyForm);
      if (editorRef.current) editorRef.current.innerHTML = "";
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存失败"); }
    finally { setBusy(false); }
  }

  async function remove(id: number) {
    if (!window.confirm("确定删除这篇文章吗？此操作无法撤销。")) return;
    const response = await fetch(`/api/admin/posts/${id}`, { method: "DELETE" });
    if (response.ok) setItems((current) => current.filter((item) => item.id !== id)); else setMessage("删除失败，请稍后重试");
  }

  return (
    <div className="admin-workspace">
      <section className="editor-panel">
        <div className="admin-heading"><div><p>EDITOR / 文章编辑器</p><h1>{editingId ? "编辑这篇日记" : "写一篇新日记"}</h1></div><div className="admin-stats"><span>{counts.published} 已发布</span><span>{counts.draft} 草稿</span></div></div>
        <form className="editor-form" onSubmit={(event) => save(event, "published")}>
          <label><span>文章标题</span><input value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="今天想写点什么？" required /></label>
          <label><span>分类 · 文章 ID 将在首次保存时自动生成</span><input value={form.category} onChange={(e) => update("category", e.target.value)} placeholder="例如：校园生活" /></label>
          <label><span>摘要</span><textarea className="excerpt-field" value={form.excerpt} onChange={(e) => update("excerpt", e.target.value)} placeholder="用一两句话介绍这篇文章（可留空）" /></label>
          <div className="rich-editor-wrap">
            <div className="rich-editor-label"><span>正文</span><small>支持排版、公式、表格、代码和附件</small></div>
            <div className="rich-toolbar" role="toolbar" aria-label="文章排版工具">
              <div className="toolbar-group">
                <button type="button" title="加粗" onMouseDown={(e) => toolbarMouseDown(e, "bold")}><b>B</b></button>
                <button type="button" title="倾斜" onMouseDown={(e) => toolbarMouseDown(e, "italic")}><i>I</i></button>
              </div>
              <div className="toolbar-group">
                <button type="button" title="左对齐" onMouseDown={(e) => toolbarMouseDown(e, "justifyLeft")}>≡</button>
                <button type="button" title="居中" onMouseDown={(e) => toolbarMouseDown(e, "justifyCenter")}>≣</button>
                <button type="button" className="align-right" title="右对齐" onMouseDown={(e) => toolbarMouseDown(e, "justifyRight")}>≡</button>
              </div>
              <div className="toolbar-group">
                <button type="button" title="无序列表" onMouseDown={(e) => toolbarMouseDown(e, "insertUnorderedList")}>•≡</button>
                <button type="button" title="有序列表" onMouseDown={(e) => toolbarMouseDown(e, "insertOrderedList")}>1.</button>
                <button type="button" title="代码块" onMouseDown={insertCodeBlock}>&lt;/&gt;</button>
              </div>
              <div className="toolbar-group toolbar-insert">
                <button type="button" onMouseDown={(e) => { e.preventDefault(); rememberSelection(); setTableOpen(false); setFormulaOpen((open) => !open); }}>∑ <span>公式</span></button>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); rememberSelection(); setFormulaOpen(false); setTableOpen((open) => !open); }}>▦ <span>表格</span></button>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); rememberSelection(); imageInputRef.current?.click(); }}>▧ <span>图片</span></button>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); rememberSelection(); fileInputRef.current?.click(); }}>↓ <span>文件</span></button>
              </div>
            </div>
            {formulaOpen && <div className="formula-panel"><label><span>LaTeX 公式</span><input autoFocus value={latex} onChange={(e) => setLatex(e.target.value)} placeholder="例如：\\frac{a}{b}" /></label><label className="formula-mode"><input type="checkbox" checked={displayFormula} onChange={(e) => setDisplayFormula(e.target.checked)} /> 独占一行</label><button type="button" onClick={insertFormula}>插入公式</button></div>}
            {tableOpen && <div className="table-panel"><label><span>行数</span><input type="number" min="1" max="12" value={tableRows} onChange={(e) => setTableRows(Number(e.target.value))} /></label><label><span>列数</span><input type="number" min="1" max="8" value={tableColumns} onChange={(e) => setTableColumns(Number(e.target.value))} /></label><button type="button" onClick={insertTable}>插入表格</button></div>}
            <div ref={editorRef} className="rich-editor" contentEditable suppressContentEditableWarning data-placeholder="开始写作……" onKeyUp={rememberSelection} onMouseUp={rememberSelection} />
            <div className="attachment-options"><label><input type="checkbox" checked={attachmentPreview} onChange={(e) => setAttachmentPreview(e.target.checked)} /> 插入文件时允许在线预览</label><span>{uploading || "单个文件不超过 20 MB"}</span></div>
            <input ref={imageInputRef} className="sr-only" type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && addImage(e.target.files[0])} />
            <input ref={fileInputRef} className="sr-only" type="file" onChange={(e) => e.target.files?.[0] && addAttachment(e.target.files[0])} />
          </div>
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
          {items.map((post) => <article key={post.id} className="manager-item"><div className="manager-meta"><span className={post.status}>{post.status === "published" ? "已发布" : "草稿"}</span><time>{new Date(post.updatedAt).toLocaleDateString("zh-CN")}</time></div><h2>{post.title}</h2><p>{post.category} · {post.excerpt || "暂无摘要"}</p><div><button type="button" onClick={() => edit(post)}>编辑</button>{post.status === "published" && <a href={`/posts/${post.slug}`}>查看 ↗</a>}<button type="button" className="danger" onClick={() => remove(post.id)}>删除</button></div></article>)}
        </div>
      </aside>
    </div>
  );
}

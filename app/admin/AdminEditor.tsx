"use client";

import { MouseEvent, SyntheticEvent, useMemo, useRef, useState } from "react";
import katex from "katex";
import ArrowIcon from "../ArrowIcon";
import { codeLanguages, highlightCodeBlocks, highlightSource } from "../../lib/code-highlight";

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

function ImageToolbarIcon() {
  return <svg className="toolbar-flat-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="2.5" /><circle cx="8.5" cy="9" r="1.6" /><path d="m5 17 4.4-4.4 3.3 3.2 2.4-2.4L19 17.3" /></svg>;
}

function FileToolbarIcon() {
  return <svg className="toolbar-flat-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3.5h7.4l3.6 3.7v13.3h-11z" /><path d="M13.5 3.8v4h3.8M9.5 12h5M9.5 15.5h5" /></svg>;
}

function AlignToolbarIcon({ direction }: { direction: "left" | "center" | "right" }) {
  const middle = direction === "left" ? "M4 12h11" : direction === "center" ? "M7 12h10" : "M9 12h11";
  const bottom = direction === "left" ? "M4 17h14" : direction === "center" ? "M5.5 17h13" : "M6 17h14";
  return <svg className="toolbar-flat-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16" /><path d={middle} /><path d={bottom} /></svg>;
}

function ListToolbarIcon({ ordered = false }: { ordered?: boolean }) {
  return <svg className="toolbar-flat-icon" viewBox="0 0 24 24" aria-hidden="true">
    {ordered ? <path d="M4 5.2 5.2 4v4M3.8 11.6c.2-.8 2.5-1.1 2.5.3 0 .9-2.4 1.4-2.4 2.6h2.5M3.9 17.1c.5-.5 2.4-.4 2.4.7 0 .8-.8 1.1-1.6 1.1.8 0 1.7.3 1.7 1.1 0 1.2-2 1.3-2.6.7" /> : <><circle cx="5" cy="6" r="1" /><circle cx="5" cy="12" r="1" /><circle cx="5" cy="18" r="1" /></>}
    <path d="M10 6h10M10 12h10M10 18h10" />
  </svg>;
}

function caretOffsetWithin(root: HTMLElement) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.anchorNode || !root.contains(selection.anchorNode)) return null;
  const range = selection.getRangeAt(0).cloneRange();
  range.selectNodeContents(root);
  range.setEnd(selection.anchorNode, selection.anchorOffset);
  return range.toString().length;
}

function restoreCaretOffset(root: HTMLElement, targetOffset: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = targetOffset;
  let node = walker.nextNode();
  while (node) {
    const length = node.textContent?.length || 0;
    if (remaining <= length) {
      const range = document.createRange();
      range.setStart(node, remaining); range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges(); selection?.addRange(range);
      return;
    }
    remaining -= length;
    node = walker.nextNode();
  }
  const range = document.createRange();
  range.selectNodeContents(root); range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges(); selection?.addRange(range);
}

export default function AdminEditor({ initialPosts }: { initialPosts: AdminPost[] }) {
  const [items, setItems] = useState(initialPosts);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [formulaOpen, setFormulaOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeLanguage, setCodeLanguage] = useState("auto");
  const [codeText, setCodeText] = useState("");
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

  function openCodePanel(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    rememberSelection();
    const selection = window.getSelection();
    const selectedText = selection?.rangeCount ? selection.getRangeAt(0).toString() : "";
    setCodeText(selectedText);
    setFormulaOpen(false); setTableOpen(false); setCodeOpen((open) => !open);
  }

  function insertCodeBlock(event: SyntheticEvent) {
    event.preventDefault();
    const source = codeText.trim() ? codeText : "在这里输入代码";
    const result = highlightSource(source, codeLanguage);
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    const languageLabel = codeLanguages.find((item) => item.value === result.language)?.label || result.language.toUpperCase();
    pre.dataset.language = languageLabel;
    code.dataset.language = codeLanguage;
    code.className = `hljs language-${result.language}`;
    code.innerHTML = result.html;
    pre.append(code);
    insertNode(pre);
    insertNode(document.createElement("p"));
    setCodeOpen(false); setCodeText(""); setCodeLanguage("auto");
  }

  function handleEditorInput(event: SyntheticEvent<HTMLDivElement>) {
    const nativeEvent = event.nativeEvent as InputEvent;
    if (nativeEvent.isComposing) return;
    const selection = window.getSelection();
    const anchor = selection?.anchorNode;
    const element = anchor instanceof Element ? anchor : anchor?.parentElement;
    const code = element?.closest("pre code") as HTMLElement | null;
    if (!code || !editorRef.current?.contains(code)) { rememberSelection(); return; }

    const offset = caretOffsetWithin(code);
    const source = code.innerText;
    const requestedLanguage = code.dataset.language || "auto";
    const result = highlightSource(source, requestedLanguage);
    code.innerHTML = result.html;
    code.className = `hljs language-${result.language}`;
    code.dataset.language = requestedLanguage;
    const pre = code.parentElement;
    if (pre) pre.dataset.language = codeLanguages.find((item) => item.value === result.language)?.label || result.language.toUpperCase();
    if (offset !== null) restoreCaretOffset(code, offset);
    rememberSelection();
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
    if (editorRef.current) { editorRef.current.innerHTML = looksLikeHtml(post.content) ? post.content : legacyContent(post.content); hydrateFormulas(editorRef.current); highlightCodeBlocks(editorRef.current); }
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
            <div className="rich-editor-label"><span>正文</span><small>支持排版、公式、表格、代码、图片和附件</small></div>
            <div className="rich-toolbar" role="toolbar" aria-label="文章排版工具">
              <div className="toolbar-group">
                <button type="button" title="加粗" onMouseDown={(e) => toolbarMouseDown(e, "bold")}><b>B</b></button>
                <button type="button" title="倾斜" onMouseDown={(e) => toolbarMouseDown(e, "italic")}><i>I</i></button>
              </div>
              <div className="toolbar-group">
                <button type="button" title="左对齐" aria-label="左对齐" onMouseDown={(e) => toolbarMouseDown(e, "justifyLeft")}><AlignToolbarIcon direction="left" /></button>
                <button type="button" title="居中" aria-label="居中" onMouseDown={(e) => toolbarMouseDown(e, "justifyCenter")}><AlignToolbarIcon direction="center" /></button>
                <button type="button" title="右对齐" aria-label="右对齐" onMouseDown={(e) => toolbarMouseDown(e, "justifyRight")}><AlignToolbarIcon direction="right" /></button>
              </div>
              <div className="toolbar-group">
                <button type="button" title="无序列表" aria-label="无序列表" onMouseDown={(e) => toolbarMouseDown(e, "insertUnorderedList")}><ListToolbarIcon /></button>
                <button type="button" title="有序列表" aria-label="有序列表" onMouseDown={(e) => toolbarMouseDown(e, "insertOrderedList")}><ListToolbarIcon ordered /></button>
                <button type="button" title="插入代码块" onMouseDown={openCodePanel}>&lt;/&gt;</button>
              </div>
              <div className="toolbar-group toolbar-insert">
                <button type="button" onMouseDown={(e) => { e.preventDefault(); rememberSelection(); setTableOpen(false); setCodeOpen(false); setFormulaOpen((open) => !open); }}>∑ <span>公式</span></button>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); rememberSelection(); setFormulaOpen(false); setCodeOpen(false); setTableOpen((open) => !open); }}>▦ <span>表格</span></button>
                <button type="button" title="插入图片" onMouseDown={(e) => { e.preventDefault(); rememberSelection(); imageInputRef.current?.click(); }}><ImageToolbarIcon /> <span>图片</span></button>
                <button type="button" title="插入文件" onMouseDown={(e) => { e.preventDefault(); rememberSelection(); fileInputRef.current?.click(); }}><FileToolbarIcon /> <span>文件</span></button>
              </div>
            </div>
            {codeOpen && <div className="code-panel">
              <label><span>代码语言</span><select value={codeLanguage} onChange={(event) => setCodeLanguage(event.target.value)}>{codeLanguages.map((language) => <option key={language.value} value={language.value}>{language.label}</option>)}</select></label>
              <label className="code-source"><span>代码内容</span><textarea value={codeText} onChange={(event) => setCodeText(event.target.value)} spellCheck={false} placeholder="粘贴代码；选择自动识别也可以。" /></label>
              <button type="button" onClick={insertCodeBlock}>高亮并插入</button>
            </div>}
            {formulaOpen && <div className="formula-panel"><label><span>LaTeX 公式</span><input value={latex} onChange={(e) => setLatex(e.target.value)} placeholder="例如：\\frac{a}{b}" /></label><label className="formula-mode"><input type="checkbox" checked={displayFormula} onChange={(e) => setDisplayFormula(e.target.checked)} /> 独占一行</label><button type="button" onClick={insertFormula}>插入公式</button></div>}
            {tableOpen && <div className="table-panel"><label><span>行数</span><input type="number" min="1" max="12" value={tableRows} onChange={(e) => setTableRows(Number(e.target.value))} /></label><label><span>列数</span><input type="number" min="1" max="8" value={tableColumns} onChange={(e) => setTableColumns(Number(e.target.value))} /></label><button type="button" onClick={insertTable}>插入表格</button></div>}
            <div ref={editorRef} className="rich-editor" contentEditable role="textbox" tabIndex={0} aria-multiline="true" suppressContentEditableWarning data-placeholder="开始写作……" onInput={handleEditorInput} onKeyUp={rememberSelection} onMouseUp={rememberSelection} />
            <div className="attachment-options"><label><input type="checkbox" checked={attachmentPreview} onChange={(e) => setAttachmentPreview(e.target.checked)} /> 插入文件时允许在线预览</label><span>{uploading || "AWS S3 私有存储 · 单个文件不超过 20 MB"}</span></div>
            <input ref={imageInputRef} className="sr-only" type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && addImage(e.target.files[0])} />
            <input ref={fileInputRef} className="sr-only" type="file" onChange={(e) => e.target.files?.[0] && addAttachment(e.target.files[0])} />
          </div>
          {message && <p className="form-message" role="status">{message}</p>}
          <div className="form-actions">
            {editingId && <button type="button" className="button-quiet" onClick={reset}>取消编辑</button>}
            <button type="button" className="button-draft" disabled={busy} onClick={(event) => save(event, "draft")}>保存草稿</button>
            <button type="submit" className="button-publish" disabled={busy}>{busy ? "正在保存…" : <>发布文章 <ArrowIcon direction="up-right" /></>}</button>
          </div>
        </form>
      </section>
      <aside className="post-manager">
        <div className="manager-head"><p>你的文章</p><span>{items.length} 篇</span></div>
        <div className="manager-list">
          {items.length === 0 && <div className="empty-posts"><b>✦</b><p>还没有文章<br />从左边写下第一篇吧</p></div>}
          {items.map((post) => <article key={post.id} className="manager-item"><div className="manager-meta"><span className={post.status}>{post.status === "published" ? "已发布" : "草稿"}</span><time>{new Date(post.updatedAt).toLocaleDateString("zh-CN")}</time></div><h2>{post.title}</h2><p>{post.category} · {post.excerpt || "暂无摘要"}</p><div><button type="button" onClick={() => edit(post)}>编辑</button>{post.status === "published" && <a href={`/posts/${post.slug}`}>查看 <ArrowIcon direction="up-right" /></a>}<button type="button" className="danger" onClick={() => remove(post.id)}>删除</button></div></article>)}
        </div>
      </aside>
    </div>
  );
}

"use client";

import { MouseEvent, useEffect, useRef, useState } from "react";
import Icon from "../Icon";
import { createAttachmentCard } from "../../lib/attachment-cards";

export default function SurveyRichEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectionRef = useRef<Range | null>(null);
  const emittedRef = useRef(value);
  const initializedRef = useRef(false);
  const [uploading, setUploading] = useState("");

  useEffect(() => {
    if (editorRef.current && (!initializedRef.current || value !== emittedRef.current)) editorRef.current.innerHTML = value;
    initializedRef.current = true;
    emittedRef.current = value;
  }, [value]);

  function rememberSelection() {
    const selection = window.getSelection();
    if (selection?.rangeCount && editorRef.current?.contains(selection.anchorNode)) selectionRef.current = selection.getRangeAt(0).cloneRange();
  }

  function restoreSelection() {
    const selection = window.getSelection();
    if (!selectionRef.current || !selection) return;
    selection.removeAllRanges(); selection.addRange(selectionRef.current);
  }

  function emit() {
    const html = editorRef.current?.innerHTML.trim() || "";
    emittedRef.current = html; onChange(html); rememberSelection();
  }

  function command(event: MouseEvent, name: string, value?: string) {
    event.preventDefault(); restoreSelection(); editorRef.current?.focus(); document.execCommand(name, false, value); emit();
  }

  function insertNode(node: Node) {
    restoreSelection();
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (range && editorRef.current?.contains(range.commonAncestorContainer)) { range.deleteContents(); range.insertNode(node); range.setStartAfter(node); range.collapse(true); selection?.removeAllRanges(); selection?.addRange(range); }
    else editorRef.current?.append(node);
    editorRef.current?.focus(); emit();
  }

  function addFormula(event: MouseEvent) {
    event.preventDefault(); rememberSelection(); const latex = window.prompt("输入 LaTeX 公式", "E = mc^2")?.trim(); if (!latex) return;
    const node = document.createElement("div"); node.className = "latex-formula"; node.dataset.latex = latex; node.dataset.display = "block"; node.textContent = latex; insertNode(node);
  }

  function addTable(event: MouseEvent) {
    event.preventDefault(); rememberSelection(); const rowInput = window.prompt("表格行数", "3"); if (rowInput === null) return; const columnInput = window.prompt("表格列数", "3"); if (columnInput === null) return; const rows = Math.min(12, Math.max(1, Number(rowInput) || 1)); const columns = Math.min(8, Math.max(1, Number(columnInput) || 1));
    const table = document.createElement("table"); table.className = "content-table"; const body = document.createElement("tbody");
    for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) { const row = document.createElement("tr"); for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) { const cell = document.createElement(rowIndex === 0 ? "th" : "td"); cell.textContent = rowIndex === 0 ? `标题 ${columnIndex + 1}` : "内容"; row.append(cell); } body.append(row); }
    table.append(body); insertNode(table);
  }

  function addCode(event: MouseEvent) {
    event.preventDefault(); rememberSelection(); const source = window.prompt("输入代码")?.trim(); if (!source) return; const language = window.prompt("代码语言（如 javascript、css、html）", "auto")?.trim() || "auto";
    const pre = document.createElement("pre"); pre.dataset.language = language; const code = document.createElement("code"); code.dataset.language = language; code.textContent = source; pre.append(code); insertNode(pre);
  }

  function addLink(event: MouseEvent) {
    event.preventDefault(); const href = window.prompt("输入 HTTPS 网址或站内路径");
    if (!href || !(href.startsWith("/") && !href.startsWith("//")) && !href.startsWith("https://")) return;
    restoreSelection(); editorRef.current?.focus(); document.execCommand("createLink", false, href); emit();
  }

  async function upload(file: File, previewable: boolean) {
    const body = new FormData(); body.append("file", file); body.append("previewable", previewable ? "true" : "false");
    const response = await fetch("/api/admin/uploads", { method: "POST", body });
    const result = await response.json() as { url?: string; downloadUrl?: string; name?: string; size?: number; previewable?: boolean; error?: string };
    if (!response.ok || !result.url) throw new Error(result.error || "上传失败");
    return result;
  }

  async function addImage(file: File) {
    try {
      setUploading(`正在上传 ${file.name}…`);
      const result = await upload(file, true);
      restoreSelection(); editorRef.current?.focus(); document.execCommand("insertImage", false, result.url); emit();
    } catch (error) { setUploading(error instanceof Error ? error.message : "图片上传失败"); }
    finally { if (imageInputRef.current) imageInputRef.current.value = ""; }
  }

  async function addFile(file: File) {
    try {
      setUploading(`正在上传 ${file.name}…`); const result = await upload(file, true);
      insertNode(createAttachmentCard({ name: result.name || file.name, url: result.url!, downloadUrl: result.downloadUrl || result.url!, size: result.size || file.size, previewable: result.previewable !== false }));
    } catch (error) { setUploading(error instanceof Error ? error.message : "文件上传失败"); }
    finally { if (fileInputRef.current) fileInputRef.current.value = ""; }
  }

  return <div className="rich-editor-wrap survey-rich-editor">
    <div className="rich-editor-label"><span>提交后的提示内容</span><small>与文章编辑器一致，支持富文本和图片</small></div>
    <div className="rich-toolbar" role="toolbar" aria-label="提交后内容排版工具">
      <div className="toolbar-group">
        <button type="button" title="标题" onMouseDown={(event) => command(event, "formatBlock", "h2")}>H2</button>
        <button type="button" title="正文" onMouseDown={(event) => command(event, "formatBlock", "p")}>P</button>
        <button type="button" title="加粗" onMouseDown={(event) => command(event, "bold")}><b>B</b></button>
        <button type="button" title="倾斜" onMouseDown={(event) => command(event, "italic")}><i>I</i></button>
      </div>
      <div className="toolbar-group">
        <button type="button" title="左对齐" onMouseDown={(event) => command(event, "justifyLeft")}>左</button>
        <button type="button" title="居中" onMouseDown={(event) => command(event, "justifyCenter")}>中</button>
        <button type="button" title="右对齐" onMouseDown={(event) => command(event, "justifyRight")}>右</button>
      </div>
      <div className="toolbar-group toolbar-insert">
        <button type="button" title="无序列表" onMouseDown={(event) => command(event, "insertUnorderedList")}>列表</button>
        <button type="button" title="有序列表" onMouseDown={(event) => command(event, "insertOrderedList")}>编号</button>
        <button type="button" title="链接" onMouseDown={addLink}>链接</button>
        <button type="button" title="公式" onMouseDown={addFormula}><Icon name="formula" /> 公式</button>
        <button type="button" title="表格" onMouseDown={addTable}><Icon name="table" /> 表格</button>
        <button type="button" title="代码" onMouseDown={addCode}><Icon name="code" /> 代码</button>
        <button type="button" title="插入图片" onMouseDown={(event) => { event.preventDefault(); rememberSelection(); imageInputRef.current?.click(); }}><Icon name="image" /> 图片</button>
        <button type="button" title="插入文件" onMouseDown={(event) => { event.preventDefault(); rememberSelection(); fileInputRef.current?.click(); }}><Icon name="file" /> 文件</button>
      </div>
    </div>
    <div ref={editorRef} className="rich-editor" contentEditable role="textbox" tabIndex={0} aria-multiline="true" suppressContentEditableWarning data-placeholder="填写提交成功后的提示……" onInput={emit} onKeyUp={rememberSelection} onMouseUp={rememberSelection} />
    <small>{uploading || "内容会在服务端清理危险代码"}</small>
    <input ref={imageInputRef} className="sr-only" type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && addImage(event.target.files[0])} />
    <input ref={fileInputRef} className="sr-only" type="file" onChange={(event) => event.target.files?.[0] && addFile(event.target.files[0])} />
  </div>;
}

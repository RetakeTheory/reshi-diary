"use client";
/* eslint-disable @next/next/no-img-element -- blob URLs cannot be rendered by next/image */

import { ChangeEvent, useEffect, useRef, useState } from "react";
import Icon from "../Icon";

export default function AvatarCropper({ onUploaded }: { onUploaded: (user: unknown) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState("");
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => () => { if (source) URL.revokeObjectURL(source); }, [source]);
  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (source) URL.revokeObjectURL(source);
    setSource(URL.createObjectURL(file)); setZoom(1); setX(0); setY(0); setMessage("");
  }
  async function upload() {
    const image = new Image(); image.src = source; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 512;
    const context = canvas.getContext("2d"); if (!context) return;
    const base = Math.max(512 / image.naturalWidth, 512 / image.naturalHeight);
    const width = image.naturalWidth * base * zoom; const height = image.naturalHeight * base * zoom;
    const maxX = Math.max(0, (width - 512) / 2); const maxY = Math.max(0, (height - 512) / 2);
    context.drawImage(image, (512 - width) / 2 + maxX * x / 100, (512 - height) / 2 + maxY * y / 100, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", .9));
    if (!blob) return;
    setBusy(true); setMessage("");
    try {
      const form = new FormData(); form.set("avatar", blob, "avatar.jpg");
      const response = await fetch("/api/account/avatar", { method: "POST", body: form });
      const result = await response.json() as { user?: unknown; error?: string };
      if (!response.ok || !result.user) throw new Error(result.error || "头像上传失败");
      onUploaded(result.user); setSource(""); setMessage("头像已更新");
    } catch (error) { setMessage(error instanceof Error ? error.message : "头像上传失败"); }
    finally { setBusy(false); }
  }
  return <div className="avatar-editor">
    <input ref={inputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={choose} />
    <button className="avatar-choose" type="button" onClick={() => inputRef.current?.click()}><Icon name="image" /> 选择并裁剪头像</button>
    {source && <div className="avatar-crop-dialog" role="dialog" aria-modal="true" aria-label="裁剪头像">
      <div className="avatar-crop-card">
        <div className="avatar-crop-stage"><img src={source} alt="头像裁剪预览" style={{ transform: `translate(${x / 2}%,${y / 2}%) scale(${zoom})` }} /></div>
        <label><span>缩放</span><input type="range" min="1" max="3" step=".05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
        <div className="avatar-position"><label><span>水平</span><input type="range" min="-100" max="100" value={x} onChange={(event) => setX(Number(event.target.value))} /></label><label><span>垂直</span><input type="range" min="-100" max="100" value={y} onChange={(event) => setY(Number(event.target.value))} /></label></div>
        <div className="avatar-crop-actions"><button type="button" className="button-quiet" onClick={() => setSource("")}>取消</button><button type="button" disabled={busy} onClick={upload}>{busy ? "正在上传…" : "保存头像"}</button></div>
      </div>
    </div>}
    {message && <p className="account-message" role="status">{message}</p>}
  </div>;
}

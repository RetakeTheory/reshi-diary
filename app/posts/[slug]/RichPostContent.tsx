"use client";

import { useEffect, useRef, useState } from "react";
import katex from "katex";
import { highlightCodeBlocks } from "../../../lib/code-highlight";
import { hydrateAttachmentCards } from "../../../lib/attachment-cards";
import Icon from "../../Icon";

type ViewerImage = { src: string; alt: string };

export default function RichPostContent({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLImageElement | null>(null);
  const [viewer, setViewer] = useState<ViewerImage | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    ref.current?.querySelectorAll<HTMLElement>("[data-latex]").forEach((node) => {
      katex.render(node.dataset.latex || "", node, { throwOnError: false, displayMode: node.dataset.display === "block" });
    });
    highlightCodeBlocks(ref.current);
    hydrateAttachmentCards(ref.current);
    const images = Array.from(ref.current?.querySelectorAll<HTMLImageElement>("img") || []);
    const open = (image: HTMLImageElement) => {
      triggerRef.current = image;
      setViewer({ src: image.currentSrc || image.src, alt: image.alt || "文章图片" });
      setZoom(1);
    };
    const clickHandlers = new Map<HTMLImageElement, () => void>();
    const keyHandlers = new Map<HTMLImageElement, (event: globalThis.KeyboardEvent) => void>();
    images.forEach((image) => {
      image.tabIndex = 0;
      image.setAttribute("role", "button");
      image.setAttribute("aria-label", `查看大图：${image.alt || "文章图片"}`);
      const click = () => open(image);
      const key = (event: globalThis.KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(image); }
      };
      clickHandlers.set(image, click); keyHandlers.set(image, key);
      image.addEventListener("click", click); image.addEventListener("keydown", key);
    });
    return () => images.forEach((image) => {
      const click = clickHandlers.get(image); const key = keyHandlers.get(image);
      if (click) image.removeEventListener("click", click);
      if (key) image.removeEventListener("keydown", key);
    });
  }, [html]);

  useEffect(() => {
    if (!viewer) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setViewer(null);
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), [href], [tabindex]:not([tabindex='-1'])") || []);
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
      triggerRef.current?.focus();
    };
  }, [viewer]);

  return <>
    <div ref={ref} className="rich-content" dangerouslySetInnerHTML={{ __html: html }} />
    {viewer && <div ref={dialogRef} className="image-viewer" role="dialog" aria-modal="true" aria-label={`图片查看器：${viewer.alt}`}>
      <div className="image-viewer-toolbar">
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" disabled={zoom <= 0.5} onClick={() => setZoom((value) => Math.max(0.5, value - 0.5))} aria-label="缩小图片，最小 50%"><Icon name="zoom-out" /></button>
        <button type="button" disabled={zoom >= 4} onClick={() => setZoom((value) => Math.min(4, value + 0.5))} aria-label="放大图片，最大 400%"><Icon name="zoom-in" /></button>
        <button type="button" onClick={() => setZoom(1)} aria-label="恢复原始缩放"><Icon name="reset" /></button>
        <button ref={closeRef} type="button" onClick={() => setViewer(null)} aria-label="关闭图片查看器"><Icon name="close" /></button>
      </div>
      <div className="image-viewer-stage">
        <button className="image-viewer-image" type="button" style={{ width: `${zoom * 100}%` }} aria-label="切换图片缩放" onClick={() => setZoom((value) => value > 1 ? 1 : 2)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewer.src} alt={viewer.alt} />
        </button>
      </div>
      <p>单击图片切换 100% / 200%，也可使用上方按钮缩放。</p>
    </div>}
  </>;
}

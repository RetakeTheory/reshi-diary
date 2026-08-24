"use client";
/* eslint-disable @next/next/no-img-element -- the transformed map uses its supplied source at intrinsic aspect ratio */

import { PointerEvent, WheelEvent, useRef, useState } from "react";
import Icon from "./Icon";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const STEP = 0.5;
const hotspots = [
  { id: "library", label: "图文信息中心", left: 39, top: 43 },
  { id: "lake", label: "镜月湖", left: 58, top: 47 },
  { id: "activity", label: "大学生活动中心", left: 44, top: 64 },
  { id: "teaching", label: "第一教学楼", left: 75, top: 48 },
  { id: "gym", label: "体育馆", left: 28, top: 60 },
];

function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }

export default function CampusMap({ title, description, hint, mapAlt, hotspotHint }: { title: string; description: string; hint: string; mapAlt: string; hotspotHint: string }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const [active, setActive] = useState(hotspots[1].id);

  function constrained(scale: number, x: number, y: number) {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect || scale <= 1) return { scale, x: 0, y: 0 };
    return { scale, x: clamp(x, -rect.width * (scale - 1) / 2, rect.width * (scale - 1) / 2), y: clamp(y, -rect.height * (scale - 1) / 2, rect.height * (scale - 1) / 2) };
  }

  function zoom(nextScale: number) {
    setView((current) => constrained(clamp(nextScale, MIN_SCALE, MAX_SCALE), current.x, current.y));
  }

  function reset() { setView({ scale: 1, x: 0, y: 0 }); }

  function onWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    zoom(view.scale + (event.deltaY < 0 ? STEP : -STEP));
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (view.scale <= 1 || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, offsetX: view.x, offsetY: view.y };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setView((current) => constrained(current.scale, drag.offsetX + event.clientX - drag.x, drag.offsetY + event.clientY - drag.y));
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }

  const selected = hotspots.find((hotspot) => hotspot.id === active)!;
  return <section className="campus-map-shell shell">
    <header className="campus-map-heading">
      <div><h1>{title}</h1><p>{description}</p></div>
      <span className="campus-map-scale" aria-live="polite">{Math.round(view.scale * 100)}%</span>
    </header>
    <div className="campus-map-frame">
      <div className="campus-map-toolbar" aria-label="地图缩放工具">
        <button type="button" onClick={() => zoom(view.scale + STEP)} disabled={view.scale >= MAX_SCALE} aria-label="放大地图"><Icon name="zoom-in" /></button>
        <button type="button" onClick={() => zoom(view.scale - STEP)} disabled={view.scale <= MIN_SCALE} aria-label="缩小地图"><Icon name="zoom-out" /></button>
        <button type="button" onClick={reset} disabled={view.scale === 1 && view.x === 0 && view.y === 0} aria-label="复位地图"><Icon name="reset" /></button>
      </div>
      <div ref={viewportRef} className={`campus-map-viewport${view.scale > 1 ? " is-zoomed" : ""}`} onWheel={onWheel} onDoubleClick={() => zoom(view.scale < 2 ? 2 : 1)} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
        <div className="campus-map-canvas" style={{ transform: `translate3d(${view.x}px,${view.y}px,0) scale(${view.scale})` }}>
          {/* The supplied campus overview is the authoritative map image. */}
          <img src="/campus-map-songjiang.jpg" alt={mapAlt} draggable={false} />
          {hotspots.map((hotspot) => <button type="button" key={hotspot.id} className={`campus-map-hotspot${active === hotspot.id ? " is-active" : ""}`} style={{ left: `${hotspot.left}%`, top: `${hotspot.top}%` }} onClick={(event) => { event.stopPropagation(); setActive(hotspot.id); }} aria-label={`定位：${hotspot.label}`}><span /></button>)}
        </div>
      </div>
      <footer className="campus-map-footer"><div><Icon name="map" /><span><b>{selected.label}</b><small>{hotspotHint}</small></span></div><p>{hint}</p></footer>
    </div>
  </section>;
}

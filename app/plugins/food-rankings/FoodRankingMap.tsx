"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import type { FoodRankingEntry, FoodRankingType } from "../../../lib/food-rankings";

type Position = { latitude: number; longitude: number };
type Props = {
  entries?: FoodRankingEntry[];
  editable?: boolean;
  editableType?: FoodRankingType;
  editablePosition?: Position | null;
  onPositionChange?: (position: Position) => void;
  onSelect?: (entry: FoodRankingEntry) => void;
};

const DEFAULT_CENTER: [number, number] = [121.22, 31.05];
const OSM_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster" as const, source: "osm" }],
};

function hasPosition(entry: FoodRankingEntry) {
  return Number.isFinite(entry.latitude) && Number.isFinite(entry.longitude);
}

export default function FoodRankingMap({ entries = [], editable = false, editableType = "red", editablePosition = null, onPositionChange, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const onSelectRef = useRef(onSelect);
  const onPositionChangeRef = useRef(onPositionChange);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    onSelectRef.current = onSelect;
    onPositionChangeRef.current = onPositionChange;
  }, [onPositionChange, onSelect]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const map = new maplibregl.Map({ container, style: OSM_STYLE, center: DEFAULT_CENTER, zoom: 16, minZoom: 3, attributionControl: false });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.on("load", () => setReady(true));
    map.on("error", (event) => { if (event.error) setError("地图加载失败，请检查网络后重试。"); });
    if (editable) {
      map.on("click", (event) => onPositionChangeRef.current?.({ latitude: event.lngLat.lat, longitude: event.lngLat.lng }));
    }
    mapRef.current = map;
    return () => { markersRef.current.forEach((marker) => marker.remove()); markersRef.current = []; map.remove(); mapRef.current = null; setReady(false); };
  }, [editable]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    const positionedEntries = entries.filter(hasPosition);
    if (!editable && positionedEntries.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      positionedEntries.forEach((entry) => bounds.extend([entry.longitude, entry.latitude]));
      map.fitBounds(bounds, { padding: 56, maxZoom: 17, duration: 350 });
    } else if (!editable && positionedEntries.length === 1) {
      map.easeTo({ center: [positionedEntries[0].longitude, positionedEntries[0].latitude], zoom: 16, duration: 350 });
    }
    if (editable) {
      const element = document.createElement("button");
      element.type = "button";
      element.className = `food-map-marker is-${editableType} is-editor`;
      element.setAttribute("aria-label", "拖动地图标记调整位置");
      const position: [number, number] = editablePosition ? [editablePosition.longitude, editablePosition.latitude] : (map.getCenter().toArray() as [number, number]);
      const marker = new maplibregl.Marker({ element, draggable: true, anchor: "center" }).setLngLat(position).addTo(map);
      marker.on("dragend", () => { const current = marker.getLngLat(); onPositionChangeRef.current?.({ latitude: current.lat, longitude: current.lng }); });
      markersRef.current.push(marker);
      return;
    }
    positionedEntries.forEach((entry) => {
      const element = document.createElement("button");
      element.type = "button";
      element.className = `food-map-marker is-${entry.listType}`;
      element.setAttribute("aria-label", `${entry.restaurant}，${entry.listType === "red" ? "红榜" : "黑榜"}`);
      element.addEventListener("click", (event) => { event.stopPropagation(); onSelectRef.current?.(entry); });
      markersRef.current.push(new maplibregl.Marker({ element, anchor: "center" }).setLngLat([entry.longitude, entry.latitude]).addTo(map));
    });
  }, [editable, editablePosition, editableType, entries, ready]);

  return <div className={`food-ranking-map${editable ? " is-editable" : ""}`}>
    <div ref={containerRef} className="food-ranking-map-canvas" aria-label={editable ? "点击或拖动地图标记设置餐厅位置" : "红黑榜餐厅地图"} />
    {error && <p className="food-ranking-map-error" role="status">{error}</p>}
    {editable && <span className="food-ranking-map-hint">点击地图放置标记，或拖动标记微调位置</span>}
    {!editable && !entries.some(hasPosition) && <div className="food-ranking-map-empty">管理员尚未为当前榜单设置地图位置</div>}
  </div>;
}


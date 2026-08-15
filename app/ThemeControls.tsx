"use client";

import { useEffect, useState } from "react";

type ThemeChoice = "system" | "light" | "dark";
type AccentChoice = "violet" | "ocean" | "rose" | "mint" | "amber" | "custom";

const themes: Array<{ value: ThemeChoice; label: string }> = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];
const accents: Array<{ value: AccentChoice; label: string }> = [
  { value: "violet", label: "紫罗兰" }, { value: "ocean", label: "海蓝" },
  { value: "rose", label: "莓红" }, { value: "mint", label: "薄荷" }, { value: "amber", label: "琥珀" },
];

function applyTheme(choice: ThemeChoice) {
  const dark = choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.dataset.themeChoice = choice;
}

function normalizeHex(value: string) {
  const cleaned = value.trim().replace(/^#/, "");
  return /^[0-9a-fA-F]{6}$/.test(cleaned) ? `#${cleaned.toUpperCase()}` : null;
}

function applyCustomColor(value: string) {
  const hex = normalizeHex(value);
  if (!hex) return false;
  const number = Number.parseInt(hex.slice(1), 16);
  const rgb = [(number >> 16) & 255, (number >> 8) & 255, number & 255];
  const soft = rgb.map((channel) => Math.min(255, Math.round(channel + (255 - channel) * .38)));
  document.documentElement.dataset.accent = "custom";
  document.documentElement.style.setProperty("--accent", hex);
  document.documentElement.style.setProperty("--accent-rgb", rgb.join(","));
  document.documentElement.style.setProperty("--accent-2", `rgb(${soft.join(",")})`);
  return true;
}

function clearCustomColor() {
  document.documentElement.style.removeProperty("--accent");
  document.documentElement.style.removeProperty("--accent-rgb");
  document.documentElement.style.removeProperty("--accent-2");
}

export default function ThemeControls() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeChoice>("system");
  const [accent, setAccent] = useState<AccentChoice>("violet");
  const [customColor, setCustomColor] = useState("#7657F6");

  useEffect(() => {
    const savedTheme = (localStorage.getItem("reshi-theme") as ThemeChoice | null) || "system";
    const savedAccent = (localStorage.getItem("reshi-accent") as AccentChoice | null) || "violet";
    const savedCustom = localStorage.getItem("reshi-custom-accent") || "#7657F6";
    setTheme(savedTheme); setAccent(savedAccent);
    setCustomColor(savedCustom); applyTheme(savedTheme);
    if (savedAccent === "custom") applyCustomColor(savedCustom);
    else { clearCustomColor(); document.documentElement.dataset.accent = savedAccent; }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => { if ((localStorage.getItem("reshi-theme") || "system") === "system") applyTheme("system"); };
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  function chooseTheme(value: ThemeChoice) {
    setTheme(value); localStorage.setItem("reshi-theme", value); applyTheme(value);
  }
  function chooseAccent(value: AccentChoice) {
    setAccent(value); localStorage.setItem("reshi-accent", value);
    if (value !== "custom") { clearCustomColor(); document.documentElement.dataset.accent = value; }
  }
  function chooseCustom(value: string) {
    setCustomColor(value);
    const hex = normalizeHex(value);
    if (hex && applyCustomColor(hex)) {
      setAccent("custom"); localStorage.setItem("reshi-accent", "custom"); localStorage.setItem("reshi-custom-accent", hex);
    }
  }

  return (
    <div className="theme-control">
      {open && <div className="theme-panel" role="dialog" aria-label="外观设置">
        <div className="theme-panel-head"><div><small>APPEARANCE</small><b>页面外观</b></div><button type="button" onClick={() => setOpen(false)} aria-label="关闭设置">×</button></div>
        <p>显示模式</p>
        <div className="theme-options">{themes.map((item) => <button type="button" key={item.value} className={theme === item.value ? "active" : ""} onClick={() => chooseTheme(item.value)}>{item.label}</button>)}</div>
        <p>主题颜色</p>
        <div className="accent-options">{accents.map((item) => <button type="button" key={item.value} data-color={item.value} className={accent === item.value ? "active" : ""} onClick={() => chooseAccent(item.value)} aria-label={item.label}><i /><span>{item.label}</span></button>)}</div>
        <div className={`custom-color ${accent === "custom" ? "active" : ""}`}>
          <label className="color-picker" title="打开取色器"><input type="color" value={normalizeHex(customColor) || "#7657F6"} onChange={(event) => chooseCustom(event.target.value)} /><i style={{ background: normalizeHex(customColor) || "#7657F6" }} /></label>
          <label className="hex-field"><span>自定义色号</span><input value={customColor} onChange={(event) => setCustomColor(event.target.value)} onBlur={() => chooseCustom(customColor)} onKeyDown={(event) => { if (event.key === "Enter") chooseCustom(customColor); }} aria-label="输入十六进制主题色" /></label>
          <button type="button" onClick={() => chooseCustom(customColor)}>应用</button>
        </div>
      </div>}
      <button className="theme-trigger" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label="打开页面外观设置"><span>◐</span><b>外观</b></button>
    </div>
  );
}

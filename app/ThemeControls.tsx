"use client";

import { useEffect, useRef, useState } from "react";

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
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  document.documentElement.style.backgroundColor = dark ? "#0b0d17" : "#eef0f7";
  let themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"][data-reshi-theme]');
  if (!themeColor) {
    themeColor = document.createElement("meta");
    themeColor.name = "theme-color";
    themeColor.dataset.reshiTheme = "";
    document.head.append(themeColor);
  }
  themeColor.content = dark ? "#0b0d17" : "#eef0f7";
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

function applyAccentChoice(value: Exclude<AccentChoice, "custom">) {
  clearCustomColor();
  document.documentElement.dataset.accent = value;
}

export default function ThemeControls() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeChoice>("system");
  const [accent, setAccent] = useState<AccentChoice>("violet");
  const [customColor, setCustomColor] = useState("#7657F6");
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const savedTheme = (localStorage.getItem("reshi-theme") as ThemeChoice | null) || "system";
    const savedAccent = (localStorage.getItem("reshi-accent") as AccentChoice | null) || "violet";
    const savedCustom = localStorage.getItem("reshi-custom-accent") || "#7657F6";
    const hydrateControls = window.setTimeout(() => {
      setTheme(savedTheme); setAccent(savedAccent);
      setCustomColor(savedCustom); applyTheme(savedTheme);
      if (savedAccent === "custom") applyCustomColor(savedCustom);
      else applyAccentChoice(savedAccent);
    }, 0);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => { if ((localStorage.getItem("reshi-theme") || "system") === "system") applyTheme("system"); };
    if (typeof media.addEventListener === "function") media.addEventListener("change", sync);
    else media.addListener(sync);
    return () => {
      window.clearTimeout(hydrateControls);
      if (typeof media.removeEventListener === "function") media.removeEventListener("change", sync);
      else media.removeListener(sync);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  function chooseTheme(value: ThemeChoice) {
    setTheme(value); localStorage.setItem("reshi-theme", value); applyTheme(value);
  }
  function chooseAccent(value: AccentChoice) {
    setAccent(value); localStorage.setItem("reshi-accent", value);
    if (value !== "custom") applyAccentChoice(value);
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
      {open && <div className="theme-panel" id="theme-panel" role="dialog" aria-label="外观设置">
        <div className="theme-panel-head"><div><small>APPEARANCE</small><b>页面外观</b></div><button type="button" onClick={() => { setOpen(false); triggerRef.current?.focus(); }} aria-label="关闭设置"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" /></svg></button></div>
        <p>显示模式</p>
        <div className="theme-options">{themes.map((item) => <button type="button" key={item.value} className={theme === item.value ? "active" : ""} aria-pressed={theme === item.value} onClick={() => chooseTheme(item.value)}>{item.label}</button>)}</div>
        <p>主题颜色</p>
        <div className="accent-options">{accents.map((item) => <button type="button" key={item.value} data-color={item.value} className={accent === item.value ? "active" : ""} aria-pressed={accent === item.value} onClick={() => chooseAccent(item.value)} aria-label={item.label}><i aria-hidden="true" /><span>{item.label}</span></button>)}</div>
        <div className={`custom-color ${accent === "custom" ? "active" : ""}`}>
          <label className="color-picker" title="打开取色器"><input type="color" aria-label="选择自定义主题色" value={normalizeHex(customColor) || "#7657F6"} onChange={(event) => chooseCustom(event.target.value)} /><i aria-hidden="true" style={{ background: normalizeHex(customColor) || "#7657F6" }} /></label>
          <label className="hex-field"><span>自定义色号</span><input value={customColor} onChange={(event) => setCustomColor(event.target.value)} onBlur={() => chooseCustom(customColor)} onKeyDown={(event) => { if (event.key === "Enter") chooseCustom(customColor); }} aria-label="输入十六进制主题色" /></label>
          <button type="button" onClick={() => chooseCustom(customColor)}>应用</button>
        </div>
      </div>}
      <button ref={triggerRef} className="theme-trigger" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="theme-panel" aria-label={open ? "关闭页面外观设置" : "打开页面外观设置"}><span aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" /></svg></span><b>外观</b></button>
    </div>
  );
}

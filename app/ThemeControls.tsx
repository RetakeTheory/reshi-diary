"use client";

import { useEffect, useState } from "react";

type ThemeChoice = "system" | "light" | "dark";
type AccentChoice = "violet" | "ocean" | "rose" | "mint" | "amber";

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

export default function ThemeControls() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeChoice>("system");
  const [accent, setAccent] = useState<AccentChoice>("violet");

  useEffect(() => {
    const savedTheme = (localStorage.getItem("reshi-theme") as ThemeChoice | null) || "system";
    const savedAccent = (localStorage.getItem("reshi-accent") as AccentChoice | null) || "violet";
    setTheme(savedTheme); setAccent(savedAccent);
    applyTheme(savedTheme); document.documentElement.dataset.accent = savedAccent;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => { if ((localStorage.getItem("reshi-theme") || "system") === "system") applyTheme("system"); };
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  function chooseTheme(value: ThemeChoice) {
    setTheme(value); localStorage.setItem("reshi-theme", value); applyTheme(value);
  }
  function chooseAccent(value: AccentChoice) {
    setAccent(value); localStorage.setItem("reshi-accent", value); document.documentElement.dataset.accent = value;
  }

  return (
    <div className="theme-control">
      {open && <div className="theme-panel" role="dialog" aria-label="外观设置">
        <div className="theme-panel-head"><div><small>APPEARANCE</small><b>页面外观</b></div><button type="button" onClick={() => setOpen(false)} aria-label="关闭设置">×</button></div>
        <p>显示模式</p>
        <div className="theme-options">{themes.map((item) => <button type="button" key={item.value} className={theme === item.value ? "active" : ""} onClick={() => chooseTheme(item.value)}>{item.label}</button>)}</div>
        <p>主题颜色</p>
        <div className="accent-options">{accents.map((item) => <button type="button" key={item.value} data-color={item.value} className={accent === item.value ? "active" : ""} onClick={() => chooseAccent(item.value)} aria-label={item.label}><i /><span>{item.label}</span></button>)}</div>
      </div>}
      <button className="theme-trigger" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label="打开页面外观设置"><span>◐</span><b>外观</b></button>
    </div>
  );
}

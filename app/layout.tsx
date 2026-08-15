import type { Metadata } from "next";
import "./globals.css";
import ThemeControls from "./ThemeControls";

export function generateMetadata(): Metadata {
  const title = "reshi的日记本｜计算机系废柴学生";
  const description = "reshi 的个人博客，记录学不会的知识、跑不通的代码和普通生活。";
  return {
    title,
    description,
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: { title, description, images: [] },
    twitter: { card: "summary", title, description, images: [] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const themeScript = `(function(){try{var c=localStorage.getItem('reshi-theme')||'system';var d=c==='dark'||(c==='system'&&matchMedia('(prefers-color-scheme:dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.dataset.themeChoice=c;document.documentElement.dataset.accent=localStorage.getItem('reshi-accent')||'violet'}catch(e){}})()`;
  return <html lang="zh-CN" suppressHydrationWarning><body><script dangerouslySetInnerHTML={{ __html: themeScript }} />{children}<ThemeControls /></body></html>;
}

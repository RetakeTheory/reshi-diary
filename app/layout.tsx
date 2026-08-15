import type { Metadata } from "next";
import "./globals.css";
import ThemeControls from "./ThemeControls";
import "katex/dist/katex.min.css";

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
  const themeScript = `(function(){try{var e=document.documentElement,c=localStorage.getItem('reshi-theme')||'system',d=c==='dark'||(c==='system'&&matchMedia('(prefers-color-scheme:dark)').matches),a=localStorage.getItem('reshi-accent')||'violet';e.dataset.theme=d?'dark':'light';e.dataset.themeChoice=c;e.dataset.accent=a;if(a==='custom'){var h=(localStorage.getItem('reshi-custom-accent')||'#7657F6').replace('#','');if(/^[0-9a-fA-F]{6}$/.test(h)){var n=parseInt(h,16),r=[n>>16&255,n>>8&255,n&255],s=r.map(function(v){return Math.min(255,Math.round(v+(255-v)*.38))});e.style.setProperty('--accent','#'+h);e.style.setProperty('--accent-rgb',r.join(','));e.style.setProperty('--accent-2','rgb('+s.join(',')+')')}}}catch(x){}})()`;
  return <html lang="zh-CN" suppressHydrationWarning><body><script dangerouslySetInnerHTML={{ __html: themeScript }} /><div className="site-mascot" aria-hidden="true" />{children}<ThemeControls /></body></html>;
}

import type { Metadata } from "next";
import "./globals.css";
import ThemeControls from "./ThemeControls";
import NoticeBanner from "./NoticeBanner";
import "katex/dist/katex.min.css";

export function generateMetadata(): Metadata {
  const title = "reshi的日记本｜日常碎片存档中";
  const description = "reshi 的私人存档点，收集日常、脑洞、喜欢的东西和偶尔触发的支线任务。";
  return {
    title,
    description,
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: { title, description, images: [] },
    twitter: { card: "summary", title, description, images: [] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const themeScript = `(function(){try{var e=document.documentElement,c=localStorage.getItem('reshi-theme')||'system',d=c==='dark'||(c==='system'&&matchMedia('(prefers-color-scheme:dark)').matches),a=localStorage.getItem('reshi-accent')||'violet',m=document.querySelector('meta[name="theme-color"][data-reshi-theme]');e.dataset.theme=d?'dark':'light';e.dataset.themeChoice=c;e.dataset.accent=a;e.style.colorScheme=d?'dark':'light';e.style.backgroundColor=d?'#0b0d17':'#eef0f7';if(m)m.content=d?'#0b0d17':'#eef0f7';if(a==='custom'){var h=(localStorage.getItem('reshi-custom-accent')||'#7657F6').replace('#','');if(/^[0-9a-fA-F]{6}$/.test(h)){var n=parseInt(h,16),r=[n>>16&255,n>>8&255,n&255],s=r.map(function(v){return Math.min(255,Math.round(v+(255-v)*.38))});e.style.setProperty('--accent','#'+h);e.style.setProperty('--accent-rgb',r.join(','));e.style.setProperty('--accent-2','rgb('+s.join(',')+')')}}}catch(x){}})()`;
  return <html lang="zh-CN" suppressHydrationWarning><head><meta name="theme-color" content="#eef0f7" data-reshi-theme="" /></head><body><script dangerouslySetInnerHTML={{ __html: themeScript }} /><NoticeBanner /><div className="site-mascot" aria-hidden="true" />{children}<ThemeControls /></body></html>;
}

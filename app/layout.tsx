import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "林屿｜产品设计师与前端开发者",
  description: "独立产品设计师与前端开发者林屿的个人主页，专注品牌、数字产品与网站体验。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}

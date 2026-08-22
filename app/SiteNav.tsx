"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ArrowIcon from "./ArrowIcon";
import Icon from "./Icon";

const destinations = [
  { href: "/", label: "首页" },
  { href: "/posts", label: "文章" },
  { href: "/plugins", label: "插件目录" },
  { href: "/#about", label: "关于" },
  { href: "/login", label: "读者登录" },
];

export default function SiteNav({ backHref, backLabel }: { backHref?: string; backLabel?: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <nav className="nav shell site-nav" aria-label="主导航">
      <Link className="brand" href="/#top"><span>RE</span>reshi的日记本</Link>
      <div className="nav-links">
        <Link href="/">首页</Link><Link href="/posts">文章</Link>
        <div className="nav-directory">
          <Link href="/plugins">插件</Link>
          <div className="nav-dropdown">
            <Link href="/plugins/food-roulette"><span><Icon name="food" /></span><b>今天吃什么</b><small>命运摇奖机</small></Link>
            <Link href="/plugins/random-number"><span><Icon name="dice" /></span><b>随机数</b><small>不重复抽取</small></Link>
            <Link href="/plugins/prize-wheel"><span><Icon name="wheel" /></span><b>自定义抽奖</b><small>概率与权重</small></Link>
          </div>
        </div>
        <Link href="/#about">关于</Link><Link href="/login">读者登录</Link>
      </div>
      {backHref ? (
        <Link className="admin-link desktop-nav-action" href={backHref}><ArrowIcon direction="left" /> {backLabel || "返回"}</Link>
      ) : (
        <Link className="admin-link desktop-nav-action" href="/admin/login">写日记 <ArrowIcon direction="up-right" /></Link>
      )}
      <button ref={triggerRef} className="mobile-menu-trigger" type="button" aria-expanded={open} aria-controls="mobile-site-menu" aria-label={open ? "关闭菜单" : "打开菜单"} onClick={() => setOpen((value) => !value)}>
        <Icon name={open ? "close" : "menu"} />
      </button>
      <div id="mobile-site-menu" className={`mobile-site-menu${open ? " is-open" : ""}`} hidden={!open}>
        {destinations.map((item) => <Link href={item.href} key={item.href} onClick={() => setOpen(false)}>{item.label}<ArrowIcon /></Link>)}
        <Link href={backHref || "/admin/login"} onClick={() => setOpen(false)}>{backLabel || "写日记"}<ArrowIcon direction={backHref ? "left" : "up-right"} /></Link>
      </div>
    </nav>
  );
}

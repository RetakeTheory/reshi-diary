"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- native navigation remains functional when client routing is unavailable */

import { useEffect, useRef, useState } from "react";
import ArrowIcon from "./ArrowIcon";
import Icon from "./Icon";
import ReaderAvatar from "./ReaderAvatar";
import { sitePages } from "../lib/site-pages";

const copy = sitePages.globals.navigation;
const destinations = [
  { href: "/", label: copy.home },
  { href: "/posts", label: copy.posts },
  { href: "/plugins", label: copy.plugins },
  { href: "/#about", label: copy.about },
  { href: "/login", label: copy.readerLogin },
];

export default function SiteNav({ backHref, backLabel }: { backHref?: string; backLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [reader, setReader] = useState<{ displayName: string; avatarUrl: string | null } | null>(null);
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
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/me", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (response.ok) setReader(((await response.json()) as { user: { displayName: string; avatarUrl: string | null } }).user);
    }).catch(() => undefined);
    return () => controller.abort();
  }, []);

  return (
    <nav className="nav shell site-nav" aria-label="主导航">
      <a className="brand" href="/#top"><span>RE</span>{copy.brand}</a>
      <div className="nav-links">
        <a href="/">{copy.home}</a><a href="/posts">{copy.posts}</a>
        <div className="nav-directory">
          <a href="/plugins">{copy.plugins}</a>
          <div className="nav-dropdown">
            <a href="/plugins/food-roulette"><span><Icon name="food" /></span><b>{copy.foodTitle}</b><small>{copy.foodCaption}</small></a>
            <a href="/plugins/random-number"><span><Icon name="dice" /></span><b>{copy.randomTitle}</b><small>{copy.randomCaption}</small></a>
            <a href="/plugins/prize-wheel"><span><Icon name="wheel" /></span><b>{copy.wheelTitle}</b><small>{copy.wheelCaption}</small></a>
          </div>
        </div>
        <a href="/#about">{copy.about}</a><a href={reader ? "/account" : "/login"}>{reader ? copy.readerCenter : copy.readerLogin}</a>
      </div>
      {backHref ? (
        <a className="admin-link desktop-nav-action" href={backHref}><ArrowIcon direction="left" /> {backLabel || "返回"}</a>
      ) : (
        <div className="desktop-nav-actions"><a className="admin-link" href="/admin/login">{copy.write} <ArrowIcon direction="up-right" /></a><a className="nav-reader-avatar" href={reader ? "/account" : "/login"} aria-label={reader ? `${reader.displayName} 的${copy.readerCenter}` : copy.readerLogin}><ReaderAvatar src={reader?.avatarUrl} name={reader?.displayName || "读者"} /></a></div>
      )}
      <button ref={triggerRef} className="mobile-menu-trigger" type="button" aria-expanded={open} aria-controls="mobile-site-menu" aria-label={open ? "关闭菜单" : "打开菜单"} onClick={() => setOpen((value) => !value)}>
        <Icon name={open ? "close" : "menu"} />
      </button>
      <div id="mobile-site-menu" className={`mobile-site-menu${open ? " is-open" : ""}`} hidden={!open}>
        {destinations.map((item) => <a href={item.href === "/login" && reader ? "/account" : item.href} key={item.href} onClick={() => setOpen(false)}>{item.href === "/login" && reader ? copy.readerCenter : item.label}<ArrowIcon /></a>)}
        <a href={backHref || "/admin/login"} onClick={() => setOpen(false)}>{backLabel || copy.write}<ArrowIcon direction={backHref ? "left" : "up-right"} /></a>
      </div>
    </nav>
  );
}

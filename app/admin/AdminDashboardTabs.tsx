"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import Icon, { type IconName } from "../Icon";

export type AdminDashboardTab = {
  id: string;
  label: string;
  description: string;
  icon: IconName;
  content: ReactNode;
};

export default function AdminDashboardTabs({ items }: { items: AdminDashboardTab[] }) {
  const fallbackId = items.find((item) => item.id === "admin-posts")?.id || items[0]?.id || "";
  const [activeId, setActiveId] = useState(fallbackId);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    function followHash() {
      const hashId = window.location.hash.slice(1);
      if (items.some((item) => item.id === hashId)) setActiveId(hashId);
    }
    queueMicrotask(followHash);
    window.addEventListener("hashchange", followHash);
    return () => window.removeEventListener("hashchange", followHash);
  }, [items]);

  function select(id: string) {
    setActiveId(id);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${id}`);
  }

  function moveFocus(index: number, event: KeyboardEvent<HTMLButtonElement>) {
    let nextIndex = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % items.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = items.length - 1;
    else return;
    event.preventDefault();
    const next = items[nextIndex];
    select(next.id);
    tabRefs.current[nextIndex]?.focus();
  }

  return <section className="admin-dashboard" aria-label="后台功能区">
    <header className="admin-dashboard-head">
      <div><h1>管理中心</h1><p>选择一个功能区开始工作，其他模块会暂时收起并保留当前编辑状态。</p></div>
      <span>{items.length} 个功能区</span>
    </header>
    <div className="admin-tab-cards" role="tablist" aria-label="后台功能">
      {items.map((item, index) => <button
        type="button"
        role="tab"
        id={`tab-${item.id}`}
        aria-controls={`panel-${item.id}`}
        aria-selected={activeId === item.id}
        tabIndex={activeId === item.id ? 0 : -1}
        ref={(element) => { tabRefs.current[index] = element; }}
        onClick={() => select(item.id)}
        onKeyDown={(event) => moveFocus(index, event)}
        key={item.id}
      >
        <span className="admin-tab-icon"><Icon name={item.icon} /></span>
        <span className="admin-tab-copy"><b>{item.label}</b><small>{item.description}</small></span>
        <i aria-hidden="true" />
      </button>)}
    </div>
    <div className="admin-tab-stage">
      {items.map((item) => <section
        className="admin-tab-panel"
        role="tabpanel"
        id={`panel-${item.id}`}
        aria-labelledby={`tab-${item.id}`}
        hidden={activeId !== item.id}
        key={item.id}
      >{item.content}</section>)}
    </div>
  </section>;
}

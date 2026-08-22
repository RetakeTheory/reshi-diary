"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";

type Notice = { text: string; backgroundColor: string; foregroundColor: string };

export default function NoticeTicker({ notice }: { notice: Notice }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const [scrolling, setScrolling] = useState(false);

  useEffect(() => {
    const measure = () => setScrolling((textRef.current?.scrollWidth || 0) > (trackRef.current?.clientWidth || 0) + 1);
    measure();
    const observer = new ResizeObserver(measure);
    if (trackRef.current) observer.observe(trackRef.current);
    if (textRef.current) observer.observe(textRef.current);
    return () => observer.disconnect();
  }, [notice.text]);

  return (
    <aside className={`notice-banner${scrolling ? " is-scrolling" : ""}`} style={{ backgroundColor: notice.backgroundColor, color: notice.foregroundColor }} aria-label="站内通知">
      <Icon name="spark" />
      <div ref={trackRef} className="notice-track">
        <div className="notice-rail">
          <p ref={textRef}>{notice.text}</p>
          {scrolling && <p aria-hidden="true">{notice.text}</p>}
        </div>
      </div>
    </aside>
  );
}

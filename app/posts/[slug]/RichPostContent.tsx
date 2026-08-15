"use client";

import { useEffect, useRef } from "react";
import katex from "katex";

export default function RichPostContent({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelectorAll<HTMLElement>("[data-latex]").forEach((node) => {
      katex.render(node.dataset.latex || "", node, {
        throwOnError: false,
        displayMode: node.dataset.display === "block",
      });
    });
  }, [html]);
  return <div ref={ref} className="rich-content" dangerouslySetInnerHTML={{ __html: html }} />;
}

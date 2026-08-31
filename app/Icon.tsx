export type IconName =
  | "spark" | "food" | "dice" | "wheel" | "menu" | "close" | "user" | "key"
  | "heart" | "insight" | "reply" | "comment" | "zoom-in" | "zoom-out" | "reset"
  | "plus" | "minus" | "trash" | "formula" | "table" | "code" | "image" | "file" | "check"
  | "external" | "shield" | "map" | "arrow-left" | "search" | "ranking" | "thumb-up" | "thumb-down"
  | "heading" | "paragraph" | "bold" | "italic" | "align-left" | "align-center" | "align-right"
  | "list-unordered" | "list-ordered" | "link" | "bot";

export default function Icon({ name, className }: { name: IconName; className?: string }) {
  const common = { className, viewBox: "0 0 24 24", "aria-hidden": true } as const;
  switch (name) {
    case "spark": return <svg {...common}><path d="M12 2.8c.7 5.3 3.1 7.7 8.4 8.4-5.3.7-7.7 3.1-8.4 8.4-.7-5.3-3.1-7.7-8.4-8.4 5.3-.7 7.7-3.1 8.4-8.4Z" /></svg>;
    case "food": return <svg {...common}><path d="M5 10.5h14v1.2a7 7 0 0 1-14 0v-1.2Z" /><path d="M3.5 10.5h17M8 7.5c0-1 1-1.4 1-2.5M12 7.5c0-1 1-1.4 1-2.5M16 7.5c0-1 1-1.4 1-2.5M8 19h8" /></svg>;
    case "dice": return <svg {...common}><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="8.5" cy="8.5" r="1" /><circle cx="15.5" cy="8.5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="8.5" cy="15.5" r="1" /><circle cx="15.5" cy="15.5" r="1" /></svg>;
    case "wheel": return <svg {...common}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2" /><path d="M12 4v6M12 14v6M4 12h6M14 12h6M6.3 6.3l4.2 4.2M13.5 13.5l4.2 4.2M17.7 6.3l-4.2 4.2M10.5 13.5l-4.2 4.2" /></svg>;
    case "menu": return <svg {...common}><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
    case "close": return <svg {...common}><path d="m6 6 12 12M18 6 6 18" /></svg>;
    case "user": return <svg {...common}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.5-4 3-6 7-6s6.5 2 7 6" /></svg>;
    case "key": return <svg {...common}><circle cx="8.5" cy="12" r="4" /><path d="M12.5 12H21M17 12v3M20 12v2" /></svg>;
    case "heart": return <svg {...common}><path d="M20.8 8.9c0 5.2-8.8 10.1-8.8 10.1S3.2 14.1 3.2 8.9A4.7 4.7 0 0 1 12 6.6a4.7 4.7 0 0 1 8.8 2.3Z" /></svg>;
    case "insight": return <svg {...common}><path d="M9 18h6M9.5 21h5M8.2 14.8a7 7 0 1 1 7.6 0c-.8.6-.8 1.2-.8 2.2H9c0-1-.1-1.6-.8-2.2Z" /></svg>;
    case "reply": return <svg {...common}><path d="m9 7-5 5 5 5M5 12h8c4 0 6 2 6 6" /></svg>;
    case "comment": return <svg {...common}><path d="M5 5h14v11H9l-4 3V5Z" /><path d="M8 9h8M8 12h5" /></svg>;
    case "zoom-in": return <svg {...common}><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 4.5 4.5M7.5 10.5h6M10.5 7.5v6" /></svg>;
    case "zoom-out": return <svg {...common}><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 4.5 4.5M7.5 10.5h6" /></svg>;
    case "reset": return <svg {...common}><path d="M5 8V4m0 0h4M5 4a9 9 0 1 1-1.2 10" /></svg>;
    case "plus": return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
    case "minus": return <svg {...common}><path d="M5 12h14" /></svg>;
    case "trash": return <svg {...common}><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 10v6M14 10v6" /></svg>;
    case "heading": return <svg {...common}><path d="M4 5v14M12 5v14M4 12h8M16 9a2 2 0 0 1 4 0c0 2-4 2.5-4 5h4" /></svg>;
    case "paragraph": return <svg {...common}><path d="M13 5v14M17 5v14M13 5H9a4 4 0 0 0 0 8h4" /></svg>;
    case "bold": return <svg {...common}><path d="M7 5h6a4 4 0 0 1 0 8H7V5Zm0 8h7a3 3 0 0 1 0 6H7v-6Z" /></svg>;
    case "italic": return <svg {...common}><path d="M10 5h7M7 19h7M14 5l-4 14" /></svg>;
    case "align-left": return <svg {...common}><path d="M4 6h16M4 10h11M4 14h16M4 18h13" /></svg>;
    case "align-center": return <svg {...common}><path d="M4 6h16M7 10h10M4 14h16M6 18h12" /></svg>;
    case "align-right": return <svg {...common}><path d="M4 6h16M9 10h11M4 14h16M7 18h13" /></svg>;
    case "list-unordered": return <svg {...common}><circle cx="5" cy="6" r="1" /><circle cx="5" cy="12" r="1" /><circle cx="5" cy="18" r="1" /><path d="M10 6h10M10 12h10M10 18h10" /></svg>;
    case "list-ordered": return <svg {...common}><path d="M4 5.2 5.2 4v4M3.8 11.6c.2-.8 2.5-1.1 2.5.3 0 .9-2.4 1.4-2.4 2.6h2.5M3.9 17.1c.5-.5 2.4-.4 2.4.7 0 .8-.8 1.1-1.6 1.1.8 0 1.7.3 1.7 1.1 0 1.2-2 1.3-2.6.7M10 6h10M10 12h10M10 18h10" /></svg>;
    case "link": return <svg {...common}><path d="M10 13a5 5 0 0 0 7.1.1l2-2A5 5 0 0 0 12 4l-1.1 1.1M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" /></svg>;
    case "formula": return <svg {...common}><path d="M17.5 5H8l5 7-5 7h9.5M15 9h4M15 15h4" /></svg>;
    case "table": return <svg {...common}><rect x="4" y="5" width="16" height="14" rx="1.5" /><path d="M4 10h16M10 5v14M15 5v14" /></svg>;
    case "code": return <svg {...common}><path d="m9 7-5 5 5 5M15 7l5 5-5 5M13.5 4 10.5 20" /></svg>;
    case "image": return <svg {...common}><rect x="3.5" y="4" width="17" height="16" rx="2.5" /><circle cx="8.5" cy="9" r="1.6" /><path d="m5 17 4.4-4.4 3.3 3.2 2.4-2.4L19 17.3" /></svg>;
    case "file": return <svg {...common}><path d="M6.5 3.5h7.4l3.6 3.7v13.3h-11z" /><path d="M13.5 3.8v4h3.8M9.5 12h5M9.5 15.5h5" /></svg>;
    case "check": return <svg {...common}><path d="m5 12.5 4.2 4.2L19 7" /></svg>;
    case "external": return <svg {...common}><path d="M13 5h6v6M19 5l-8 8" /><path d="M16 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h5" /></svg>;
    case "shield": return <svg {...common}><path d="M12 3 5 6v5c0 4.4 2.7 7.8 7 10 4.3-2.2 7-5.6 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>;
    case "map": return <svg {...common}><path d="m4 6 5-2 6 2 5-2v14l-5 2-6-2-5 2V6Z" /><path d="M9 4v14M15 6v14" /></svg>;
    case "arrow-left": return <svg {...common}><path d="m10 6-6 6 6 6M4 12h16" /></svg>;
    case "search": return <svg {...common}><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 4.5 4.5" /></svg>;
    case "ranking": return <svg {...common}><path d="M5 20V10h4v10M10 20V4h4v16M15 20v-7h4v7M3 20h18" /><path d="m6 6 2-2 2 2 2-2 2 2 2-2 2 2" /></svg>;
    case "thumb-up": return <svg {...common}><path d="M8 10v10H4V10h4Zm0 8h8.2a2 2 0 0 0 1.9-1.4l1.4-4.7A2 2 0 0 0 17.6 9H14l.5-3.1A2.4 2.4 0 0 0 12.1 3L8 9v9Z" /></svg>;
    case "thumb-down": return <svg {...common}><path d="M8 14V4H4v10h4Zm0-8h8.2a2 2 0 0 1 1.9 1.4l1.4 4.7a2 2 0 0 1-1.9 2.9H14l.5 3.1a2.4 2.4 0 0 1-2.4 2.9L8 15V6Z" /></svg>;
    case "bot": return <svg {...common}><rect x="4" y="7" width="16" height="12" rx="4" /><path d="M12 3v4M9 3h6M8 12h.01M16 12h.01M8.5 16h7M2 11v4M22 11v4" /></svg>;
  }
}

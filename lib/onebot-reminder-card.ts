import { ImageResponse } from "@vercel/og";
import { createElement, type CSSProperties, type ReactNode } from "react";

const CARD_WIDTH = 960;
const MAX_LINES = 10;
const FONT_ORIGIN = "https://rettheory.top";
const MENU_CACHE_URL = "https://onebot-card-cache.invalid/help-menu-v2.png";

export type OneBotCardFonts = {
  rounded: ArrayBuffer;
  noto: ArrayBuffer;
};

let cardFontsPromise: Promise<OneBotCardFonts> | null = null;

function element(type: string, style: CSSProperties, ...children: ReactNode[]) {
  return createElement(type, { style }, ...children);
}

function chinaDateTime(timestamp: number) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(timestamp);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day} ${value.hour}:${value.minute}:${value.second}`;
}

function characterWidth(character: string) {
  return (character.codePointAt(0) || 0) <= 0x024f ? 0.55 : 1;
}

export function wrapOneBotReminderText(value: string, maxWidth = 19, maxLines = MAX_LINES) {
  const lines: string[] = [];
  let line = "";
  let width = 0;
  const pushLine = () => {
    lines.push(line.trimEnd());
    line = "";
    width = 0;
  };
  for (const character of value.trim()) {
    if (character === "\n") {
      pushLine();
    } else {
      const nextWidth = width + characterWidth(character);
      if (line && nextWidth > maxWidth) pushLine();
      line += character;
      width += characterWidth(character);
    }
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) pushLine();
  const consumed = lines.join("").length;
  if (consumed < value.replace(/\n/g, "").trim().length && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[，。！？、,.!?\s]+$/u, "")}…`;
  }
  return lines;
}

async function fetchCardFont(path: string) {
  let response: Response | null = null;
  try {
    const { env } = await import("cloudflare:workers");
    const assets = (env as unknown as { ASSETS?: { fetch(request: Request): Promise<Response> } }).ASSETS;
    if (assets) response = await assets.fetch(new Request(new URL(path, FONT_ORIGIN)));
  } catch {
    // Tests and non-Worker runtimes do not expose the Cloudflare asset binding.
  }
  response ||= await fetch(new URL(path, FONT_ORIGIN), { signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`提醒卡片字体加载失败（HTTP ${response.status}）`);
  return response.arrayBuffer();
}

function defaultCardCache() {
  if (typeof caches === "undefined") return null;
  return (caches as CacheStorage & { default?: Cache }).default || null;
}

async function loadCardFonts() {
  cardFontsPromise ||= Promise.all([
    fetchCardFont("/fonts/resource-han-rounded-sc-bold.woff"),
    fetchCardFont("/fonts/noto-sans-sc-bold-latin.woff"),
  ]).then(([rounded, noto]) => ({ rounded, noto })).catch((error) => {
    cardFontsPromise = null;
    throw error;
  });
  return cardFontsPromise;
}

export async function renderOneBotReminderCard(input: {
  text: string;
  title?: string;
  menu?: boolean;
  dueAt: number;
  generatedAt?: number;
  fonts?: OneBotCardFonts;
}) {
  const cache = input.menu ? defaultCardCache() : null;
  if (cache) {
    const cached = await cache.match(MENU_CACHE_URL).catch(() => undefined);
    if (cached?.ok) return cached.arrayBuffer();
  }
  const generatedAt = input.generatedAt ?? Date.now();
  const lines = wrapOneBotReminderText(input.text, input.menu ? 30 : 19, input.menu ? 20 : MAX_LINES);
  const height = Math.min(input.menu ? 1400 : 900, Math.max(560, 430 + lines.length * 52));
  const fonts = input.fonts || await loadCardFonts();
  const fontFamily = "OneBot Noto Sans SC, OneBot Rounded SC";
  const image = new ImageResponse(
    element("div", {
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      padding: "38px 32px 26px",
      background: "#f2f7ff",
      color: "#2f394a",
      fontFamily,
      fontWeight: 700,
    },
    element("div", {
      width: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 4px 24px",
      fontSize: 28,
    },
    element("div", { display: "flex", alignItems: "center", gap: 14 },
      element("div", {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 44,
        height: 44,
        borderRadius: 22,
        background: "#4d8fe8",
        color: "#ffffff",
        fontSize: 25,
      }, "i"),
      input.title || "定时提醒",
    ),
    element("div", { display: "flex", color: "#4b7fc5", fontSize: 20 }, "REMINDER")),
    element("div", {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      padding: "44px 50px 38px",
      border: "2px solid #c9dbf3",
      borderRadius: 22,
      background: "#ffffff",
    },
    element("div", { display: "flex", flexDirection: "column" },
      element("div", { display: "flex", color: "#7194c3", fontSize: 21, marginBottom: 16 }, input.title || "提醒时间到了"),
      element("div", {
        display: "flex",
        whiteSpace: "pre-wrap",
        color: "#2e3745",
        fontSize: input.menu ? 30 : 42,
        lineHeight: 1.34,
        letterSpacing: "0.01em",
      }, lines.join("\n"))),
    element("div", {
      width: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 34,
      padding: "18px 22px",
      borderRadius: 14,
      background: "#edf5ff",
      color: "#5477a5",
      fontSize: 21,
    },
    element("span", { display: "flex" }, input.title ? "更新时间" : "设定时间"),
    element("span", { display: "flex" }, chinaDateTime(input.dueAt)))),
    element("div", {
      display: "flex",
      justifyContent: "flex-end",
      padding: "19px 4px 0",
      color: "#8693a6",
      fontSize: 18,
    }, `DT:${chinaDateTime(generatedAt)}`)), {
      width: CARD_WIDTH,
      height,
      fonts: [
        { name: "OneBot Rounded SC", data: fonts.rounded, weight: 700, style: "normal" },
        { name: "OneBot Noto Sans SC", data: fonts.noto, weight: 700, style: "normal" },
      ],
    });
  const png = await image.arrayBuffer();
  const signature = new Uint8Array(png, 0, Math.min(8, png.byteLength));
  if (png.byteLength < 1000 || signature[0] !== 0x89 || signature[1] !== 0x50) {
    throw new Error("提醒卡片 PNG 生成失败");
  }
  if (cache) {
    await cache.put(MENU_CACHE_URL, new Response(png.slice(0), {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
    })).catch(() => undefined);
  }
  return png;
}

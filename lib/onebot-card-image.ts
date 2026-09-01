import { toBlob } from "html-to-image";

const TRANSPARENT_PIXEL = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
let embeddedFontsPromise: Promise<string> | null = null;

function blobDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("卡片字体读取失败")), { once: true });
    reader.addEventListener("error", () => reject(reader.error || new Error("卡片字体读取失败")), { once: true });
    reader.readAsDataURL(blob);
  });
}

async function fontDataUrl(path: string) {
  const response = await fetch(path, { cache: "force-cache" });
  if (!response.ok) throw new Error(`卡片字体加载失败（HTTP ${response.status}）`);
  return blobDataUrl(await response.blob());
}

async function embeddedCardFonts() {
  embeddedFontsPromise ||= Promise.all([
    fontDataUrl("/fonts/resource-han-rounded-sc-bold.woff2"),
    fontDataUrl("/fonts/noto-sans-sc-bold-latin.woff2"),
  ]).then(([rounded, noto]) => `
    @font-face{font-family:"OneBot Rounded SC";src:url("${rounded}") format("woff2");font-style:normal;font-weight:700;font-display:block}
    @font-face{font-family:"OneBot Noto Sans SC";src:url("${noto}") format("woff2");font-style:normal;font-weight:700;font-display:block}
  `).catch((error) => {
    embeddedFontsPromise = null;
    throw error;
  });
  return embeddedFontsPromise;
}

function generatedDateTime() {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(Date.now());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `DT:${value.year}-${value.month}-${value.day} ${value.hour}:${value.minute}:${value.second}`;
}

async function waitForImages(node: HTMLElement) {
  const images = Array.from(node.querySelectorAll("img"));
  await Promise.all(images.map(async (image) => {
    if (image.complete) return;
    await new Promise<void>((resolve) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
      window.setTimeout(resolve, 4_000);
    });
  }));
}

export async function renderOneBotCardPng(node: HTMLElement) {
  const [rounded, noto, fontEmbedCSS] = await Promise.all([
    document.fonts.load("700 32px 'OneBot Rounded SC'", "群通知卡片汉字"),
    document.fonts.load("700 32px 'OneBot Noto Sans SC'", "Andory 2026"),
    embeddedCardFonts(),
  ]);
  if (!rounded.length || !noto.length) throw new Error("卡片字体未能加载，请刷新后台后重试");
  await document.fonts.ready;
  await waitForImages(node);
  const content = node.querySelector<HTMLElement>(".onebot-render-content");
  const dateTime = node.querySelector<HTMLElement>(".onebot-render-datetime");
  const previousDateTime = dateTime?.textContent || "";
  if (dateTime) dateTime.textContent = generatedDateTime();
  content?.classList.toggle("is-truncated", content.scrollHeight > content.clientHeight);
  try {
    const blob = await toBlob(node, {
      backgroundColor: "#f4f6fb",
      cacheBust: true,
      fontEmbedCSS,
      imagePlaceholder: TRANSPARENT_PIXEL,
      pixelRatio: 1.5,
    });
    if (!blob) throw new Error("卡片图片生成失败，请重试");
    return blob;
  } finally {
    if (dateTime) dateTime.textContent = previousDateTime;
    content?.classList.remove("is-truncated");
  }
}

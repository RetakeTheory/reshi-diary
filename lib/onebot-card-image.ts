import { toBlob } from "html-to-image";

const TRANSPARENT_PIXEL = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

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
  await Promise.all([
    document.fonts.load("700 32px 'OneBot Rounded SC'", "群通知卡片汉字"),
    document.fonts.load("700 32px 'OneBot Noto Sans SC'", "Andory 2026"),
  ]);
  await document.fonts.ready;
  await waitForImages(node);
  const content = node.querySelector<HTMLElement>(".onebot-render-content");
  content?.classList.toggle("is-truncated", content.scrollHeight > content.clientHeight);
  try {
    const blob = await toBlob(node, {
      backgroundColor: "#f4f6fb",
      cacheBust: true,
      imagePlaceholder: TRANSPARENT_PIXEL,
      pixelRatio: 1.5,
    });
    if (!blob) throw new Error("卡片图片生成失败，请重试");
    return blob;
  } finally {
    content?.classList.remove("is-truncated");
  }
}

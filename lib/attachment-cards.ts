type AttachmentCardData = {
  name: string;
  url: string;
  downloadUrl: string;
  size: number;
  previewable: boolean;
};

const SVG_NS = "http://www.w3.org/2000/svg";

function folderIcon() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "attachment-folder-icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", "M3.5 7.2A2.2 2.2 0 0 1 5.7 5h3.8l2.2 2.2h6.6a2.2 2.2 0 0 1 2.2 2.2v7.4a2.2 2.2 0 0 1-2.2 2.2H5.7a2.2 2.2 0 0 1-2.2-2.2Z");
  svg.append(path);
  return svg;
}

function actionLink(label: string, href: string, kind: "preview" | "download") {
  const link = document.createElement("a");
  link.className = `attachment-action attachment-${kind}`;
  link.href = href;
  link.textContent = label;
  return link;
}

function localUrl(parsed: URL) {
  return parsed.origin === window.location.origin ? `${parsed.pathname}${parsed.search}${parsed.hash}` : parsed.toString();
}

function rawFileUrlFor(url: string) {
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin === window.location.origin && parsed.pathname.startsWith("/preview/")) {
      parsed.pathname = `/api/files/${parsed.pathname.slice("/preview/".length)}`;
    }
    parsed.searchParams.delete("from");
    parsed.searchParams.delete("download");
    parsed.hash = "";
    return localUrl(parsed);
  } catch {
    return url;
  }
}

function readerUrlFor(url: string) {
  try {
    const rawUrl = new URL(rawFileUrlFor(url), window.location.origin);
    if (rawUrl.origin !== window.location.origin || !rawUrl.pathname.startsWith("/api/files/")) return url;
    const readerUrl = new URL(`/preview/${rawUrl.pathname.slice("/api/files/".length)}`, window.location.origin);
    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (returnTo.startsWith("/posts/") || returnTo.startsWith("/admin")) readerUrl.searchParams.set("from", returnTo);
    return localUrl(readerUrl);
  } catch {
    return url;
  }
}

function downloadUrlFor(url: string) {
  try {
    const parsed = new URL(url, window.location.origin);
    parsed.searchParams.set("download", "1");
    return parsed.origin === window.location.origin ? `${parsed.pathname}${parsed.search}${parsed.hash}` : parsed.toString();
  } catch {
    return url.includes("?") ? `${url}&download=1` : `${url}?download=1`;
  }
}

function directChild<T extends Element>(card: HTMLElement, selector: string) {
  return Array.from(card.querySelectorAll<T>(selector)).find((node) => node.parentElement === card) || null;
}

export function flattenAttachmentCards(container: HTMLElement | null) {
  if (!container) return;
  const lastPlaced = new Map<HTMLElement, HTMLElement>();
  let nested = container.querySelector<HTMLElement>(".attachment-card .attachment-card");
  while (nested) {
    const parentCard = nested.parentElement?.closest<HTMLElement>(".attachment-card");
    if (!parentCard) break;
    let topCard = parentCard;
    while (topCard.parentElement?.closest<HTMLElement>(".attachment-card")) {
      topCard = topCard.parentElement.closest<HTMLElement>(".attachment-card")!;
    }
    const anchor = lastPlaced.get(topCard) || topCard;
    anchor.after(nested);
    lastPlaced.set(topCard, nested);
    nested = container.querySelector<HTMLElement>(".attachment-card .attachment-card");
  }
}

export function hydrateAttachmentCards(container: HTMLElement | null) {
  if (!container) return;
  flattenAttachmentCards(container);
  container.querySelectorAll<HTMLElement>(".attachment-card").forEach((card) => {
    let icon = directChild<HTMLElement>(card, ".attachment-icon");
    if (!icon) {
      icon = document.createElement("span");
      icon.className = "attachment-icon";
      card.prepend(icon);
    }
    icon.replaceChildren(folderIcon());

    const currentActions = directChild<HTMLElement>(card, ".attachment-actions");
    const legacyLink = Array.from(card.children).find((child): child is HTMLAnchorElement => child instanceof HTMLAnchorElement) || null;
    const meta = Array.from(card.children).find((child): child is HTMLElement =>
      child instanceof HTMLElement && child.tagName === "DIV" && child !== currentActions,
    );
    meta?.classList.add("attachment-meta");

    const previewable = card.dataset.previewable === "true";
    const existingPreview = currentActions?.querySelector<HTMLAnchorElement>(".attachment-preview");
    const existingDownload = currentActions?.querySelector<HTMLAnchorElement>(".attachment-download");
    const objectUrl = rawFileUrlFor(card.dataset.fileUrl || existingPreview?.getAttribute("href") || legacyLink?.getAttribute("href") || existingDownload?.getAttribute("href") || "");
    if (!objectUrl) return;
    card.dataset.fileUrl = objectUrl;
    const downloadUrl = existingDownload?.getAttribute("href") || (previewable ? downloadUrlFor(objectUrl) : objectUrl);
    const actions = currentActions || document.createElement("div");
    actions.className = "attachment-actions";
    actions.replaceChildren();
    if (previewable) actions.append(actionLink("在线阅读", readerUrlFor(objectUrl), "preview"));
    actions.append(actionLink("下载", downloadUrl, "download"));
    if (!currentActions) card.append(actions);
    legacyLink?.remove();
  });
}

export function createAttachmentCard(data: AttachmentCardData) {
  const card = document.createElement("div");
  card.className = "attachment-card";
  card.dataset.previewable = data.previewable ? "true" : "false";
  card.dataset.fileUrl = data.url;

  const icon = document.createElement("span");
  icon.className = "attachment-icon";
  icon.append(folderIcon());

  const meta = document.createElement("div");
  meta.className = "attachment-meta";
  const title = document.createElement("strong");
  title.textContent = data.name;
  const detail = document.createElement("small");
  detail.textContent = `${data.previewable ? "可用站内阅读器打开" : "仅下载"} · ${Math.max(1, Math.ceil(data.size / 1024))} KB`;
  meta.append(title, detail);

  const actions = document.createElement("div");
  actions.className = "attachment-actions";
  if (data.previewable) actions.append(actionLink("在线阅读", readerUrlFor(data.url), "preview"));
  actions.append(actionLink("下载", data.downloadUrl, "download"));
  card.append(icon, meta, actions);
  return card;
}

const allowedTags = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "h2", "h3", "blockquote",
  "ul", "ol", "li", "a", "img", "figure", "figcaption", "div", "span",
]);

function escapeAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function safeUrl(value: string) {
  const url = value.trim();
  return /^(https?:\/\/|\/api\/files\/)/i.test(url) ? url : "";
}

export function sanitizeRichHtml(input: string) {
  const withoutDangerousBlocks = input.replace(/<(script|style|iframe|object|embed|link|meta)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|style|iframe|object|embed|link|meta)\b[^>]*\/?\s*>/gi, "");

  return withoutDangerousBlocks.replace(/<\/?([a-z0-9-]+)([^>]*)>/gi, (whole, rawTag: string, rawAttributes: string) => {
    const tag = rawTag.toLowerCase();
    if (!allowedTags.has(tag)) return "";
    if (whole.startsWith("</")) return `</${tag}>`;
    if (tag === "br") return "<br>";

    const attributes: string[] = [];
    const matcher = /([a-zA-Z0-9:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let match: RegExpExecArray | null;
    while ((match = matcher.exec(rawAttributes))) {
      const name = match[1].toLowerCase();
      const value = match[2] ?? match[3] ?? "";
      if (name === "class" && /^[a-z0-9 _-]{1,100}$/i.test(value)) attributes.push(`class="${escapeAttribute(value)}"`);
      if (name === "alt" && tag === "img") attributes.push(`alt="${escapeAttribute(value.slice(0, 180))}"`);
      if (name === "data-latex" && (tag === "span" || tag === "div")) attributes.push(`data-latex="${escapeAttribute(value.slice(0, 1500))}"`);
      if (name === "data-display" && (tag === "span" || tag === "div")) attributes.push(`data-display="${value === "block" ? "block" : "inline"}"`);
      if (name === "data-previewable" && tag === "div") attributes.push(`data-previewable="${value === "true" ? "true" : "false"}"`);
      if (name === "style") {
        const alignment = value.match(/^\s*text-align\s*:\s*(left|center|right)\s*;?\s*$/i);
        if (alignment) attributes.push(`style="text-align:${alignment[1].toLowerCase()}"`);
      }
      if ((name === "href" && tag === "a") || (name === "src" && tag === "img")) {
        const url = safeUrl(value);
        if (url) attributes.push(`${name}="${escapeAttribute(url)}"`);
      }
      if (name === "download" && tag === "a") attributes.push("download=\"\"");
      if (name === "target" && tag === "a" && value === "_blank") attributes.push("target=\"_blank\"");
      if (name === "rel" && tag === "a") attributes.push("rel=\"noopener noreferrer\"");
    }
    return `<${tag}${attributes.length ? ` ${attributes.join(" ")}` : ""}>`;
  }).trim();
}

export function richTextToPlainText(input: string) {
  return input.replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<\/p>|<\/div>|<\/li>|<\/blockquote>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

export function plainTextToRichHtml(input: string) {
  const escaped = input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped.split(/\n\s*\n/).map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`).join("");
}

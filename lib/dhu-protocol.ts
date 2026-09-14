export type DhuProtocolEvidence = {
  checkedAt: number;
  scriptSha256: string;
  scriptBytes: number;
  postCallCount: number;
  endpointCandidates: string[];
  fieldHints: string[];
  verified: false;
};

const POST_CALL = /(?:\$\s*\.\s*post\s*\(|\b(?:type|method)\s*:\s*["']POST["']|\bfetch\s*\()/gi;
const FIELD_HINTS = ["buyMaterial", "courseCode", "sectionNumber", "classCode", "scCode", "kcdm", "xkxh"];

export function findSchoolScript(html: string, baseUrl: string) {
  const source = html.match(/<script\b[^>]*\bsrc=["']([^"']*selecthome\.js[^"']*)["']/i)?.[1];
  if (!source) return null;
  const url = new URL(source.replaceAll("&amp;", "&"), baseUrl);
  if (url.origin !== "https://webproxy.dhu.edu.cn" || !/\/dhu\/jsp\/selectcourse\/studentui\/selecthome\.js$/i.test(url.pathname)) return null;
  return url.href;
}

export async function analyzeSchoolScript(source: string, checkedAt = Date.now()): Promise<DhuProtocolEvidence> {
  if (!source || source.length > 1_000_000 || /<html\b|<title>.*(?:登录|login)/i.test(source.slice(0, 2_000))) {
    throw new Error("学校返回的不是可核验的选课脚本");
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  const scriptSha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const endpointCandidates = [...new Set([...source.matchAll(/["'`]([^"'`\r\n]{1,250})["'`]/g)]
    .map((match) => match[1].trim())
    .filter((value) => /(?:^|\/)selectcourse\//i.test(value) && !/[{}<>]/.test(value))
    .map((value) => value.replace(/\?.*$/, "")))].slice(0, 30);
  return {
    checkedAt, scriptSha256, scriptBytes: new TextEncoder().encode(source).byteLength,
    postCallCount: [...source.matchAll(POST_CALL)].length,
    endpointCandidates,
    fieldHints: FIELD_HINTS.filter((name) => new RegExp(`\\b${name}\\b`, "i").test(source)),
    verified: false,
  };
}

// The downloaded asset is a static first-party script. Keep only the call site
// context needed to review the exact POST shape; never log page HTML or session data.
export function schoolSubmitSourceContext(source: string) {
  const markers = ["/selectcourse/scSubmit", "/selectcourse/scConflictCheck", "/selectcourse/accessJudge"];
  return markers.flatMap((marker) => {
    const at = source.indexOf(marker);
    if (at < 0) return [];
    return [{ marker, source: source.slice(Math.max(0, at - 3_000), Math.min(source.length, at + 3_000)) }];
  });
}

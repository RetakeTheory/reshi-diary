import { constants, publicEncrypt } from "node:crypto";

const SCHOOL_ORIGIN = "https://webproxy.dhu.edu.cn";
const MAX_REDIRECTS = 12;
// Public webproxy resource link for the undergraduate academic system. The resource id
// may rotate, so the live portal is searched first and this is only a fallback.
export const DHU_COURSE_SEED_URL = `${SCHOOL_ORIGIN}/https/446a5061214023323032323131446855152f7f4845a0b976a6a0aa1d0121c0/dhu/selectcourse/toSH`;

export type SchoolCookie = { name: string; value: string; path: string; expiresAt?: number };
export type SchoolState = {
  cookies: SchoolCookie[];
  authPrefix?: string;
  username?: string;
  mfa?: { type: number; appId: string; appUrl: string; methodAvailable?: boolean; passwordRequired?: boolean };
  mfaPageUrl?: string;
  userAgent?: string;
  stage: "passport" | "mfa" | "verified" | "ready";
  coursePageUrl?: string;
  updatedAt: number;
};

function schoolUrl(input: string, base = SCHOOL_ORIGIN): URL {
  const url = new URL(input, base);
  if (url.origin !== SCHOOL_ORIGIN || url.username || url.password) throw new Error("学校跳转地址无效");
  return url;
}

function cookiePath(url: URL) {
  const index = url.pathname.lastIndexOf("/");
  return index <= 0 ? "/" : url.pathname.slice(0, index + 1);
}

export function updateSchoolCookies(cookies: SchoolCookie[], response: Response, url: URL, now = Date.now()) {
  const next = cookies.filter((cookie) => !cookie.expiresAt || cookie.expiresAt > now);
  for (const header of response.headers.getSetCookie()) {
    const [pair, ...attributes] = header.split(";");
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    let path = cookiePath(url);
    let expiresAt: number | undefined;
    for (const attribute of attributes) {
      const [key, ...rest] = attribute.trim().split("=");
      if (key.toLowerCase() === "path") path = rest.join("=") || "/";
      if (key.toLowerCase() === "max-age") {
        const seconds = Number(rest[0]);
        if (Number.isFinite(seconds)) expiresAt = now + seconds * 1000;
      }
      if (key.toLowerCase() === "expires" && expiresAt === undefined) {
        const timestamp = Date.parse(rest.join("="));
        if (Number.isFinite(timestamp)) expiresAt = timestamp;
      }
    }
    const old = next.findIndex((cookie) => cookie.name === name && cookie.path === path);
    if (old >= 0) next.splice(old, 1);
    if (value && (!expiresAt || expiresAt > now)) next.push({ name, value, path, expiresAt });
  }
  return next;
}

export class SchoolHttp {
  public state: SchoolState;
  private readonly send: typeof fetch;

  constructor(state: SchoolState, send: typeof fetch = fetch) {
    this.state = state;
    this.send = (input, init) => send.call(globalThis, input, init);
  }

  async request(input: string, init: RequestInit = {}, follow = true): Promise<{ url: URL; response: Response }> {
    let url = schoolUrl(input);
    let method = init.method || "GET";
    let body = init.body;
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      const cookies = this.state.cookies.filter((cookie) =>
        (!cookie.expiresAt || cookie.expiresAt > Date.now()) && url.pathname.startsWith(cookie.path));
      const headers = new Headers(init.headers);
      headers.set("Accept", headers.get("Accept") || "application/json, text/html;q=0.9, */*;q=0.8");
      headers.set("User-Agent", this.state.userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36");
      if (cookies.length) headers.set("Cookie", cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "));
      const response = await this.send(url, { ...init, method, body, headers, redirect: "manual", cache: "no-store" });
      this.state.cookies = updateSchoolCookies(this.state.cookies, response, url);
      if (!follow || ![301, 302, 303, 307, 308].includes(response.status)) return { url, response };
      const location = response.headers.get("Location");
      if (!location) throw new Error("学校跳转缺少目标地址");
      url = schoolUrl(location, url.href);
      if (response.status === 303 || ((response.status === 301 || response.status === 302) && method !== "GET")) {
        method = "GET"; body = undefined;
      }
    }
    throw new Error("学校登录跳转次数过多");
  }

  async json(input: string, method = "GET", data?: unknown, referer?: string) {
    const xsrf = this.state.cookies.find((cookie) => cookie.name === "XSRF-TOKEN"
      && (!cookie.expiresAt || cookie.expiresAt > Date.now()));
    const requestUrl = schoolUrl(input);
    requestUrl.searchParams.set("_", String(Date.now()));
    const { url, response } = await this.request(requestUrl.href, {
      method,
      headers: {
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN",
        "language": "zh-CN",
        "browserid": "",
        ...(xsrf ? { "X-XSRF-TOKEN": xsrf.value } : {}),
        ...(data === undefined ? {} : {
          "Content-Type": "application/json; charset=utf-8",
          "Origin": SCHOOL_ORIGIN,
        }),
        ...(referer ? { Referer: schoolUrl(referer).href } : {}),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    const body = await response.json().catch(() => null) as { code?: string; msg?: string; data?: Record<string, unknown> } | null;
    if (!response.ok || !body || body.code !== "0") {
      const message = body?.msg || `学校接口返回 ${response.status}`;
      throw new Error(body?.code ? `${message}（学校代码 ${body.code}）` : message);
    }
    return { url, body };
  }

  async postForm(input: string, fields: Record<string, string>, referer: string): Promise<Record<string, unknown>> {
    const expected = schoolUrl(input);
    const { url, response } = await this.request(expected.href, {
      method: "POST",
      headers: {
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Origin": SCHOOL_ORIGIN,
        "Referer": schoolUrl(referer).href,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: new URLSearchParams(fields),
      signal: AbortSignal.timeout(12_000),
    });
    if (url.pathname !== expected.pathname || !response.ok) throw new Error("学校接口未返回预期结果，请检查登录状态");
    const body = await response.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("学校接口返回格式异常");
    return body as Record<string, unknown>;
  }
}

export function authPrefixFrom(url: URL) {
  const match = url.pathname.match(/^\/https\/([a-f0-9]+)\//i);
  if (!match) throw new Error("未能识别学校认证入口");
  return `/https/${match[1]}`;
}

export function encryptSchoolPassword(password: string, key: string, keyId: string) {
  if (!key || !keyId) throw new Error("学校未提供登录公钥");
  const pem = `-----BEGIN PUBLIC KEY-----\n${key.replace(/\s+/g, "").match(/.{1,64}/g)?.join("\n")}\n-----END PUBLIC KEY-----`;
  return { password: publicEncrypt({ key: pem, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(password, "utf8")).toString("base64"), publicKeyId: keyId };
}

export function schoolRedirect(data: Record<string, unknown> | undefined, authPrefix: string) {
  const candidate = data?.redirect;
  if (typeof candidate !== "string" || !candidate) return null;
  const decoded = decodeURIComponent(candidate);
  const url = new URL(decoded, SCHOOL_ORIGIN);
  if (url.hostname === "cas.dhu.edu.cn" && url.protocol === "https:") {
    return schoolUrl(`${authPrefix}${url.pathname}${url.search}${url.hash}`).href;
  }
  return schoolUrl(url.href).href;
}

export function validateCoursePageUrl(input: string) {
  const url = schoolUrl(input);
  if (!/^\/https\/[a-f0-9]+\/dhu\/selectcourse\/toSH(?:$|[/?])/i.test(url.pathname)) {
    throw new Error("请填写学校 toSH 课程列表完整地址");
  }
  return url.href;
}

export function discoverCoursePageUrls(html: string): string[] {
  const source = html.slice(0, 500_000).replace(/&amp;/gi, "&").replace(/\\\//g, "/")
    .replace(/\\u002f/gi, "/").replace(/\\u003a/gi, ":");
  const matches = source.match(/(?:https?:\/\/webproxy\.dhu\.edu\.cn(?::443)?)?\/https\/[a-f0-9]{24,128}\/dhu\/selectcourse\/toSH(?:\?[^\s"'<>]*)?/gi) || [];
  return [...new Set(matches.flatMap((match) => {
    try { return [validateCoursePageUrl(match)]; } catch { return []; }
  }))];
}

import type { SitePagesDocument } from "./site-pages";

const defaultRepository = "RetakeTheory/reshi-diary";
const contentPath = "src/content/site-pages.json";
const baseBranch = "main";

type GitHubContent = { sha: string; content: string; encoding: string };

async function settings(requireToken = false) {
  let token = process.env.GITHUB_TOKEN?.trim() || "";
  let repository = process.env.GITHUB_REPOSITORY?.trim() || defaultRepository;
  try {
    const { env } = await import("cloudflare:workers");
    token = env.GITHUB_TOKEN?.trim() || token;
    repository = env.GITHUB_REPOSITORY?.trim() || repository;
  } catch {
    // Local tests and builds use process.env.
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error("GITHUB_REPOSITORY 配置无效");
  if (requireToken && !token) throw new Error("线上页面编辑器尚未配置 GITHUB_TOKEN");
  return { token, repository };
}

function headers(token: string) {
  const result: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "reshi-diary-site-editor",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) result.Authorization = `Bearer ${token}`;
  return result;
}

async function github<T>(path: string, init: RequestInit = {}, requireToken = false): Promise<T> {
  const { token, repository } = await settings(requireToken);
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    ...init,
    headers: { ...headers(token), ...(init.headers || {}) },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as T & { message?: string } | null;
  if (!response.ok || !payload) throw new Error(payload?.message || `GitHub 请求失败（${response.status}）`);
  return payload;
}

function decodeBase64(value: string) {
  const bytes = Uint8Array.from(atob(value.replace(/\s/g, "")), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

export async function readPublishedSitePages() {
  const file = await github<GitHubContent>(`/contents/${contentPath}?ref=${baseBranch}`);
  if (file.encoding !== "base64") throw new Error("GitHub 返回了不支持的页面文件编码");
  const text = decodeBase64(file.content);
  return { document: JSON.parse(text) as SitePagesDocument, version: file.sha };
}

export async function createSitePagesPullRequest(document: SitePagesDocument, expectedVersion: string) {
  const { repository } = await settings(true);
  const published = await github<GitHubContent>(`/contents/${contentPath}?ref=${baseBranch}`, {}, true);
  if (published.sha !== expectedVersion) throw new Error("GitHub 页面配置已更新，请同步后重新发布");
  const reference = await github<{ object: { sha: string } }>(`/git/ref/heads/${baseBranch}`, {}, true);
  const suffix = `${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36).slice(0, 5)}`;
  const branch = `content/site-pages-${suffix}`;
  await github(`/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: reference.object.sha }),
  }, true);
  const text = `${JSON.stringify(document, null, 2)}\n`;
  await github(`/contents/${contentPath}`, {
    method: "PUT",
    body: JSON.stringify({
      message: "content: publish site pages",
      content: encodeBase64(text),
      sha: published.sha,
      branch,
    }),
  }, true);
  const pullRequest = await github<{ number: number; html_url: string }>(`/pulls`, {
    method: "POST",
    body: JSON.stringify({
      title: "content: publish site pages",
      head: branch,
      base: baseBranch,
      body: "由 admin.rettheory.top 整站模块编辑器创建。仅更新页面文字、链接、模块顺序、可见性及白名单布局选项；请等待 GitHub Actions 通过后合并。",
    }),
  }, true);
  return { ...pullRequest, branch, repository };
}

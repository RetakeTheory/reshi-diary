import { getD1 } from "../db/runtime";
import { hashValue } from "./admin-email-auth";
import { createSitePagesPullRequest, readPublishedSitePages } from "./site-editor-github";
import { validateSitePagesDocument, type SitePagesDocument } from "./site-pages";

type DraftRow = { document_json: string; base_version: string; draft_version: string };
type EditorPayload = { document?: unknown; version?: string; draftVersion?: string };

async function database() {
  const db = await getD1();
  await db.prepare(`CREATE TABLE IF NOT EXISTS site_editor_drafts (
    admin_email TEXT PRIMARY KEY NOT NULL,
    document_json TEXT NOT NULL,
    base_version TEXT NOT NULL,
    draft_version TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`).run();
  return db;
}

async function draftVersion(document: SitePagesDocument) {
  return hashValue(JSON.stringify(document));
}

async function readDraft(email: string, published: SitePagesDocument, version: string) {
  const db = await database();
  const row = await db.prepare("SELECT document_json, base_version, draft_version FROM site_editor_drafts WHERE admin_email = ? LIMIT 1")
    .bind(email).first<DraftRow>();
  if (!row || row.base_version !== version) return null;
  try {
    return { document: validateSitePagesDocument(JSON.parse(row.document_json), published), version: row.draft_version };
  } catch {
    await db.prepare("DELETE FROM site_editor_drafts WHERE admin_email = ?").bind(email).run();
    return null;
  }
}

async function writeDraft(email: string, document: SitePagesDocument, version: string) {
  const serialized = JSON.stringify(document);
  const nextDraftVersion = await draftVersion(document);
  const db = await database();
  await db.prepare(`INSERT INTO site_editor_drafts (admin_email, document_json, base_version, draft_version, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(admin_email) DO UPDATE SET document_json = excluded.document_json, base_version = excluded.base_version,
      draft_version = excluded.draft_version, updated_at = excluded.updated_at`)
    .bind(email, serialized, version, nextDraftVersion, Date.now()).run();
  return nextDraftVersion;
}

async function clearDraft(email: string) {
  const db = await database();
  await db.prepare("DELETE FROM site_editor_drafts WHERE admin_email = ?").bind(email).run();
}

export async function loadOnlineEditor(email: string) {
  const published = await readPublishedSitePages();
  const baseline = validateSitePagesDocument(published.document, published.document);
  const draft = await readDraft(email, baseline, published.version);
  return {
    ok: true,
    online: true,
    published: baseline,
    draft: draft?.document || baseline,
    version: published.version,
    draftVersion: draft?.version || await draftVersion(baseline),
    publishTarget: { branch: "main", currentBranch: "online", remote: "GitHub PR" },
  };
}

export async function runOnlineEditorAction(email: string, action: string, payload: EditorPayload) {
  const published = await readPublishedSitePages();
  const baseline = validateSitePagesDocument(published.document, published.document);
  if (action === "reset-draft") {
    await clearDraft(email);
    return { ok: true, document: baseline, version: published.version, draftVersion: await draftVersion(baseline), message: "线上草稿已恢复为 GitHub main 内容" };
  }
  if (action === "sync-github") {
    const draft = await readDraft(email, baseline, published.version);
    return {
      ok: true,
      online: true,
      published: baseline,
      draft: draft?.document || baseline,
      version: published.version,
      draftVersion: draft?.version || await draftVersion(baseline),
      publishTarget: { branch: "main", currentBranch: "online", remote: "GitHub PR" },
      message: "已同步 GitHub main 最新页面配置",
    };
  }
  if (payload.version !== published.version) throw new Error("GitHub 页面配置已更新，请先同步后重试");
  const currentDraft = await readDraft(email, baseline, published.version);
  if (currentDraft && payload.draftVersion !== currentDraft.version) throw new Error("线上草稿已在其他标签页改变，请刷新后重试");
  const document = validateSitePagesDocument(payload.document, baseline);
  if (action === "draft") {
    const nextDraftVersion = await writeDraft(email, document, published.version);
    return { ok: true, document, version: published.version, draftVersion: nextDraftVersion, message: "草稿已安全保存到管理端" };
  }
  if (action === "publish") {
    const pullRequest = await createSitePagesPullRequest(document, published.version);
    await clearDraft(email);
    return {
      ok: true,
      document,
      version: published.version,
      draftVersion: await draftVersion(document),
      pullRequestUrl: pullRequest.html_url,
      message: `已创建 GitHub PR #${pullRequest.number}，请等待 Actions 通过后合并`,
    };
  }
  throw new Error("不支持的编辑器操作");
}

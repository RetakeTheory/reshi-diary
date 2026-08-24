import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publishedPath = resolve(projectRoot, "src", "content", "site-pages.json");
const draftPath = resolve(projectRoot, "src", "content", "site-pages.draft.json");
const tempPublishedPath = `${publishedPath}.visual-editor.tmp`;
const tempDraftPath = `${draftPath}.visual-editor.tmp`;
const backupPath = resolve(projectRoot, "src", "content", "site-pages.publish-backup.json");
const tempBackupPath = `${backupPath}.visual-editor.tmp`;
const editorUiPath = resolve(projectRoot, "scripts", "site-visual-editor.html");
const host = "127.0.0.1";
const port = 3789;
const publishRemote = "origin";
const publishBranch = process.env.VISUAL_EDITOR_PUBLISH_BRANCH?.trim() || "main";
const publishCommitPrefix = "content: publish site pages";
const publishedRelativePath = "src/content/site-pages.json";
const maxBodyBytes = 1024 * 1024;
const maxTextLength = 5000;
const styleOptions = {
  spacing: new Set(["default", "compact", "airy"]),
  align: new Set(["inherit", "left", "center"]),
  width: new Set(["default", "narrow", "wide"]),
};

function jsonResponse(response, status, payload) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(`${JSON.stringify(payload)}\n`);
}

function htmlResponse(response, html) {
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    "Content-Type": "text/html; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(html);
}

function versionOf(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, baseline, label) {
  if (!isRecord(value)) throw new Error(`${label} 必须是对象`);
  const actual = Object.keys(value).sort();
  const expected = Object.keys(baseline).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} 的字段结构已改变，请刷新编辑器后重试`);
  }
}

function safeLink(value) {
  return value.startsWith("/") && !value.startsWith("//")
    || value.startsWith("#")
    || value.startsWith("mailto:")
    || value.startsWith("https://");
}

function validateTextFields(fields, baselineFields, label) {
  exactKeys(fields, baselineFields, label);
  const next = {};
  for (const key of Object.keys(baselineFields)) {
    const value = fields[key];
    if (typeof value !== "string") throw new Error(`${label}.${key} 必须是文字`);
    if (value.length > maxTextLength) throw new Error(`${label}.${key} 最多 ${maxTextLength} 个字符`);
    if (baselineFields[key].trim() && !value.trim()) throw new Error(`${label}.${key} 不能为空`);
    if (key.toLowerCase().includes("href") && !safeLink(value)) {
      throw new Error(`${label}.${key} 只能使用站内路径、HTTPS、邮箱或页内锚点`);
    }
    next[key] = value;
  }
  return next;
}

export function validateSiteDocument(candidate, baseline) {
  if (!isRecord(candidate) || candidate.schemaVersion !== 1) throw new Error("不支持的页面配置版本");
  if (!isRecord(baseline) || baseline.schemaVersion !== 1) throw new Error("项目页面配置版本无效");
  exactKeys(candidate.pages, baseline.pages, "页面列表");
  exactKeys(candidate.globals, baseline.globals, "全局配置");
  exactKeys(candidate.globals.navigation, baseline.globals.navigation, "全局导航");

  const next = structuredClone(baseline);
  next.globals.navigation = validateTextFields(candidate.globals.navigation, baseline.globals.navigation, "全局导航");

  for (const pageId of Object.keys(baseline.pages)) {
    const page = candidate.pages[pageId];
    const baselinePage = baseline.pages[pageId];
    if (!isRecord(page) || page.label !== baselinePage.label || page.path !== baselinePage.path || !Array.isArray(page.modules)) {
      throw new Error(`页面 ${pageId} 的固定信息已改变`);
    }
    if (page.modules.length !== baselinePage.modules.length) throw new Error(`页面 ${pageId} 的模块数量已改变`);

    const baselineById = new Map(baselinePage.modules.map((module) => [module.id, module]));
    const seen = new Set();
    const modules = page.modules.map((module, index) => {
      if (!isRecord(module) || typeof module.id !== "string" || seen.has(module.id)) {
        throw new Error(`页面 ${pageId} 含有无效或重复模块`);
      }
      seen.add(module.id);
      const original = baselineById.get(module.id);
      if (!original) throw new Error(`页面 ${pageId} 含有未知模块 ${module.id}`);
      if (module.type !== original.type || module.label !== original.label || module.canMove !== original.canMove || module.canHide !== original.canHide) {
        throw new Error(`模块 ${module.id} 的固定信息已改变`);
      }
      if (!original.canMove && baselinePage.modules[index]?.id !== module.id) {
        throw new Error(`模块 ${module.label} 已锁定，不能移动`);
      }
      if (typeof module.hidden !== "boolean" || (!original.canHide && module.hidden)) {
        throw new Error(`模块 ${module.label} 不能隐藏`);
      }
      exactKeys(module.styles, original.styles, `模块 ${module.label} 的布局`);
      const styles = {};
      for (const key of Object.keys(styleOptions)) {
        const value = module.styles[key];
        if (!styleOptions[key].has(value)) throw new Error(`模块 ${module.label} 的 ${key} 布局值无效`);
        styles[key] = value;
      }
      return {
        ...original,
        hidden: module.hidden,
        fields: validateTextFields(module.fields, original.fields, `模块 ${module.label}`),
        styles,
      };
    });
    if (seen.size !== baselineById.size) throw new Error(`页面 ${pageId} 缺少模块`);
    next.pages[pageId].modules = modules;
  }
  return next;
}

export function migrateAdditiveDraft(candidate, baseline) {
  if (!isRecord(candidate) || candidate.schemaVersion !== 1) throw new Error("不支持的草稿配置版本");
  if (!isRecord(candidate.globals?.navigation) || !isRecord(candidate.pages)) throw new Error("草稿页面配置格式无效");
  const next = structuredClone(baseline);
  for (const [key, value] of Object.entries(candidate.globals.navigation)) {
    if (!(key in baseline.globals.navigation)) throw new Error(`草稿包含已移除的全局字段 ${key}`);
    next.globals.navigation[key] = value;
  }
  for (const [pageId, draftPage] of Object.entries(candidate.pages)) {
    const baselinePage = baseline.pages[pageId];
    if (!baselinePage) throw new Error(`草稿包含已移除的页面 ${pageId}`);
    if (!isRecord(draftPage) || draftPage.label !== baselinePage.label || draftPage.path !== baselinePage.path || !Array.isArray(draftPage.modules)) throw new Error(`页面 ${pageId} 的固定信息已改变`);
    const baselineById = new Map(baselinePage.modules.map((item) => [item.id, item]));
    const draftById = new Map();
    for (const draftModule of draftPage.modules) {
      const original = isRecord(draftModule) ? baselineById.get(draftModule.id) : null;
      if (!original) throw new Error(`草稿页面 ${pageId} 包含已移除的模块`);
      if (draftById.has(draftModule.id)) throw new Error(`草稿页面 ${pageId} 含有重复模块`);
      for (const key of Object.keys(draftModule.fields || {})) if (!(key in original.fields)) throw new Error(`草稿模块 ${draftModule.id} 包含已移除的字段 ${key}`);
      draftById.set(draftModule.id, draftModule);
    }
    const mergedModules = baselinePage.modules.map((original) => {
      const draftModule = draftById.get(original.id);
      if (!draftModule) return structuredClone(original);
      return { ...structuredClone(original), hidden: draftModule.hidden, styles: { ...original.styles, ...draftModule.styles }, fields: { ...original.fields, ...draftModule.fields } };
    });
    const oldOrder = draftPage.modules.map((item) => item.id);
    next.pages[pageId].modules = [...oldOrder.map((id) => mergedModules.find((item) => item.id === id)), ...mergedModules.filter((item) => !oldOrder.includes(item.id))];
  }
  return validateSiteDocument(next, baseline);
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: projectRoot, env: process.env, shell: false, windowsHide: true });
    let output = "";
    const append = (chunk, stream) => {
      const value = chunk.toString();
      stream.write(value);
      output = `${output}${value}`.slice(-12000);
    };
    child.stdout.on("data", (chunk) => append(chunk, process.stdout));
    child.stderr.on("data", (chunk) => append(chunk, process.stderr));
    child.on("error", reject);
    child.on("exit", (code) => code === 0
      ? resolvePromise({ output: output.trimEnd() })
      : reject(new Error(`${command} 命令失败（退出码 ${code}）\n${output.trim()}`)));
  });
}

async function runBuild() {
  try {
    return await run(process.execPath, [resolve(projectRoot, "scripts", "run-vinext.mjs"), "build"]);
  } catch (error) {
    throw new Error(`网站构建失败：${error instanceof Error ? error.message : "未知错误"}`);
  }
}

export function parseGitStatusPaths(output) {
  return output.split(/\r?\n/).filter(Boolean).map((line) => {
    const path = line.slice(3).trim();
    const renameTarget = path.includes(" -> ") ? path.split(" -> ").at(-1) : path;
    return renameTarget.replaceAll("\\", "/");
  });
}

function parseAheadBehind(output) {
  const [behind, ahead] = output.trim().split(/\s+/).map(Number);
  if (!Number.isInteger(behind) || !Number.isInteger(ahead)) throw new Error("无法读取 Git 分支同步状态");
  return { ahead, behind };
}

async function currentBranch() {
  const result = await run("git", ["branch", "--show-current"]);
  if (!result.output) throw new Error("当前 Git 处于 detached HEAD，不能自动发布");
  return result.output;
}

async function assertOnlyPageContentChanged() {
  const status = await run("git", ["status", "--porcelain", "--untracked-files=normal"]);
  const paths = parseGitStatusPaths(status.output);
  const unrelated = paths.filter((path) => path !== publishedRelativePath);
  if (unrelated.length) {
    throw new Error(`项目还有其他未提交修改，已停止 GitHub 发布：${unrelated.slice(0, 5).join("、")}${unrelated.length > 5 ? " 等" : ""}`);
  }
}

async function assertPendingCommitsAreEditorPublishes() {
  const result = await run("git", ["log", `refs/remotes/${publishRemote}/${publishBranch}..HEAD`, "--format=%H%x09%s"]);
  const lines = result.output.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const [commit, ...messageParts] = line.split("\t");
    if (!commit || !messageParts.join("\t").startsWith(publishCommitPrefix)) {
      throw new Error("当前分支含有尚未推送的非编辑器提交，请先手动处理后再发布");
    }
    const files = await run("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", commit]);
    const paths = files.output.split(/\r?\n/).map((path) => path.trim().replaceAll("\\", "/")).filter(Boolean);
    if (paths.length !== 1 || paths[0] !== publishedRelativePath) {
      throw new Error("检测到尚未推送的编辑器提交包含其他文件，请手动检查");
    }
  }
}

async function prepareGitHubPublish() {
  const branch = await currentBranch();
  if (branch !== publishBranch) {
    throw new Error(`当前分支是 ${branch}。为避免误发其他开发内容，请先把编辑器合并并切换到 ${publishBranch} 分支再发布`);
  }
  await assertOnlyPageContentChanged();
  await run("git", ["fetch", "--quiet", publishRemote, publishBranch]);
  const remoteRef = `refs/remotes/${publishRemote}/${publishBranch}`;
  let sync = parseAheadBehind((await run("git", ["rev-list", "--left-right", "--count", `${remoteRef}...HEAD`])).output);
  if (sync.behind) {
    const committedDifferences = await run("git", ["diff", "--name-only", remoteRef, "HEAD"]);
    if (!committedDifferences.output) {
      await run("git", ["reset", "--soft", remoteRef]);
      sync = { ahead: 0, behind: 0 };
    }
  }
  if (sync.behind) throw new Error(`本地 ${publishBranch} 落后 GitHub ${sync.behind} 个提交，请先拉取更新`);
  if (sync.ahead) {
    await assertPendingCommitsAreEditorPublishes();
    await run("git", ["push", publishRemote, `HEAD:${publishBranch}`]);
  }
  return { branch };
}

async function pushPublishedContent() {
  await assertOnlyPageContentChanged();
  const changed = (await run("git", ["status", "--porcelain", "--", publishedRelativePath])).output;
  if (!changed) return { commit: null, pushed: false };
  await run("git", ["add", "--", publishedRelativePath]);
  await run("git", ["commit", "-m", publishCommitPrefix, "--", publishedRelativePath]);
  const commit = (await run("git", ["rev-parse", "HEAD"])).output;
  await run("git", ["push", publishRemote, `HEAD:${publishBranch}`]);
  return { commit, pushed: true };
}

async function readPublished() {
  const text = await readFile(publishedPath, "utf8");
  return { document: JSON.parse(text), text, version: versionOf(text) };
}

async function readDraftOrPublished(published) {
  try {
    const text = await readFile(draftPath, "utf8");
    const candidate = JSON.parse(text);
    try {
      return { document: validateSiteDocument(candidate, published.document), text, version: versionOf(text) };
    } catch (validationError) {
      return { document: migrateAdditiveDraft(candidate, published.document), text, version: versionOf(text), migrated: true, migrationReason: validationError instanceof Error ? validationError.message : "页面结构已更新" };
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return { document: structuredClone(published.document), text: published.text, version: published.version };
    }
    throw new Error(`本机草稿无法读取：${error instanceof Error ? error.message : "格式无效"}`);
  }
}

async function atomicWriteText(path, tempPath, text) {
  await writeFile(tempPath, text, "utf8");
  await rename(tempPath, path);
}

async function atomicWrite(path, tempPath, document) {
  await atomicWriteText(path, tempPath, `${JSON.stringify(document, null, 2)}\n`);
}

async function recoverInterruptedPublish() {
  try {
    const backup = await readFile(backupPath, "utf8");
    await atomicWriteText(publishedPath, tempPublishedPath, backup);
    await unlink(backupPath);
    console.warn("检测到上次发布意外中断，已自动恢复原页面配置；草稿仍保留。");
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
  }
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) throw new Error("请求体过大");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("请求体不是有效 JSON");
  }
}

function assertSameOrigin(request) {
  const origin = request.headers.origin;
  if (origin && origin !== `http://${host}:${port}` && origin !== `http://localhost:${port}`) {
    throw new Error("拒绝来自其他网站的修改请求");
  }
}

async function saveDraft(payload) {
  const published = await readPublished();
  if (payload.version !== published.version) throw new Error("页面配置已在其他地方改变，请刷新后重试");
  const currentDraft = await readDraftOrPublished(published);
  if (payload.draftVersion !== currentDraft.version) throw new Error("草稿已在另一个标签页改变，请刷新后再保存");
  const document = validateSiteDocument(payload.document, published.document);
  await atomicWrite(draftPath, tempDraftPath, document);
  const text = await readFile(draftPath, "utf8");
  return { document, version: published.version, draftVersion: versionOf(text), message: "草稿已保存在本机" };
}

async function publish(payload) {
  const published = await readPublished();
  if (payload.version !== published.version) throw new Error("页面配置已在其他地方改变，请刷新后重试");
  const currentDraft = await readDraftOrPublished(published);
  if (payload.draftVersion !== currentDraft.version) throw new Error("草稿已在另一个标签页改变，请刷新后再发布");
  const document = validateSiteDocument(payload.document, published.document);
  const git = await prepareGitHubPublish();
  await atomicWrite(draftPath, tempDraftPath, document);
  await atomicWriteText(backupPath, tempBackupPath, published.text);
  let replaced = false;
  try {
    await atomicWrite(publishedPath, tempPublishedPath, document);
    replaced = true;
    await runBuild();
  } catch (error) {
    if (replaced) await atomicWriteText(publishedPath, tempPublishedPath, published.text);
    await unlink(backupPath).catch(() => {});
    throw error;
  } finally {
    await unlink(tempPublishedPath).catch(() => {});
  }
  const text = await readFile(publishedPath, "utf8");
  const draftText = await readFile(draftPath, "utf8");
  await unlink(backupPath);
  const github = await pushPublishedContent();
  return {
    document,
    version: versionOf(text),
    draftVersion: versionOf(draftText),
    github: { ...github, branch: git.branch, remote: publishRemote },
    message: github.pushed
      ? `已通过构建、推送到 GitHub ${git.branch}，网站部署已由 Actions 启动`
      : `内容没有变化；GitHub ${git.branch} 已是最新版本`,
  };
}

async function resetDraft() {
  const published = await readPublished();
  await atomicWrite(draftPath, tempDraftPath, published.document);
  const text = await readFile(draftPath, "utf8");
  return { document: published.document, version: published.version, draftVersion: versionOf(text), message: "草稿已恢复为当前已发布内容" };
}

export function createEditorServer() {
  return createServer(async (request, response) => {
    const pathname = new URL(request.url || "/", `http://${host}:${port}`).pathname;
    try {
      if (request.method === "GET" && pathname === "/") {
        return htmlResponse(response, await readFile(editorUiPath, "utf8"));
      }
      if (request.method === "GET" && pathname === "/api/site-pages") {
        const published = await readPublished();
        const draft = await readDraftOrPublished(published);
        const branch = await currentBranch();
        return jsonResponse(response, 200, {
          ok: true,
          published: published.document,
          draft: draft.document,
          version: published.version,
          draftVersion: draft.version,
          draftMigrated: Boolean(draft.migrated),
          publishTarget: { branch: publishBranch, currentBranch: branch, remote: publishRemote },
        });
      }
      if (request.method === "POST" && pathname === "/api/site-pages/draft") {
        assertSameOrigin(request);
        return jsonResponse(response, 200, { ok: true, ...(await saveDraft(await readBody(request))) });
      }
      if (request.method === "POST" && pathname === "/api/site-pages/publish") {
        assertSameOrigin(request);
        return jsonResponse(response, 200, { ok: true, ...(await publish(await readBody(request))) });
      }
      if (request.method === "POST" && pathname === "/api/site-pages/reset-draft") {
        assertSameOrigin(request);
        return jsonResponse(response, 200, { ok: true, ...(await resetDraft()) });
      }
      if (pathname === "/figma/sync-text" || pathname === "/api/home-text") {
        return jsonResponse(response, 410, { ok: false, error: "旧版首页/Figma 接口已停用，请使用整站浏览器编辑器" });
      }
      return jsonResponse(response, 404, { ok: false, error: "Not found" });
    } catch (error) {
      await unlink(tempDraftPath).catch(() => {});
      const message = error instanceof Error ? error.message : "未知错误";
      console.error(message);
      return jsonResponse(response, message.includes("构建失败") ? 500 : 400, { ok: false, error: message });
    }
  });
}

async function check() {
  const published = await readPublished();
  validateSiteDocument(published.document, published.document);
  console.log(`整站页面配置有效：${Object.keys(published.document.pages).length} 个页面`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await recoverInterruptedPublish();
  if (process.argv.includes("--check")) {
    await check();
  } else {
    createEditorServer().listen(port, host, () => {
      console.log(`整站模块编辑器已启动：http://localhost:${port}/`);
      console.log(`先保存草稿；发布会构建、提交并推送到 ${publishRemote}/${publishBranch}，随后触发 GitHub Actions 部署。`);
    });
  }
}

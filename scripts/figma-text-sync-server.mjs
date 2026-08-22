import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mapPath = resolve(projectRoot, "figma-text-map.json");
const contentPath = resolve(projectRoot, "src", "content", "home.json");
const tempContentPath = `${contentPath}.figma-sync.tmp`;
const endpoint = "/figma/sync-text";
const host = "127.0.0.1";
const port = 3789;
const maxBodyBytes = 32 * 1024;
const maxTextLength = 5000;
const commitMessage = "content: sync Figma text";

function jsonResponse(response, status, payload) {
  response.writeHead(status, {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(`${JSON.stringify(payload)}\n`);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export function createWhitelist(textMap) {
  if (!textMap || Array.isArray(textMap) || typeof textMap !== "object") {
    throw new Error("figma-text-map.json 必须是对象");
  }

  const whitelist = new Map();
  for (const [layerName, jsonPath] of Object.entries(textMap)) {
    if (!layerName.startsWith("EDIT/home.") || typeof jsonPath !== "string") {
      throw new Error(`无效映射：${layerName}`);
    }
    if (!/^hero\.(title|subtitle|cta)$/.test(jsonPath)) {
      throw new Error(`映射超出允许范围：${jsonPath}`);
    }

    const requestField = `home.${jsonPath}`;
    if (whitelist.has(requestField)) {
      throw new Error(`重复映射：${requestField}`);
    }
    whitelist.set(requestField, jsonPath);
  }

  if (whitelist.size !== 3) {
    throw new Error("文字映射必须且只能包含 title、subtitle、cta 三项");
  }
  return whitelist;
}

export function validateSyncPayload(payload, whitelist) {
  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    throw new Error("请求体必须是 JSON 对象");
  }
  if (!payload.fields || Array.isArray(payload.fields) || typeof payload.fields !== "object") {
    throw new Error("fields 必须是对象");
  }

  const entries = Object.entries(payload.fields);
  if (entries.length === 0) {
    throw new Error("没有可同步文字");
  }

  for (const [field, value] of entries) {
    if (!whitelist.has(field)) {
      throw new Error(`字段不在白名单：${field}`);
    }
    if (typeof value !== "string") {
      throw new Error(`字段必须是文字：${field}`);
    }
    if (value.length > maxTextLength) {
      throw new Error(`字段过长：${field}`);
    }
  }
  return entries;
}

function readPath(target, jsonPath) {
  return jsonPath.split(".").reduce((value, key) => value?.[key], target);
}

function writePath(target, jsonPath, value) {
  const parts = jsonPath.split(".");
  const leaf = parts.pop();
  const parent = parts.reduce((current, key) => current[key], target);
  parent[leaf] = value;
}

export function applyMappedFields(content, entries, whitelist) {
  const nextContent = structuredClone(content);
  const changedFields = [];

  for (const [requestField, value] of entries) {
    const jsonPath = whitelist.get(requestField);
    if (typeof readPath(nextContent, jsonPath) !== "string") {
      throw new Error(`目标内容字段不存在或不是文字：${jsonPath}`);
    }
    if (readPath(nextContent, jsonPath) !== value) {
      writePath(nextContent, jsonPath, value);
      changedFields.push(requestField);
    }
  }

  return { changedFields, nextContent };
}

function run(command, args, { allowFailure = false } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: process.env,
      shell: false,
      windowsHide: true,
    });
    let output = "";
    const append = (chunk, stream) => {
      const text = chunk.toString();
      stream.write(text);
      output = `${output}${text}`.slice(-12000);
    };
    child.stdout.on("data", (chunk) => append(chunk, process.stdout));
    child.stderr.on("data", (chunk) => append(chunk, process.stderr));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0 || allowFailure) {
        resolvePromise({ code: code ?? 1, output: output.trim() });
      } else {
        reject(new Error(`${command} ${args.join(" ")} 失败（退出码 ${code}）\n${output.trim()}`));
      }
    });
  });
}

function runNpmBuild() {
  if (process.env.npm_execpath) {
    return run(process.execPath, [process.env.npm_execpath, "run", "build"]);
  }
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  return run(npmCommand, ["run", "build"]);
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) {
      throw new Error("请求体过大");
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("请求体不是有效 JSON");
  }
}

async function assertContentFileClean() {
  const result = await run("git", ["status", "--porcelain", "--", "src/content/home.json"]);
  if (result.output) {
    throw new Error("src/content/home.json 存在未提交修改，请先处理后再同步");
  }
}

async function currentBranch() {
  const result = await run("git", ["branch", "--show-current"]);
  if (!result.output || result.output === "HEAD") {
    throw new Error("当前 Git 处于 detached HEAD，无法自动推送");
  }
  return result.output;
}

async function syncText(payload, whitelist) {
  const entries = validateSyncPayload(payload, whitelist);
  await assertContentFileClean();

  const originalText = await readFile(contentPath, "utf8");
  const content = JSON.parse(originalText);
  const { changedFields, nextContent } = applyMappedFields(content, entries, whitelist);
  if (changedFields.length === 0) {
    return { changedFields, message: "文字没有变化，无需提交", pushed: false };
  }

  const branch = await currentBranch();
  let buildSucceeded = false;
  try {
    await writeFile(tempContentPath, `${JSON.stringify(nextContent, null, 2)}\n`, "utf8");
    await rename(tempContentPath, contentPath);
    await runNpmBuild();
    buildSucceeded = true;
  } finally {
    await unlink(tempContentPath).catch(() => {});
    if (!buildSucceeded) {
      await writeFile(contentPath, originalText, "utf8");
    }
  }

  await run("git", ["add", "--", "src/content/home.json"]);
  await run("git", ["commit", "-m", commitMessage, "--", "src/content/home.json"]);
  await run("git", ["push", "--set-upstream", "origin", branch]);

  return {
    branch,
    changedFields,
    message: `已同步 ${changedFields.length} 项文字并推送到 ${branch}`,
    pushed: true,
  };
}

export async function checkConfiguration() {
  const textMap = await readJson(mapPath);
  const whitelist = createWhitelist(textMap);
  const content = await readJson(contentPath);
  for (const jsonPath of whitelist.values()) {
    if (typeof readPath(content, jsonPath) !== "string") {
      throw new Error(`src/content/home.json 缺少文字字段：${jsonPath}`);
    }
  }
  return whitelist;
}

async function startServer() {
  const whitelist = await checkConfiguration();
  let syncing = false;

  const server = createServer(async (request, response) => {
    if (request.method === "OPTIONS" && request.url === endpoint) {
      jsonResponse(response, 204, {});
      return;
    }
    if (request.method !== "POST" || request.url !== endpoint) {
      jsonResponse(response, 404, { ok: false, error: "Not found" });
      return;
    }
    if (syncing) {
      jsonResponse(response, 409, { ok: false, error: "已有同步任务正在执行" });
      return;
    }

    syncing = true;
    try {
      const payload = await readBody(request);
      const result = await syncText(payload, whitelist);
      jsonResponse(response, 200, { ok: true, ...result });
    } catch (error) {
      console.error(error);
      jsonResponse(response, 400, { ok: false, error: error instanceof Error ? error.message : "同步失败" });
    } finally {
      syncing = false;
    }
  });

  server.listen(port, host, () => {
    console.log(`Figma 文字同步服务：http://localhost:${port}${endpoint}`);
    console.log("仅允许 figma-text-map.json 中的 TEXT 字段；按 Ctrl+C 停止。\n");
  });
}

const isMainModule = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMainModule) {
  if (process.argv.includes("--check")) {
    await checkConfiguration();
    console.log("Figma 文字映射和首页内容校验通过");
  } else {
    await startServer();
  }
}

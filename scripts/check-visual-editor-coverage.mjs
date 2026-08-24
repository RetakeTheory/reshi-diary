import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const document = JSON.parse(await readFile(resolve(root, "src/content/site-pages.json"), "utf8"));

async function walk(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(path));
    else if (entry.name === "page.tsx") output.push(path);
  }
  return output;
}

const references = new Map();
for (const path of await walk(resolve(root, "app"))) {
  const source = await readFile(path, "utf8");
  for (const match of source.matchAll(/pageDocument\(["']([^"']+)["']\)/g)) references.set(match[1], path.slice(root.length + 1).replaceAll("\\", "/"));
}
const missing = [...references].filter(([id]) => !document.pages[id]);
if (missing.length) throw new Error(`整站编辑器缺少页面：${missing.map(([id, path]) => `${id}（${path}）`).join("、")}`);
const paths = new Set();
for (const [id, page] of Object.entries(document.pages)) {
  if (!page || typeof page !== "object" || typeof page.path !== "string" || !Array.isArray(page.modules) || !page.modules.length) throw new Error(`整站编辑器页面 ${id} 配置无效`);
  if (paths.has(page.path)) throw new Error(`整站编辑器存在重复网址：${page.path}`);
  paths.add(page.path);
}
console.log(`整站编辑器同步有效：${Object.keys(document.pages).length} 个页面，${references.size} 个代码引用。`);

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { migrateAdditiveDraft, parseGitStatusPaths, validateSiteDocument } from "../scripts/visual-editor-server.mjs";

const baseline = JSON.parse(await readFile(new URL("../src/content/site-pages.json", import.meta.url), "utf8"));
const copy = () => structuredClone(baseline);

test("all known page modules accept safe content, visibility, layout, and ordering edits", () => {
  const candidate = copy();
  const modules = candidate.pages.home.modules;
  modules[0].fields.title = "新的首页标题\n也可以换行";
  modules[1].hidden = true;
  modules[2].styles.spacing = "airy";
  modules.push(modules.splice(0, 1)[0]);

  const validated = validateSiteDocument(candidate, baseline);
  assert.equal(validated.pages.home.modules.at(-1).fields.title, "新的首页标题\n也可以换行");
  assert.equal(validated.pages.home.modules[0].hidden, true);
  assert.equal(validated.pages.home.modules[1].styles.spacing, "airy");
});

test("unknown fields and module identity changes are rejected", () => {
  const extraField = copy();
  extraField.pages.home.modules[0].fields.injected = "no";
  assert.throws(() => validateSiteDocument(extraField, baseline), /字段结构已改变/);

  const changedType = copy();
  changedType.pages.home.modules[0].type = "script";
  assert.throws(() => validateSiteDocument(changedType, baseline), /固定信息已改变/);
});

test("unsafe links, invalid style values, and hidden core modules are rejected", () => {
  const unsafeLink = copy();
  unsafeLink.pages.home.modules[0].fields.ctaHref = "javascript:alert(1)";
  assert.throws(() => validateSiteDocument(unsafeLink, baseline), /只能使用/);

  const invalidStyle = copy();
  invalidStyle.pages.home.modules[0].styles.width = "200vw";
  assert.throws(() => validateSiteDocument(invalidStyle, baseline), /布局值无效/);

  const hiddenCore = copy();
  hiddenCore.pages.article.modules.find((module) => module.id === "article-body").hidden = true;
  assert.throws(() => validateSiteDocument(hiddenCore, baseline), /不能隐藏/);
});

test("locked functional modules cannot be reordered", () => {
  const candidate = copy();
  candidate.pages.preview.modules.reverse();
  assert.throws(() => validateSiteDocument(candidate, baseline), /已锁定，不能移动/);
});

test("navigation fields remain editable while their schema stays fixed", () => {
  const candidate = copy();
  candidate.globals.navigation.home = "回首页";
  assert.equal(validateSiteDocument(candidate, baseline).globals.navigation.home, "回首页");

  delete candidate.globals.navigation.posts;
  assert.throws(() => validateSiteDocument(candidate, baseline), /字段结构已改变/);
});

test("older drafts gain newly published pages, modules, and fields without losing edits", () => {
  const older = structuredClone(baseline);
  older.globals.navigation.home = "回首页";
  delete older.pages.externalLink;
  delete older.pages.surveyResults;
  delete older.pages.surveyQuery;
  delete older.pages.campusMap.modules[0].fields.hotspotHint;
  const migrated = migrateAdditiveDraft(older, baseline);
  assert.equal(migrated.globals.navigation.home, "回首页");
  assert.equal(migrated.pages.externalLink.path, "/out");
  assert.equal(migrated.pages.surveyResults.path, "/admin/surveys/[id]/results");
  assert.equal(migrated.pages.surveyQuery.path, "/surveys/[slug]/query");
  assert.equal(migrated.pages.campusMap.modules[0].fields.hotspotHint, "点击地图光点切换位置");
});

test("Git publish status parsing keeps the exact changed file scope", () => {
  assert.deepEqual(parseGitStatusPaths(" M src/content/site-pages.json\n?? notes.txt\n"), [
    "src/content/site-pages.json",
    "notes.txt",
  ]);
  assert.deepEqual(parseGitStatusPaths("R  old.json -> src/content/site-pages.json\n"), [
    "src/content/site-pages.json",
  ]);
});

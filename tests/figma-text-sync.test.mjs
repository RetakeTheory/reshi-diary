import assert from "node:assert/strict";
import test from "node:test";

import {
  applyMappedFields,
  createWhitelist,
  validateSyncPayload,
} from "../scripts/figma-text-sync-server.mjs";

const textMap = {
  "EDIT/home.hero.title": "hero.title",
  "EDIT/home.hero.subtitle": "hero.subtitle",
  "EDIT/home.hero.cta": "hero.cta",
};

test("only mapped home text fields are accepted", () => {
  const whitelist = createWhitelist(textMap);
  assert.deepEqual(
    validateSyncPayload({ fields: { "home.hero.title": "新标题" } }, whitelist),
    [["home.hero.title", "新标题"]],
  );
  assert.throws(
    () => validateSyncPayload({ fields: { "home.hero.color": "red" } }, whitelist),
    /字段不在白名单/,
  );
  assert.throws(
    () => validateSyncPayload({ fields: { "home.hero.title": { x: 10 } } }, whitelist),
    /字段必须是文字/,
  );
});

test("mapped fields update text without changing surrounding structure", () => {
  const whitelist = createWhitelist(textMap);
  const source = {
    hero: { title: "旧标题", subtitle: "旧副标题", cta: "旧按钮" },
    untouched: { layout: "same" },
  };
  const entries = validateSyncPayload(
    { fields: { "home.hero.subtitle": "新副标题" } },
    whitelist,
  );
  const result = applyMappedFields(source, entries, whitelist);

  assert.deepEqual(result.changedFields, ["home.hero.subtitle"]);
  assert.equal(result.nextContent.hero.subtitle, "新副标题");
  assert.deepEqual(result.nextContent.untouched, source.untouched);
  assert.equal(source.hero.subtitle, "旧副标题");
});

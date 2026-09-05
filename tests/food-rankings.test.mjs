import test from "node:test";
import assert from "node:assert/strict";
import { normalizeFoodRankingInput, normalizeFoodRating, foodRankingFromRow } from "../lib/food-rankings.ts";

test("food ranking entries keep a bounded admin-controlled module shape", () => {
  assert.deepEqual(normalizeFoodRankingInput({ adminRating: 4, restaurant: " 测试餐厅 ", summary: " 等待较久 ", tags: ["夜宵", "夜宵", "排队"] }), {
    adminRating: 4, restaurant: "测试餐厅", location: "", category: "", summary: "等待较久", details: "", tags: ["夜宵", "排队"], imageUrl: "", latitude: null, longitude: null,
  });
  assert.throws(() => normalizeFoodRankingInput({ adminRating: 3, restaurant: "", summary: "推荐" }), /餐厅名称/);
  assert.equal(normalizeFoodRankingInput({ restaurant: "一食堂", summary: "推荐", imageUrl: "/api/files/uploads/meal-01.webp" }).imageUrl, "/api/files/uploads/meal-01.webp");
  const located = normalizeFoodRankingInput({ restaurant: "二食堂", summary: "推荐", latitude: "31.050001", longitude: 121.220002 });
  assert.equal(located.latitude, 31.050001);
  assert.equal(located.longitude, 121.220002);
  assert.throws(() => normalizeFoodRankingInput({ restaurant: "一食堂", summary: "推荐", imageUrl: "https://example.com/tracker.png" }), /照片地址无效/);
  assert.throws(() => normalizeFoodRankingInput({ restaurant: "一食堂", summary: "推荐", latitude: 31 }), /纬度和经度/);
});


import { readFile } from "node:fs/promises";
import { saveFoodRating } from "../lib/food-ratings-store.ts";
import { sqliteD1 } from "./sqlite-d1.mjs";

test("ratings accept only integer scores from 1 to 5 or explicit withdrawal", () => {
  for (const score of [1, 2, 3, 4, 5, null]) assert.equal(normalizeFoodRating(score), score);
  for (const score of [0, 6, -1, 2.5, "5", NaN, true, undefined]) assert.throws(() => normalizeFoodRating(score), /评分/);
  assert.throws(() => normalizeFoodRankingInput({ restaurant: "餐厅", summary: "简介", adminRating: 6 }), /评分/);
  const legacy = foodRankingFromRow({ id: "old", listType: "red", restaurant: "老餐厅", summary: "简介" });
  assert.equal(legacy.adminRating, null); assert.equal(legacy.averageRating, null); assert.equal(legacy.ratingCount, 0); assert.ok(!("listType" in legacy));
});

test("user averages, edits and withdrawals leave the independent administrator rating unchanged", async () => {
  const db = sqliteD1();
  try {
    db.sqlite.exec("CREATE TABLE users (id TEXT PRIMARY KEY); INSERT INTO users VALUES ('a'), ('b'); CREATE TABLE food_rankings (id TEXT PRIMARY KEY, admin_rating INTEGER); INSERT INTO food_rankings VALUES ('meal', 3);");
    const runtime = await readFile(new URL("../db/runtime.ts", import.meta.url), "utf8");
    const schema = runtime.match(/CREATE TABLE IF NOT EXISTS food_ratings \([\s\S]*?\n    \)/)[0];
    db.sqlite.exec(schema);
    assert.deepEqual(await saveFoodRating(db, "meal", "a", 5), { averageRating: 5, ratingCount: 1, myRating: 5 });
    assert.deepEqual(await saveFoodRating(db, "meal", "b", 2), { averageRating: 3.5, ratingCount: 2, myRating: 2 });
    assert.deepEqual(await saveFoodRating(db, "meal", "a", 4), { averageRating: 3, ratingCount: 2, myRating: 4 });
    assert.deepEqual(await saveFoodRating(db, "meal", "a", 4), { averageRating: 3, ratingCount: 2, myRating: 4 });
    assert.deepEqual(await saveFoodRating(db, "meal", "b", null), { averageRating: 4, ratingCount: 1, myRating: null });
    assert.deepEqual(await saveFoodRating(db, "meal", "a", null), { averageRating: null, ratingCount: 0, myRating: null });
    assert.equal(db.sqlite.prepare("SELECT admin_rating FROM food_rankings WHERE id = 'meal'").get().admin_rating, 3);
    await assert.rejects(saveFoodRating(db, "meal", "a", 6));
    await assert.rejects(saveFoodRating(db, "missing", "a", 3));
    assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS total FROM food_ratings").get().total, 0);
  } finally { db.sqlite.close(); }
});

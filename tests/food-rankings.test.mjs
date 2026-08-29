import test from "node:test";
import assert from "node:assert/strict";
import { normalizeFoodRankingInput } from "../lib/food-rankings.ts";

test("food ranking entries keep a bounded admin-controlled module shape", () => {
  assert.deepEqual(normalizeFoodRankingInput({ listType: "black", restaurant: " 测试餐厅 ", summary: " 等待较久 ", tags: ["夜宵", "夜宵", "排队"] }), {
    listType: "black", restaurant: "测试餐厅", location: "", category: "", summary: "等待较久", details: "", tags: ["夜宵", "排队"], imageUrl: "", latitude: null, longitude: null,
  });
  assert.throws(() => normalizeFoodRankingInput({ listType: "red", restaurant: "", summary: "推荐" }), /餐厅名称/);
  assert.equal(normalizeFoodRankingInput({ restaurant: "一食堂", summary: "推荐", imageUrl: "/api/files/uploads/meal-01.webp" }).imageUrl, "/api/files/uploads/meal-01.webp");
  const located = normalizeFoodRankingInput({ restaurant: "二食堂", summary: "推荐", latitude: "31.050001", longitude: 121.220002 });
  assert.equal(located.latitude, 31.050001);
  assert.equal(located.longitude, 121.220002);
  assert.throws(() => normalizeFoodRankingInput({ restaurant: "一食堂", summary: "推荐", imageUrl: "https://example.com/tracker.png" }), /照片地址无效/);
  assert.throws(() => normalizeFoodRankingInput({ restaurant: "一食堂", summary: "推荐", latitude: 31 }), /纬度和经度/);
});


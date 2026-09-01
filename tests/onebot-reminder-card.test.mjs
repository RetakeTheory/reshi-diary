import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { renderOneBotReminderCard, wrapOneBotReminderText } from "../lib/onebot-reminder-card.ts";

function arrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

test("renders a group reminder as a PNG with the bundled Chinese and Latin fonts", async () => {
  const [rounded, noto] = await Promise.all([
    readFile(new URL("../public/fonts/resource-han-rounded-sc-bold.woff", import.meta.url)),
    readFile(new URL("../public/fonts/noto-sans-sc-bold-latin.woff", import.meta.url)),
  ]);
  const png = new Uint8Array(await renderOneBotReminderCard({
    text: "带好材料，在 A2 教室集合 Test 123",
    dueAt: Date.UTC(2026, 8, 4, 4),
    generatedAt: Date.UTC(2026, 8, 1, 8, 38, 39),
    fonts: { rounded: arrayBuffer(rounded), noto: arrayBuffer(noto) },
  }));
  assert.deepEqual([...png.slice(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  assert.ok(png.byteLength > 2000);
});

test("wraps and truncates oversized reminder text for the card", () => {
  const lines = wrapOneBotReminderText("提醒内容".repeat(100), 10, 3);
  assert.equal(lines.length, 3);
  assert.match(lines.at(-1), /…$/);
});

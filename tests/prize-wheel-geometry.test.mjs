import assert from "node:assert/strict";
import test from "node:test";

import {
  createWheelGradient,
  labelPositionForSegment,
  landingAngleForSegment,
} from "../lib/prize-wheel-geometry.mjs";

test("keeps weighted color regions aligned with the top wheel pointer", () => {
  const gradient = createWheelGradient([
    { color: "#7657f6", start: 0, end: 300 },
    { color: "#f06f9d", start: 300, end: 360 },
  ]);

  assert.equal(gradient, "conic-gradient(#7657f6 0deg 300deg, #f06f9d 300deg 360deg)");
  assert.doesNotMatch(gradient, /from -90deg/);
});

test("uses the same clockwise coordinate system for labels and landing angles", () => {
  const position = labelPositionForSegment(150);

  assert.ok(position.left > 50);
  assert.ok(position.top > 50);
  assert.equal(landingAngleForSegment(150), 210);
  assert.equal((150 + landingAngleForSegment(150)) % 360, 0);
});

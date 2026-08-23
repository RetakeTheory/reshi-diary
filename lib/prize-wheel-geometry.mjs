/**
 * @typedef {{ color: string, start: number, end: number }} WheelGradientSegment
 */

/**
 * CSS conic gradients use the top of the circle as 0deg by default, matching
 * the wheel pointer and the segment angles used by the prize selection logic.
 *
 * @param {WheelGradientSegment[]} segments
 */
export function createWheelGradient(segments) {
  return `conic-gradient(${segments.map((segment) => `${segment.color} ${segment.start}deg ${segment.end}deg`).join(", ")})`;
}

/** @param {number} center */
export function landingAngleForSegment(center) {
  return ((360 - center) % 360 + 360) % 360;
}

/** @param {number} center @param {number} [radius] */
export function labelPositionForSegment(center, radius = 34) {
  const angle = (center - 90) * Math.PI / 180;
  return {
    left: 50 + Math.cos(angle) * radius,
    top: 50 + Math.sin(angle) * radius,
  };
}

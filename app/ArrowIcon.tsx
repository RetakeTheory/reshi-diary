type ArrowDirection = "right" | "left" | "up" | "down" | "up-right";

export default function ArrowIcon({ direction = "right" }: { direction?: ArrowDirection }) {
  const glyph: Record<ArrowDirection, string> = {
    right: "→",
    left: "←",
    up: "↑",
    down: "↓",
    "up-right": "↗",
  };

  return <span className={`button-arrow button-arrow--${direction}`} aria-hidden="true">{glyph[direction]}</span>;
}

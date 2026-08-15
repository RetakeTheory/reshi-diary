type ArrowDirection = "right" | "left" | "up" | "down" | "up-right";

export default function ArrowIcon({ direction = "right" }: { direction?: ArrowDirection }) {
  return (
    <span className={`button-arrow button-arrow--${direction}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </span>
  );
}

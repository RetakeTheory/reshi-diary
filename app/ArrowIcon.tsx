type ArrowDirection = "right" | "left" | "up" | "down" | "up-right";

export default function ArrowIcon({ direction = "right" }: { direction?: ArrowDirection }) {
  return (
    <span className={`button-arrow button-arrow--${direction}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M3.5 12h16.25M13.5 5.75 19.75 12l-6.25 6.25" />
      </svg>
    </span>
  );
}

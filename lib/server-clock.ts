export type ServerClockAnchor = {
  serverNow: number;
  monotonicNow: number;
};

/**
 * Read a server-synchronised clock without consulting the mutable system clock
 * after the initial server response. `monotonicNow` should come from
 * performance.now() in the browser.
 */
export function serverClockNow(
  anchor: ServerClockAnchor | null,
  monotonicNow: number,
  fallbackNow?: number,
) {
  if (!anchor) return fallbackNow ?? Date.now();
  return Math.round(anchor.serverNow + monotonicNow - anchor.monotonicNow);
}

/** Keep animated edge markers inside the connector corridor, away from node borders. */
export function pulseTravelWindow(length: number) {
  if (!Number.isFinite(length) || length <= 0) return { start: 0, end: 1, inset: 0 };
  // Leave room for the marker radius and its glow. A small connector still
  // gets a usable travel corridor, while long routed edges keep a generous
  // visual gap from both endpoint boxes.
  const inset = Math.min(length * 0.4, Math.max(24, Math.min(32, length * 0.12)));
  return { start: inset / length, end: 1 - inset / length, inset };
}

/** Convert animation progress into a path distance using the safe travel window. */
export function pulseTravelDistance(length: number, progress: number): number {
  const window = pulseTravelWindow(length);
  const boundedProgress = Math.min(1, Math.max(0, progress));
  return length * (window.start + (window.end - window.start) * boundedProgress);
}

/** Keep animated edge markers inside the connector corridor, away from node borders. */
export function pulseTravelWindow(length: number) {
  if (!Number.isFinite(length) || length <= 0) return { start: 0, end: 1, inset: 0 };
  const inset = Math.min(length * 0.25, Math.max(3, Math.min(24, length * 0.08)));
  return { start: inset / length, end: 1 - inset / length, inset };
}

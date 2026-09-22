/** Keep animated edge markers inside the connector corridor, away from node borders. */
export function pulseTravelWindow(length: number) {
  if (!Number.isFinite(length) || length <= 0) return { start: 0, end: 1, inset: 0 };
  // Leave room for the marker radius and its glow at the source. A small
  // connector still gets a usable travel corridor.
  const inset = Math.min(length * 0.4, Math.max(24, Math.min(32, length * 0.12)));
  // Finish at the arrow entry, one marker radius outside the box. Stopping
  // 24–32 units away makes an arrival-triggered glow look premature.
  const arrivalInset = Math.min(8, length * 0.4);
  return { start: inset / length, end: 1 - arrivalInset / length, inset };
}

/** Shared marker speed for the live canvas and exported GIFs, in SVG units/second. */
export const PULSE_TRAVEL_SPEED = 48;
/** Minimum loop period, including a brief rest after arrival on short connectors. */
export const PULSE_MIN_DURATION_SECONDS = 2.8;

/** Duration required to cross a connector at the shared visual speed. */
export function pulseTravelDuration(length: number, speed = PULSE_TRAVEL_SPEED): number {
  const window = pulseTravelWindow(length);
  const distance = Math.max(1, length * (window.end - window.start));
  return distance / Math.max(1, speed);
}

/** Rest at the destination instead of changing the speed on short connectors. */
export function pulseRepeatDelay(length: number, speed = PULSE_TRAVEL_SPEED): number {
  return Math.max(0, PULSE_MIN_DURATION_SECONDS - pulseTravelDuration(length, speed));
}

/** Position a looping marker by elapsed time while preserving a constant speed. */
export function pulseTravelDistanceAtTime(
  length: number,
  elapsedSeconds: number,
  speed = PULSE_TRAVEL_SPEED,
): number {
  const window = pulseTravelWindow(length);
  const distance = Math.max(1, length * (window.end - window.start));
  const duration = pulseTravelDuration(length, speed);
  const period = duration + pulseRepeatDelay(length, speed);
  const progress = Math.min(1, (Math.max(0, elapsedSeconds) % period) / duration);
  return window.inset + distance * progress;
}

/** Convert animation progress into a path distance using the safe travel window. */
export function pulseTravelDistance(length: number, progress: number): number {
  const window = pulseTravelWindow(length);
  const boundedProgress = Math.min(1, Math.max(0, progress));
  return length * (window.start + (window.end - window.start) * boundedProgress);
}

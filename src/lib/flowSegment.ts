import { PULSE_TRAVEL_SPEED, pulseTravelWindow } from './pulseTravel';

/** A short, hidden reset replaces the long visible rest used by round markers. */
export const FLOW_RESET_SECONDS = 0.12;

export function flowSegmentMotion(length: number) {
  const window = pulseTravelWindow(length);
  const start = length * window.start;
  const end = length * window.end;
  const segment = Math.min(18, Math.max(0, end - start));
  const duration = Math.max(0.001, end - start) / PULSE_TRAVEL_SPEED;
  return {
    // A gap longer than the path prevents a second dash wrapping to the source.
    dasharray: `${segment} ${length + segment + 1}`,
    // The leading edge, rather than the tail, arrives at the arrow entry.
    startOffset: segment - start,
    endOffset: segment - end,
    duration,
    fadeIn: Math.min(FLOW_RESET_SECONDS, duration / 2),
    reset: FLOW_RESET_SECONDS,
  };
}

/** The same travel, arrival fade and hidden reset as the live Flow timeline. */
export function flowSegmentFrame(length: number, elapsedSeconds: number) {
  const motion = flowSegmentMotion(length);
  const time = Math.max(0, elapsedSeconds) % (motion.duration + motion.reset);
  const progress = Math.min(1, time / motion.duration);
  return {
    dashoffset: motion.startOffset + (motion.endOffset - motion.startOffset) * progress,
    opacity:
      time <= motion.duration
        ? Math.min(1, time / motion.fadeIn)
        : Math.max(0, 1 - (time - motion.duration) / motion.reset),
  };
}

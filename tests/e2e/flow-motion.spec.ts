import { expect, test } from '@playwright/test';
import { NOVATION_FLOW } from '../fixtures/novationPresentation';
import { flowSegmentFrame, flowSegmentMotion } from '../../src/lib/flowSegment';

// Keep recording overhead out of the motion check. A controlled browser clock
// makes the frame-by-frame assertions independent of CI scheduling and load.
test.use({ trace: 'off', viewport: { width: 1600, height: 1000 } });

test('live Flow moves fractionally at constant speed and resets without a visible jump', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'novation.mmd',
    mimeType: 'text/plain',
    buffer: Buffer.from(NOVATION_FLOW),
  });
  await page.getByRole('button', { name: 'Flow', exact: true }).click();
  await page.clock.runFor(1800);
  const recording = page.evaluate(async () => {
    const paths = [...document.querySelectorAll<SVGPathElement>('.flow-segment')].sort(
      (a, b) => a.getTotalLength() - b.getTotalLength(),
    );
    const selected = [paths[0], paths[paths.length - 1]];
    const frames: {
      time: number;
      values: { offset: number; opacity: number; glow: number }[];
    }[] = [];
    await new Promise<void>((resolve) => {
      let start: number;
      function sample(time: number) {
        start ??= time;
        frames.push({
          time,
          values: selected.map((path) => ({
            offset: parseFloat(path.style.strokeDashoffset),
            opacity: parseFloat(path.style.opacity),
            // The shortest connector in this fixture is A -> B.
            glow: parseFloat(
              getComputedStyle(document.querySelector('#glow-B')!).opacity,
            ),
          })),
        });
        if (time - start < 4200) requestAnimationFrame(sample);
        else resolve();
      }
      requestAnimationFrame(sample);
    });
    return { lengths: selected.map((p) => p.getTotalLength()), frames };
  });
  await page.clock.runFor(4250);
  const motion = await recording;
  const [shortLength, longLength] = motion.lengths;
  expect(longLength).toBeGreaterThan(500);
  const longSteps = motion.frames
    .slice(1)
    .map((frame, i) => ({
      dt: (frame.time - motion.frames[i].time) / 1000,
      distance: motion.frames[i].values[1].offset - frame.values[1].offset,
    }))
    .filter(({ dt }) => dt > 0.008 && dt < 0.03);
  expect(longSteps.length).toBeGreaterThan(100);
  expect(longSteps.filter(({ distance }) => distance === 0).length).toBe(0);
  const speeds = longSteps.map(({ dt, distance }) => distance / dt).sort((a, b) => a - b);
  expect(speeds[Math.floor(speeds.length / 2)]).toBeCloseTo(48, 0);
  expect(
    motion.frames.filter((frame) => !Number.isInteger(frame.values[1].offset)).length,
  ).toBeGreaterThan(100);
  const profile = flowSegmentMotion(shortLength);
  let restarts = 0;
  for (let i = 1; i < motion.frames.length; i++) {
    const previous = motion.frames[i - 1].values[0];
    const current = motion.frames[i].values[0];
    if (current.offset - previous.offset > 10) {
      restarts++;
      expect(Math.min(previous.opacity, current.opacity)).toBeLessThan(0.35);
    }
    if (current.glow > previous.glow + 0.1) {
      expect(current.offset).toBeCloseTo(profile.endOffset, 1);
    }
    // Match the live opacity against the same phase model used by GIF export.
    if (current.offset > profile.endOffset + 1) {
      const phase = (profile.startOffset - current.offset) / 48;
      expect(current.opacity).toBeCloseTo(
        flowSegmentFrame(shortLength, phase).opacity,
        1,
      );
    }
  }
  expect(restarts).toBeGreaterThanOrEqual(3);
  await page.getByRole('button', { name: 'Workspace tools', exact: true }).click();
  await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
  const paused = await page.locator('#pulsegraph-svg').innerHTML();
  await page.clock.runFor(200);
  expect(await page.locator('#pulsegraph-svg').innerHTML()).toBe(paused);
});

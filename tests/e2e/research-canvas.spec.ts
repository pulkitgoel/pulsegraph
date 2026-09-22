import { expect, test } from '@playwright/test';
import { RESEARCH_FLOW } from '../fixtures/researchFlow';

test('research flow is complete and readable on the live canvas', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 2400 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Use light theme', exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'research-flow.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        source: RESEARCH_FLOW,
        roles: {
          User: 'lead-in',
          API: 'pipeline',
          SEC: 'pipeline',
          Q: 'pipeline',
          W: 'pipeline',
          C: 'service',
          L: 'service',
          A1: 'pipeline',
          A2: 'pipeline',
          A3: 'pipeline',
          A4: 'pipeline',
          TZ: 'service',
          GO: 'pipeline',
          S: 'service',
          RES: 'output',
          POLL: 'output',
        },
      }),
    ),
  });

  for (const mode of ['Classic', 'Rich', 'Flow', 'Presentation']) {
    await page.getByRole('button', { name: mode, exact: true }).click();
    await page.waitForTimeout(2200);
    const state = await page.locator('#pulsegraph-svg').evaluate((svg) => {
      const paths = Array.from(svg.querySelectorAll<SVGPathElement>('[id^="path-"]'));
      const labels = Array.from(
        svg.querySelectorAll<SVGGElement>('[data-edge-label="true"]'),
      );
      return {
        pathCount: paths.length,
        arrowCount: paths.filter((path) => {
          const marker = path.getAttribute('marker-end');
          const id = marker?.match(/^url\(#(.+)\)$/)?.[1];
          return (
            id &&
            svg.querySelector(
              `marker[id="${id}"] polygon, marker[id="${id}"] path, marker[id="${id}"] circle`,
            )
          );
        }).length,
        labelsTopmost: labels.every((label) => {
          const bounds = label.getBoundingClientRect();
          const top = document.elementFromPoint(
            bounds.left + bounds.width / 2,
            bounds.top + bounds.height / 2,
          );
          return Boolean(top && label.contains(top));
        }),
      };
    });
    expect(state, `${mode} live canvas`).toEqual({
      pathCount: 24,
      arrowCount: 24,
      labelsTopmost: true,
    });
    if (mode !== 'Presentation') {
      const spacing = await page.locator('#pulsegraph-svg').evaluate((svg) => {
        const sample = (id: string) => {
          const path = svg.querySelector<SVGPathElement>(`#path-${id}`)!;
          const length = path.getTotalLength();
          return Array.from({ length: Math.ceil(length / 4) + 1 }, (_, index) =>
            path.getPointAtLength(Math.min(length, index * 4)),
          );
        };
        const distance = (a: DOMPoint[], b: DOMPoint[]) =>
          Math.min(
            ...a.map((point) =>
              Math.min(
                ...b.map((other) => Math.hypot(point.x - other.x, point.y - other.y)),
              ),
            ),
          );
        const cache = sample('e_7'),
          memory = sample('e_9'),
          retry = sample('e_14');
        return {
          cacheToMemory: distance(cache, memory),
          cacheToRetry: distance(cache, retry),
          memoryToRetry: distance(memory, retry),
        };
      });
      expect(spacing.cacheToMemory).toBeGreaterThanOrEqual(23);
      expect(spacing.cacheToRetry).toBeGreaterThan(80);
      expect(spacing.memoryToRetry).toBeGreaterThan(80);
      if (mode === 'Rich' || mode === 'Flow') {
        const bounds = await page.locator('#pulsegraph-svg').evaluate((svg) => {
          const top = svg.querySelector('#node-group-C')!.getBoundingClientRect();
          const bottom = svg.querySelector('#node-group-S')!.getBoundingClientRect();
          const path = svg.querySelector('#path-e_7')!.getBoundingClientRect();
          return {
            x: top.left - 20,
            y: top.top - 20,
            width: path.right - top.left + 50,
            height: bottom.bottom - top.top + 40,
          };
        });
        await page.screenshot({
          path: `test-results/research-canvas-${mode.toLowerCase()}-routing.png`,
          clip: bounds,
        });
      }
    }
  }
});

test('boxes glow only after their incoming marker arrives on the live canvas', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'arrival.mmd',
    mimeType: 'text/plain',
    buffer: Buffer.from('flowchart LR\n A[Source] --> B[Target]'),
  });
  for (const mode of ['Rich', 'Classic']) {
    await page.getByRole('button', { name: mode, exact: true }).click();
    await page.waitForTimeout(1800);
    const observation = await page.locator('#pulsegraph-svg').evaluate(async (svg) => {
      const path = svg.querySelector<SVGPathElement>('[id^="path-"]')!;
      const pulse = svg.querySelector<SVGGraphicsElement>('[id^="pulse-"]')!;
      const glow = svg.querySelector<SVGGraphicsElement>('#glow-B')!;
      const sourceGlow = svg.querySelector<SVGGraphicsElement>('#glow-A')!;
      const point = path
        .getPointAtLength(path.getTotalLength())
        .matrixTransform(path.getScreenCTM()!);
      let previousDistance = Infinity;
      let previousOpacity = Number(getComputedStyle(glow).opacity);
      const initialOpacity = previousOpacity;
      const arrivals: number[] = [];
      let sourceEverGlows = false;
      const deadline = performance.now() + 4000;
      await new Promise<void>((resolve) => {
        const frame = () => {
          const rect = pulse.getBoundingClientRect();
          const distance = Math.hypot(
            rect.x + rect.width / 2 - point.x,
            rect.y + rect.height / 2 - point.y,
          );
          const opacity = Number(getComputedStyle(glow).opacity);
          if (opacity > previousOpacity + 0.2)
            arrivals.push(Math.min(distance, previousDistance));
          sourceEverGlows ||= Number(getComputedStyle(sourceGlow).opacity) > 0;
          previousDistance = distance;
          previousOpacity = opacity;
          if (performance.now() < deadline) requestAnimationFrame(frame);
          else resolve();
        };
        requestAnimationFrame(frame);
      });
      const scale = Math.hypot(path.getScreenCTM()!.a, path.getScreenCTM()!.b);
      return {
        initialOpacity,
        sourceEverGlows,
        arrivals: arrivals.map((value) => value / scale),
      };
    });
    expect(observation.initialOpacity).toBe(0);
    expect(observation.sourceEverGlows).toBe(false);
    expect(observation.arrivals.length).toBeGreaterThan(0);
    expect(Math.max(...observation.arrivals)).toBeLessThan(12);
  }
});

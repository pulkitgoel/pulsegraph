import { expect, test } from '@playwright/test';
import {
  PRODUCTION_FLOW,
  PRODUCTION_ROLES,
  PRODUCTION_PRESENTATION,
} from '../fixtures/productionPresentation';

test('production and parallel labels clear nodes and unrelated paths in every ordinary appearance', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  for (const source of [
    PRODUCTION_FLOW,
    'flowchart LR\nA[Request] -->|authenticated request accepted| B[API]\nA -->|authentication failed, retry request| B\nB -->|return response| A',
  ]) {
    await page.locator('input[type="file"]').setInputFiles({
      name: 'quality.mmd',
      mimeType: 'text/plain',
      buffer: Buffer.from(source),
    });
    for (const mode of ['Classic', 'Rich', 'Flow']) {
      await page.getByRole('button', { name: mode, exact: true }).click();
      const result = await page.locator('#pulsegraph-svg').evaluate((svg) => {
        const labels = Array.from(
          svg.querySelectorAll<SVGGElement>('[data-edge-label="true"]'),
        );
        const paths = Array.from(svg.querySelectorAll<SVGPathElement>('[id^="path-"]'));
        const overlaps = (a: DOMRect, b: DOMRect) =>
          a.left < b.right - 0.1 &&
          a.right > b.left + 0.1 &&
          a.top < b.bottom - 0.1 &&
          a.bottom > b.top + 0.1;
        const nodes = Array.from(svg.querySelectorAll('[id^="node-group-"]')).map(
          (node) => node.getBoundingClientRect(),
        );
        const collisions: string[] = [];
        labels.forEach((label, i) => {
          const rect = label.querySelector('rect')!.getBoundingClientRect();
          if (
            nodes.some((box) => overlaps(rect, box)) ||
            labels
              .slice(i + 1)
              .some((other) =>
                overlaps(rect, other.querySelector('rect')!.getBoundingClientRect()),
              )
          )
            collisions.push('label overlap');
          const ownPath = label.getAttribute('data-edge-id');
          for (const path of paths) {
            if (path.id === `path-${ownPath}`) continue;
            const length = path.getTotalLength();
            for (let t = 0; t <= length; t += 1) {
              const p = path.getPointAtLength(t).matrixTransform(path.getScreenCTM()!);
              if (
                p.x > rect.left + 0.1 &&
                p.x < rect.right - 0.1 &&
                p.y > rect.top + 0.1 &&
                p.y < rect.bottom - 0.1
              ) {
                collisions.push(path.id);
                break;
              }
            }
          }
        });
        return { labels: labels.length, collisions };
      });
      expect(result.collisions, mode).toEqual([]);
      expect(result.labels).toBe(source === PRODUCTION_FLOW ? 1 : 3);
    }
  }
});

test('rejected AI composition keeps the visible slide, source, and undo history intact', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'api.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        source: PRODUCTION_FLOW,
        roles: PRODUCTION_ROLES,
        presentation: PRODUCTION_PRESENTATION,
      }),
    ),
  });
  await page.getByRole('button', { name: 'Presentation', exact: true }).click();
  const before = await page.locator('#pulsegraph-svg').getAttribute('aria-label');
  await page.getByRole('button', { name: 'Workspace tools', exact: true }).click();
  await page.getByRole('button', { name: 'AI settings', exact: true }).click();
  await page.getByLabel('DeepSeek API key').fill('test-not-real');
  await page.getByRole('button', { name: 'Save AI settings', exact: true }).click();
  let requests = 0;
  await page.route('https://api.deepseek.com/**', (route) => {
    requests++;
    return route.fulfill({
      json: {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                roles: PRODUCTION_ROLES,
                presentation: { ...PRODUCTION_PRESENTATION, mainPath: ['U', 'DB'] },
              }),
            },
          },
        ],
      },
    });
  });
  const undoWasEnabled = await page
    .getByRole('button', { name: 'Undo', exact: true })
    .isEnabled();
  await page.getByRole('button', { name: 'Recompose with AI', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Your current diagram has been kept',
  );
  await expect(page.locator('#pulsegraph-svg')).toHaveAttribute('aria-label', before!);
  await expect(page.locator('[data-slide-edges] path')).toHaveCount(8);
  expect(await page.getByRole('button', { name: 'Undo', exact: true }).isEnabled()).toBe(
    undoWasEnabled,
  );
  expect(requests).toBe(1);
  await page.getByRole('button', { name: 'Workspace tools', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Mermaid source', exact: true }).click();
  await expect(page.getByLabel('Edit Mermaid', { exact: true })).toHaveValue(
    PRODUCTION_FLOW,
  );
});

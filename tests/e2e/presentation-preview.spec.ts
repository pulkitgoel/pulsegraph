import { expect, test } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { RESEARCH_FLOW } from '../fixtures/researchFlow';
import { RESEARCH_PRESENTATION, RESEARCH_ROLES } from '../fixtures/researchPresentation';
import {
  NOVATION_FLOW,
  NOVATION_PRESENTATION,
  NOVATION_ROLES,
} from '../fixtures/novationPresentation';

test('Novation long labels render completely inside the live slide and SVG export', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'novation.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        source: NOVATION_FLOW,
        roles: NOVATION_ROLES,
        presentation: NOVATION_PRESENTATION,
      }),
    ),
  });
  await page.getByRole('button', { name: 'Presentation', exact: true }).click();
  const chat = page.getByRole('button', { name: 'Chat', exact: true });
  if ((await chat.getAttribute('aria-pressed')) === 'true') await chat.click();
  await expect(page.locator('.presentation-preview [role="alert"]')).toHaveCount(0);
  await expect(page.locator('#pulsegraph-svg [id^="node-group-"]')).toHaveCount(19);
  await expect(page.locator('#pulsegraph-svg [id^="path-"]')).toHaveCount(20);
  const decline = page.locator('#node-group-R');
  const fullText =
    'Darwin shows message: You have declined the required agreement. Your benefit order cannot be completed until the agreement is signed.';
  expect((await decline.locator('text').allTextContents()).join(' ')).toBe(fullText);
  const overflow = await page.locator('#pulsegraph-svg').evaluate((svg) =>
    [...svg.querySelectorAll('[id^="node-group-"]')].flatMap((group) => {
      const body = group.querySelector('[data-node-body]')!.getBoundingClientRect();
      return [...group.querySelectorAll('text')]
        .filter((text) => {
          const box = text.getBoundingClientRect();
          return (
            box.left < body.left ||
            box.right > body.right ||
            box.top < body.top ||
            box.bottom > body.bottom
          );
        })
        .map((text) => `${group.id}: ${text.textContent}`);
    }),
  );
  expect(overflow).toEqual([]);
  const edgesThroughText = await page.locator('#pulsegraph-svg').evaluate((svg) => {
    const textBoxes = [...svg.querySelectorAll('[id^="node-group-"] text')].map((text) =>
      text.getBoundingClientRect(),
    );
    return [...svg.querySelectorAll<SVGPathElement>('[id^="path-"]')]
      .filter((path) => {
        const matrix = path.getScreenCTM()!;
        const length = path.getTotalLength();
        for (let distance = 0; distance <= length; distance += 2) {
          const point = path.getPointAtLength(distance).matrixTransform(matrix);
          if (
            textBoxes.some(
              (box) =>
                point.x > box.left &&
                point.x < box.right &&
                point.y > box.top &&
                point.y < box.bottom,
            )
          )
            return true;
        }
        return false;
      })
      .map((path) => path.id);
  });
  expect(edgesThroughText).toEqual([]);
  await page.screenshot({ path: 'test-results/novation-presentation.png' });
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'SVG', exact: true }).click();
  const download = await pending;
  const exported = await readFile((await download.path())!, 'utf8');
  expect(exported).toContain(fullText);
  expect((exported.match(/id="path-/g) ?? []).length).toBe(20);
});

test('architecture preview preserves the research flow on one landscape slide', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'slide.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        source: RESEARCH_FLOW,
        roles: RESEARCH_ROLES,
        presentation: RESEARCH_PRESENTATION,
      }),
    ),
  });
  await page.getByRole('button', { name: 'Presentation', exact: true }).click();
  const chat = page.getByRole('button', { name: 'Chat', exact: true });
  if ((await chat.getAttribute('aria-pressed')) === 'true') await chat.click();
  await expect(
    page.getByRole('region', { name: 'Architecture slide preview' }),
  ).toBeVisible();
  await expect(page.locator('#pulsegraph-svg [id^="node-group-"]')).toHaveCount(16);
  await expect(page.locator('#pulsegraph-svg [id^="path-"]')).toHaveCount(24);
  await expect(page.locator('#pulsegraph-svg [data-source-group="grp_ag"]')).toHaveCount(
    1,
  );
  await expect(page.locator('#pulsegraph-svg')).toHaveAttribute(
    'viewBox',
    '0 0 1600 900',
  );
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'test-results/architecture-research-dark.png' });
  const state = await page.locator('#pulsegraph-svg').evaluate((svg) => {
    const labels = [...svg.querySelectorAll<SVGGElement>('[data-edge-label]')];
    return {
      arrows: [...svg.querySelectorAll('[id^="path-"]')].filter((edge) =>
        edge.getAttribute('marker-end')?.startsWith('url(#slide-arrow'),
      ).length,
      labelsTopmost: labels.every((label) => {
        const box = label.getBoundingClientRect();
        const top = document.elementFromPoint(
          box.x + box.width / 2,
          box.y + box.height / 2,
        );
        return top && label.contains(top);
      }),
      allTextInside: [...svg.querySelectorAll<SVGGraphicsElement>('text')].every((el) => {
        const box = el.getBoundingClientRect(),
          frame = svg.getBoundingClientRect();
        return (
          box.left >= frame.left &&
          box.right <= frame.right &&
          box.top >= frame.top &&
          box.bottom <= frame.bottom
        );
      }),
    };
  });
  expect(state).toEqual({ arrows: 24, labelsTopmost: true, allTextInside: true });
  await page.getByRole('button', { name: 'Workspace tools', exact: true }).click();
  await page.getByRole('button', { name: 'Use light theme', exact: true }).click();
  await page.screenshot({ path: 'test-results/architecture-research-light.png' });
  await page.getByRole('button', { name: 'Previous layout', exact: true }).click();
  await expect(page.locator('#pulsegraph-svg')).not.toHaveAttribute(
    'data-visual-style',
    'presentation',
  );
  await page
    .getByRole('button', { name: 'Architecture preview · 16:9', exact: true })
    .click();
  await expect(page.locator('#pulsegraph-svg')).toHaveAttribute(
    'data-visual-style',
    'presentation',
  );
});

test('AI slide plans survive recovery and export the live composition', async ({
  page,
}) => {
  const scopeWarnings: string[] = [];
  page.on('console', (message) => {
    if (message.text().includes('Invalid scope')) scopeWarnings.push(message.text());
  });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'research.mmd',
    mimeType: 'text/plain',
    buffer: Buffer.from(RESEARCH_FLOW),
  });
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
                roles: RESEARCH_ROLES,
                presentation: RESEARCH_PRESENTATION,
              }),
            },
          },
        ],
      },
    });
  });
  await page.getByRole('button', { name: 'Presentation', exact: true }).click();
  await page.getByLabel('DeepSeek API key').fill('test-not-real');
  await page.getByRole('button', { name: 'Save AI settings' }).click();
  await expect(page.locator('#pulsegraph-svg')).toHaveAttribute(
    'data-visual-style',
    'presentation',
  );
  expect(requests).toBe(1);
  await expect(page.getByText('Layout review:', { exact: false })).toHaveCount(0);
  const pulse = page.locator('#pulse-e_1');
  const before = await pulse.getAttribute('transform');
  await expect.poll(() => pulse.getAttribute('transform')).not.toEqual(before);
  await page.getByRole('button', { name: 'Workspace tools', exact: true }).click();
  await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
  const paused = await page.locator('#pulsegraph-svg').innerHTML();
  await page.waitForTimeout(200);
  expect(await page.locator('#pulsegraph-svg').innerHTML()).toBe(paused);
  for (const format of ['SVG', 'Slide PNG', 'Animated GIF']) {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await expect(page.getByLabel('Frame size')).toHaveValue('16:9');
    await expect(page.getByLabel('Frame size')).toBeDisabled();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: format, exact: true }).click();
    const download = await downloadPromise;
    const bytes = await readFile((await download.path())!);
    if (format === 'SVG') {
      const xml = bytes.toString();
      expect(xml).toContain('data-visual-style="presentation"');
      expect(xml).toContain(RESEARCH_PRESENTATION.title);
      expect(xml).toContain('<g font-family="Inter, Segoe UI, Arial, sans-serif">');
      expect((xml.match(/id="path-/g) ?? []).length).toBe(24);
    } else if (format === 'Slide PNG') {
      expect(bytes.readUInt32BE(16)).toBe(2560);
      expect(bytes.readUInt32BE(20)).toBe(1440);
      await writeFile('test-results/architecture-slide-export.png', bytes);
    } else {
      expect(bytes.subarray(0, 3).toString()).toBe('GIF');
      expect(bytes.readUInt16LE(6)).toBe(2560);
      expect(bytes.readUInt16LE(8)).toBe(1440);
      await writeFile('test-results/architecture-slide-export.gif', bytes);
    }
  }
  await page.reload();
  await page.getByRole('button', { name: 'Presentation', exact: true }).click();
  await expect(page.locator('#pulsegraph-svg')).toHaveAttribute(
    'aria-label',
    RESEARCH_PRESENTATION.title,
  );
  expect(requests).toBe(1);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    'test-not-real',
  );
  expect(scopeWarnings).toEqual([]);
});

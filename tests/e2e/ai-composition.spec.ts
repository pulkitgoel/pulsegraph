import { expect, test } from '@playwright/test';
import {
  LIVE_RESEARCH_FLOW,
  LIVE_RESEARCH_DUPLICATE_PLAN,
} from '../fixtures/liveAiResearch';
import { parseDiagram } from '../../src/services/llmValidation';

test('captured live AI duplicates compose once per node and preserve source on the canvas', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'live-ai-research.mmd',
    mimeType: 'text/plain',
    buffer: Buffer.from(LIVE_RESEARCH_FLOW),
  });
  const graph = parseDiagram(LIVE_RESEARCH_FLOW);
  const roles = Object.fromEntries(graph.nodes.map((node) => [node.id, 'pipeline']));
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
                roles,
                presentation: LIVE_RESEARCH_DUPLICATE_PLAN,
              }),
            },
          },
        ],
      },
    });
  });
  await page.getByRole('button', { name: 'Presentation', exact: true }).click();
  await page.getByLabel('DeepSeek API key').fill('test-not-real');
  await page.getByRole('button', { name: 'Save AI settings', exact: true }).click();
  await expect(page.locator('#pulsegraph-svg')).toHaveAttribute(
    'data-visual-style',
    'presentation',
  );
  await expect(page.locator('[id^="node-group-"]')).toHaveCount(16);
  await expect(page.locator('[id^="path-"]')).toHaveCount(24);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(requests).toBe(1);
  await page.getByRole('button', { name: 'Workspace tools', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Mermaid source', exact: true }).click();
  await expect(page.getByLabel('Edit Mermaid', { exact: true })).toHaveValue(
    LIVE_RESEARCH_FLOW,
  );
  await page.getByRole('button', { name: 'Close source editor', exact: true }).click();
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await page.screenshot({ path: 'test-results/ai-duplicate-composition-regression.png' });
});

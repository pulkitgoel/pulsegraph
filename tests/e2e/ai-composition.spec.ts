import { expect, test } from '@playwright/test';
import {
  LIVE_RESEARCH_FLOW,
  LIVE_RESEARCH_DUPLICATE_PLAN,
} from '../fixtures/liveAiResearch';
import { parseDiagram } from '../../src/services/llmValidation';
import {
  PRODUCTION_FLOW,
  PRODUCTION_PRESENTATION,
  PRODUCTION_ROLES,
} from '../fixtures/productionPresentation';
import { DIAGRAM_EXAMPLES } from '../../src/lib/examples';
import { INCIDENT_PRESENTATION, INCIDENT_ROLES } from '../fixtures/incidentPresentation';
import { DELIVERY_PRESENTATION, DELIVERY_ROLES } from '../fixtures/deliveryPresentation';
import { assertPresentationAttachments } from '../helpers/presentationAttachments';

for (const example of [
  {
    name: 'Incident response',
    plan: INCIDENT_PRESENTATION,
    roles: INCIDENT_ROLES,
    count: 8,
    edges: 9,
  },
  {
    name: 'Secure CI/CD pipeline',
    plan: DELIVERY_PRESENTATION,
    roles: DELIVERY_ROLES,
    count: 10,
    edges: 10,
  },
]) {
  test(`${example.name} composes through AI with attached arrows, complete labels and animation`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/');
    await page.getByRole('button', { name: new RegExp(`^${example.name}`) }).click();
    const source = DIAGRAM_EXAMPLES.find((item) => item.name === example.name)!.source;
    const graph = parseDiagram(source);
    let requests = 0;
    await page.route('https://api.deepseek.com/**', (route) => {
      requests++;
      const request = route.request().postDataJSON();
      const data = JSON.parse(request.messages.at(-1).content);
      expect(data.nodes.map((node: { id: string }) => node.id)).toEqual(
        graph.nodes.map((node) => node.id),
      );
      expect(
        data.edges.map((edge: { from: string; to: string; label?: string }) => [
          edge.from,
          edge.to,
          edge.label,
        ]),
      ).toEqual(graph.edges.map((edge) => [edge.from, edge.to, edge.label]));
      return route.fulfill({
        json: {
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: JSON.stringify({
                  roles: example.roles,
                  presentation: example.plan,
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
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.locator('[data-slide-lane]')).toHaveCount(1);
    await expect(page.locator('[id^="node-group-"]')).toHaveCount(example.count);
    await expect(page.locator('[id^="path-"][marker-end]')).toHaveCount(example.edges);
    await expect(page.locator('[data-edge-label] text')).toHaveText(
      graph.edges.filter((edge) => edge.label).map((edge) => edge.label!),
    );
    for (const node of graph.nodes)
      await expect(page.locator(`#node-group-${node.id}`)).toBeVisible();
    const pulse = page.locator('#pulse-e_5');
    const before = await pulse.getAttribute('transform');
    await expect.poll(() => pulse.getAttribute('transform')).not.toEqual(before);
    expect(requests).toBe(1);
    await page.getByRole('button', { name: 'Workspace tools', exact: true }).click();
    await page.getByRole('button', { name: 'Edit Mermaid source', exact: true }).click();
    await expect(page.getByLabel('Edit Mermaid', { exact: true })).toHaveValue(source);
    await page.getByRole('button', { name: 'Close source editor', exact: true }).click();
    const chat = page.getByRole('button', { name: 'Chat', exact: true });
    if ((await chat.getAttribute('aria-pressed')) === 'true') await chat.click();
    await assertPresentationAttachments(page, graph.edges);
    const stem = example.name === 'Incident response' ? 'incident' : 'delivery';
    await page.screenshot({ path: `test-results/${stem}-ai-composition-dark.png` });
    await page.getByRole('button', { name: 'Workspace tools', exact: true }).click();
    await page.getByRole('button', { name: 'Use light theme', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.locator('[id^="path-"][marker-end]')).toHaveCount(example.edges);
    await assertPresentationAttachments(page, graph.edges);
    await page.screenshot({ path: `test-results/${stem}-ai-composition-light.png` });
  });
}

test('production API example composes through AI and renders all four dependency routes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await page.getByRole('button', { name: /^Production API architecture/ }).click();
  let requests = 0;
  await page.route('https://api.deepseek.com/**', (route) => {
    requests++;
    const body = route.request().postDataJSON();
    const data = JSON.parse(body.messages.at(-1).content);
    expect(data.nodes).toHaveLength(9);
    expect(data.edges).toHaveLength(8);
    return route.fulfill({
      json: {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                roles: PRODUCTION_ROLES,
                presentation: PRODUCTION_PRESENTATION,
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
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('[data-slide-lane]')).toHaveCount(2);
  await expect(page.locator('[id^="node-group-"]')).toHaveCount(9);
  await expect(page.locator('[id^="path-"][marker-end]')).toHaveCount(8);
  await expect(page.locator('[data-edge-label]')).toContainText('logs');
  const pulse = page.locator('#pulse-e_7');
  const before = await pulse.getAttribute('transform');
  await expect.poll(() => pulse.getAttribute('transform')).not.toEqual(before);
  expect(requests).toBe(1);
  await page.getByRole('button', { name: 'Workspace tools', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Mermaid source', exact: true }).click();
  await expect(page.getByLabel('Edit Mermaid', { exact: true })).toHaveValue(
    PRODUCTION_FLOW,
  );
  await page.getByRole('button', { name: 'Close source editor', exact: true }).click();
  const chat = page.getByRole('button', { name: 'Chat', exact: true });
  if ((await chat.getAttribute('aria-pressed')) === 'true') await chat.click();
  await assertPresentationAttachments(page, parseDiagram(PRODUCTION_FLOW).edges);
  await page.screenshot({ path: 'test-results/production-api-ai-routing.png' });
});

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

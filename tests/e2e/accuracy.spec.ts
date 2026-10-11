import { expect, test } from '@playwright/test';
import { INCIDENT_FLOW, INCIDENT_ROLES } from '../fixtures/incidentPresentation';

test('latest Mermaid label survives rendering and case-only AI refinement', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'labels.mmd',
    mimeType: 'text/plain',
    buffer: Buffer.from('flowchart LR\nA[Old label] --> B[Result]\nA[api]\nA --> B'),
  });
  for (const mode of ['Classic', 'Rich', 'Flow']) {
    await page.getByRole('button', { name: mode, exact: true }).click();
    await expect(page.locator('#node-group-A')).toContainText('api');
    await expect(page.locator('#node-group-A')).not.toContainText('Old label');
    await expect(page.locator('[id^="path-"]')).toHaveCount(1);
  }
  await page.getByRole('button', { name: 'Workspace tools', exact: true }).click();
  await page.getByRole('button', { name: 'AI settings', exact: true }).click();
  await page.getByLabel('DeepSeek API key').fill('test-not-real');
  await page.getByRole('button', { name: 'Save AI settings' }).click();
  await page.route('https://api.deepseek.com/**', (route) =>
    route.fulfill({
      json: {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                mermaidCode: 'flowchart LR\nA[API] --> B[Result]',
              }),
            },
          },
        ],
      },
    }),
  );
  await page.getByLabel('Refine your diagram').fill('Capitalize api to API');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('#node-group-A')).toContainText('API');
  await expect(page.locator('[id^="path-"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('local role-only incident presentation keeps eight nodes in one section', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'incident-local.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        source: INCIDENT_FLOW,
        roles: { ...INCIDENT_ROLES, H: 'output' },
      }),
    ),
  });
  await page.getByRole('button', { name: 'Presentation', exact: true }).click();
  await page
    .getByRole('button', { name: 'Architecture preview · 16:9', exact: true })
    .click();
  await expect(page.locator('[data-slide-lane]')).toHaveCount(1);
  await expect(page.locator('[id^="node-group-"]')).toHaveCount(8);
  await expect(page.locator('[id^="path-"]')).toHaveCount(9);
  await expect(page.locator('.presentation-preview [role="alert"]')).toHaveCount(0);
});

test('rich icon animations remain active and skip absent targets', async ({ page }) => {
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (/GSAP target|Invalid scope/.test(message.text())) warnings.push(message.text());
  });
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'icons.mmd',
    mimeType: 'text/plain',
    buffer: Buffer.from('flowchart LR\nA[Auth] --> B[Writer Agent] --> C[Analytics]'),
  });
  await page.getByRole('button', { name: 'Rich', exact: true }).click();
  for (const selector of ['.lock-shackle', '.robot-body-dance', '.bar-grow']) {
    const icon = page.locator(`#pulsegraph-svg ${selector}`).first();
    const before = await icon.getAttribute('transform');
    await expect.poll(() => icon.getAttribute('transform')).not.toBe(before);
  }
  expect(warnings).toEqual([]);
  await page.getByRole('button', { name: 'Workspace tools', exact: true }).click();
  await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
  const paused = await page.locator('#pulsegraph-svg').innerHTML();
  await page.waitForTimeout(200);
  expect(await page.locator('#pulsegraph-svg').innerHTML()).toBe(paused);
});

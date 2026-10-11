import { expect, test } from '@playwright/test';

test('Mermaid starter creates the real diagram without an AI request', async ({
  page,
}) => {
  const aiRequests: string[] = [];
  page.on('request', (request) => {
    if (/api\.deepseek\.com|\/api\/chat/.test(request.url()))
      aiRequests.push(request.url());
  });
  await page.goto('/');
  const input = page.getByRole('textbox', {
    name: 'Diagram description or Mermaid source',
  });
  const submit = page.getByRole('button', { name: 'Animate my diagram', exact: true });
  await expect(submit).toBeDisabled();
  await page.getByRole('button', { name: 'Use a Mermaid starter' }).click();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(/^flowchart LR\n/);
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.locator('#pulsegraph-svg')).toBeVisible();
  await expect(page.locator('[id^="node-group-"]')).toHaveCount(5);
  await expect(page.locator('[id^="path-"]')).toHaveCount(5);
  expect(aiRequests).toEqual([]);
});

test('the exported demo opens its source diagram in the editor', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open this diagram', exact: true }).click();
  await expect(page.locator('#pulsegraph-svg')).toBeVisible();
  await expect(page.locator('[id^="node-group-"]')).toHaveCount(9);
  await expect(page.locator('[id^="path-"]')).toHaveCount(8);
});

test('FAQ is keyboard accessible and the final action focuses the source', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('main')).toHaveCount(1);
  const question = page
    .locator('summary')
    .filter({ hasText: 'Does my diagram stay on my device?' });
  await question.focus();
  await page.keyboard.press('Enter');
  await expect(question.locator('..')).toHaveAttribute('open', '');
  await expect(question.locator('..')).toContainText('sent to that provider');
  await page.getByRole('link', { name: 'Create your diagram', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'Diagram description or Mermaid source' }),
  ).toBeFocused();
});

test('demo retains a visible static preview if the GIF fails', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.route('**/pulsegraph-live-flow.gif*', (route) => route.abort());
  await page.goto('/');
  const preview = page.locator('.browser-screen img');
  await expect(preview).toHaveAttribute('src', /pulsegraph-live-flow-static\.png$/);
  await expect
    .poll(() => preview.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await expect(
    page.getByRole('button', { name: 'Open this diagram', exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Preview', exact: true })).toBeDisabled();
});

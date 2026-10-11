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
  await expect(page.locator('[id^="node-group-"]')).toHaveCount(6);
  await expect(page.locator('[id^="path-"]')).toHaveCount(5);
  await expect(page.locator('[data-edge-label="true"] text')).toContainText([
    'Yes',
    'No',
  ]);
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

test('pause and resume do not leave a reduced-motion preview loading', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const screen = page.locator('.browser-screen');
  await expect(screen).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.demo-caption')).toContainText('Static preview');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(screen).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(screen).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('demo retains a visible static preview if the GIF fails', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.route('**/pulsegraph-live-flow.gif*', (route) => route.abort());
  await page.goto('/');
  const preview = page.locator('.browser-screen img');
  await expect(preview).toHaveAttribute('src', /pulsegraph-live-flow-static\.png\?v=9$/);
  await expect
    .poll(() => preview.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await expect(
    page.getByRole('button', { name: 'Open this diagram', exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Preview', exact: true })).toBeDisabled();
});

test('slow demo download shows a poster and loading status before animation is ready', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/pulsegraph-live-flow.gif*', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const screen = page.locator('.browser-screen');
  await expect(screen).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('status')).toHaveText('Loading animation…');
  await expect(screen).toHaveCSS(
    'background-image',
    /pulsegraph-live-flow-static\.png\?v=9/,
  );
  release();
  await expect(screen).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(screen.locator('img')).toBeVisible();
  await expect(page.locator('.demo-caption')).toContainText('Animated GIF');
  await page
    .locator('.browser-shot')
    .screenshot({ path: 'test-results/landing-checkout-demo.png' });
});

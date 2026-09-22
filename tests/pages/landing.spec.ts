import { expect, test } from '@playwright/test';

test('landing demo loads from the GitHub Pages subpath in both motion preferences', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const failedAssets: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 400) failedAssets.push(response.url());
  });
  await page.goto('./');
  const preview = page.locator('.browser-screen img');
  await preview.scrollIntoViewIfNeeded();
  await expect(preview).toHaveAttribute(
    'src',
    '/pulsegraph/pulsegraph-live-flow.gif?v=8',
  );
  await expect
    .poll(() => preview.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBe(2560);
  const gif = await page.request.get((await preview.getAttribute('src')) as string);
  expect(gif.status()).toBe(200);
  expect(gif.headers()['content-type']).toContain('image/gif');

  const staticResponse = page.waitForResponse((response) =>
    response.url().endsWith('/pulsegraph/pulsegraph-live-flow-static.png'),
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect((await staticResponse).status()).toBe(200);
  await expect(preview).toHaveCSS(
    'content',
    'url("http://127.0.0.1:5179/pulsegraph/pulsegraph-live-flow-static.png")',
  );
  expect(failedAssets).toEqual([]);
  await page
    .locator('.browser-shot')
    .screenshot({ path: 'test-results/pages-landing-demo.png' });
});

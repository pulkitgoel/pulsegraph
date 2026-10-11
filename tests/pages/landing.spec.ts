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
    '/pulsegraph/pulsegraph-live-flow.gif?v=9',
  );
  await expect
    .poll(() => preview.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBe(2560);
  const gif = await page.request.get((await preview.getAttribute('src')) as string);
  expect(gif.status()).toBe(200);
  expect(gif.headers()['content-type']).toContain('image/gif');
  expect((await gif.body()).byteLength).toBeLessThan(2_000_000);
  await expect(page.locator('.browser-screen')).toHaveAttribute('aria-busy', 'false');
  const firstFrame = await preview.screenshot();
  await expect
    .poll(async () => (await preview.screenshot()).equals(firstFrame))
    .toBe(false);

  const staticResponse = await page.request.get(
    '/pulsegraph/pulsegraph-live-flow-static.png?v=9',
  );
  expect(staticResponse.status()).toBe(200);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(() => preview.evaluate((image) => (image as HTMLImageElement).currentSrc))
    .toBe('http://127.0.0.1:5179/pulsegraph/pulsegraph-live-flow-static.png?v=9');
  await expect(page.locator('.demo-caption')).toContainText('Static preview');
  expect(failedAssets).toEqual([]);
  await page
    .locator('.browser-shot')
    .screenshot({ path: 'test-results/pages-landing-demo.png' });
});

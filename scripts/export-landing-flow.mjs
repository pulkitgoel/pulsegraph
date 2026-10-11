import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { LANDING_DEMO } from '../src/lib/examples.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localBrowser = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => candidate && existsSync(candidate));

const browser = await chromium.launch({ headless: true, executablePath: localBrowser });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  await page.goto(process.env.PULSEGRAPH_URL ?? 'http://127.0.0.1:4173');
  await page
    .getByRole('textbox', { name: 'Diagram description or Mermaid source' })
    .fill(LANDING_DEMO.source);
  await page.getByRole('button', { name: 'Animate my diagram', exact: true }).click();
  await page.locator('#pulsegraph-svg').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Rich', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Rich', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByText('Export', { exact: true }).click();
  await page.locator('.export-menu select').selectOption('auto');

  const downloadPromise = page.waitForEvent('download', { timeout: 120_000 });
  await page.getByRole('button', { name: 'Animated GIF', exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs(path.join(root, 'public', 'pulsegraph-live-flow.gif'));

  await page.getByText('Export', { exact: true }).click();
  const pngDownloadPromise = page.waitForEvent('download', { timeout: 120_000 });
  await page.getByRole('button', { name: 'PNG', exact: true }).click();
  const pngDownload = await pngDownloadPromise;
  await pngDownload.saveAs(path.join(root, 'public', 'pulsegraph-live-flow-static.png'));
} catch (error) {
  console.error(
    'Landing capture failed:',
    await page.getByRole('alert').allTextContents(),
  );
  throw error;
} finally {
  await browser.close();
}

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

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
  await page.getByRole('button', { name: /^Production API architecture/ }).click();
  await page.locator('#pulsegraph-svg').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Rich', exact: true }).click();
  await page.getByText('Export', { exact: true }).click();
  await page.locator('.export-menu select').selectOption('16:9');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Animated GIF', exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs(path.join(root, 'public', 'pulsegraph-live-flow.gif'));

  await page.getByText('Export', { exact: true }).click();
  const pngDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNG', exact: true }).click();
  const pngDownload = await pngDownloadPromise;
  await pngDownload.saveAs(path.join(root, 'public', 'pulsegraph-live-flow-static.png'));
} finally {
  await browser.close();
}

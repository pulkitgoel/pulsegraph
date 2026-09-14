import { test, expect, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

async function example(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Request flow', exact: true }).click();
  await expect(page.locator('#pulsegraph-svg')).toBeVisible();
}

async function openMore(page: Page) {
  await page.getByRole('button', { name: 'Workspace tools', exact: true }).click();
}

test('landing actions stay discoverable in both themes and on mobile', async ({
  page,
}) => {
  await page.goto('/');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      await page.getByRole('button', { name: `Use ${theme} theme`, exact: true }).click();
      await expect(page.getByRole('button', { name: 'Workspace tools' })).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Import diagram', exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'AI settings', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      const header = page.locator('.app-header');
      expect(await header.evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      expect(
        await header.evaluate((element) => getComputedStyle(element).backgroundColor),
      ).toBe(theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(15, 22, 35)');
      await page.screenshot({ path: `test-results/landing-${theme}-${width}.png` });
    }
  }
});

async function configureAi(page: Page) {
  await openMore(page);
  await page.getByRole('button', { name: 'AI settings', exact: true }).click();
  await page.getByLabel('DeepSeek API key').fill('test-key-not-real');
  await page.getByRole('button', { name: 'Save AI settings' }).click();
}

test('landing preview, examples, footer and workspace menu work at narrow widths', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Pause preview' }).click();
  await expect(page.getByRole('button', { name: 'Play preview' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(
    await page
      .locator('.preview-beams path')
      .first()
      .evaluate((path) => getComputedStyle(path).animationPlayState),
  ).toBe('paused');
  await page.getByRole('button', { name: 'Play preview' }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(
    await page
      .locator('.preview-beams path')
      .first()
      .evaluate((path) => getComputedStyle(path).animationName),
  ).toBe('none');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const landing = page.locator('.landing-page');
    expect(
      await landing.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1);
    await page
      .getByRole('navigation', { name: 'Footer', exact: true })
      .scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'Connect AI', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.screenshot({ path: `test-results/landing-footer-${width}.png` });
    await page.getByRole('link', { name: 'Explore examples', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Decision loop', exact: true }),
    ).toBeInViewport();
  }
  for (const name of ['Request flow', 'Decision loop', 'Delivery pipeline']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.locator('#pulsegraph-svg')).toBeVisible();
    await expect(page.locator('.workspace-summary')).toContainText('connections');
    await openMore(page);
    await expect(
      page.getByRole('button', { name: 'Reset workspace', exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: `test-results/menu-${name.replaceAll(' ', '-')}.png` });
    await page.keyboard.press('Escape');
    await expect(page.locator('.tools-menu')).toHaveCount(0);
    await openMore(page);
    await page.getByRole('button', { name: 'Reset workspace', exact: true }).click();
  }
});

test('long business presentation uses semantic zones and wrapped rows instead of Rich geometry', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const source = `flowchart TD
    A[Employee selects benefit] --> B[Checkout]
    B --> C{Agreement required?}
    C -->|No| D[Normal checkout]
    C -->|Yes| E[Generate agreement]
    E --> F[Send to DocuSign]
    F --> G[Employee reviews]
    G --> H{Signed?}
    H -->|No| I[Send reminder]
    I --> F
    H -->|Yes| J[Validate signature]
    J --> K[Store agreement]
    K --> L[Update benefit]
    L --> M[Calculate payroll]
    M --> N[Approve deduction]
    N --> O[Activate benefit]
    O --> P[Notify employee]
    P --> Q[Confirmation]
    K -.-> R[(Document archive)]
    M -.-> S[Payroll service]`;
  const roles = Object.fromEntries(
    'ABCDEFGHIJKLMNOPQRS'
      .split('')
      .map((id) => [
        id,
        'AB'.includes(id)
          ? 'lead-in'
          : 'DQ'.includes(id)
            ? 'output'
            : 'RS'.includes(id)
              ? 'service'
              : 'pipeline',
      ]),
  );
  await page.locator('input[type="file"]').setInputFiles({
    name: 'benefits.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: 1, source, roles })),
  });
  const position = () =>
    page
      .locator('#node-group-K')
      .evaluate((node) => node.parentElement?.getAttribute('transform'));
  const richPosition = await position();
  await page.getByRole('button', { name: 'Presentation', exact: true }).click();
  await expect.poll(position).not.toBe(richPosition);
  await expect(page.locator('#pulsegraph-svg')).toContainText('Decision Paths');
  await expect(page.locator('#pulsegraph-svg')).not.toContainText('Backend Pipeline');
  await expect(page.locator('[id^="node-group-"]')).toHaveCount(19);
  const presentationPosition = await position();
  for (const theme of ['light', 'dark']) {
    await openMore(page);
    await page.getByRole('button', { name: `Use ${theme} theme`, exact: true }).click();
    await page.screenshot({ path: `test-results/business-presentation-${theme}.png` });
  }
  await page.getByRole('button', { name: 'Rich', exact: true }).click();
  await expect.poll(position).toBe(richPosition);
  await page.getByRole('button', { name: 'Presentation', exact: true }).click();
  await expect.poll(position).toBe(presentationPosition);
  await openMore(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('.tools-menu')).toHaveCount(0);
});

async function exportFile(page: Page, name: string) {
  await page.getByText('Export', { exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name, exact: true }).click();
  const result = await download;
  expect(await result.failure()).toBeNull();
  const path = await result.path();
  expect(path).not.toBeNull();
  return readFile(path!);
}

test('local rendering, editing, undo, recovery, keyboard navigation and no external traffic', async ({
  page,
}) => {
  const external: string[] = [];
  page.on('request', (request) => {
    if (
      request.url().startsWith('http') &&
      !request.url().startsWith('http://127.0.0.1:5178')
    )
      external.push(request.url());
  });
  await example(page);
  await openMore(page);
  await page.getByRole('button', { name: 'Edit Mermaid source', exact: true }).click();
  await page
    .getByLabel('Edit Mermaid', { exact: true })
    .fill('flowchart LR; X[New start] --> Y[New end]');
  await page.getByRole('button', { name: 'Apply source' }).click();
  await expect(page.locator('#node-group-X')).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('#node-group-API')).toBeVisible();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await page.reload();
  await expect(page.locator('#node-group-X')).toBeVisible();
  await page.getByRole('region', { name: /Diagram canvas/ }).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('0');
  expect(external).toEqual([]);
  await openMore(page);
  await page.getByRole('button', { name: 'Reset workspace', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Every flow/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: /Every flow/ })).toBeVisible();
});

test('invalid source preserves the current document', async ({ page }) => {
  await example(page);
  await openMore(page);
  await page.getByRole('button', { name: 'Edit Mermaid source', exact: true }).click();
  await page.getByLabel('Edit Mermaid', { exact: true }).fill('flowchart LR\nA -->');
  await page.getByRole('button', { name: 'Apply source' }).click();
  await expect(page.getByRole('alert')).toContainText('missing');
  await expect(page.locator('#node-group-API')).toBeVisible();
});

test('chat refinement applies the latest instruction to the current diagram', async ({
  page,
}) => {
  await example(page);
  await configureAi(page);
  let refinement: Record<string, string> | undefined;
  await page.route('https://api.deepseek.com/**', async (route) => {
    const body = route.request().postDataJSON() as {
      messages: Array<{ content: string }>;
    };
    refinement = JSON.parse(body.messages.at(-1)!.content) as Record<string, string>;
    await route.fulfill({
      json: {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                mermaidCode:
                  'flowchart LR; U((User)) --> API[API Gateway]; API --> REDIS[/Redis/]; REDIS --> DB[(PostgreSQL)]',
              }),
            },
          },
        ],
      },
    });
  });

  await page.getByLabel('Refine your diagram').fill('Add Redis before PostgreSQL');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('#node-group-REDIS')).toBeVisible();
  expect(refinement?.operation).toBe('refine');
  expect(refinement?.instruction).toBe('Add Redis before PostgreSQL');
  expect(refinement?.currentDiagram).toContain('API Gateway');
});

test('AI presentation preserves topology, enables slide export, and does not persist keys', async ({
  page,
}) => {
  await example(page);
  let presentationRequests = 0;
  await page.route('https://api.deepseek.com/**', (route) => {
    presentationRequests += 1;
    return route.fulfill({
      json: {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                roles: {
                  U: 'lead-in',
                  API: 'pipeline',
                  AUTH: 'service',
                  S: 'pipeline',
                  DB: 'service',
                  CACHE: 'service',
                },
                mermaidCode: 'flowchart LR; BAD[Replacement]',
              }),
            },
          },
        ],
      },
    });
  });
  await page.getByRole('button', { name: 'Presentation', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  expect(presentationRequests).toBe(0);
  await page.getByRole('button', { name: 'Presentation', exact: true }).click();
  await page.getByLabel('DeepSeek API key').fill('test-key-not-real');
  await page.getByRole('button', { name: 'Save AI settings' }).click();
  await expect(page.getByRole('log')).toContainText('All original nodes');
  const presentationPosition = await page
    .locator('#node-group-API')
    .getAttribute('transform');
  await expect(
    page.getByRole('button', { name: 'Presentation', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Classic', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Classic', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(() => page.locator('#node-group-API').getAttribute('transform'))
    .not.toBe(presentationPosition);
  await page.getByRole('button', { name: 'Presentation', exact: true }).click();
  expect(presentationRequests).toBe(1);
  await expect(page.locator('#node-group-API')).toBeVisible();
  await expect(page.locator('#node-group-BAD')).toHaveCount(0);
  const apiBox = await page.locator('#node-group-API').boundingBox();
  const authBox = await page.locator('#node-group-AUTH').boundingBox();
  expect(authBox!.y).toBeGreaterThan(apiBox!.y);
  await expect
    .poll(() =>
      page
        .locator('#node-group-AUTH')
        .evaluate((node) => Number(getComputedStyle(node).opacity)),
    )
    .toBe(1);
  const keys = await page.evaluate(() => JSON.stringify(localStorage));
  expect(keys).not.toContain('test-key-not-real');
  await page.screenshot({ path: 'test-results/presentation-workspace.png' });
  const png = await exportFile(page, 'Slide PNG');
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  await writeFile('test-results/presentation-slide.png', png);
});

test('configured AI settings can be kept or explicitly reset', async ({ page }) => {
  await example(page);
  await configureAi(page);
  await openMore(page);
  await page.getByRole('button', { name: 'AI settings', exact: true }).click();
  await expect(page.getByLabel('DeepSeek API key')).toHaveAttribute(
    'placeholder',
    'Key configured — leave blank to keep it',
  );
  await page.getByRole('button', { name: 'Save AI settings' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await openMore(page);
  await page.getByRole('button', { name: 'AI settings', exact: true }).click();
  await expect(page.getByText('DeepSeek key configured for this tab')).toBeVisible();
  await page.getByRole('button', { name: 'Reset AI settings' }).click();
  await page.getByRole('button', { name: 'Presentation', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('PNG, SVG, GIF and document exports produce real files with requested framing', async ({
  page,
}) => {
  await example(page);
  await page.getByText('Export', { exact: true }).click();
  await page.getByLabel('Frame size').selectOption('16:9');
  await page.getByText('Export', { exact: true }).click();

  const png = await exportFile(page, 'PNG');
  expect(png.readUInt32BE(16)).toBe(2560);
  expect(png.readUInt32BE(20)).toBe(1440);
  await writeFile('test-results/export.png', png);
  const svg = await exportFile(page, 'SVG');
  expect(svg.toString()).toContain('<svg');
  expect(svg.toString()).not.toContain('<script');
  const gif = await exportFile(page, 'GIF');
  expect(gif.subarray(0, 3).toString()).toBe('GIF');
  expect(gif.readUInt16LE(6)).toBe(2560);
  expect(gif.readUInt16LE(8)).toBe(1440);
  await writeFile('test-results/export.gif', gif);
  const document = JSON.parse((await exportFile(page, 'Editable document')).toString());
  expect(document.version).toBe(1);
  expect(document.source).toContain('API Gateway');
});

test('provider failure is recoverable and cancellation unlocks the editor', async ({
  page,
}) => {
  await example(page);
  await configureAi(page);
  await page.route('https://api.deepseek.com/**', (route) =>
    route.fulfill({ status: 429, body: 'private-provider-detail' }),
  );
  await page.getByLabel('Refine your diagram').fill('Add another API');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('alert')).toContainText('rate limiting');
  await expect(page.locator('#node-group-API')).toBeVisible();
  await page.unroute('https://api.deepseek.com/**');
  await page.route('https://api.deepseek.com/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await route.abort();
  });
  await page.getByRole('button', { name: 'Dismiss error' }).click();
  await page.getByRole('button', { name: 'Send message' }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Send message' })).toBeEnabled();
});

test('mobile, reduced motion, dialog keyboard and screenshots', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await example(page);
  await openMore(page);
  await expect(
    page.getByRole('button', { name: 'Play animation', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Workspace tools', exact: true }).click();
  await expect(page.locator('#pulsegraph-svg')).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  expect(
    await page.locator('.app-header').evaluate((header) => header.scrollWidth),
  ).toBeLessThanOrEqual(
    await page.locator('.app-header').evaluate((header) => header.clientWidth),
  );
  await openMore(page);
  await page.getByRole('button', { name: 'AI settings', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/mobile-workspace.png' });
  await page.setViewportSize({ width: 1440, height: 960 });
  await expect
    .poll(async () => (await page.locator('#pulsegraph-svg').boundingBox())?.width ?? 0)
    .toBeGreaterThan(700);
  expect(
    await page.locator('.app-header').evaluate((header) => header.scrollWidth),
  ).toBeLessThanOrEqual(
    await page.locator('.app-header').evaluate((header) => header.clientWidth),
  );
  await page.screenshot({ path: 'test-results/desktop-workspace.png' });
});

test('source and document imports preserve valid state on invalid files', async ({
  page,
}) => {
  await example(page);
  const input = page.locator('input[type="file"]');
  await input.setInputFiles({
    name: 'flow.mmd',
    mimeType: 'text/plain',
    buffer: Buffer.from('flowchart LR; FIRST[Imported start] --> LAST[Imported end]'),
  });
  await expect(page.locator('#node-group-FIRST')).toBeVisible();
  const document = await exportFile(page, 'Editable document');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('#node-group-API')).toBeVisible();
  await input.setInputFiles({
    name: 'flow.json',
    mimeType: 'application/json',
    buffer: document,
  });
  await expect(page.locator('#node-group-FIRST')).toBeVisible();
  await input.setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"version":999}'),
  });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('#node-group-FIRST')).toBeVisible();
});

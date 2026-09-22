import { test, expect, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { BENEFIT_FLOW } from '../fixtures/benefitFlow';
import { DIAGRAM_EXAMPLES } from '../../src/lib/examples';

test('Secure CI/CD presentation keeps visible corridors between boxes', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const source = DIAGRAM_EXAMPLES.find(
    (example) => example.name === 'Secure CI/CD pipeline',
  )!.source;
  await page.locator('input[type="file"]').setInputFiles({
    name: 'secure-ci-cd.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        source,
        roles: {
          A: 'lead-in',
          B: 'pipeline',
          C: 'pipeline',
          D: 'pipeline',
          E: 'pipeline',
          F: 'pipeline',
          G: 'pipeline',
          H: 'pipeline',
          I: 'pipeline',
          J: 'output',
        },
      }),
    ),
  });
  const presentationButton = page.getByRole('button', {
    name: 'Presentation',
    exact: true,
  });
  await presentationButton.click();
  await expect(presentationButton).toHaveAttribute('aria-pressed', 'true');
  const connectorLengths = await page
    .locator('[id^="path-"]')
    .evaluateAll((paths) =>
      paths.map((path) => (path as SVGPathElement).getTotalLength()),
    );
  expect(Math.min(...connectorLengths)).toBeGreaterThanOrEqual(80);
  await expect(page.locator('[data-edge-label="true"] text')).toContainText([
    'No',
    'Yes',
    'No',
    'Yes',
  ]);
  await page.screenshot({ path: 'test-results/secure-ci-cd-presentation-spacing.png' });
});

test('Classic benefit flow exports neutral retry connectors with separate arrow entries', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'benefits.mmd',
    mimeType: 'text/plain',
    buffer: Buffer.from(BENEFIT_FLOW),
  });
  await page.getByRole('button', { name: 'Classic', exact: true }).click();
  for (const theme of ['light', 'dark']) {
    await openMore(page);
    await page.getByRole('button', { name: `Use ${theme} theme`, exact: true }).click();
    const connectors = await page.locator('#pulsegraph-svg').evaluate((svg) => {
      const paths = Array.from(svg.querySelectorAll<SVGPathElement>('[id^="path-"]'));
      const retry = paths.at(-1)!;
      const incoming = paths[4];
      const end = retry.getPointAtLength(retry.getTotalLength());
      const other = incoming.getPointAtLength(incoming.getTotalLength());
      return {
        strokes: [...new Set(paths.map((path) => path.getAttribute('stroke')))],
        markers: [...new Set(paths.map((path) => path.getAttribute('marker-end')))],
        entryDistance: Math.hypot(end.x - other.x, end.y - other.y),
      };
    });
    expect(connectors.strokes).toEqual([theme === 'light' ? '#CBD5E1' : '#1E293B']);
    expect(connectors.markers).toEqual(['url(#arr)']);
    expect(connectors.entryDistance).toBeGreaterThan(30);
    const gif = await exportFile(page, 'Animated GIF');
    expect(gif.subarray(0, 3).toString()).toBe('GIF');
    await writeFile(`test-results/benefits-classic-${theme}.gif`, gif);
  }
});

async function example(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /^Production API architecture/ }).click();
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
    const headerColors: string[] = [];
    for (const theme of ['light', 'dark']) {
      await page.getByRole('button', { name: `Use ${theme} theme`, exact: true }).click();
      await expect(page.getByRole('button', { name: 'Workspace tools' })).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Import diagram', exact: true }),
      ).toBeVisible();
      await page
        .getByRole('navigation', { name: 'Diagram tools' })
        .getByRole('button', { name: 'AI settings', exact: true })
        .click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      const header = page.locator('.app-header');
      expect(await header.evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      const headerColor = await header.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      );
      expect(headerColor).not.toBe('rgba(0, 0, 0, 0)');
      headerColors.push(headerColor);
      await page.screenshot({ path: `test-results/landing-${theme}-${width}.png` });
    }
    expect(headerColors[0]).not.toBe(headerColors[1]);
  }
});

test('browser showcase adds responsive depth and respects reduced motion', async ({
  page,
}) => {
  await page.goto('/');
  await page.setViewportSize({ width: 1440, height: 900 });
  const stage = page.locator('.browser-stage');
  const shot = stage.locator('.browser-shot');
  await stage.scrollIntoViewIfNeeded();
  await expect(shot).toBeVisible();
  await expect(shot.locator('img')).toHaveJSProperty('complete', true);

  const bounds = await stage.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(
    bounds!.x + bounds!.width * 0.85,
    bounds!.y + bounds!.height * 0.25,
  );
  await expect
    .poll(() => shot.evaluate((element) => element.style.getPropertyValue('--tilt-y')))
    .not.toBe('-3deg');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(shot).toHaveCSS('transform', 'none');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.browser-float-render')).toBeHidden();
  expect(
    await page.locator('.landing-page').evaluate((element) => element.scrollWidth),
  ).toBeLessThanOrEqual(390);
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
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(
    await page
      .locator('.preview-beams path')
      .first()
      .evaluate((path) => getComputedStyle(path).animationPlayState),
  ).toBe('paused');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
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
    await page
      .getByRole('navigation', { name: 'Footer', exact: true })
      .getByRole('button', { name: 'AI settings', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.screenshot({ path: `test-results/landing-footer-${width}.png` });
    await page
      .getByRole('navigation', { name: 'Footer', exact: true })
      .getByRole('link', { name: 'Examples', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: /^Incident response/ }),
    ).toBeInViewport();
  }
  for (const name of [
    'Production API architecture',
    'Incident response',
    'Secure CI/CD pipeline',
  ]) {
    await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
    await expect(page.locator('#pulsegraph-svg')).toBeVisible();
    await expect(page.locator('[id^="node-group-"]').first()).toHaveCSS('opacity', '1');
    await expect(page.locator('.workspace-summary')).toContainText('connections');
    await openMore(page);
    await expect(
      page.getByRole('button', { name: 'Reset workspace', exact: true }),
    ).toBeVisible();
    const slug = name.replaceAll(/[^a-z0-9]+/gi, '-');
    await page.screenshot({ path: `test-results/menu-${slug}.png` });
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

test('presentation decision loops do not overlap semantic zone borders', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const source = `flowchart LR
    A[Start] --> B{Is it working?}
    B -->|Yes| D[Ship it]
    B -->|No| C[Debug]
    C --> B`;
  const roles = {
    A: 'lead-in',
    B: 'pipeline',
    C: 'pipeline',
    D: 'output',
  };
  await page.locator('input[type="file"]').setInputFiles({
    name: 'decision-loop.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: 1, source, roles })),
  });
  await page.getByRole('button', { name: 'Presentation', exact: true }).click();
  await expect(page.locator('[id^="group-zone_"]')).toHaveCount(3);

  const borderRuns = await page.locator('#pulsegraph-svg').evaluate((svg) => {
    const boundaries = Array.from(
      svg.querySelectorAll('[id^="group-zone_"] rect'),
    ).flatMap((rect) => {
      const y = Number(rect.getAttribute('y'));
      return [y, y + Number(rect.getAttribute('height'))];
    });
    return Array.from(svg.querySelectorAll<SVGPathElement>('[id^="path-"]')).map(
      (path) => {
        const length = path.getTotalLength();
        return boundaries.reduce((longest, boundary) => {
          let run = 0;
          let maxRun = 0;
          for (let offset = 0; offset <= length; offset += 2) {
            if (Math.abs(path.getPointAtLength(offset).y - boundary) < 0.5) {
              run += 2;
              maxRun = Math.max(maxRun, run);
            } else {
              run = 0;
            }
          }
          return Math.max(longest, maxRun);
        }, 0);
      },
    );
  });
  expect(Math.max(...borderRuns)).toBeLessThanOrEqual(4);
  expect(await page.locator('#path-e_4').getAttribute('d')).not.toBe(
    await page.locator('#path-e_3').getAttribute('d'),
  );
  await page.screenshot({ path: 'test-results/presentation-decision-loop.png' });
  const gif = await exportFile(page, 'Animated GIF');
  expect(gif.subarray(0, 3).toString()).toBe('GIF');
  await writeFile('test-results/presentation-decision-loop.gif', gif);
});

test('rich and classic retain moving markers clear of node boxes', async ({ page }) => {
  await page.goto('/');
  const source = `flowchart LR
    G[GitHub] --> T[Tests]
    T --> P{Pass?}
    P -->|No| F[Fix code]
    F --> G
    P -->|Yes| B[Build container]
    B --> D[Deploy]`;
  await page.locator('input[type="file"]').setInputFiles({
    name: 'ci-loop.mmd',
    mimeType: 'text/plain',
    buffer: Buffer.from(source),
  });

  for (const mode of ['Rich', 'Classic']) {
    await page.getByRole('button', { name: mode, exact: true }).click();
    await page.waitForTimeout(3600);
    await expect(page.locator('[id^="pulse-"]').first()).toBeAttached();
    const firstPulse = page.locator('[id^="pulse-"]').first();
    await expect(firstPulse).toHaveCSS('opacity', '1');
    const initialTransform = await firstPulse.getAttribute('transform');
    await expect
      .poll(() => firstPulse.getAttribute('transform'))
      .not.toBe(initialTransform);
    const overlapping = await page.locator('#pulsegraph-svg').evaluate((svg) => {
      const boxes = Array.from(svg.querySelectorAll('[data-node-body="true"]')).map(
        (node) => node.getBoundingClientRect(),
      );
      return Array.from(svg.querySelectorAll('[id^="pulse-"]')).some((pulse) => {
        if (getComputedStyle(pulse).opacity === '0') return false;
        const marker = pulse.getBoundingClientRect();
        return boxes.some(
          (box) =>
            marker.left < box.right &&
            marker.right > box.left &&
            marker.top < box.bottom &&
            marker.bottom > box.top,
        );
      });
    });
    expect(overlapping, `${mode} pulse marker overlaps a node`).toBe(false);
    const labelsAreTopmost = await page.locator('#pulsegraph-svg').evaluate((svg) =>
      Array.from(svg.querySelectorAll<SVGGElement>('[data-edge-label="true"]')).every(
        (label) => {
          const pulse = label.parentElement?.querySelector<SVGElement>('[id^="pulse-"]');
          return Boolean(
            pulse &&
            pulse.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING,
          );
        },
      ),
    );
    expect(labelsAreTopmost, `${mode} edge labels should render above markers`).toBe(
      true,
    );
  }
});

test('delivery example preserves branch semantics and clear retry lanes in every mode', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const source = `flowchart LR
    A[GitHub] --> B[Tests]
    B --> C{Pass?}
    C -->|Yes| D[Build container]
    D --> E[Deploy]
    C -->|No| F[Fix code]
    F --> A`;
  await page.locator('input[type="file"]').setInputFiles({
    name: 'delivery.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        source,
        roles: {
          A: 'lead-in',
          B: 'pipeline',
          C: 'pipeline',
          D: 'pipeline',
          E: 'output',
          F: 'pipeline',
        },
      }),
    ),
  });

  const retryClearsNodes = () =>
    page.locator('#pulsegraph-svg').evaluate((svg) => {
      const nodes = Array.from(svg.querySelectorAll('[id^="node-group-"]'));
      const nodeBottom = Math.max(
        ...nodes.map((node) => node.getBoundingClientRect().bottom),
      );
      const retry = Array.from(svg.querySelectorAll<SVGPathElement>('[id^="path-"]')).at(
        -1,
      )!;
      const matrix = retry.getScreenCTM()!;
      let routeBottom = -Infinity;
      for (let distance = 0; distance <= retry.getTotalLength(); distance += 2) {
        const point = retry.getPointAtLength(distance).matrixTransform(matrix);
        routeBottom = Math.max(routeBottom, point.y);
      }
      return routeBottom > nodeBottom + 8;
    });

  for (const mode of ['Classic', 'Rich', 'Flow']) {
    await page.getByRole('button', { name: mode, exact: true }).click();
    await expect.poll(retryClearsNodes).toBe(true);
    await page.screenshot({ path: `test-results/delivery-${mode.toLowerCase()}.png` });
    const gif = await exportFile(page, 'Animated GIF');
    expect(gif.subarray(0, 3).toString()).toBe('GIF');
    await writeFile(`test-results/delivery-${mode.toLowerCase()}.gif`, gif);
  }

  await page.getByRole('button', { name: 'Rich', exact: true }).click();
  await page.getByRole('button', { name: 'Presentation', exact: true }).click();
  await expect(page.locator('[data-edge-label="true"] text')).toContainText([
    'Yes',
    'No',
  ]);
  const presentationLabelsAreTopmost = await page
    .locator('#pulsegraph-svg')
    .evaluate((svg) =>
      Array.from(svg.querySelectorAll<SVGGElement>('[data-edge-label="true"]')).every(
        (label) => {
          const pulse = label.parentElement?.querySelector<SVGElement>('[id^="pulse-"]');
          return Boolean(
            pulse &&
            pulse.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING,
          );
        },
      ),
    );
  expect(presentationLabelsAreTopmost).toBe(true);
  const positions = await page.locator('#pulsegraph-svg').evaluate((svg) => {
    const box = (id: string) =>
      svg.querySelector(`#node-group-${id}`)!.getBoundingClientRect();
    const center = (rect: DOMRect) => ({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
    return {
      build: center(box('D')),
      deploy: center(box('E')),
      fix: center(box('F')),
    };
  });
  expect(Math.abs(positions.build.y - positions.deploy.y)).toBeLessThan(2);
  expect(Math.abs(positions.build.x - positions.fix.x)).toBeLessThan(2);
  expect(positions.fix.y).toBeGreaterThan(positions.build.y + 40);
  await expect.poll(retryClearsNodes).toBe(true);
  await page.screenshot({ path: 'test-results/delivery-presentation.png' });
  const presentationGif = await exportFile(page, 'Animated GIF');
  expect(presentationGif.subarray(0, 3).toString()).toBe('GIF');
  await writeFile('test-results/delivery-presentation.gif', presentationGif);
});

test('Flow appearance uses rounded connectors, flowing segments and varied icons', async ({
  page,
}) => {
  await example(page);
  await page.getByRole('button', { name: 'Flow', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Flow', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('#pulsegraph-svg')).toHaveAttribute(
    'data-visual-style',
    'flow',
  );
  await expect(page.locator('.flow-segment')).toHaveCount(8);
  expect(
    await page
      .locator('[id^="path-"]')
      .evaluateAll((paths) =>
        paths.some((path) => path.getAttribute('d')?.includes(' Q ')),
      ),
  ).toBe(true);
  expect(
    await page.locator('#pulsegraph-svg .flow-node-icon').count(),
  ).toBeGreaterThanOrEqual(5);
  expect(
    await page.locator('#pulsegraph-svg .step-badge').count(),
  ).toBeGreaterThanOrEqual(5);
  await expect
    .poll(() =>
      page
        .locator('[id^="node-group-"]')
        .last()
        .evaluate((node) => Number(getComputedStyle(node).opacity)),
    )
    .toBe(1);
  await page.screenshot({ path: 'test-results/flow-appearance.png' });

  const flowSvg = (await exportFile(page, 'SVG')).toString();
  expect(flowSvg).toContain('data-visual-style="flow"');
  expect(flowSvg).toContain('class="flow-segment"');
  expect(flowSvg).toContain('stroke-dasharray=');
  expect(flowSvg).toContain('stroke-dashoffset=');
  const flowPng = await exportFile(page, 'PNG');
  expect(flowPng.subarray(1, 4).toString()).toBe('PNG');
  await writeFile('test-results/flow-export.png', flowPng);
  const flowGif = await exportFile(page, 'Animated GIF');
  expect(flowGif.subarray(0, 3).toString()).toBe('GIF');
  expect(flowGif.length).toBeGreaterThan(10_000);
  await writeFile('test-results/flow-export.gif', flowGif);

  await page.getByRole('button', { name: 'Rich', exact: true }).click();
  await expect(page.locator('#pulsegraph-svg')).toHaveAttribute(
    'data-visual-style',
    'rich',
  );
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
  await expect(page.getByRole('heading', { name: /Mermaid in/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: /Mermaid in/ })).toBeVisible();
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
  expect(refinement?.currentDiagram).toBe(
    DIAGRAM_EXAMPLES.find((example) => example.name === 'Production API architecture')!
      .source,
  );
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
                  CDN: 'pipeline',
                  WAF: 'pipeline',
                  LB: 'pipeline',
                  API: 'pipeline',
                  AUTH: 'service',
                  DB: 'service',
                  CACHE: 'service',
                  OBS: 'output',
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
  const apiPosition = () =>
    page.locator('#node-group-API [data-node-body]').evaluate((node) => {
      const box = node.getBoundingClientRect();
      return { x: box.x, y: box.y };
    });
  const presentationPosition = await apiPosition();
  await expect(
    page.getByRole('button', { name: 'Presentation', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Classic', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Classic', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(apiPosition).not.toEqual(presentationPosition);
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
    'Key configured. Leave blank to keep it.',
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
  const gif = await exportFile(page, 'Animated GIF');
  expect(gif.subarray(0, 3).toString()).toBe('GIF');
  expect(gif.readUInt16LE(6)).toBe(2560);
  expect(gif.readUInt16LE(8)).toBe(1440);
  await writeFile('test-results/export.gif', gif);
  const document = JSON.parse((await exportFile(page, 'Editable document')).toString());
  expect(document.version).toBe(1);
  expect(document.source).toBe(
    DIAGRAM_EXAMPLES.find((example) => example.name === 'Production API architecture')!
      .source,
  );
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

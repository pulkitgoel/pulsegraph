import { expect, test } from '@playwright/test';

test('presentation checkout spine has no small steps between measured icons', async ({
  page,
}) => {
  await page.goto('/');
  const source = `flowchart LR
Customer[Customer] --> Checkout[Checkout]
Checkout --> Decision{Payment approved?}
Decision -->|Yes| Order[Order service]
Order --> Receipt[Receipt email]
Decision -->|No| Retry[Retry payment]`;
  const ids = ['Customer', 'Checkout', 'Decision', 'Order', 'Receipt', 'Retry'];
  await page.locator('input[type="file"]').setInputFiles({
    name: 'checkout.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        source,
        roles: Object.fromEntries(ids.map((id) => [id, 'pipeline'])),
        presentation: {
          title: 'Checkout',
          mainPath: ids.slice(0, 5),
          lanes: [{ title: 'Checkout', kind: 'journey', nodeIds: ids }],
        },
      }),
    ),
  });
  await page.getByRole('button', { name: 'Presentation', exact: true }).click();
  await expect(page.locator('[data-slide-edges] path')).toHaveCount(5);
  const spine = await page.locator('[data-slide-edges] path').evaluateAll((elements) =>
    elements.slice(0, 4).map((element) => {
      const path = element as SVGPathElement;
      const length = path.getTotalLength();
      const samples = Array.from({ length: 21 }, (_, i) =>
        path.getPointAtLength((length * i) / 20),
      );
      return Math.max(...samples.map((p) => p.y)) - Math.min(...samples.map((p) => p.y));
    }),
  );
  expect(spine.every((range) => range < 0.01)).toBe(true);
  await expect(page.locator('[data-slide-labels] [data-edge-label]')).toHaveCount(2);
});

test('cache branch labels stay separate and arrows approach boxes straight', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Diagram description or Mermaid source' })
    .fill(`flowchart TB
Customer[Customer] -->|request| APIGW[API Gateway]
APIGW -->|auth| Auth[Auth Service]
Auth -->|forward| API[API Service]
API -->|read| Redis[Redis Cache]
Redis -->|hit| Response[Response]
Redis -->|miss| PG[PostgreSQL]
PG -->|update| Redis
PG -->|return| Response
API -.->|logs| Monitoring[Monitoring Service]`);
  await page.getByRole('button', { name: 'Animate my diagram' }).click();
  for (const mode of ['Classic', 'Rich', 'Flow']) {
    await page.getByRole('button', { name: mode, exact: true }).click();
    await page.waitForTimeout(2200);
    const state = await page.locator('#pulsegraph-svg').evaluate((svg) => {
      const boxes = Array.from(svg.querySelectorAll('[data-edge-label="true"] rect')).map(
        (rect) => rect.getBoundingClientRect(),
      );
      const overlap = boxes.some((a, i) =>
        boxes
          .slice(i + 1)
          .some(
            (b) =>
              a.left < b.right &&
              a.right > b.left &&
              a.top < b.bottom &&
              a.bottom > b.top,
          ),
      );
      const paths = Array.from(svg.querySelectorAll<SVGPathElement>('[id^="path-"]'));
      return {
        labels: boxes.length,
        overlap,
        arrows: paths.filter((path) =>
          path.getAttribute('marker-end')?.startsWith('url('),
        ).length,
        straightApproaches: paths.every((path) => {
          const length = path.getTotalLength();
          const end = path.getPointAtLength(length);
          const approach = path.getPointAtLength(Math.max(0, length - 2));
          return Math.abs(end.x - approach.x) < 0.1 || Math.abs(end.y - approach.y) < 0.1;
        }),
      };
    });
    expect(state, mode).toEqual({
      labels: 9,
      overlap: false,
      arrows: 9,
      straightApproaches: true,
    });
  }
});

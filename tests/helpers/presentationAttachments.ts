import { expect, type Page } from '@playwright/test';
import type { GraphEdge } from '../../src/types';

/** Verify rendered glyphs, not the invisible node+label rectangles. */
export async function assertPresentationAttachments(page: Page, edges: GraphEdge[]) {
  const result = await page.locator('#pulsegraph-svg').evaluate(
    (svg, connections) => {
      const screen = (element: SVGGraphicsElement, point: { x: number; y: number }) =>
        new DOMPoint(point.x, point.y).matrixTransform(element.getScreenCTM()!);
      const distanceToSegment = (p: DOMPoint, a: DOMPoint, b: DOMPoint) => {
        const dx = b.x - a.x,
          dy = b.y - a.y;
        const t = Math.max(
          0,
          Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)),
        );
        return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
      };
      const labelBoxes = [
        ...svg.querySelectorAll<SVGTextElement>('.node-group text'),
      ].map((text) => text.getBoundingClientRect());
      const gaps: { edge: string; node: string; gap: number }[] = [];
      const crossedLabels: string[] = [];
      for (const edge of connections) {
        const path = svg.querySelector<SVGPathElement>(`#path-${CSS.escape(edge.id)}`)!;
        const length = path.getTotalLength();
        for (const [id, distance] of [
          [edge.from, 0],
          [edge.to, length],
        ] as const) {
          const icon = svg.querySelector<SVGGElement>(
            `[data-slide-icon="${CSS.escape(id)}"]`,
          )!;
          const point = screen(path, path.getPointAtLength(distance));
          let boundary: DOMPoint[];
          const polygon = icon.querySelector<SVGPolygonElement>('polygon');
          if (icon.dataset.iconShape === 'diamond' && polygon) {
            boundary = Array.from({ length: polygon.points.numberOfItems }, (_, i) =>
              screen(polygon, polygon.points.getItem(i)),
            );
          } else {
            const box = icon.getBBox();
            boundary = [
              { x: box.x, y: box.y },
              { x: box.x + box.width, y: box.y },
              { x: box.x + box.width, y: box.y + box.height },
              { x: box.x, y: box.y + box.height },
            ].map((p) => screen(icon, p));
          }
          gaps.push({
            edge: edge.id,
            node: id,
            gap: Math.min(
              ...boundary.map((a, i) =>
                distanceToSegment(point, a, boundary[(i + 1) % boundary.length]),
              ),
            ),
          });
        }
        for (let distance = 0; distance <= length; distance += 2) {
          const point = screen(path, path.getPointAtLength(distance));
          if (
            labelBoxes.some(
              (box) =>
                point.x > box.left - 1 &&
                point.x < box.right + 1 &&
                point.y > box.top - 1 &&
                point.y < box.bottom + 1,
            )
          ) {
            crossedLabels.push(edge.id);
            break;
          }
        }
      }
      return { gaps, crossedLabels };
    },
    edges.map(({ id, from, to }) => ({ id, from, to })),
  );
  expect(result.crossedLabels, 'arrows must not pass through component labels').toEqual(
    [],
  );
  for (const item of result.gaps)
    expect(item.gap, `${item.edge} must attach to the ${item.node} glyph`).toBeLessThan(
      4,
    );
}

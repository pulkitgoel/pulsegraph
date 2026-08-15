/**
 * Where to place an edge's label along its routed polyline.
 *
 * Straight 2-point connectors are labeled at their middle. Multi-point routed
 * arcs are labeled a short distance from the SOURCE end — a "yes"/"no" label
 * belongs next to the decision node, not at some corner of a long detour lane
 * in empty space.
 */
export interface Pt { x: number; y: number }

export function labelAnchor(points: Pt[] | undefined): Pt | null {
  if (!points || points.length < 2) return null;

  const segs: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const l = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    segs.push(l);
    total += l;
  }
  if (total === 0) return points[0];

  const d = points.length === 2 ? total / 2 : Math.min(70, total / 2);

  let acc = 0;
  for (let i = 0; i < segs.length; i++) {
    if (acc + segs[i] >= d) {
      const t = segs[i] === 0 ? 0 : (d - acc) / segs[i];
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * t,
        y: points[i].y + (points[i + 1].y - points[i].y) * t,
      };
    }
    acc += segs[i];
  }
  return points[points.length - 1];
}

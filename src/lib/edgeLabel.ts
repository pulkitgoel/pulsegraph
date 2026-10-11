/**
 * Where to place an edge's label along its routed polyline.
 *
 * Straight 2-point connectors are labeled at their middle. Multi-point routed
 * arcs are labeled a short distance from the SOURCE end — a "yes"/"no" label
 * belongs next to the decision node, not at some corner of a long detour lane
 * in empty space.
 */
import type { GraphEdge, GraphNode } from '../types';

export interface Pt {
  x: number;
  y: number;
}

export interface EdgeLabelPlacement extends Pt {
  width: number;
  height: number;
  anchor: Pt;
  /** The caller must reject this layout instead of treating a fallback as clear. */
  clearanceFailed?: boolean;
}

/** Place the complete set together, on clear straight runs rather than bends. */
export function placeEdgeLabels(
  edges: GraphEdge[],
  nodes: GraphNode[],
  style = { charWidth: 6.2, padding: 16, minWidth: 36, height: 24 },
): Map<string, EdgeLabelPlacement> {
  const result = new Map<string, EdgeLabelPlacement>();
  type Box = { left: number; right: number; top: number; bottom: number };
  const nodeBoxes: Box[] = nodes.map((node) => ({
    left: node.x! - node.width / 2 - 8,
    right: node.x! + node.width / 2 + 8,
    top: node.y! - node.height / 2 - 16,
    bottom: node.y! + node.height / 2 + 8,
  }));
  const occupied: Box[] = [];
  const overlaps = (a: Box, b: Box) =>
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const crosses = (a: Pt, b: Pt, box: Box) =>
    Math.max(a.x, b.x) > box.left &&
    Math.min(a.x, b.x) < box.right &&
    Math.max(a.y, b.y) > box.top &&
    Math.min(a.y, b.y) < box.bottom;

  // Give long labels first choice, rather than stranding them in gaps left by
  // short labels. The ordering is deterministic and never changes label text.
  for (const edge of [...edges].sort(
    (a, b) => (b.label?.length ?? 0) - (a.label?.length ?? 0),
  )) {
    if (!edge.label) continue;
    const points = edge.points ?? [];
    const preferred = labelAnchor(points);
    if (!preferred) continue;
    const plain = edge.label.replace(/<[^>]+>/g, '');
    const width = Math.max(
      style.minWidth,
      plain.length * style.charWidth + style.padding,
    );
    const height = style.height;
    const candidates: (EdgeLabelPlacement & { score: number })[] = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
      const dx = b.x - a.x,
        dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      if (!length) continue;
      const horizontal = Math.abs(dx) >= Math.abs(dy);
      const clearance = Math.min(4, length / 2);
      const projected =
        ((preferred.x - a.x) * dx + (preferred.y - a.y) * dy) / (length * length);
      for (const fraction of [
        Math.max(clearance / length, Math.min(1 - clearance / length, projected)),
        0.5,
        0.25,
        0.75,
        0.1,
        0.9,
      ]) {
        if (fraction * length < clearance || (1 - fraction) * length < clearance)
          continue;
        const anchor = { x: a.x + dx * fraction, y: a.y + dy * fraction };
        for (const offset of [
          0,
          -height - 8,
          height + 8,
          -height * 2 - 12,
          height * 2 + 12,
          -height * 3 - 16,
          height * 3 + 16,
          -height * 4 - 20,
          height * 4 + 20,
          -height * 6 - 24,
          height * 6 + 24,
          -height * 8 - 28,
          height * 8 + 28,
        ]) {
          const x = anchor.x + (horizontal ? 0 : offset);
          const y = anchor.y + (horizontal ? offset : 0);
          candidates.push({
            x,
            y,
            width,
            height,
            anchor,
            score:
              Math.hypot(anchor.x - preferred.x, anchor.y - preferred.y) +
              Math.abs(offset) * 3,
          });
        }
      }
    }
    candidates.sort((a, b) => a.score - b.score);
    const placement = candidates.find((candidate) => {
      const box = {
        left: candidate.x - width / 2 - 4,
        right: candidate.x + width / 2 + 4,
        top: candidate.y - height / 2 - 4,
        bottom: candidate.y + height / 2 + 4,
      };
      if (box.left < 4 || box.top < 4) return false;
      return (
        ![...nodeBoxes, ...occupied].some((other) => overlaps(box, other)) &&
        !edges.some(
          (other) =>
            other.id !== edge.id &&
            (other.points ?? []).some(
              (point, i, route) => i > 0 && crosses(route[i - 1], point, box),
            ),
        )
      );
    }) ?? { ...preferred, width, height, anchor: preferred, clearanceFailed: true };
    result.set(edge.id, placement);
    occupied.push({
      left: placement.x - width / 2 - 4,
      right: placement.x + width / 2 + 4,
      top: placement.y - height / 2 - 4,
      bottom: placement.y + height / 2 + 4,
    });
  }
  return result;
}

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

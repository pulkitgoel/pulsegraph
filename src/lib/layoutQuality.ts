import type { Graph } from '../types';
import { placeEdgeLabels, type EdgeLabelPlacement, type Pt } from './edgeLabel';

type Box = { left: number; right: number; top: number; bottom: number };
export interface LayoutIssue {
  code:
    | 'invalid-geometry'
    | 'node-overlap'
    | 'edge-through-node'
    | 'label-overlap'
    | 'label-on-edge'
    | 'shared-route'
    | 'edge-crossing'
    | 'short-approach'
    | 'short-jog';
  ids: string[];
}
export interface LayoutQuality {
  issues: LayoutIssue[];
  /** Compare correctness, ambiguous rails, short steps/approaches, crossings, bends, length, area. */
  cost: number[];
}
const EPS = 0.01;
const overlaps = (a: Box, b: Box) =>
  a.left < b.right - EPS &&
  a.right > b.left + EPS &&
  a.top < b.bottom - EPS &&
  a.bottom > b.top + EPS;

/** Interior intersection, including diagonals; touching a border is allowed. */
export function segmentIntersectsBox(a: Pt, b: Pt, box: Box): boolean {
  let low = 0,
    high = 1;
  for (const [start, delta, min, max] of [
    [a.x, b.x - a.x, box.left + EPS, box.right - EPS],
    [a.y, b.y - a.y, box.top + EPS, box.bottom - EPS],
  ]) {
    if (Math.abs(delta) < EPS) {
      if (start < min || start > max) return false;
    } else {
      const p = (min - start) / delta,
        q = (max - start) / delta;
      low = Math.max(low, Math.min(p, q));
      high = Math.min(high, Math.max(p, q));
      if (low > high) return false;
    }
  }
  return low <= high;
}

/** Independent of the router. Never equates a pretty layout with semantic correctness. */
export function inspectLayout(
  graph: Graph,
  labels: Map<string, EdgeLabelPlacement> | false = placeEdgeLabels(
    graph.edges,
    graph.nodes,
  ),
): LayoutQuality {
  const issues: LayoutIssue[] = [];
  const nodeBoxes = graph.nodes.map((node) => ({
    id: node.id,
    left: node.x! - node.width / 2,
    right: node.x! + node.width / 2,
    top: node.y! - node.height / 2,
    bottom: node.y! + node.height / 2,
  }));
  let correctness = 0,
    ambiguity = 0,
    jogs = 0,
    bends = 0,
    crossings = 0,
    length = 0;
  const segments: { id: string; a: Pt; b: Pt }[] = [];
  for (const node of graph.nodes) {
    if (
      ![node.x, node.y, node.width, node.height].every(Number.isFinite) ||
      node.width <= 0 ||
      node.height <= 0
    ) {
      issues.push({ code: 'invalid-geometry', ids: [node.id] });
      correctness++;
    }
  }
  nodeBoxes.forEach((box, i) => {
    for (const other of nodeBoxes.slice(i + 1))
      if (overlaps(box, other)) {
        issues.push({ code: 'node-overlap', ids: [box.id, other.id] });
        correctness++;
      }
  });
  for (const edge of graph.edges) {
    const points = edge.points ?? [];
    if (
      points.length < 2 ||
      points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y)) ||
      !graph.nodes.some((n) => n.id === edge.from) ||
      !graph.nodes.some((n) => n.id === edge.to)
    ) {
      issues.push({ code: 'invalid-geometry', ids: [edge.id] });
      correctness++;
      continue;
    }
    const valid = points.filter(
      (p, i) => !i || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > EPS,
    );
    if (valid.length < 2) {
      issues.push({ code: 'invalid-geometry', ids: [edge.id] });
      correctness++;
      continue;
    }
    for (const box of nodeBoxes) {
      if (box.id === edge.from || box.id === edge.to) continue;
      if (valid.some((p, i) => i > 0 && segmentIntersectsBox(valid[i - 1], p, box))) {
        issues.push({ code: 'edge-through-node', ids: [edge.id, box.id] });
        correctness++;
      }
    }
    for (let i = 1; i < valid.length; i++) {
      const a = valid[i - 1],
        b = valid[i];
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      length += distance;
      segments.push({ id: edge.id, a, b });
      if (valid.length > 2 && i === valid.length - 1 && distance < 24) {
        issues.push({ code: 'short-approach', ids: [edge.id] });
        jogs++;
      }
      if (i > 1) {
        const previous = valid[i - 2];
        if (
          Math.abs((a.x - previous.x) * (b.y - a.y) - (a.y - previous.y) * (b.x - a.x)) >
          EPS
        )
          bends++;
      }
      // A tiny internal step between bends is visual noise; short straight edges and arrow tips are valid.
      if (
        i > 1 &&
        i < valid.length - 1 &&
        distance < 12 &&
        distance > EPS &&
        Math.abs(
          (a.x - valid[i - 2].x) * (b.y - a.y) - (a.y - valid[i - 2].y) * (b.x - a.x),
        ) > EPS &&
        Math.abs(
          (b.x - a.x) * (valid[i + 1].y - b.y) - (b.y - a.y) * (valid[i + 1].x - b.x),
        ) > EPS
      ) {
        issues.push({ code: 'short-jog', ids: [edge.id] });
        jogs++;
      }
    }
  }
  const shared = new Set<string>();
  segments.forEach((s, i) => {
    for (const t of segments.slice(i + 1)) {
      if (s.id === t.id) continue;
      const sv = Math.abs(s.a.x - s.b.x) < EPS,
        tv = Math.abs(t.a.x - t.b.x) < EPS;
      const sh = Math.abs(s.a.y - s.b.y) < EPS,
        th = Math.abs(t.a.y - t.b.y) < EPS;
      const overlapLength =
        sv && tv && Math.abs(s.a.x - t.a.x) < EPS
          ? Math.min(Math.max(s.a.y, s.b.y), Math.max(t.a.y, t.b.y)) -
            Math.max(Math.min(s.a.y, s.b.y), Math.min(t.a.y, t.b.y))
          : sh && th && Math.abs(s.a.y - t.a.y) < EPS
            ? Math.min(Math.max(s.a.x, s.b.x), Math.max(t.a.x, t.b.x)) -
              Math.max(Math.min(s.a.x, s.b.x), Math.min(t.a.x, t.b.x))
            : 0;
      const key = [s.id, t.id].sort().join('\0');
      if (overlapLength > 4 && !shared.has(key)) {
        shared.add(key);
        issues.push({ code: 'shared-route', ids: [s.id, t.id] });
        ambiguity++;
      }
      if (
        (sv &&
          th &&
          s.a.x > Math.min(t.a.x, t.b.x) + EPS &&
          s.a.x < Math.max(t.a.x, t.b.x) - EPS &&
          t.a.y > Math.min(s.a.y, s.b.y) + EPS &&
          t.a.y < Math.max(s.a.y, s.b.y) - EPS) ||
        (sh &&
          tv &&
          t.a.x > Math.min(s.a.x, s.b.x) + EPS &&
          t.a.x < Math.max(s.a.x, s.b.x) - EPS &&
          s.a.y > Math.min(t.a.y, t.b.y) + EPS &&
          s.a.y < Math.max(t.a.y, t.b.y) - EPS)
      ) {
        issues.push({ code: 'edge-crossing', ids: [s.id, t.id] });
        crossings++;
      }
    }
  });
  const labelBoxes: (Box & { id: string })[] = [];
  if (labels)
    for (const edge of graph.edges.filter((e) => e.label)) {
      const label = labels.get(edge.id);
      if (
        !label ||
        ![label.x, label.y, label.width, label.height].every(Number.isFinite)
      ) {
        issues.push({ code: 'invalid-geometry', ids: [edge.id] });
        correctness++;
        continue;
      }
      const box = {
        id: edge.id,
        left: label.x - label.width / 2,
        right: label.x + label.width / 2,
        top: label.y - label.height / 2,
        bottom: label.y + label.height / 2,
      };
      if (label.clearanceFailed) {
        issues.push({ code: 'label-overlap', ids: [edge.id] });
        correctness++;
      }
      for (const other of [...nodeBoxes, ...labelBoxes])
        if (overlaps(box, other)) {
          issues.push({ code: 'label-overlap', ids: [edge.id, other.id] });
          correctness++;
        }
      if (segments.some((s) => s.id !== edge.id && segmentIntersectsBox(s.a, s.b, box))) {
        issues.push({ code: 'label-on-edge', ids: [edge.id] });
        correctness++;
      }
      labelBoxes.push(box);
    }
  const boxes = [...nodeBoxes, ...labelBoxes];
  const all = [
    ...boxes.flatMap((b) => [
      { x: b.left, y: b.top },
      { x: b.right, y: b.bottom },
    ]),
    ...segments.flatMap((s) => [s.a, s.b]),
  ];
  const area = all.length
    ? (Math.max(...all.map((p) => p.x)) - Math.min(...all.map((p) => p.x))) *
      (Math.max(...all.map((p) => p.y)) - Math.min(...all.map((p) => p.y)))
    : 0;
  return { issues, cost: [correctness, ambiguity, jogs, crossings, bends, length, area] };
}

export function compareLayoutQuality(a: LayoutQuality, b: LayoutQuality): number {
  for (let i = 0; i < a.cost.length; i++)
    if (Math.abs(a.cost[i] - b.cost[i]) > EPS) return a.cost[i] - b.cost[i];
  return 0;
}

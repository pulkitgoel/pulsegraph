import type { Graph, GraphEdge, GraphNode } from '../types';
import type { PresentationPlan, PresentationLane } from './presentationPlan';
import { presentationLabel } from './presentationLabel';

type Point = { x: number; y: number };
type Box = { left: number; right: number; top: number; bottom: number };
export interface SlideLane extends PresentationLane {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface PresentationScene {
  graph: Graph;
  lanes: SlideLane[];
  width: number;
  height: number;
  labels: Record<string, Point>;
  warnings: string[];
}
const boxOf = (node: GraphNode, padding = 0): Box => ({
  left: node.x! - node.width / 2 - padding,
  right: node.x! + node.width / 2 + padding,
  top: node.y! - node.height / 2 - padding,
  bottom: node.y! + node.height / 2 + padding,
});
const inside = (point: Point, box: Box) =>
  point.x > box.left && point.x < box.right && point.y > box.top && point.y < box.bottom;
const blocked = (a: Point, b: Point, box: Box) =>
  a.x === b.x
    ? a.x > box.left &&
      a.x < box.right &&
      Math.max(a.y, b.y) > box.top &&
      Math.min(a.y, b.y) < box.bottom
    : a.y > box.top &&
      a.y < box.bottom &&
      Math.max(a.x, b.x) > box.left &&
      Math.min(a.x, b.x) < box.right;
const overlap = (a: Point, b: Point, c: Point, d: Point) =>
  a.x === b.x && c.x === d.x && a.x === c.x
    ? Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) -
      Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y))
    : a.y === b.y && c.y === d.y && a.y === c.y
      ? Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) -
        Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x))
      : 0;

function simplify(points: Point[]) {
  return points.filter(
    (point, i) =>
      !i ||
      i === points.length - 1 ||
      !(
        (points[i - 1].x === point.x && points[i + 1].x === point.x) ||
        (points[i - 1].y === point.y && points[i + 1].y === point.y)
      ),
  );
}

/** Orthogonal visibility-grid routing, reserved rails and separate attachment ports. */
function route(
  start: Point,
  end: Point,
  nodes: GraphNode[],
  used: [Point, Point][],
  width: number,
  height: number,
  headers: Box[],
): Point[] | null {
  const xs = new Set([start.x, end.x, 24, 40, width - 40, width - 24]);
  const ys = new Set([start.y, end.y, 114, 126, height - 62, height - 48]);
  for (const node of nodes) {
    const box = boxOf(node);
    for (const offset of [14, 28, 42]) {
      xs.add(box.left - offset);
      xs.add(box.right + offset);
      ys.add(box.top - offset);
      ys.add(box.bottom + offset);
    }
  }
  for (const box of headers) {
    xs.add(box.left - 14);
    xs.add(box.right + 14);
    ys.add(box.top - 14);
    ys.add(box.bottom + 14);
  }
  const x = [...xs].filter((v) => v >= 16 && v <= width - 16).sort((a, b) => a - b);
  const y = [...ys].filter((v) => v >= 108 && v <= height - 40).sort((a, b) => a - b);
  const boxes = [...nodes.map((node) => boxOf(node, 8)), ...headers];
  const valid = y.flatMap((py) =>
    x.map((px) => !boxes.some((box) => inside({ x: px, y: py }, box))),
  );
  const startIndex = y.indexOf(start.y) * x.length + x.indexOf(start.x);
  const endIndex = y.indexOf(end.y) * x.length + x.indexOf(end.x);
  const point = (index: number): Point => ({
    x: x[index % x.length],
    y: y[Math.floor(index / x.length)],
  });
  const distance = new Map<number, number>();
  const previous = new Map<number, number>();
  const queue: { key: number; cost: number; score: number }[] = [];
  const push = (entry: { key: number; cost: number; score: number }) => {
    let low = 0,
      high = queue.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (queue[mid].score < entry.score) low = mid + 1;
      else high = mid;
    }
    queue.splice(low, 0, entry);
  };
  const first = startIndex * 3;
  distance.set(first, 0);
  push({ key: first, cost: 0, score: 0 });
  while (queue.length) {
    const current = queue.shift()!;
    if (current.cost !== distance.get(current.key)) continue;
    const index = Math.floor(current.key / 3),
      direction = current.key % 3;
    if (index === endIndex) {
      const result: Point[] = [];
      let key: number | undefined = current.key;
      while (key !== undefined) {
        result.push(point(Math.floor(key / 3)));
        key = previous.get(key);
      }
      return simplify(result.reverse());
    }
    const a = point(index),
      col = index % x.length,
      row = Math.floor(index / x.length);
    const neighbors = [
      col > 0 ? index - 1 : -1,
      col < x.length - 1 ? index + 1 : -1,
      row > 0 ? index - x.length : -1,
      row < y.length - 1 ? index + x.length : -1,
    ];
    for (const next of neighbors) {
      if (next < 0 || !valid[next]) continue;
      const b = point(next),
        nextDirection = a.x === b.x ? 2 : 1;
      if (boxes.some((box) => blocked(a, b, box))) continue;
      const shared = used.some(([c, d]) => overlap(a, b, c, d) > 0.1);
      if (shared) continue;
      const cost =
        current.cost +
        Math.abs(a.x - b.x) +
        Math.abs(a.y - b.y) +
        (direction && direction !== nextDirection ? 32 : 0);
      const key = next * 3 + nextDirection;
      if (cost >= (distance.get(key) ?? Infinity)) continue;
      distance.set(key, cost);
      previous.set(key, current.key);
      push({ key, cost, score: cost + Math.abs(b.x - end.x) + Math.abs(b.y - end.y) });
    }
  }
  return null;
}

export function presentationLayout(
  source: Graph,
  plan: PresentationPlan,
): PresentationScene {
  const rows = plan.lanes.flatMap((lane) => {
    const count = Math.ceil(lane.nodeIds.length / 7);
    return Array.from({ length: count }, (_, i) => ({
      ...lane,
      title: lane.title + (count > 1 ? ` · ${i + 1}/${count}` : ''),
      nodeIds: lane.nodeIds.slice(i * 7, (i + 1) * 7),
    }));
  });
  const nodesById = new Map(source.nodes.map((node) => [node.id, node]));
  const rowHeights = rows.map((lane) =>
    Math.max(
      ...lane.nodeIds.map((id) => presentationLabel(nodesById.get(id)!.label).height),
    ),
  );
  const height = Math.max(
      900,
      rowHeights.reduce((sum, h) => sum + h + 84, 220),
    ),
    width = (height * 16) / 9;
  const nodes: GraphNode[] = [];
  const nodeRows = new Map<string, number>();
  let nextTop = 152;
  const lanes = rows.map((lane, row): SlideLane => {
    const top = nextTop;
    nextTop += rowHeights[row] + 84;
    lane.nodeIds.forEach((id, index) => {
      const node = nodesById.get(id)!;
      const nodeHeight = presentationLabel(node.label).height;
      nodeRows.set(id, row);
      nodes.push({
        ...node,
        width: 144,
        height: nodeHeight,
        x: 160 + index * ((width - 320) / Math.max(1, lane.nodeIds.length - 1)),
        y: top + 30 + nodeHeight / 2,
      });
    });
    return { ...lane, x: 64, y: top, width: width - 128, height: rowHeights[row] + 38 };
  });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const headers = lanes.map((lane) => ({
    left: lane.x + 12,
    right: lane.x + 30 + lane.title.length * 8,
    top: lane.y + 4,
    bottom: lane.y + 30,
  }));
  type Side = 'left' | 'right' | 'top' | 'bottom';
  const sides = new Map<string, { from: Side; to: Side }>();
  const ports = new Map<string, string[]>();
  const register = (node: string, side: Side, edge: string) => {
    const key = `${node}:${side}`;
    ports.set(key, [...(ports.get(key) ?? []), edge]);
  };
  for (const edge of source.edges) {
    const a = byId.get(edge.from)!,
      b = byId.get(edge.to)!;
    const sameRow = nodeRows.get(a.id) === nodeRows.get(b.id);
    let from: Side =
      edge.from === edge.to
        ? 'right'
        : sameRow
          ? b.x! > a.x!
            ? 'right'
            : 'top'
          : b.y! > a.y!
            ? 'bottom'
            : 'top';
    let to: Side =
      edge.from === edge.to
        ? 'top'
        : sameRow
          ? b.x! > a.x!
            ? 'left'
            : 'top'
          : b.y! > a.y!
            ? 'top'
            : 'bottom';
    const nearHeader = (node: GraphNode) =>
      headers.some(
        (box) =>
          node.x! > box.left - 40 &&
          node.x! < box.right + 40 &&
          node.y! - node.height / 2 - 18 > box.top &&
          node.y! - node.height / 2 - 18 < box.bottom,
      );
    if (from === 'top' && nearHeader(a)) from = 'left';
    if (to === 'top' && nearHeader(b)) to = 'left';
    sides.set(edge.id, { from, to });
    register(edge.from, from, `${edge.id}:from`);
    register(edge.to, to, `${edge.id}:to`);
  }
  const port = (id: string, side: Side, edgeKey: string, target: boolean) => {
    const node = byId.get(id)!,
      box = boxOf(node);
    const list = ports.get(`${id}:${side}`)!;
    const offset =
      (list.indexOf(edgeKey) - (list.length - 1) / 2) * Math.min(18, 100 / list.length);
    const gap = target ? 7 : 0;
    const tip =
      side === 'left'
        ? { x: node.x! - 36 - gap, y: box.top + 43 + offset }
        : side === 'right'
          ? { x: node.x! + 36 + gap, y: box.top + 43 + offset }
          : side === 'top'
            ? { x: node.x! + offset, y: box.top + 16 - gap }
            : { x: node.x! + offset, y: box.bottom + gap };
    const stub =
      side === 'left'
        ? { ...tip, x: box.left - 18 }
        : side === 'right'
          ? { ...tip, x: box.right + 18 }
          : side === 'top'
            ? { ...tip, y: box.top - 18 }
            : { ...tip, y: box.bottom + 18 };
    return { tip, stub };
  };
  const warnings: string[] = [];
  const used: [Point, Point][] = [];
  const routed = new Map<string, GraphEdge>();
  // Short adjacent routes get their straight corridor first.
  const ordered = [...source.edges].sort((a, b) => {
    const length = (edge: GraphEdge) =>
      Math.abs(byId.get(edge.from)!.x! - byId.get(edge.to)!.x!) +
      Math.abs(byId.get(edge.from)!.y! - byId.get(edge.to)!.y!);
    return length(a) - length(b);
  });
  for (const edge of ordered) {
    const side = sides.get(edge.id)!;
    const a = port(edge.from, side.from, `${edge.id}:from`, false),
      b = port(edge.to, side.to, `${edge.id}:to`, true);
    const path = route(a.stub, b.stub, nodes, used, width, height, headers);
    if (!path)
      throw new Error(
        'This diagram needs more routing space for the slide preview. The previous layout is still available.',
      );
    const points = simplify([a.tip, ...path, b.tip]);
    if (
      points
        .slice(1)
        .some((point, index) =>
          used.some(([c, d]) => overlap(points[index], point, c, d) > 0.1),
        )
    )
      throw new Error(
        'This composition needs more space for separate connector ports. Try Recompose with AI or Previous layout.',
      );
    points.slice(1).forEach((point, index) => used.push([points[index], point]));
    routed.set(edge.id, { ...edge, points });
  }
  const edges = source.edges.map((edge) => routed.get(edge.id)!);
  const labels: Record<string, Point> = Object.create(null) as Record<string, Point>;
  const placed: Box[] = [];
  const collides = (a: Box, b: Box) =>
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  for (const edge of edges.filter((edge) => edge.label)) {
    const points = edge.points!;
    const candidates = points.slice(1).flatMap((b, i) => {
      const a = points[i];
      return [0.5, 0.25, 0.75].flatMap((t) =>
        [0, -18, 18].map((offset) => ({
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t + offset,
        })),
      );
    });
    const half = Math.max(18, edge.label!.length * 3.8 + 10);
    const labelBox = (p: Point) => ({
      left: p.x - half,
      right: p.x + half,
      top: p.y - 13,
      bottom: p.y + 13,
    });
    const location = candidates.find(
      (p) =>
        p.x > half + 12 &&
        p.x < width - half - 12 &&
        ![...nodes.map((node) => boxOf(node, 4)), ...placed, ...headers].some((box) =>
          collides(labelBox(p), box),
        ),
    );
    if (location) {
      labels[edge.id] = location;
      placed.push(labelBox(location));
    } else {
      throw new Error(
        'This composition needs more space for readable edge labels. Try Recompose with AI or Previous layout.',
      );
    }
  }
  if (rows.length > 3)
    warnings.push('Dense diagram: preview text is smaller at slide size.');
  return { graph: { ...source, nodes, edges }, lanes, width, height, labels, warnings };
}

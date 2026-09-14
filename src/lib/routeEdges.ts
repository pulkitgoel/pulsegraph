import type { GraphEdge, GraphNode } from '../types';

interface Point {
  x: number;
  y: number;
}
interface Box {
  id: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function boxesFor(nodes: GraphNode[]): Box[] {
  return nodes.map((node) => ({
    id: node.id,
    left: node.x! - node.width / 2,
    right: node.x! + node.width / 2,
    top: node.y! - node.height / 2,
    bottom: node.y! + node.height / 2,
  }));
}

function intersects(a: Point, b: Point, box: Box): boolean {
  return (
    Math.max(a.x, b.x) > box.left &&
    Math.min(a.x, b.x) < box.right &&
    Math.max(a.y, b.y) > box.top &&
    Math.min(a.y, b.y) < box.bottom
  );
}

export function routeCrossesNode(edge: GraphEdge, nodes: GraphNode[]): boolean {
  const points = edge.points ?? [];
  const boxes = boxesFor(nodes).filter(
    (box) => box.id !== edge.from && box.id !== edge.to,
  );
  return points.some(
    (point, index) =>
      index > 0 && boxes.some((box) => intersects(points[index - 1], point, box)),
  );
}

/**
 * Repair blocked semantic routes using a rectilinear visibility grid.
 * All grid connections are checked, including the exit and entry channels.
 * If no route exists, fail explicitly rather than draw through another node.
 */
export function repairRoutes(edges: GraphEdge[], nodes: GraphNode[]): GraphEdge[] {
  const boxes = boxesFor(nodes);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const pairs = new Map<string, number>();

  return edges.map((edge) => {
    const source = byId.get(edge.from);
    const target = byId.get(edge.to);
    if (!source || !target) throw new Error('An edge references a missing node.');
    const pair = edge.from + ':' + edge.to;
    const parallel = pairs.get(pair) ?? 0;
    pairs.set(pair, parallel + 1);
    if (source !== target && !parallel && !routeCrossesNode(edge, nodes)) return edge;

    const gap = 12 + parallel * 8;
    const obstacles = boxes;
    const port = (node: GraphNode, side: number): { boundary: Point; outside: Point } => {
      const x = node.x!,
        y = node.y!;
      const boundary =
        side === 0
          ? { x: x + node.width / 2, y }
          : side === 1
            ? { x, y: y + node.height / 2 }
            : side === 2
              ? { x: x - node.width / 2, y }
              : { x, y: y - node.height / 2 };
      const outside = {
        x: boundary.x + (side === 0 ? gap : side === 2 ? -gap : 0),
        y: boundary.y + (side === 1 ? gap : side === 3 ? -gap : 0),
      };
      return { boundary, outside };
    };

    for (const side of [parallel ? 1 : 0, 3, 2, 1]) {
      const start = port(source, side);
      const end = port(target, source === target ? (side + 1) % 4 : (side + 2) % 4);
      if (
        obstacles.some(
          (box) => box.id !== source.id && intersects(start.boundary, start.outside, box),
        ) ||
        obstacles.some(
          (box) => box.id !== target.id && intersects(end.boundary, end.outside, box),
        )
      )
        continue;

      const xs = [
        ...new Set([
          start.outside.x,
          end.outside.x,
          ...boxes.flatMap((box) => [box.left - gap, box.right + gap]),
        ]),
      ].sort((a, b) => a - b);
      const ys = [
        ...new Set([
          start.outside.y,
          end.outside.y,
          ...boxes.flatMap((box) => [box.top - gap, box.bottom + gap]),
        ]),
      ].sort((a, b) => a - b);
      const count = xs.length * ys.length;
      const predecessor = new Int32Array(count).fill(-1);
      const indexOf = (point: Point) =>
        ys.indexOf(point.y) * xs.length + xs.indexOf(point.x);
      const pointOf = (index: number) => ({
        x: xs[index % xs.length],
        y: ys[Math.floor(index / xs.length)],
      });
      const startIndex = indexOf(start.outside),
        endIndex = indexOf(end.outside);
      const queue = [startIndex];
      predecessor[startIndex] = startIndex;

      for (let head = 0; head < queue.length && predecessor[endIndex] < 0; head++) {
        const current = queue[head];
        const x = current % xs.length,
          y = Math.floor(current / xs.length);
        const candidates = [
          ...(x > 0 ? [current - 1] : []),
          ...(x + 1 < xs.length ? [current + 1] : []),
          ...(y > 0 ? [current - xs.length] : []),
          ...(y + 1 < ys.length ? [current + xs.length] : []),
        ];
        for (const next of candidates) {
          if (predecessor[next] >= 0) continue;
          if (obstacles.some((box) => intersects(pointOf(current), pointOf(next), box)))
            continue;
          predecessor[next] = current;
          queue.push(next);
        }
      }

      if (predecessor[endIndex] < 0) continue;
      const reversed = [end.outside];
      let current = endIndex;
      while (current !== startIndex) {
        current = predecessor[current];
        reversed.push(pointOf(current));
      }
      const points = [start.boundary, ...reversed.reverse(), end.boundary];
      const simplified = points.filter((point, index) => {
        if (!index || index === points.length - 1) return true;
        const previous = points[index - 1],
          next = points[index + 1];
        return !(
          (previous.x === point.x && point.x === next.x) ||
          (previous.y === point.y && point.y === next.y)
        );
      });
      return { ...edge, points: simplified };
    }
    throw new Error(
      'Could not find a clear route. Simplify this diagram or change presentation roles.',
    );
  });
}

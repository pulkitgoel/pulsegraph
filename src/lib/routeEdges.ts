import type { GraphEdge, GraphNode, GraphGroup } from '../types';

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

interface RoutedSegment {
  a: Point;
  b: Point;
}

function sharedAxisLength(a: RoutedSegment, b: RoutedSegment): number {
  const aVertical = Math.abs(a.a.x - a.b.x) < 0.5;
  const bVertical = Math.abs(b.a.x - b.b.x) < 0.5;
  if (aVertical && bVertical && Math.abs(a.a.x - b.a.x) < 0.5) {
    return Math.max(
      0,
      Math.min(Math.max(a.a.y, a.b.y), Math.max(b.a.y, b.b.y)) -
        Math.max(Math.min(a.a.y, a.b.y), Math.min(b.a.y, b.b.y)),
    );
  }
  const aHorizontal = Math.abs(a.a.y - a.b.y) < 0.5;
  const bHorizontal = Math.abs(b.a.y - b.b.y) < 0.5;
  if (aHorizontal && bHorizontal && Math.abs(a.a.y - b.a.y) < 0.5) {
    return Math.max(
      0,
      Math.min(Math.max(a.a.x, a.b.x), Math.max(b.a.x, b.b.x)) -
        Math.max(Math.min(a.a.x, a.b.x), Math.min(b.a.x, b.b.x)),
    );
  }
  return 0;
}

function segments(points: Point[]): RoutedSegment[] {
  return points.slice(0, -1).map((point, index) => ({ a: point, b: points[index + 1] }));
}

function simplifyPolyline(points: Point[]): Point[] {
  return points.filter((point, index) => {
    if (!index || index === points.length - 1) return true;
    const previous = points[index - 1];
    const next = points[index + 1];
    return !(
      (Math.abs(previous.x - point.x) < 0.5 && Math.abs(point.x - next.x) < 0.5) ||
      (Math.abs(previous.y - point.y) < 0.5 && Math.abs(point.y - next.y) < 0.5)
    );
  });
}

function offsetSegment(
  points: Point[],
  index: number,
  offset: number,
): { points: Point[]; shifted: RoutedSegment } | null {
  const a = points[index];
  const b = points[index + 1];
  const vertical = Math.abs(a.x - b.x) < 0.5;
  const horizontal = Math.abs(a.y - b.y) < 0.5;
  if (!vertical && !horizontal) return null;
  const shiftedA = vertical ? { x: a.x + offset, y: a.y } : { x: a.x, y: a.y + offset };
  const shiftedB = vertical ? { x: b.x + offset, y: b.y } : { x: b.x, y: b.y + offset };
  const first = index === 0;
  const last = index === points.length - 2;
  const shifted = { a: shiftedA, b: shiftedB };
  if (first && last) return { points: [shiftedA, shiftedB], shifted };
  if (first)
    return {
      points: [shiftedA, shiftedB, b, ...points.slice(index + 2)],
      shifted,
    };
  if (last)
    return {
      points: [...points.slice(0, index), a, shiftedA, shiftedB],
      shifted,
    };
  return {
    points: [
      ...points.slice(0, index),
      a,
      shiftedA,
      shiftedB,
      b,
      ...points.slice(index + 2),
    ],
    shifted,
  };
}

/**
 * Give coincident orthogonal connectors their own visible lanes. Node-safe
 * routing alone is insufficient: fan-in/fan-out edges can otherwise occupy
 * the exact same pixels and look like a missing connection on the live canvas.
 */
export function separateSharedSegments(
  edges: GraphEdge[],
  nodes: GraphNode[],
): GraphEdge[] {
  const occupied: RoutedSegment[] = [];
  const offsets = [8, -8, 16, -16, 24, -24];

  return edges.map((edge) => {
    let points = (edge.points ?? []).map((point) => ({ ...point }));
    for (let pass = 0; pass < 24; pass++) {
      const current = segments(points);
      const index = current.findIndex((segment) =>
        occupied.some((other) => sharedAxisLength(segment, other) > 0.5),
      );
      if (index < 0) break;

      let replacement: Point[] | null = null;
      for (const offset of offsets) {
        const candidate = offsetSegment(points, index, offset);
        if (!candidate) continue;
        if (
          occupied.some((other) => sharedAxisLength(candidate.shifted, other) > 0.5) ||
          routeCrossesNode({ ...edge, points: candidate.points }, nodes)
        )
          continue;
        replacement = candidate.points;
        break;
      }
      if (!replacement) break;
      points = replacement;
    }
    // Collinear Dagre points are curve control points, not redundant vertices.
    // Removing them makes the renderer sweep a curve across an entire group.
    if (
      points.every(
        (point, index) =>
          !index || point.x === points[index - 1].x || point.y === points[index - 1].y,
      )
    ) {
      points = simplifyPolyline(points);
      // Leave a visible straight approach before the arrowhead. A bend just
      // 10–12px from the box looks like a triangle stuck on a vertical trunk.
      if (points.length >= 4) {
        const end = points.at(-1)!,
          bend = points.at(-2)!,
          before = points.at(-3)!;
        const length = Math.hypot(end.x - bend.x, end.y - bend.y);
        if (length > 0 && length < 32) {
          const candidate = points.map((point) => ({ ...point }));
          const last = candidate.length - 1;
          if (end.y === bend.y && before.x === bend.x) {
            candidate[last - 1].x = candidate[last - 2].x =
              end.x - Math.sign(end.x - bend.x) * 32;
          } else if (end.x === bend.x && before.y === bend.y) {
            candidate[last - 1].y = candidate[last - 2].y =
              end.y - Math.sign(end.y - bend.y) * 32;
          }
          if (
            !routeCrossesNode({ ...edge, points: candidate }, nodes) &&
            !segments(candidate).some((segment) =>
              occupied.some((other) => sharedAxisLength(segment, other) > 0.5),
            )
          )
            points = candidate;
        }
      }
    }
    occupied.push(...segments(points));
    return { ...edge, points };
  });
}

type PortSide = 'top' | 'right' | 'bottom' | 'left';

interface PortUse {
  edgeIndex: number;
  end: 'source' | 'target';
  side: PortSide;
}

function endpointSide(points: Point[], end: PortUse['end']): PortSide | null {
  if (points.length < 2) return null;
  if (end === 'source') {
    const dx = points[1].x - points[0].x;
    const dy = points[1].y - points[0].y;
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
    return dy >= 0 ? 'bottom' : 'top';
  }
  const last = points.length - 1;
  const dx = points[last].x - points[last - 1].x;
  const dy = points[last].y - points[last - 1].y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'left' : 'right';
  return dy >= 0 ? 'top' : 'bottom';
}

/** Give every connector on the same node side a distinct entry/exit port. */
export function separateNodePorts(edges: GraphEdge[], nodes: GraphNode[]): GraphEdge[] {
  const groups = new Map<string, PortUse[]>();
  edges.forEach((edge, edgeIndex) => {
    const points = edge.points ?? [];
    for (const end of ['source', 'target'] as const) {
      const side = endpointSide(points, end);
      if (!side) continue;
      const nodeId = end === 'source' ? edge.from : edge.to;
      const key = `${nodeId}:${side}`;
      groups.set(key, [...(groups.get(key) ?? []), { edgeIndex, end, side }]);
    }
  });

  const offsets = new Map<string, { side: PortSide; value: number }>();
  groups.forEach((uses) => {
    if (uses.length < 2) return;
    const node = nodes.find(
      (candidate) =>
        candidate.id ===
        (uses[0].end === 'source'
          ? edges[uses[0].edgeIndex].from
          : edges[uses[0].edgeIndex].to),
    );
    const span =
      uses[0].side === 'left' || uses[0].side === 'right' ? node?.height : node?.width;
    // Port order must follow the neighbours' visual order, not Mermaid line
    // order. Reversing this order crosses every branch close to the source.
    const horizontal = uses[0].side === 'left' || uses[0].side === 'right';
    uses.sort((a, b) => {
      const neighbour = (use: PortUse) =>
        nodes.find(
          (candidate) =>
            candidate.id ===
            (use.end === 'source' ? edges[use.edgeIndex].to : edges[use.edgeIndex].from),
        );
      const first = neighbour(a),
        second = neighbour(b);
      return (
        (horizontal ? (first?.y ?? 0) : (first?.x ?? 0)) -
          (horizontal ? (second?.y ?? 0) : (second?.x ?? 0)) || a.edgeIndex - b.edgeIndex
      );
    });
    const spacing = Math.min(24, (span ?? 130) / (uses.length + 1));
    const center = horizontal ? (node?.y ?? 0) : (node?.x ?? 0);
    const positions = uses.map(
      (_, index) => center + (index - (uses.length - 1) / 2) * spacing,
    );
    // Preserve an almost aligned connection when its straight entry still
    // fits the node side and leaves room for the other ports.
    uses.forEach((use, index) => {
      const edge = edges[use.edgeIndex];
      const opposite = use.end === 'source' ? edge.points!.at(-1)! : edge.points![0];
      const aligned = horizontal ? opposite.y : opposite.x;
      if (
        Math.abs(aligned - positions[index]) < 12 &&
        Math.abs(aligned - center) <= (span ?? 130) / 2 - 8 &&
        positions.every(
          (position, other) => other === index || Math.abs(position - aligned) >= 8,
        )
      )
        positions[index] = aligned;
    });
    uses.forEach((use, index) => {
      const points = edges[use.edgeIndex].points!;
      const endpoint = use.end === 'source' ? points[0] : points.at(-1)!;
      offsets.set(`${use.edgeIndex}:${use.end}`, {
        side: use.side,
        value: positions[index] - (horizontal ? endpoint.y : endpoint.x),
      });
    });
  });

  return edges.map((edge, edgeIndex) => {
    const original = edge.points ?? [];
    if (original.length < 2) return edge;
    const points = original.map((point) => ({ ...point }));
    const source = offsets.get(`${edgeIndex}:source`);
    const target = offsets.get(`${edgeIndex}:target`);
    const shift = (point: Point, port: { side: PortSide; value: number }) => {
      if (port.side === 'left' || port.side === 'right') point.y += port.value;
      else point.x += port.value;
    };

    if (source) {
      shift(points[0], source);
      if (points.length > 2) shift(points[1], source);
    }
    if (target) {
      shift(points[points.length - 1], target);
      if (points.length > 2) shift(points[points.length - 2], target);
    }

    // Aligned boxes use one straight lane for the whole connector. Combining
    // its endpoint offsets avoids a tiny zigzag at a shared Dagre midpoint.
    if (original.every((point) => point.x === original[0].x)) {
      const lane = (points[0].x + points.at(-1)!.x) / 2;
      points.forEach((point) => {
        point.x = lane;
      });
    } else if (original.every((point) => point.y === original[0].y)) {
      const lane = (points[0].y + points.at(-1)!.y) / 2;
      points.forEach((point) => {
        point.y = lane;
      });
    }

    if (points.length === 2 && (source || target)) {
      const start = points[0];
      const end = points[1];
      const originallyHorizontal =
        Math.abs(original[1].x - original[0].x) >=
        Math.abs(original[1].y - original[0].y);
      if (originallyHorizontal && Math.abs(start.y - end.y) > 0.5) {
        const midX = (start.x + end.x) / 2;
        const candidate = {
          ...edge,
          points: [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end],
        };
        return routeCrossesNode(candidate, nodes) ? edge : candidate;
      }
      if (!originallyHorizontal && Math.abs(start.x - end.x) > 0.5) {
        const midY = (start.y + end.y) / 2;
        const candidate = {
          ...edge,
          points: [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end],
        };
        return routeCrossesNode(candidate, nodes) ? edge : candidate;
      }
    }
    // Opposite port offsets can both write the same middle vertex on a
    // three-point route. Add an elbow instead of tilting the approach.
    const orthogonal = original.every(
      (point, i) => !i || point.x === original[i - 1].x || point.y === original[i - 1].y,
    );
    const adjusted = orthogonal
      ? points.flatMap((point, i) => {
          if (!i) return [point];
          const previous = points[i - 1];
          if (point.x === previous.x || point.y === previous.y) return [point];
          const originalHorizontal = original[i].y === original[i - 1].y;
          const elbow =
            i === points.length - 1
              ? originalHorizontal
                ? { x: previous.x, y: point.y }
                : { x: point.x, y: previous.y }
              : originalHorizontal
                ? { x: point.x, y: previous.y }
                : { x: previous.x, y: point.y };
          return [elbow, point];
        })
      : points;
    const candidate = { ...edge, points: adjusted };
    return routeCrossesNode(candidate, nodes) ? edge : candidate;
  });
}

/** Route an ordinary fan-out as ordered, nested elbows with clear arrow entries.
 * The farthest branch turns first; nearer branches turn farther along the gap.
 * Opposite halves may reuse a rail because their vertical runs do not overlap.
 */
export function routeOrderedFanouts(
  edges: GraphEdge[],
  nodes: GraphNode[],
  vertical: boolean,
): GraphEdge[] {
  const result = edges.map((edge) => ({
    ...edge,
    points: edge.points?.map((point) => ({ ...point })),
  }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const main = (point: Point) => (vertical ? point.y : point.x);
  const cross = (point: Point) => (vertical ? point.x : point.y);
  const point = (axis: number, side: number): Point =>
    vertical ? { x: side, y: axis } : { x: axis, y: side };
  for (const source of nodes) {
    const branches = result.filter(
      (edge) => edge.from === source.id && !edge.isBackEdge && edge.to !== source.id,
    );
    if (
      branches.length < 2 ||
      new Set(branches.map((edge) => edge.to)).size !== branches.length
    )
      continue;
    if (branches.some((edge) => !edge.points?.length || !byId.has(edge.to))) continue;
    const ends = branches.map((edge) => edge.points!.at(-1)!);
    if (Math.max(...ends.map(main)) - Math.min(...ends.map(main)) > 0.5) continue;
    const sourceMain = vertical ? source.y! : source.x!;
    const sourceCross = vertical ? source.x! : source.y!;
    const size = vertical ? source.height : source.width;
    const sideSize = vertical ? source.width : source.height;
    const direction = Math.sign(main(ends[0]) - sourceMain);
    if (!direction) continue;
    const startMain = sourceMain + (direction * size) / 2;
    const gap = direction * (main(ends[0]) - startMain);
    if (gap < 56) continue;
    const ordered = [...branches].sort(
      (a, b) => cross(a.points!.at(-1)!) - cross(b.points!.at(-1)!),
    );
    const spacing = Math.min(16, (sideSize - 16) / (ordered.length - 1));
    const assigned = ordered.map((edge, index) => {
      const startCross = sourceCross + (index - (ordered.length - 1) / 2) * spacing;
      const end = edge.points!.at(-1)!;
      return { edge, startCross, end, delta: cross(end) - startCross };
    });
    const proposals = assigned.map(({ edge, startCross, end, delta }) => {
      if (Math.abs(delta) < 0.5)
        return { ...edge, points: [point(startMain, startCross), end] };
      const farther = assigned.filter(
        (other) =>
          Math.sign(other.delta) === Math.sign(delta) &&
          Math.abs(other.delta) > Math.abs(delta) + 0.5,
      ).length;
      const railDistance = 24 + farther * 24;
      if (railDistance > gap - 32) return null;
      const rail = startMain + direction * railDistance;
      return {
        ...edge,
        points: [
          point(startMain, startCross),
          point(rail, startCross),
          point(rail, cross(end)),
          end,
        ],
      };
    });
    if (proposals.some((edge) => !edge || routeCrossesNode(edge, nodes))) continue;
    // Reject a replacement if it would occupy an unrelated connector's lane.
    const unrelated = result
      .filter((edge) => !branches.includes(edge))
      .flatMap((edge) => segments(edge.points ?? []));
    if (
      proposals.some((edge) =>
        segments(edge!.points!).some((segment) =>
          unrelated.some((other) => sharedAxisLength(segment, other) > 0.5),
        ),
      )
    )
      continue;
    for (const proposal of proposals) {
      const target = result.find((edge) => edge.id === proposal!.id)!;
      target.points = proposal!.points;
    }
  }
  return result;
}

/** Reserve exterior lanes for forward edges that bypass a whole subgraph.
 * Internal feedback and external shortcuts must never compete for its border.
 * Nested routes are ordered so earlier sources enter farther down the target.
 */
export function routeGroupBypasses(
  edges: GraphEdge[],
  nodes: GraphNode[],
  groups: GraphGroup[],
  vertical: boolean,
): GraphEdge[] {
  if (!vertical) return edges;
  const result = edges.map((edge) => ({ ...edge }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const routed = new Set<string>();
  for (const group of groups) {
    if (!group.width || !group.height) continue;
    const top = group.y! - group.height / 2;
    const bottom = group.y! + group.height / 2;
    const bypasses = result
      .filter((edge) => {
        const source = byId.get(edge.from),
          target = byId.get(edge.to);
        return (
          source &&
          target &&
          !edge.isBackEdge &&
          !routed.has(edge.id) &&
          !group.members.includes(source.id) &&
          !group.members.includes(target.id) &&
          source.y! + source.height / 2 < top &&
          target.y! - target.height / 2 > bottom &&
          (edge.points ?? []).some(
            (point) =>
              point.y >= top &&
              point.y <= bottom &&
              point.x > group.x! + group.width! / 2,
          )
        );
      })
      .sort((a, b) => byId.get(b.from)!.y! - byId.get(a.from)!.y!);
    if (!bypasses.length) continue;
    const minY = Math.min(...bypasses.map((edge) => byId.get(edge.from)!.y!));
    const maxY = Math.max(...bypasses.map((edge) => byId.get(edge.to)!.y!));
    const right = Math.max(
      group.x! + group.width / 2 + 80,
      ...nodes
        .filter((node) => node.y! >= minY && node.y! <= maxY)
        .map((node) => node.x! + node.width / 2),
    );
    bypasses.forEach((edge, index) => {
      const source = byId.get(edge.from)!,
        target = byId.get(edge.to)!;
      const peers = bypasses.filter((other) => other.to === edge.to);
      const slot = peers.indexOf(edge);
      const entryY =
        target.y! +
        (slot - (peers.length - 1) / 2) *
          Math.min(24, target.height / (peers.length + 1));
      const laneX = right + 56 + index * 48;
      const points = [
        { x: source.x! + source.width / 2, y: source.y! },
        { x: laneX, y: source.y! },
        { x: laneX, y: entryY },
        { x: target.x! + target.width / 2 + 9, y: entryY },
      ];
      const candidate = { ...edge, points };
      if (!routeCrossesNode(candidate, nodes)) {
        edge.points = points;
        routed.add(edge.id);
      }
    });
  }
  return result;
}

/**
 * Repair blocked semantic routes using a rectilinear visibility grid.
 * All grid connections are checked, including the exit and entry channels.
 * If no route exists, fail explicitly rather than draw through another node.
 */
export function repairRoutes(
  edges: GraphEdge[],
  nodes: GraphNode[],
  options: { orthogonal?: boolean; vertical?: boolean } = {},
): GraphEdge[] {
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
    const diagonal = (edge.points ?? []).some(
      (point, index, points) =>
        index > 0 && point.x !== points[index - 1].x && point.y !== points[index - 1].y,
    );
    if (
      source !== target &&
      !parallel &&
      !routeCrossesNode(edge, nodes) &&
      !(options.orthogonal && diagonal)
    )
      return edge;

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

    const preferredSide = options.orthogonal
      ? options.vertical
        ? target.y! >= source.y!
          ? 1
          : 3
        : target.x! >= source.x!
          ? 0
          : 2
      : 0;
    for (const side of [...new Set([parallel ? 1 : preferredSide, 0, 3, 2, 1])]) {
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

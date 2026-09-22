import {
  repairRoutes,
  routeGroupBypasses,
  separateNodePorts,
  separateSharedSegments,
} from '../lib/routeEdges.ts';
import { computeLevels, findBackEdgeIds } from '../lib/graphLevels.ts';
import { roleOf as resolveRole } from '../lib/roles.ts';
import { presentationProfile } from '../lib/presentationProfile.ts';
import dagre from '@dagrejs/dagre';
import type { Graph, GraphNode, GraphEdge, GraphGroup } from '../types';

const NODE_HEIGHT = 52;
const CHAR_PX = 7.2;
const MIN_WIDTH = 130;
const MAX_WIDTH = 320;
const ICON_PAD = 38;
const BACK_EDGE_ARROW_CLEARANCE = 9;

function stopBeforeTarget(
  points: { x: number; y: number }[],
  clearance = BACK_EDGE_ARROW_CLEARANCE,
) {
  if (points.length < 2) return points;
  const result = points.map((point) => ({ ...point }));
  const end = result[result.length - 1];
  const previous = result[result.length - 2];
  const dx = end.x - previous.x;
  const dy = end.y - previous.y;
  const length = Math.hypot(dx, dy);
  if (!length) return result;
  const distance = Math.min(clearance, length / 2);
  end.x -= (dx / length) * distance;
  end.y -= (dy / length) * distance;
  return result;
}

function getLabelLines(label: string, maxWidth: number): string[] {
  const cleanLabel = label.replace(/\\n/g, '\n').replace(/<br\s*\/?>/g, '\n');
  if (cleanLabel.includes('\n')) {
    return cleanLabel
      .split('\n')
      .map((l) => l.trim())
      .slice(0, 5);
  }
  const approxChars = Math.floor(maxWidth / CHAR_PX);
  const plainText = cleanLabel.replace(/<[^>]+>/g, '');
  if (plainText.length <= approxChars) return [cleanLabel];
  const words = cleanLabel.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).replace(/<[^>]+>/g, '').trim().length <= approxChars)
      cur = (cur + ' ' + w).trim();
    else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 5);
}

export function getNodeDimensions(label: string): { width: number; height: number } {
  const lines = getLabelLines(label, MAX_WIDTH - ICON_PAD);
  const maxLineLen = Math.max(...lines.map((l) => l.replace(/<[^>]+>/g, '').length));
  // DO NOT cap at MAX_WIDTH. Allow box to expand if unbreakable words or <br> lines exceed it.
  const width = Math.max(MIN_WIDTH, Math.ceil(maxLineLen * CHAR_PX) + ICON_PAD);
  const height = Math.max(NODE_HEIGHT, 30 + lines.length * 15);
  return { width, height };
}

export function computeLayout(graph: Graph): Graph {
  // Enable compound graph for subgraphs/clusters; multigraph so parallel
  // edges (A→B twice with different labels) keep separate geometry instead of
  // silently overwriting each other.
  const g = new dagre.graphlib.Graph({ compound: true, multigraph: true });
  g.setDefaultEdgeLabel(() => ({}));

  const isVertical = (graph.layout || 'LR') === 'TB' || graph.layout === 'BT';
  g.setGraph({
    rankdir: graph.layout || 'LR',
    marginx: 40,
    marginy: 40,
    // Tighter spacing keeps diagrams compact so text stays a larger fraction of
    // the exported image (more readable when the image is fit into a window/slide).
    nodesep: isVertical ? 38 : 42,
    ranksep: isVertical ? 70 : 60,
    edgesep: 20,
    // Align nodes to a consistent up-left grid so the layout looks symmetric
    // rather than scattered.
    align: 'UL',
  });

  // Uniform box sizes give the grid a clean, symmetric look (like a hand-drawn
  // diagram) instead of ragged boxes of different sizes. Width is snapped to a
  // shared value (capped so long labels don't blow it up); height is uniform.
  const rawDims = graph.nodes.map((n) => ({ n, dim: getNodeDimensions(n.label) }));
  const uniformHeight = Math.max(
    NODE_HEIGHT,
    ...rawDims.map((d) => d.n.height || d.dim.height),
  );
  const widestLabel = Math.max(
    MIN_WIDTH,
    ...rawDims.map((d) => d.n.width || d.dim.width),
  );
  const uniformWidth = Math.min(widestLabel, 210); // cap so one long label can't bloat every box

  const nodesWithSize: GraphNode[] = rawDims.map(({ n, dim }) => ({
    ...n,
    width: Math.max(n.width || dim.width, uniformWidth),
    height: uniformHeight,
  }));

  nodesWithSize.forEach((n) => {
    g.setNode(n.id, { width: n.width, height: n.height });
  });

  // Tell dagre about the subgraphs to prevent overlap
  if (graph.groups) {
    graph.groups.forEach((grp) => {
      g.setNode(grp.id, { label: grp.label });
      grp.members.forEach((memberId) => {
        if (g.hasNode(memberId)) {
          g.setParent(memberId, grp.id);
        }
      });
      // If this group is nested inside another, register it with dagre
      if (grp.parentId) {
        g.setParent(grp.id, grp.parentId);
      }
    });
  }

  // Detect back-edges (cycles) via DFS so dagre only sees a DAG
  const backEdgeIds = findBackEdgeIds(graph);

  graph.edges.forEach((e) => {
    // Pass e.id as dagre's edge *name* (4th arg) — required for multigraphs.
    if (!backEdgeIds.has(e.id)) g.setEdge(e.from, e.to, { id: e.id }, e.id);
  });

  dagre.layout(g);

  const positionedNodes: GraphNode[] = nodesWithSize.map((n) => {
    const nd = g.node(n.id);
    return { ...n, x: nd?.x ?? 0, y: nd?.y ?? 0 };
  });

  // Cyclic return paths must clear the entire diagram, not only their two
  // endpoints. Otherwise a lower sibling branch can force route repair to
  // choose a short lane above the nodes, where it collides visually with
  // step badges and box borders.
  const layoutMaxY = Math.max(
    ...positionedNodes.map((node) => node.y! + (node.height || NODE_HEIGHT) / 2),
  );
  const layoutMinX = Math.min(
    ...positionedNodes.map((node) => node.x! - (node.width || MIN_WIDTH) / 2),
  );

  const sharedGroup = (from: string, to: string) =>
    (graph.groups ?? [])
      .filter((group) => group.members.includes(from) && group.members.includes(to))
      .sort((a, b) => a.members.length - b.members.length)[0];
  const groupLaneUse = new Map<string, number>();

  let backEdgeCount = 0;

  let positionedEdges: GraphEdge[] = graph.edges.map((e) => {
    if (backEdgeIds.has(e.id)) {
      const from = positionedNodes.find((n) => n.id === e.from)!;
      const to = positionedNodes.find((n) => n.id === e.to)!;
      if (!from || !to) return { ...e, points: [], isBackEdge: true };

      const fh = (from.height || NODE_HEIGHT) / 2;
      const th = (to.height || NODE_HEIGHT) / 2;
      const fw = (from.width || MIN_WIDTH) / 2;
      const fx = from.x ?? 0,
        fy = from.y ?? 0;
      const tx = to.x ?? 0,
        ty = to.y ?? 0;

      // Keep feedback inside its own subgraph. Sending a local retry around the
      // complete canvas creates giant border routes and makes a small agent loop
      // look like a system-wide connection.
      const group = sharedGroup(e.from, e.to);
      const groupBox = group ? g.node(group.id) : undefined;
      if (group && groupBox?.width && groupBox?.height) {
        const laneIndex = groupLaneUse.get(group.id) ?? 0;
        groupLaneUse.set(group.id, laneIndex + 1);
        if (isVertical) {
          const useRight = fx >= groupBox.x;
          const side = useRight ? 1 : -1;
          const laneX = groupBox.x + side * (groupBox.width / 2 + 24 + laneIndex * 18);
          const startX = fx + side * fw;
          const endX = tx + (side * (to.width || MIN_WIDTH)) / 2;
          return {
            ...e,
            isBackEdge: true,
            points: stopBeforeTarget([
              { x: startX, y: fy },
              { x: laneX, y: fy },
              { x: laneX, y: ty },
              { x: endX, y: ty },
            ]),
          };
        }

        const useBottom = fy >= groupBox.y;
        const side = useBottom ? 1 : -1;
        const laneY = groupBox.y + side * (groupBox.height / 2 + 24 + laneIndex * 18);
        const startY = fy + side * fh;
        const endY = ty + (side * (to.height || NODE_HEIGHT)) / 2;
        return {
          ...e,
          isBackEdge: true,
          points: stopBeforeTarget([
            { x: fx, y: startY },
            { x: fx, y: laneY },
            { x: tx, y: laneY },
            { x: tx, y: endY },
          ]),
        };
      }

      backEdgeCount++;

      if (!isVertical) {
        const curveY = layoutMaxY + 30 + backEdgeCount * 25;
        const away = fx >= tx ? 1 : -1;
        const startX = fx + away * fw;
        const startChannelX = startX + away * 12;
        return {
          ...e,
          isBackEdge: true,
          points: stopBeforeTarget([
            { x: startX, y: fy },
            { x: startChannelX, y: fy },
            { x: startChannelX, y: curveY },
            { x: tx, y: curveY },
            { x: tx, y: ty + th },
          ]),
        };
      } else {
        const curveX = layoutMinX - 30 - backEdgeCount * 25;
        const away = fy >= ty ? 1 : -1;
        const startY = fy + away * fh;
        const startChannelY = startY + away * 12;
        // Enter from the left so the retry arrow does not share the normal
        // incoming connector's top/bottom port.
        const endX = tx - (to.width || MIN_WIDTH) / 2;
        return {
          ...e,
          isBackEdge: true,
          points: stopBeforeTarget([
            { x: fx, y: startY },
            { x: fx, y: startChannelY },
            { x: curveX, y: startChannelY },
            { x: curveX, y: ty },
            { x: endX, y: ty },
          ]),
        };
      }
    }

    try {
      const ed = g.edge(e.from, e.to, e.id);
      return { ...e, points: ed?.points ?? [] };
    } catch {
      return { ...e, points: [] };
    }
  });

  const positionedGroups: GraphGroup[] = (graph.groups || []).map((grp) => {
    const nd = g.node(grp.id);
    return {
      ...grp,
      x: nd?.x ?? 0,
      y: nd?.y ?? 0,
      width: nd?.width ?? 0,
      height: nd?.height ?? 0,
    };
  });

  // Dagre optimizes rank placement, but its splines can still cross unrelated
  // nodes in dense or cyclic graphs. Convert only blocked routes to verified
  // rectilinear paths before coordinates are normalized.
  positionedEdges = separateSharedSegments(
    separateNodePorts(repairRoutes(positionedEdges, positionedNodes), positionedNodes),
    positionedNodes,
  );
  positionedEdges = routeGroupBypasses(
    positionedEdges,
    positionedNodes,
    positionedGroups,
    isVertical,
  );

  // Normalize coordinates so content starts at (PAD, PAD) with symmetric margins.
  // This removes dagre's leftover asymmetric margins and prevents back-edge curves
  // (which can produce negative coordinates) from being clipped in the export.
  const PAD_NORM = 40;
  let nMinX = Infinity,
    nMinY = Infinity;
  positionedNodes.forEach((n) => {
    const w = n.width || MIN_WIDTH,
      h = n.height || NODE_HEIGHT;
    nMinX = Math.min(nMinX, (n.x || 0) - w / 2);
    nMinY = Math.min(nMinY, (n.y || 0) - h / 2);
  });
  positionedEdges.forEach((e) =>
    (e.points || []).forEach((p) => {
      nMinX = Math.min(nMinX, p.x);
      nMinY = Math.min(nMinY, p.y);
    }),
  );
  positionedGroups.forEach((grp) => {
    const w = grp.width || 0,
      h = grp.height || 0;
    nMinX = Math.min(nMinX, (grp.x || 0) - w / 2);
    nMinY = Math.min(nMinY, (grp.y || 0) - h / 2);
  });
  if (isFinite(nMinX) && isFinite(nMinY)) {
    const dx = PAD_NORM - nMinX,
      dy = PAD_NORM - nMinY;
    positionedNodes.forEach((n) => {
      n.x = (n.x || 0) + dx;
      n.y = (n.y || 0) + dy;
    });
    positionedEdges.forEach((e) => {
      e.points = (e.points || []).map((p) => ({ x: p.x + dx, y: p.y + dy }));
    });
    positionedGroups.forEach((grp) => {
      grp.x = (grp.x || 0) + dx;
      grp.y = (grp.y || 0) + dy;
    });
  }

  return {
    ...graph,
    nodes: positionedNodes,
    edges: positionedEdges,
    groups: positionedGroups,
  };
}

export function getGraphDimensions(graph: Graph): { width: number; height: number } {
  let minX = Infinity,
    minY = Infinity,
    maxX = 0,
    maxY = 0;
  graph.nodes.forEach((n) => {
    const hw = (n.width || MIN_WIDTH) / 2,
      hh = (n.height || NODE_HEIGHT) / 2;
    minX = Math.min(minX, (n.x || 0) - hw);
    minY = Math.min(minY, (n.y || 0) - hh);
    maxX = Math.max(maxX, (n.x || 0) + hw);
    maxY = Math.max(maxY, (n.y || 0) + hh);
  });
  graph.edges.forEach((e) => {
    (e.points || []).forEach((p) => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    });
  });
  // Content is normalized to start at 40px; add matching 40px on the far side
  // so padding is symmetric and there is no wasted empty band.
  return {
    width: (isFinite(maxX) ? maxX : 600) + 40,
    height: (isFinite(maxY) ? maxY : 400) + 40,
  };
}

// ── Role-based Blueprint ──────────────────────────────────────────────────────
// Places nodes by their MEANING (role), reproducing a hand-designed architecture
// slide: a lead-in row on the left, the main pipeline in the centre, shared
// services in a band below, and outputs stacked on the right — each wrapped in a
// labeled zone. Roles come from the AI (see designPresentation), so the layout is
// semantic, not just topological.
export type NodeRole = 'lead-in' | 'pipeline' | 'service' | 'output';

export function roleBlueprintLayout(graph: Graph, roles: Record<string, string>): Graph {
  const profile = presentationProfile(graph);
  const BOX_W = 180,
    BOX_H = 92,
    // A short decision tag is about 36px wide. Keep enough corridor for that
    // pill, the arrowhead and clear space on both sides of adjacent boxes.
    GAP_X = 84,
    MARGIN = 64;
  const colStep = BOX_W + GAP_X;

  const nodes: GraphNode[] = graph.nodes.map((n) => ({
    ...n,
    width: BOX_W,
    height: BOX_H,
    x: 0,
    y: 0,
  }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const roleOf = (id: string): NodeRole => resolveRole(roles, id);

  const out = new Map<string, string[]>(),
    inc = new Map<string, string[]>();
  nodes.forEach((n) => {
    out.set(n.id, []);
    inc.set(n.id, []);
  });
  graph.edges.forEach((e) => {
    if (byId.has(e.from) && byId.has(e.to) && e.from !== e.to) {
      out.get(e.from)!.push(e.to);
      inc.get(e.to)!.push(e.from);
    }
  });

  const level = computeLevels(graph);
  const byLv = (a: GraphNode, b: GraphNode) => level.get(a.id)! - level.get(b.id)!;

  const leadIn = nodes.filter((n) => roleOf(n.id) === 'lead-in').sort(byLv);
  const pipeline = nodes.filter((n) => roleOf(n.id) === 'pipeline').sort(byLv);
  const services = nodes.filter((n) => roleOf(n.id) === 'service').sort(byLv);
  const outputs = nodes.filter((n) => roleOf(n.id) === 'output').sort(byLv);

  // Prefer the branch that reaches a declared output without following a
  // structural back edge. This keeps success/delivery paths on the main row
  // and moves retry or repair branches below them.
  const backEdgeIds = findBackEdgeIds(graph);
  const forwardOut = new Map(nodes.map((node) => [node.id, [] as string[]]));
  graph.edges.forEach((edge) => {
    if (!backEdgeIds.has(edge.id)) forwardOut.get(edge.from)?.push(edge.to);
  });
  const outputIds = new Set(outputs.map((node) => node.id));
  const outputReachability = new Map<string, boolean>();
  const reachesOutput = (id: string, visiting = new Set<string>()): boolean => {
    if (outputIds.has(id)) return true;
    const cached = outputReachability.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return false;
    const nextVisiting = new Set(visiting).add(id);
    const result = (forwardOut.get(id) ?? []).some((next) =>
      reachesOutput(next, nextVisiting),
    );
    outputReachability.set(id, result);
    return result;
  };

  const PIPE_Y = MARGIN + 46 + BOX_H / 2;
  // Extra space between zones so their bounding boxes never overlap
  // (must exceed 2× the zone padding used below).
  const ZONE_GAP = 80;
  const ZONE_PADDING = 30;
  const ZONE_ROUTE_CLEARANCE = 18;
  // Long pipelines wrap into serpentine rows so a 9-stage flow doesn't become
  // a 3000px-wide single row.
  const MAX_PER_ROW = 5;
  const ROW_GAP = 110; // vertical corridor between pipeline rows (used for routing)

  // Lead-in row on the left.
  let cx = MARGIN;
  leadIn.forEach((n) => {
    n.x = cx + BOX_W / 2;
    n.y = PIPE_Y;
    cx += colStep;
  });
  if (leadIn.length && pipeline.length) cx += ZONE_GAP;

  // Small decision diagrams use one column per topological level. Sibling
  // branches share a column on separate rows, so they cannot be mistaken for
  // consecutive stages. Larger workflows retain the compact serpentine grid.
  const pipeStartX = cx;
  const pipelineOrder = new Map(pipeline.map((node, index) => [node.id, index]));
  const columns = [...new Set(pipeline.map((node) => level.get(node.id) ?? 0))]
    .sort((a, b) => a - b)
    .map((columnLevel) =>
      pipeline
        .filter((node) => (level.get(node.id) ?? 0) === columnLevel)
        .sort(
          (a, b) =>
            Number(reachesOutput(b.id)) - Number(reachesOutput(a.id)) ||
            pipelineOrder.get(a.id)! - pipelineOrder.get(b.id)!,
        ),
    );
  const useBranchGrid =
    profile.layout === 'branching' &&
    pipeline.length <= MAX_PER_ROW + 2 &&
    columns.some((column) => column.length > 1);

  let nRows: number;
  let pipeBottomY: number;
  if (useBranchGrid) {
    nRows = Math.max(...columns.map((column) => column.length));
    columns.forEach((column, columnIndex) => {
      column.forEach((node, rowIndex) => {
        node.x = pipeStartX + columnIndex * colStep + BOX_W / 2;
        node.y = PIPE_Y + rowIndex * (BOX_H + ROW_GAP);
      });
    });
    cx = pipeStartX + columns.length * colStep;
    pipeBottomY = PIPE_Y + (nRows - 1) * (BOX_H + ROW_GAP);
  } else {
    nRows = pipeline.length ? Math.ceil(pipeline.length / MAX_PER_ROW) : 0;
    const perRow = nRows ? Math.ceil(pipeline.length / nRows) : 0;
    pipeline.forEach((node, index) => {
      const row = Math.floor(index / perRow);
      let column = index % perRow;
      if (row % 2 === 1) column = perRow - 1 - column;
      node.x = pipeStartX + column * colStep + BOX_W / 2;
      node.y = PIPE_Y + row * (BOX_H + ROW_GAP);
    });
    if (pipeline.length) cx = pipeStartX + Math.min(pipeline.length, perRow) * colStep;
    pipeBottomY = pipeline.length ? PIPE_Y + (nRows - 1) * (BOX_H + ROW_GAP) : PIPE_Y;
  }

  // Align each output with its incoming stage when possible. This keeps the
  // primary branch visually continuous instead of centring a lone result
  // between the success and retry rows.
  if (leadIn.length + pipeline.length > 0 && outputs.length) cx += ZONE_GAP;
  const rightX = cx + BOX_W / 2;
  const oGap = BOX_H + 40;
  const outCenterY = (PIPE_Y + pipeBottomY) / 2;
  outputs.forEach((n, j) => {
    n.x = rightX;
    const incomingYs = (inc.get(n.id) ?? [])
      .map((id) => byId.get(id))
      .filter((node): node is GraphNode => Boolean(node && node.x))
      .map((node) => node.y!);
    n.y = incomingYs.length
      ? incomingYs.reduce((sum, y) => sum + y, 0) / incomingYs.length
      : outCenterY + (j - (outputs.length - 1) / 2) * oGap;
  });
  const outputsByY = [...outputs].sort((a, b) => a.y! - b.y!);
  for (let index = 1; index < outputsByY.length; index++) {
    outputsByY[index].y = Math.max(outputsByY[index].y!, outputsByY[index - 1].y! + oGap);
  }

  // Services: a band below the LAST pipeline row, x near connected nodes.
  const svcY = pipeBottomY + BOX_H + 130;
  services.forEach((n) => {
    const nb = [...out.get(n.id)!, ...inc.get(n.id)!]
      .map((id) => byId.get(id))
      .filter(Boolean) as GraphNode[];
    const avg = nb.length ? nb.reduce((s, m) => s + m.x!, 0) / nb.length : rightX / 2;
    n.x = avg;
    n.y = svcY;
  });
  // Spread services so they don't overlap.
  const svcSorted = [...services].sort((a, b) => a.x! - b.x!);
  for (let i = 1; i < svcSorted.length; i++) {
    const min = svcSorted[i - 1].x! + colStep;
    if (svcSorted[i].x! < min) svcSorted[i].x = min;
  }

  for (const service of svcSorted) {
    const others = nodes.filter((node) => node.id !== service.id);
    let blocked = true;
    while (blocked) {
      blocked = false;
      for (const node of others) {
        if (
          Math.abs(service.x! - node.x!) < BOX_W + 20 &&
          Math.abs(service.y! - node.y!) < BOX_H + 20
        ) {
          service.x = node.x! + colStep;
          blocked = true;
        }
      }
    }
  }

  // ── Collision-aware orthogonal routing ──────────────────────────────────────
  // A straight segment through another node's box is never acceptable; blocked
  // routes go around through box-free corridors (row gaps, inter-column
  // channels, or a lane below everything in the span).
  const boxes = nodes.map((n) => ({
    id: n.id,
    x0: n.x! - BOX_W / 2 - 4,
    x1: n.x! + BOX_W / 2 + 4,
    y0: n.y! - BOX_H / 2 - 4,
    y1: n.y! + BOX_H / 2 + 4,
  }));
  const clearH = (y: number, xa: number, xb: number, skip: Set<string>) => {
    const lo = Math.min(xa, xb),
      hi = Math.max(xa, xb);
    return !boxes.some(
      (b) => !skip.has(b.id) && y > b.y0 && y < b.y1 && hi > b.x0 && lo < b.x1,
    );
  };
  const clearV = (x: number, ya: number, yb: number, skip: Set<string>) => {
    const lo = Math.min(ya, yb),
      hi = Math.max(ya, yb);
    return !boxes.some(
      (b) => !skip.has(b.id) && x > b.x0 && x < b.x1 && hi > b.y0 && lo < b.y1,
    );
  };
  /** Lowest edge of any box inside the horizontal span (for below-all lanes). */
  const spanBottom = (xa: number, xb: number) => {
    const lo = Math.min(xa, xb) - BOX_W / 2,
      hi = Math.max(xa, xb) + BOX_W / 2;
    let y = -Infinity;
    boxes.forEach((b) => {
      if (hi > b.x0 && lo < b.x1) y = Math.max(y, b.y1);
    });
    return y;
  };
  const laneUse = new Map<number, number>(); // stack parallel arcs on shared lanes
  const edgeOrder = new Map(
    graph.edges.map((edge, index) => [`${edge.from}\u0000${edge.to}`, index]),
  );

  /** Exit a node sideways and find a VERIFIED-clear vertical channel to `lane`
      (services sit at averaged x, so "half a column over" is not guaranteed clear). */
  const jogToLane = (
    nx: number,
    ny: number,
    prefDir: number,
    lane: number,
    skipSelf: Set<string>,
  ) => {
    for (const dir of [prefDir, -prefDir]) {
      for (let off = colStep / 2; off <= colStep * 2.5; off += 20) {
        const chX = nx + dir * off;
        if (
          clearH(ny, nx + (dir * BOX_W) / 2, chX, skipSelf) &&
          clearV(chX, ny, lane, skipSelf)
        ) {
          return {
            pts: [
              { x: nx + (dir * BOX_W) / 2, y: ny },
              { x: chX, y: ny },
            ],
            chX,
          };
        }
      }
    }
    const chX = nx + prefDir * (colStep / 2);
    return {
      pts: [
        { x: nx + (prefDir * BOX_W) / 2, y: ny },
        { x: chX, y: ny },
      ],
      chX,
    };
  };
  /** Come off `lane` through a verified-clear channel and enter the node's side. */
  const entryViaChannel = (
    nx: number,
    ny: number,
    prefSide: number,
    lane: number,
    skipSelf: Set<string>,
  ) => {
    for (const side of [prefSide, -prefSide]) {
      for (let off = colStep / 2; off <= colStep * 2.5; off += 20) {
        const chX = nx - side * off;
        const dir = nx >= chX ? 1 : -1;
        if (
          clearV(chX, lane, ny, skipSelf) &&
          clearH(ny, chX, nx - (dir * BOX_W) / 2, skipSelf)
        ) {
          return [
            { x: chX, y: lane },
            { x: chX, y: ny },
            { x: nx - (dir * BOX_W) / 2, y: ny },
          ];
        }
      }
    }
    const chX = nx - prefSide * (colStep / 2);
    return [
      { x: chX, y: lane },
      { x: chX, y: ny },
      { x: nx - (prefSide * BOX_W) / 2, y: ny },
    ];
  };

  let edges: GraphEdge[] = graph.edges.map((e, edgeIndex) => {
    const f = byId.get(e.from),
      t = byId.get(e.to);
    if (!f || !t) return { ...e, points: [] };
    const fx = f.x!,
      fy = f.y!,
      tx = t.x!,
      ty = t.y!;
    const skip = new Set([f.id, t.id]);
    const skipF = new Set([f.id]);
    const skipT = new Set([t.id]);

    // Structural back edges represent retry/feedback loops. Give them a
    // dedicated lane below every node and semantic zone so they never share
    // a branch corridor or run above step badges.
    if (backEdgeIds.has(e.id)) {
      const containingGroup = (graph.groups ?? [])
        .filter((group) => group.members.includes(e.from) && group.members.includes(e.to))
        .sort((a, b) => a.members.length - b.members.length)[0];
      if (containingGroup) {
        const members = containingGroup.members
          .map((id) => byId.get(id))
          .filter((node): node is GraphNode => Boolean(node));
        const groupRight = Math.max(...members.map((node) => node.x! + BOX_W / 2));
        const groupBottom = Math.max(...members.map((node) => node.y! + BOX_H / 2));
        const laneX = groupRight + 28;
        const laneY = groupBottom + 28;
        return {
          ...e,
          isBackEdge: true,
          points: stopBeforeTarget([
            { x: fx, y: fy + BOX_H / 2 },
            { x: fx, y: laneY },
            { x: laneX, y: laneY },
            { x: laneX, y: ty },
            { x: tx + BOX_W / 2, y: ty },
          ]),
        };
      }

      const baseLane = Math.max(...boxes.map((box) => box.y1));
      const key = Math.round(baseLane);
      const laneIndex = laneUse.get(key) || 0;
      laneUse.set(key, laneIndex + 1);
      const lane = baseLane + ZONE_PADDING + ZONE_ROUTE_CLEARANCE + laneIndex * 18;
      const points: { x: number; y: number }[] = [];
      let exitX = fx;
      if (clearV(fx, fy + BOX_H / 2 + 1, lane, skipF)) {
        points.push({ x: fx, y: fy + BOX_H / 2 });
      } else {
        const jog = jogToLane(fx, fy, tx >= fx ? 1 : -1, lane, skipF);
        points.push(...jog.pts);
        exitX = jog.chX;
      }
      points.push({ x: exitX, y: lane });
      if (clearV(tx, ty + BOX_H / 2 + 1, lane, skipT)) {
        points.push({ x: tx, y: lane }, { x: tx, y: ty + BOX_H / 2 });
      } else {
        points.push(...entryViaChannel(tx, ty, tx >= exitX ? 1 : -1, lane, skipT));
      }
      return { ...e, points: stopBeforeTarget(points), isBackEdge: true };
    }

    // ── Same row ──
    if (Math.abs(fy - ty) < 1) {
      const dir = tx >= fx ? 1 : -1;
      const directRouteClear = clearH(
        fy,
        fx + (dir * BOX_W) / 2,
        tx - (dir * BOX_W) / 2,
        skip,
      );
      const reverseIndex = edgeOrder.get(`${e.to}\u0000${e.from}`);
      const needsReciprocalLane =
        directRouteClear && reverseIndex !== undefined && reverseIndex < edgeIndex;
      if (needsReciprocalLane) {
        const startTop = fy - BOX_H / 2;
        const endTop = ty - BOX_H / 2;
        const upperLane = startTop - 22;
        if (
          clearV(fx, startTop, upperLane, skipF) &&
          clearH(upperLane, fx, tx, skip) &&
          clearV(tx, upperLane, endTop, skipT)
        ) {
          return {
            ...e,
            points: [
              { x: fx, y: startTop },
              { x: fx, y: upperLane },
              { x: tx, y: upperLane },
              { x: tx, y: endTop },
            ],
          };
        }
      }
      if (directRouteClear) {
        return {
          ...e,
          points: [
            { x: fx + (dir * BOX_W) / 2, y: fy },
            { x: tx - (dir * BOX_W) / 2, y: ty },
          ],
        };
      }
      // Blocked → arc below everything in the span.
      let laneY = spanBottom(fx, tx) as number;
      const key = Math.round(laneY);
      const k = laneUse.get(key) || 0;
      laneUse.set(key, k + 1);
      // Clear the semantic zone border as well as the node boxes. The zone's
      // bottom edge is ZONE_PADDING beyond its members; routing exactly there
      // makes the connector visually merge with the dashed outer box.
      laneY += ZONE_PADDING + ZONE_ROUTE_CLEARANCE + k * 18;
      const pts: { x: number; y: number }[] = [];
      if (clearV(fx, fy + BOX_H / 2 + 1, laneY, skipF)) {
        pts.push({ x: fx, y: fy + BOX_H / 2 }, { x: fx, y: laneY });
      } else {
        const j = jogToLane(fx, fy, dir, laneY, skipF);
        pts.push(...j.pts, { x: j.chX, y: laneY });
      }
      if (clearV(tx, ty + BOX_H / 2 + 1, laneY, skipT)) {
        pts.push({ x: tx, y: laneY }, { x: tx, y: ty + BOX_H / 2 });
      } else {
        pts.push(...entryViaChannel(tx, ty, dir, laneY, skipT));
      }
      return { ...e, points: pts };
    }

    // ── Different rows ──
    const down = ty > fy ? 1 : -1;
    const startY = fy + (down * BOX_H) / 2;
    const endY = ty - (down * BOX_H) / 2;
    // Candidate horizontal lanes: midpoint, the box-free gap just before the
    // target row, then a lane below everything in the span.
    const candidates = [(startY + endY) / 2, endY - down * 26];
    let lane = candidates.find((y) => clearH(y, fx, tx, skip));
    if (lane === undefined) {
      const key0 = spanBottom(fx, tx) as number;
      const k = laneUse.get(Math.round(key0)) || 0;
      laneUse.set(Math.round(key0), k + 1);
      lane = key0 + 26 + k * 18;
    }
    const pts: { x: number; y: number }[] = [];
    let exitX = fx;
    const goingToLaneDown = lane > fy ? 1 : -1;
    if (clearV(fx, fy + (goingToLaneDown * BOX_H) / 2 + goingToLaneDown, lane, skipF)) {
      pts.push({ x: fx, y: fy + (goingToLaneDown * BOX_H) / 2 });
    } else {
      const j = jogToLane(fx, fy, tx >= fx ? 1 : -1, lane, skipF);
      pts.push(...j.pts);
      exitX = j.chX;
    }
    pts.push({ x: exitX, y: lane });
    const laneToTargetDown = ty > lane ? 1 : -1;
    if (clearV(tx, lane, ty - (laneToTargetDown * BOX_H) / 2, skipT)) {
      pts.push({ x: tx, y: lane }, { x: tx, y: ty - (laneToTargetDown * BOX_H) / 2 });
    } else {
      pts.push(...entryViaChannel(tx, ty, tx >= exitX ? 1 : -1, lane, skipT));
    }
    return { ...e, points: pts };
  });

  edges = separateSharedSegments(
    separateNodePorts(repairRoutes(edges, nodes), nodes),
    nodes,
  );

  // Use vocabulary inferred from the diagram instead of architecture-specific labels.
  const zoneDefs = [
    { ids: leadIn, label: profile.entryZone },
    { ids: pipeline, label: profile.primaryZone },
    { ids: outputs, label: profile.outputZone },
  ];
  const groups: GraphGroup[] = zoneDefs
    .filter((z) => z.ids.length > 0)
    .map((z, i) => {
      let x0 = Infinity,
        y0 = Infinity,
        x1 = -Infinity,
        y1 = -Infinity;
      z.ids.forEach((m) => {
        x0 = Math.min(x0, m.x! - BOX_W / 2);
        y0 = Math.min(y0, m.y! - BOX_H / 2);
        x1 = Math.max(x1, m.x! + BOX_W / 2);
        y1 = Math.max(y1, m.y! + BOX_H / 2);
      });
      // Generous side padding + extra room on top for the zone header.
      const p = ZONE_PADDING,
        topExtra = 26;
      return {
        id: 'zone_' + i,
        label: z.label,
        members: z.ids.map((m) => m.id),
        x: (x0 + x1) / 2,
        y: (y0 + y1) / 2 - topExtra / 2,
        width: x1 - x0 + 2 * p,
        height: y1 - y0 + 2 * p + topExtra,
      };
    });

  // Normalize so the whole thing starts at (MARGIN, MARGIN).
  let mnX = Infinity,
    mnY = Infinity;
  nodes.forEach((n) => {
    mnX = Math.min(mnX, n.x! - BOX_W / 2);
    mnY = Math.min(mnY, n.y! - BOX_H / 2);
  });
  groups.forEach((g) => {
    mnX = Math.min(mnX, g.x! - g.width! / 2);
    mnY = Math.min(mnY, g.y! - g.height! / 2);
  });
  edges.forEach((e) =>
    (e.points || []).forEach((p) => {
      mnX = Math.min(mnX, p.x);
      mnY = Math.min(mnY, p.y);
    }),
  );
  const dx = MARGIN - mnX,
    dy = MARGIN - mnY;
  nodes.forEach((n) => {
    n.x! += dx;
    n.y! += dy;
  });
  edges.forEach((e) => {
    e.points = (e.points || []).map((p) => ({ x: p.x + dx, y: p.y + dy }));
  });
  groups.forEach((g) => {
    g.x! += dx;
    g.y! += dy;
  });

  return { ...graph, nodes, edges, groups, layout: 'LR' };
}

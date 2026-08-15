import dagre from '@dagrejs/dagre';
import type { Graph, GraphNode, GraphEdge, GraphGroup } from '../types';

const NODE_HEIGHT = 52;
const CHAR_PX = 7.2;
const MIN_WIDTH = 130;
const MAX_WIDTH = 320;
const ICON_PAD = 38;

function getLabelLines(label: string, maxWidth: number): string[] {
  let cleanLabel = label.replace(/\\n/g, '\n').replace(/<br\s*\/?>/g, '\n');
  if (cleanLabel.includes('\n')) {
    return cleanLabel.split('\n').map(l => l.trim()).slice(0, 5);
  }
  const approxChars = Math.floor(maxWidth / CHAR_PX);
  const plainText = cleanLabel.replace(/<[^>]+>/g, '');
  if (plainText.length <= approxChars) return [cleanLabel];
  const words = cleanLabel.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).replace(/<[^>]+>/g, '').trim().length <= approxChars) cur = (cur + ' ' + w).trim();
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 5);
}

export function getNodeDimensions(label: string): { width: number; height: number } {
  const lines = getLabelLines(label, MAX_WIDTH - ICON_PAD);
  const maxLineLen = Math.max(...lines.map(l => l.replace(/<[^>]+>/g, '').length));
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

  const isVertical = (graph.layout || 'LR') === 'TB';
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
  const uniformHeight = Math.max(NODE_HEIGHT, ...rawDims.map(d => d.n.height || d.dim.height));
  const widestLabel = Math.max(MIN_WIDTH, ...rawDims.map(d => d.n.width || d.dim.width));
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
    graph.groups.forEach(grp => {
      g.setNode(grp.id, { label: grp.label });
      grp.members.forEach(memberId => {
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
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const backEdgeIds = new Set<string>();

  function dfs(nodeId: string) {
    visited.add(nodeId);
    inStack.add(nodeId);
    for (const e of graph.edges) {
      if (e.from === nodeId) {
        if (inStack.has(e.to)) backEdgeIds.add(e.id);
        else if (!visited.has(e.to)) dfs(e.to);
      }
    }
    inStack.delete(nodeId);
  }
  graph.nodes.forEach((n) => { if (!visited.has(n.id)) dfs(n.id); });

  graph.edges.forEach((e) => {
    // Pass e.id as dagre's edge *name* (4th arg) — required for multigraphs.
    if (!backEdgeIds.has(e.id)) g.setEdge(e.from, e.to, { id: e.id }, e.id);
  });

  dagre.layout(g);

  const positionedNodes: GraphNode[] = nodesWithSize.map((n) => {
    const nd = g.node(n.id);
    return { ...n, x: nd?.x ?? 0, y: nd?.y ?? 0 };
  });

  let backEdgeCount = 0;

  const positionedEdges: GraphEdge[] = graph.edges.map((e) => {
    if (backEdgeIds.has(e.id)) {
      backEdgeCount++;
      const from = positionedNodes.find((n) => n.id === e.from)!;
      const to   = positionedNodes.find((n) => n.id === e.to)!;
      if (!from || !to) return { ...e, points: [], isBackEdge: true };

      const fh = (from.height || NODE_HEIGHT) / 2;
      const th = (to.height   || NODE_HEIGHT) / 2;
      const fw = (from.width  || MIN_WIDTH)   / 2;
      const tw = (to.width    || MIN_WIDTH)   / 2;
      const fx = from.x ?? 0, fy = from.y ?? 0;
      const tx = to.x   ?? 0, ty = to.y   ?? 0;

      if (!isVertical) {
        const localMaxY = Math.max(fy + fh, ty + th);
        const curveY = localMaxY + 30 + (backEdgeCount * 25);
        return {
          ...e, isBackEdge: true,
          points: [
            { x: fx, y: fy + fh },
            { x: fx, y: curveY },
            { x: (fx + tx) / 2, y: curveY + 15 },
            { x: tx, y: curveY },
            { x: tx, y: ty + th },
          ],
        };
      } else {
        const localMinX = Math.min(fx - fw, tx - tw);
        const curveX = localMinX - 30 - (backEdgeCount * 25);
        return {
          ...e, isBackEdge: true,
          points: [
            { x: fx - fw, y: fy },
            { x: curveX,  y: fy },
            { x: curveX - 15, y: (fy + ty) / 2 },
            { x: curveX,  y: ty },
            { x: tx - tw, y: ty },
          ],
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

  const positionedGroups: GraphGroup[] = (graph.groups || []).map(grp => {
    const nd = g.node(grp.id);
    return {
      ...grp,
      x: nd?.x ?? 0,
      y: nd?.y ?? 0,
      width: nd?.width ?? 0,
      height: nd?.height ?? 0
    };
  });

  // Normalize coordinates so content starts at (PAD, PAD) with symmetric margins.
  // This removes dagre's leftover asymmetric margins and prevents back-edge curves
  // (which can produce negative coordinates) from being clipped in the export.
  const PAD_NORM = 40;
  let nMinX = Infinity, nMinY = Infinity;
  positionedNodes.forEach(n => {
    const w = n.width || MIN_WIDTH, h = n.height || NODE_HEIGHT;
    nMinX = Math.min(nMinX, (n.x || 0) - w / 2);
    nMinY = Math.min(nMinY, (n.y || 0) - h / 2);
  });
  positionedEdges.forEach(e => (e.points || []).forEach(p => {
    nMinX = Math.min(nMinX, p.x); nMinY = Math.min(nMinY, p.y);
  }));
  positionedGroups.forEach(grp => {
    const w = grp.width || 0, h = grp.height || 0;
    nMinX = Math.min(nMinX, (grp.x || 0) - w / 2);
    nMinY = Math.min(nMinY, (grp.y || 0) - h / 2);
  });
  if (isFinite(nMinX) && isFinite(nMinY)) {
    const dx = PAD_NORM - nMinX, dy = PAD_NORM - nMinY;
    positionedNodes.forEach(n => { n.x = (n.x || 0) + dx; n.y = (n.y || 0) + dy; });
    positionedEdges.forEach(e => { e.points = (e.points || []).map(p => ({ x: p.x + dx, y: p.y + dy })); });
    positionedGroups.forEach(grp => { grp.x = (grp.x || 0) + dx; grp.y = (grp.y || 0) + dy; });
  }

  return { ...graph, nodes: positionedNodes, edges: positionedEdges, groups: positionedGroups };
}

export function getGraphDimensions(graph: Graph): { width: number; height: number } {
  let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
  graph.nodes.forEach((n) => {
    const hw = (n.width || MIN_WIDTH) / 2, hh = (n.height || NODE_HEIGHT) / 2;
    minX = Math.min(minX, (n.x || 0) - hw);
    minY = Math.min(minY, (n.y || 0) - hh);
    maxX = Math.max(maxX, (n.x || 0) + hw);
    maxY = Math.max(maxY, (n.y || 0) + hh);
  });
  graph.edges.forEach((e) => {
    (e.points || []).forEach((p) => {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    });
  });
  // Content is normalized to start at 40px; add matching 40px on the far side
  // so padding is symmetric and there is no wasted empty band.
  return {
    width:  (isFinite(maxX) ? maxX : 600) + 40,
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
  const BOX_W = 180, BOX_H = 92, GAP_X = 40, MARGIN = 64;
  const colStep = BOX_W + GAP_X;

  const nodes: GraphNode[] = graph.nodes.map(n => ({ ...n, width: BOX_W, height: BOX_H, x: 0, y: 0 }));
  const byId = new Map(nodes.map(n => [n.id, n]));
  const roleOf = (id: string): NodeRole => {
    const r = roles[id];
    return (r === 'lead-in' || r === 'pipeline' || r === 'service' || r === 'output') ? r : 'pipeline';
  };

  const out = new Map<string, string[]>(), inc = new Map<string, string[]>();
  nodes.forEach(n => { out.set(n.id, []); inc.set(n.id, []); });
  graph.edges.forEach(e => {
    if (byId.has(e.from) && byId.has(e.to) && e.from !== e.to) {
      out.get(e.from)!.push(e.to); inc.get(e.to)!.push(e.from);
    }
  });

  // Longest-path level for ordering within a role.
  const level = new Map<string, number>(); const rem = new Map<string, number>();
  nodes.forEach(n => rem.set(n.id, inc.get(n.id)!.length));
  const q: string[] = [];
  nodes.forEach(n => { if (rem.get(n.id) === 0) { level.set(n.id, 0); q.push(n.id); } });
  for (let h = 0; h < q.length; h++) {
    const id = q[h]; const lv = level.get(id) ?? 0;
    for (const nx of out.get(id)!) {
      if ((level.get(nx) ?? -1) < lv + 1) level.set(nx, lv + 1);
      const d = (rem.get(nx) ?? 1) - 1; rem.set(nx, d);
      if (d === 0) q.push(nx);
    }
  }
  nodes.forEach(n => { if (!level.has(n.id)) level.set(n.id, 0); });
  const byLv = (a: GraphNode, b: GraphNode) => (level.get(a.id)! - level.get(b.id)!);

  const leadIn = nodes.filter(n => roleOf(n.id) === 'lead-in').sort(byLv);
  const pipeline = nodes.filter(n => roleOf(n.id) === 'pipeline').sort(byLv);
  const services = nodes.filter(n => roleOf(n.id) === 'service').sort(byLv);
  const outputs = nodes.filter(n => roleOf(n.id) === 'output').sort(byLv);

  const PIPE_Y = MARGIN + 46 + BOX_H / 2;
  // Extra space between zones so their bounding boxes never overlap
  // (must exceed 2× the zone padding used below).
  const ZONE_GAP = 80;
  // Long pipelines wrap into serpentine rows so a 9-stage flow doesn't become
  // a 3000px-wide single row.
  const MAX_PER_ROW = 5;
  const ROW_GAP = 110; // vertical corridor between pipeline rows (used for routing)

  // Lead-in row on the left.
  let cx = MARGIN;
  leadIn.forEach(n => { n.x = cx + BOX_W / 2; n.y = PIPE_Y; cx += colStep; });
  if (leadIn.length && pipeline.length) cx += ZONE_GAP;

  // Pipeline: balanced serpentine rows (odd rows reversed) so consecutive
  // stages stay adjacent even across a row break.
  const pipeStartX = cx;
  const nRows = pipeline.length ? Math.ceil(pipeline.length / MAX_PER_ROW) : 0;
  const perRow = nRows ? Math.ceil(pipeline.length / nRows) : 0;
  pipeline.forEach((n, i) => {
    const r = Math.floor(i / perRow);
    let c = i % perRow;
    if (r % 2 === 1) c = perRow - 1 - c;
    n.x = pipeStartX + c * colStep + BOX_W / 2;
    n.y = PIPE_Y + r * (BOX_H + ROW_GAP);
  });
  if (pipeline.length) cx = pipeStartX + Math.min(pipeline.length, perRow) * colStep;
  const pipeBottomY = pipeline.length ? PIPE_Y + (nRows - 1) * (BOX_H + ROW_GAP) : PIPE_Y;

  // Outputs: stacked to the right, centred on the pipeline's vertical extent.
  if ((leadIn.length + pipeline.length) > 0 && outputs.length) cx += ZONE_GAP;
  const rightX = cx + BOX_W / 2;
  const oGap = BOX_H + 40;
  const outCenterY = (PIPE_Y + pipeBottomY) / 2;
  outputs.forEach((n, j) => { n.x = rightX; n.y = outCenterY + (j - (outputs.length - 1) / 2) * oGap; });

  // Services: a band below the LAST pipeline row, x near connected nodes.
  const svcY = pipeBottomY + BOX_H + 130;
  services.forEach(n => {
    const nb = [...out.get(n.id)!, ...inc.get(n.id)!].map(id => byId.get(id)).filter(Boolean) as GraphNode[];
    const avg = nb.length ? nb.reduce((s, m) => s + m.x!, 0) / nb.length : rightX / 2;
    n.x = avg; n.y = svcY;
  });
  // Spread services so they don't overlap.
  const svcSorted = [...services].sort((a, b) => a.x! - b.x!);
  for (let i = 1; i < svcSorted.length; i++) {
    const min = svcSorted[i - 1].x! + colStep;
    if (svcSorted[i].x! < min) svcSorted[i].x = min;
  }

  // ── Collision-aware orthogonal routing ──────────────────────────────────────
  // A straight segment through another node's box is never acceptable; blocked
  // routes go around through box-free corridors (row gaps, inter-column
  // channels, or a lane below everything in the span).
  const boxes = nodes.map(n => ({
    id: n.id,
    x0: n.x! - BOX_W / 2 - 4, x1: n.x! + BOX_W / 2 + 4,
    y0: n.y! - BOX_H / 2 - 4, y1: n.y! + BOX_H / 2 + 4,
  }));
  const clearH = (y: number, xa: number, xb: number, skip: Set<string>) => {
    const lo = Math.min(xa, xb), hi = Math.max(xa, xb);
    return !boxes.some(b => !skip.has(b.id) && y > b.y0 && y < b.y1 && hi > b.x0 && lo < b.x1);
  };
  const clearV = (x: number, ya: number, yb: number, skip: Set<string>) => {
    const lo = Math.min(ya, yb), hi = Math.max(ya, yb);
    return !boxes.some(b => !skip.has(b.id) && x > b.x0 && x < b.x1 && hi > b.y0 && lo < b.y1);
  };
  /** Lowest edge of any box inside the horizontal span (for below-all lanes). */
  const spanBottom = (xa: number, xb: number) => {
    const lo = Math.min(xa, xb) - BOX_W / 2, hi = Math.max(xa, xb) + BOX_W / 2;
    let y = -Infinity;
    boxes.forEach(b => { if (hi > b.x0 && lo < b.x1) y = Math.max(y, b.y1); });
    return y;
  };
  const laneUse = new Map<number, number>(); // stack parallel arcs on shared lanes

  /** Exit a node sideways and find a VERIFIED-clear vertical channel to `lane`
      (services sit at averaged x, so "half a column over" is not guaranteed clear). */
  const jogToLane = (nx: number, ny: number, prefDir: number, lane: number, skipSelf: Set<string>) => {
    for (const dir of [prefDir, -prefDir]) {
      for (let off = colStep / 2; off <= colStep * 2.5; off += 20) {
        const chX = nx + dir * off;
        if (clearH(ny, nx + dir * BOX_W / 2, chX, skipSelf) && clearV(chX, ny, lane, skipSelf)) {
          return { pts: [{ x: nx + dir * BOX_W / 2, y: ny }, { x: chX, y: ny }], chX };
        }
      }
    }
    const chX = nx + prefDir * (colStep / 2);
    return { pts: [{ x: nx + prefDir * BOX_W / 2, y: ny }, { x: chX, y: ny }], chX };
  };
  /** Come off `lane` through a verified-clear channel and enter the node's side. */
  const entryViaChannel = (nx: number, ny: number, prefSide: number, lane: number, skipSelf: Set<string>) => {
    for (const side of [prefSide, -prefSide]) {
      for (let off = colStep / 2; off <= colStep * 2.5; off += 20) {
        const chX = nx - side * off;
        const dir = nx >= chX ? 1 : -1;
        if (clearV(chX, lane, ny, skipSelf) && clearH(ny, chX, nx - dir * BOX_W / 2, skipSelf)) {
          return [{ x: chX, y: lane }, { x: chX, y: ny }, { x: nx - dir * BOX_W / 2, y: ny }];
        }
      }
    }
    const chX = nx - prefSide * (colStep / 2);
    return [{ x: chX, y: lane }, { x: chX, y: ny }, { x: nx - prefSide * BOX_W / 2, y: ny }];
  };

  const edges: GraphEdge[] = graph.edges.map(e => {
    const f = byId.get(e.from), t = byId.get(e.to);
    if (!f || !t) return { ...e, points: [] };
    const fx = f.x!, fy = f.y!, tx = t.x!, ty = t.y!;
    const skip = new Set([f.id, t.id]);
    const skipF = new Set([f.id]);
    const skipT = new Set([t.id]);

    // ── Same row ──
    if (Math.abs(fy - ty) < 1) {
      const dir = tx >= fx ? 1 : -1;
      if (clearH(fy, fx + dir * BOX_W / 2, tx - dir * BOX_W / 2, skip)) {
        return { ...e, points: [{ x: fx + dir * BOX_W / 2, y: fy }, { x: tx - dir * BOX_W / 2, y: ty }] };
      }
      // Blocked → arc below everything in the span.
      let laneY = spanBottom(fx, tx) as number;
      const key = Math.round(laneY);
      const k = laneUse.get(key) || 0; laneUse.set(key, k + 1);
      laneY += 26 + k * 18;
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
    const startY = fy + down * BOX_H / 2;
    const endY = ty - down * BOX_H / 2;
    // Candidate horizontal lanes: midpoint, the box-free gap just before the
    // target row, then a lane below everything in the span.
    const candidates = [(startY + endY) / 2, endY - down * 26];
    let lane = candidates.find(y => clearH(y, fx, tx, skip));
    if (lane === undefined) {
      const key0 = spanBottom(fx, tx) as number;
      const k = laneUse.get(Math.round(key0)) || 0; laneUse.set(Math.round(key0), k + 1);
      lane = key0 + 26 + k * 18;
    }
    const pts: { x: number; y: number }[] = [];
    let exitX = fx;
    const goingToLaneDown = lane > fy ? 1 : -1;
    if (clearV(fx, fy + goingToLaneDown * BOX_H / 2 + goingToLaneDown, lane, skipF)) {
      pts.push({ x: fx, y: fy + goingToLaneDown * BOX_H / 2 });
    } else {
      const j = jogToLane(fx, fy, tx >= fx ? 1 : -1, lane, skipF);
      pts.push(...j.pts);
      exitX = j.chX;
    }
    pts.push({ x: exitX, y: lane });
    const laneToTargetDown = ty > lane ? 1 : -1;
    if (clearV(tx, lane, ty - laneToTargetDown * BOX_H / 2, skipT)) {
      pts.push({ x: tx, y: lane }, { x: tx, y: ty - laneToTargetDown * BOX_H / 2 });
    } else {
      pts.push(...entryViaChannel(tx, ty, tx >= exitX ? 1 : -1, lane, skipT));
    }
    return { ...e, points: pts };
  });

  // Zone boxes (Client / Backend Pipeline / Outputs) drawn by the canvas.
  const zoneDefs = [
    { ids: leadIn, label: 'Client' },
    { ids: pipeline, label: 'Backend Pipeline' },
    { ids: outputs, label: 'Outputs' },
  ];
  const groups: GraphGroup[] = zoneDefs.filter(z => z.ids.length > 0).map((z, i) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    z.ids.forEach(m => {
      x0 = Math.min(x0, m.x! - BOX_W / 2); y0 = Math.min(y0, m.y! - BOX_H / 2);
      x1 = Math.max(x1, m.x! + BOX_W / 2); y1 = Math.max(y1, m.y! + BOX_H / 2);
    });
    // Generous side padding + extra room on top for the zone header.
    const p = 30, topExtra = 26;
    return { id: 'zone_' + i, label: z.label, members: z.ids.map(m => m.id),
      x: (x0 + x1) / 2, y: (y0 + y1) / 2 - topExtra / 2,
      width: (x1 - x0) + 2 * p, height: (y1 - y0) + 2 * p + topExtra };
  });

  // Normalize so the whole thing starts at (MARGIN, MARGIN).
  let mnX = Infinity, mnY = Infinity;
  nodes.forEach(n => { mnX = Math.min(mnX, n.x! - BOX_W / 2); mnY = Math.min(mnY, n.y! - BOX_H / 2); });
  groups.forEach(g => { mnX = Math.min(mnX, g.x! - g.width! / 2); mnY = Math.min(mnY, g.y! - g.height! / 2); });
  const dx = MARGIN - mnX, dy = MARGIN - mnY;
  nodes.forEach(n => { n.x! += dx; n.y! += dy; });
  edges.forEach(e => { e.points = (e.points || []).map(p => ({ x: p.x + dx, y: p.y + dy })); });
  groups.forEach(g => { g.x! += dx; g.y! += dy; });

  return { ...graph, nodes, edges, groups, layout: 'LR' };
}

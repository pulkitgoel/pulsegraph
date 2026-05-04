import dagre from '@dagrejs/dagre';
import type { Graph, GraphNode, GraphEdge, GraphGroup } from '../types';

const NODE_HEIGHT = 52;
const CHAR_PX = 7.2;
const MIN_WIDTH = 130;
const MAX_WIDTH = 240;
const ICON_PAD = 38;

function getLabelLines(label: string, maxWidth: number): string[] {
  if (label.includes('<br>') || label.includes('<br/>')) {
    return label.replace(/<br\s*\/?>/g, '\n').split('\n').map(l => l.trim()).slice(0, 4);
  }
  const approxChars = Math.floor(maxWidth / CHAR_PX);
  if (label.length <= approxChars) return [label];
  const words = label.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length <= approxChars) cur = (cur + ' ' + w).trim();
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

export function getNodeDimensions(label: string): { width: number; height: number } {
  const lines = getLabelLines(label, MAX_WIDTH - ICON_PAD);
  const maxLineLen = Math.max(...lines.map(l => l.length));
  const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.ceil(maxLineLen * CHAR_PX) + ICON_PAD));
  const height = Math.max(NODE_HEIGHT, 30 + lines.length * 15);
  return { width, height };
}

export function computeLayout(graph: Graph): Graph {
  // Enable compound graph for subgraphs/clusters
  const g = new dagre.graphlib.Graph({ compound: true });
  g.setDefaultEdgeLabel(() => ({}));

  const isVertical = (graph.layout || 'LR') === 'TB';
  g.setGraph({
    rankdir: graph.layout || 'LR',
    marginx: 80,
    marginy: 80,
    nodesep: isVertical ? 60 : 80,
    ranksep: isVertical ? 100 : 160,
    edgesep: 30,
  });

  const nodesWithSize: GraphNode[] = graph.nodes.map((n) => {
    const dim = getNodeDimensions(n.label);
    return {
      ...n,
      width: n.width || dim.width,
      height: n.height || dim.height,
    };
  });

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
    if (!backEdgeIds.has(e.id)) g.setEdge(e.from, e.to, { id: e.id });
  });

  dagre.layout(g);

  const positionedNodes: GraphNode[] = nodesWithSize.map((n) => {
    const nd = g.node(n.id);
    return { ...n, x: nd?.x ?? 0, y: nd?.y ?? 0 };
  });

  const positionedEdges: GraphEdge[] = graph.edges.map((e) => {
    if (backEdgeIds.has(e.id)) {
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
        const curveY = Math.max(fy, ty) + fh + 50;
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
        const curveX = Math.min(fx, tx) - Math.max(fw, tw) - 50;
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
      const ed = g.edge(e.from, e.to);
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
  // Add padding; ensure SVG viewBox always has room
  return {
    width:  (isFinite(maxX) ? maxX : 600) + 80,
    height: (isFinite(maxY) ? maxY : 400) + 80,
  };
}

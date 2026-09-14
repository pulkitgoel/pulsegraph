import type { Graph } from '../types';

/**
 * Deterministic topological levels (Kahn's algorithm), ignoring back-edges.
 * Level 0 = roots (in-degree 0). Nodes stuck in cycles / disconnected get the
 * next level after the last computed one.
 *
 * Pure function of the graph — shared by both canvases (animation order +
 * step badges) and by the GIF exporter (to size the capture duration).
 */
/**
 * Structurally detect back-edges via DFS. Without this, ANY cycle that reaches
 * the entry node (retry loops, polling loops like POLL→User) leaves the graph
 * with zero in-degree-0 roots, Kahn's never starts, and every node collapses
 * to level 0 — all step badges read "1" and all animations fire at once.
 */
export function findBackEdgeIds(graph: Graph): Set<string> {
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const backEdges = new Set<string>();
  const outEdges = new Map<string, { id: string; to: string }[]>();
  graph.nodes.forEach((n) => outEdges.set(n.id, []));
  graph.edges.forEach((e) => outEdges.get(e.from)?.push({ id: e.id, to: e.to }));

  function dfs(id: string) {
    visited.add(id);
    inStack.add(id);
    for (const e of outEdges.get(id) || []) {
      if (inStack.has(e.to)) backEdges.add(e.id);
      else if (!visited.has(e.to)) dfs(e.to);
    }
    inStack.delete(id);
  }
  graph.nodes.forEach((n) => {
    if (!visited.has(n.id)) dfs(n.id);
  });
  return backEdges;
}

export function computeLevels(graph: Graph): Map<string, number> {
  const levels = new Map<string, number>();
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  const backEdges = findBackEdgeIds(graph);

  graph.nodes.forEach((n) => {
    inDegree.set(n.id, 0);
    adj.set(n.id, []);
  });
  graph.edges.forEach((e) => {
    if (!e.isBackEdge && !backEdges.has(e.id) && inDegree.has(e.to) && adj.has(e.from)) {
      inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
      adj.get(e.from)!.push(e.to);
    }
  });

  let queue: string[] = [];
  graph.nodes.forEach((n) => {
    if (inDegree.get(n.id) === 0) queue.push(n.id);
  });

  let level = 0;
  while (queue.length > 0) {
    const next: string[] = [];
    for (const u of queue) {
      levels.set(u, level);
      for (const v of adj.get(u) || []) {
        inDegree.set(v, (inDegree.get(v) || 0) - 1);
        if (inDegree.get(v) === 0) next.push(v);
      }
    }
    queue = next;
    level++;
  }

  // Fallback for cycles or disconnected nodes
  graph.nodes.forEach((n) => {
    if (!levels.has(n.id)) levels.set(n.id, level);
  });
  return levels;
}

export function maxLevel(levels: Map<string, number>): number {
  let m = 0;
  levels.forEach((v) => {
    if (v > m) m = v;
  });
  return m;
}

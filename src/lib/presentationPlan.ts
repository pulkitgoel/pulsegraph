import type { Graph } from '../types';
import { computeLevels, findBackEdgeIds } from './graphLevels';

export interface PresentationLane {
  title: string;
  kind: 'journey' | 'support' | 'platform';
  nodeIds: string[];
}
export interface PresentationPlan {
  title: string;
  mainPath: string[];
  lanes: PresentationLane[];
}

/** Source groups may hold only child groups, with no direct node members. */
export function presentationGroupMembers(graph: Graph, groupId: string): string[] {
  const members = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    const group = graph.groups?.find((item) => item.id === id);
    group?.members.forEach((member) => members.add(member));
    graph.groups
      ?.filter((item) => item.parentId === id)
      .forEach((item) => visit(item.id));
  };
  visit(groupId);
  return [...members];
}

function fail(): never {
  throw new Error('The AI slide plan does not preserve the diagram. Please retry.');
}

/** Accept composition metadata, never model-generated nodes, edges or coordinates. */
export function validatePresentationPlan(value: unknown, graph: Graph): PresentationPlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const plan = value as Record<string, unknown>;
  const title = (text: unknown) => {
    if (
      typeof text !== 'string' ||
      !text.trim() ||
      text.length > 100 ||
      /[<>]/.test(text)
    )
      return fail();
    return text.trim();
  };
  const ids = new Set(graph.nodes.map((node) => node.id));
  if (
    !Array.isArray(plan.mainPath) ||
    !plan.mainPath.length ||
    plan.mainPath.some((id) => typeof id !== 'string' || !ids.has(id))
  )
    return fail();
  const mainPath = plan.mainPath as string[];
  if (new Set(mainPath).size !== mainPath.length) return fail();
  if (
    mainPath.some(
      (id, index) =>
        index > 0 &&
        !graph.edges.some((edge) => edge.from === mainPath[index - 1] && edge.to === id),
    )
  )
    return fail();
  if (
    !Array.isArray(plan.lanes) ||
    !plan.lanes.length ||
    plan.lanes.length > graph.nodes.length
  )
    return fail();
  const assigned = new Set<string>();
  const lanes = plan.lanes.map((item: unknown): PresentationLane => {
    if (!item || typeof item !== 'object') return fail();
    const lane = item as Record<string, unknown>;
    if (lane.kind !== 'journey' && lane.kind !== 'support' && lane.kind !== 'platform')
      return fail();
    if (!Array.isArray(lane.nodeIds) || !lane.nodeIds.length) return fail();
    const nodeIds = lane.nodeIds.map((id: unknown) => {
      if (typeof id !== 'string' || !ids.has(id) || assigned.has(id)) return fail();
      assigned.add(id);
      return id;
    });
    return { title: title(lane.title), kind: lane.kind, nodeIds };
  });
  if (assigned.size !== ids.size) return fail();
  // An explicit source group must not be scattered across invented AI sections.
  for (const group of graph.groups ?? []) {
    const members = presentationGroupMembers(graph, group.id);
    const membership = lanes.filter((lane) =>
      members.some((id) => lane.nodeIds.includes(id)),
    );
    if (membership.length > 1) return fail();
  }
  return { title: title(plan.title), mainPath: [...mainPath], lanes };
}

/** Compatibility preview for old role-only documents; clearly labelled as local. */
export function localPresentationPlan(
  graph: Graph,
  roles: Record<string, string>,
): PresentationPlan {
  const levels = computeLevels(graph);
  const order = [...graph.nodes].sort(
    (a, b) => (levels.get(a.id) ?? 0) - (levels.get(b.id) ?? 0),
  );
  const back = findBackEdgeIds(graph);
  const paths = new Map<string, string[]>();
  const longest = (id: string, visiting = new Set<string>()): string[] => {
    if (visiting.has(id)) return [];
    if (paths.has(id)) return paths.get(id)!;
    const next = new Set(visiting).add(id);
    const branches = graph.edges
      .filter((edge) => edge.from === id && !back.has(edge.id))
      .map((edge) => longest(edge.to, next));
    const result = [id, ...(branches.sort((a, b) => b.length - a.length)[0] ?? [])];
    paths.set(id, result);
    return result;
  };
  const mainPath =
    order.map((node) => longest(node.id)).sort((a, b) => b.length - a.length)[0] ?? [];
  const topGroups = (graph.groups ?? [])
    .filter((group) => !group.parentId)
    .map((group) => ({ ...group, members: presentationGroupMembers(graph, group.id) }))
    .filter((group) => group.members.length > 0);
  const grouped = new Set(topGroups.flatMap((group) => group.members));
  const firstGroupLevel = Math.min(
    ...order
      .filter((node) => grouped.has(node.id))
      .map((node) => levels.get(node.id) ?? 0),
  );
  const main = order.filter(
    (node) =>
      !grouped.has(node.id) &&
      mainPath.includes(node.id) &&
      roles[node.id] !== 'output' &&
      (levels.get(node.id) ?? 0) < firstGroupLevel &&
      (roles[node.id] !== 'service' || node.type === 'gateway'),
  );
  const remaining = order.filter(
    (node) => !grouped.has(node.id) && !main.some((item) => item.id === node.id),
  );
  const lanes: PresentationLane[] = [];
  if (main.length)
    lanes.push({
      title: 'Main journey',
      kind: 'journey',
      nodeIds: main.map((node) => node.id),
    });
  for (const group of topGroups)
    lanes.push({
      title: group.label.replace(/[<>]/g, '').trim().slice(0, 100) || 'Source group',
      kind: 'journey',
      nodeIds: order
        .filter((node) => group.members.includes(node.id))
        .map((node) => node.id),
    });
  if (remaining.length)
    lanes.push({
      title: 'Supporting systems & results',
      kind: 'support',
      nodeIds: remaining.map((node) => node.id),
    });
  return validatePresentationPlan({ title: 'System flow', mainPath, lanes }, graph);
}

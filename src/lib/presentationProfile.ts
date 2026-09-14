import type { Graph } from '../types';

export interface PresentationProfile {
  title: string;
  primaryZone: string;
  entryZone: string;
  serviceZone: string;
  outputZone: string;
  layout: 'sequence' | 'branching';
}

const textOf = (graph: Graph) =>
  graph.nodes
    .map((node) => node.label)
    .join(' ')
    .toLowerCase();

export function presentationProfile(graph: Graph): PresentationProfile {
  const text = textOf(graph);
  const outDegree = new Map(graph.nodes.map((node) => [node.id, 0]));
  graph.edges.forEach((edge) =>
    outDegree.set(edge.from, (outDegree.get(edge.from) ?? 0) + 1),
  );
  const branching =
    graph.nodes.some((node) => node.type === 'gateway') ||
    [...outDegree.values()].some((degree) => degree > 1);

  if (/\b(deploy|release|build|pipeline|github|gitlab|ci|cd|container)\b/.test(text)) {
    return {
      title: 'Delivery Workflow',
      entryZone: 'Sources',
      primaryZone: branching ? 'Checks & Delivery Paths' : 'Delivery Stages',
      serviceZone: 'Tooling',
      outputZone: 'Targets',
      layout: branching ? 'branching' : 'sequence',
    };
  }

  if (/\b(auth|login|identity|token|permission|security|user|api|gateway)\b/.test(text)) {
    return {
      title: branching ? 'Request Decision Flow' : 'Service Interaction',
      entryZone: 'Actors & Entry Points',
      primaryZone: branching ? 'Rules & Request Paths' : 'Request Flow',
      serviceZone: 'Security & Data Services',
      outputZone: 'Responses',
      layout: branching ? 'branching' : 'sequence',
    };
  }

  if (branching) {
    return {
      title: 'Decision Flow',
      entryZone: 'Triggers',
      primaryZone: 'Decision Paths',
      serviceZone: 'Dependencies',
      outputZone: 'Outcomes',
      layout: 'branching',
    };
  }

  return {
    title: 'Process Flow',
    entryZone: 'Inputs',
    primaryZone: 'Main Flow',
    serviceZone: 'Supporting Systems',
    outputZone: 'Results',
    layout: 'sequence',
  };
}

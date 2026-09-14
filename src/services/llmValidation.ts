import type { Graph } from '../types';
import { parseMermaid } from '../parser/mermaidParser';

export const DIAGRAM_LIMITS = {
  sourceCharacters: 30_000,
  nodes: 100,
  edges: 300,
} as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseJsonObject(raw: string): Record<string, unknown> {
  const content = raw
    .trim()
    .replace(/^\x60\x60\x60(?:json)?\s*/i, '')
    .replace(/\s*\x60\x60\x60$/, '');

  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error('The model returned invalid JSON. Please retry.');
  }

  if (!isRecord(value)) {
    throw new Error('The model returned an invalid response object.');
  }

  return value;
}

export function readCompletion(envelope: unknown): Record<string, unknown> {
  if (!isRecord(envelope) || !Array.isArray(envelope.choices)) {
    throw new Error('The provider returned an invalid completion response.');
  }

  const choice: unknown = envelope.choices[0];
  if (!isRecord(choice)) {
    throw new Error('The provider returned no completion.');
  }

  if (choice.finish_reason === 'length') {
    throw new Error('The model response was truncated. Try a smaller diagram.');
  }

  if (!isRecord(choice.message) || typeof choice.message.content !== 'string') {
    throw new Error('The provider returned invalid message content.');
  }

  return parseJsonObject(choice.message.content);
}

/** Parse completely before the caller commits any document state. */
export function parseDiagram(source: string): Graph {
  if (!source.trim() || source.length > DIAGRAM_LIMITS.sourceCharacters) {
    throw new Error('Enter a flowchart of up to 30,000 characters.');
  }

  if (
    /^(sequenceDiagram|stateDiagram|classDiagram|erDiagram|gantt|pie|journey|mindmap|gitGraph|quadrantChart|xychart)\b/i.test(
      source.trim(),
    )
  ) {
    throw new Error(
      'Only Mermaid flowcharts are supported. Describe the flow in plain language to convert it with AI.',
    );
  }
  const graph = parseMermaid(source);
  if (graph.nodes.length === 0) {
    throw new Error('No flowchart nodes found. Try: flowchart LR; A[Start] --> B[End].');
  }

  if (graph.warnings?.length) {
    throw new Error(
      'Please fix the source first:\n' + graph.warnings.slice(0, 5).join('\n'),
    );
  }

  if (
    graph.nodes.length > DIAGRAM_LIMITS.nodes ||
    graph.edges.length > DIAGRAM_LIMITS.edges
  ) {
    throw new Error('Use up to 100 nodes and 300 connections per diagram.');
  }

  graph.mermaidSource = source.trim();
  return graph;
}

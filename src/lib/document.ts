import type { Graph } from '../types';
import { parseDiagram } from '../services/llmValidation';
import { computeLayout, roleBlueprintLayout } from '../parser/layoutEngine';
import { validateRoles } from './roles';

export interface DiagramDocument {
  source: string;
  graph: Graph;
  roles: Record<string, string> | null;
}

export function createDocument(
  source: string,
  roles: Record<string, string> | null = null,
): DiagramDocument {
  const parsed = parseDiagram(source);
  const validatedRoles = roles
    ? validateRoles(
        roles,
        parsed.nodes.map((node) => node.id),
      )
    : null;

  return {
    source: source.trim(),
    graph: validatedRoles
      ? roleBlueprintLayout(parsed, validatedRoles)
      : computeLayout(parsed),
    roles: validatedRoles,
  };
}

export function serializeDocument(document: DiagramDocument): string {
  return JSON.stringify(
    {
      version: 1,
      source: document.source,
      roles: document.roles,
    },
    null,
    2,
  );
}

export function deserializeDocument(raw: string): DiagramDocument {
  if (raw.length > 100_000) {
    throw new Error('Document exceeds the 100 KB import limit.');
  }

  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid PulseGraph document.');
  }

  const data = value as Record<string, unknown>;
  if (data.version !== 1 || typeof data.source !== 'string') {
    throw new Error('Unsupported document version or missing source.');
  }

  const graph = parseDiagram(data.source);
  const roles =
    data.roles == null
      ? null
      : validateRoles(
          data.roles,
          graph.nodes.map((node) => node.id),
        );

  return createDocument(data.source, roles);
}

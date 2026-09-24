import type { Graph } from '../types';
import { parseDiagram } from '../services/llmValidation';
import { computeLayout, roleBlueprintLayout } from '../parser/layoutEngine';
import { validateRoles } from './roles';
import { validatePresentationPlan, type PresentationPlan } from './presentationPlan';

export interface DiagramDocument {
  source: string;
  graph: Graph;
  roles: Record<string, string> | null;
  presentation?: PresentationPlan;
}

export function createDocument(
  source: string,
  roles: Record<string, string> | null = null,
  presentation?: PresentationPlan,
): DiagramDocument {
  if (presentation && !roles)
    throw new Error('Presentation metadata requires validated roles.');
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
    ...(presentation
      ? { presentation: validatePresentationPlan(presentation, parsed) }
      : {}),
  };
}

export function serializeDocument(document: DiagramDocument): string {
  return JSON.stringify(
    {
      version: 1,
      source: document.source,
      roles: document.roles,
      ...(document.presentation ? { presentation: document.presentation } : {}),
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

  const presentation =
    data.presentation == null
      ? undefined
      : validatePresentationPlan(data.presentation, graph);
  if (presentation && !roles)
    throw new Error('Presentation metadata requires validated roles.');
  return createDocument(data.source, roles, presentation);
}

import type { ChatMessage, Graph, LlmProvider, OllamaModel } from '../types';
import { looksLikeMermaid } from '../parser/mermaidParser';
import { validateRoles } from '../lib/roles';
import { type PresentationPlan } from '../lib/presentationPlan';
import { selectPresentation } from '../lib/presentationSelection';
import type { PresentationIconBounds } from '../lib/presentationIcon';
import { requestCompletion } from './llmClient';
import { GENERATE_DIAGRAM_PROMPT, PRESENTATION_ROLES_PROMPT } from './llmPrompts';
import { parseDiagram } from './llmValidation';

export { parseDiagram } from './llmValidation';

export interface SendMessageResult {
  message: string;
  graph: Graph | null;
  mermaidSource: string;
  isOffTopic: boolean;
  roles?: Record<string, string>;
  presentation?: PresentationPlan;
}

type ProgressCallback = (step: 'generating' | 'validating' | 'rendering') => void;

function diagramSignature(graph: Graph): string {
  // Compare parsed content, not lowercased source: IDs and label text are
  // case-sensitive, and whitespace inside labels can be intentional.
  return JSON.stringify({
    layout: graph.layout,
    nodes: graph.nodes.map(({ id, label, type, color }) => ({ id, label, type, color })),
    edges: graph.edges.map(({ from, to, label, dashed, arrow, thick }) => ({
      from,
      to,
      label,
      dashed,
      arrow,
      thick,
    })),
    groups: graph.groups?.map(({ id, label, members, parentId }) => ({
      id,
      label,
      members,
      parentId,
    })),
  });
}

/** Direct Mermaid stays local; natural-language requests use one AI call. */
export async function sendMessage(
  userMessage: string,
  history: ChatMessage[],
  currentGraph: Graph | null,
  apiKey: string,
  provider: LlmProvider,
  ollamaModel: OllamaModel = 'gemma3:4b',
  onStep?: ProgressCallback,
  signal?: AbortSignal,
): Promise<SendMessageResult> {
  let source = userMessage.trim();
  let refinedSource: string | undefined;

  if (!looksLikeMermaid(source)) {
    onStep?.('generating');

    const currentSource = currentGraph?.mermaidSource?.trim();
    const request = currentSource
      ? {
          operation: 'refine',
          instruction: userMessage,
          currentDiagram: currentSource,
        }
      : {
          operation: 'create',
          instruction: userMessage,
        };

    const response = await requestCompletion({
      systemPrompt: GENERATE_DIAGRAM_PROMPT,
      content: JSON.stringify(request),
      history,
      apiKey,
      provider,
      model: ollamaModel,
      signal,
    });

    if (typeof response.mermaidCode !== 'string') {
      throw new Error('The model did not return Mermaid code. Please retry.');
    }

    source = response.mermaidCode.trim();
    if (source === 'OFFTOPIC') {
      return {
        message: 'Describe a system or process, or paste a Mermaid flowchart.',
        graph: null,
        mermaidSource: '',
        isOffTopic: true,
      };
    }

    refinedSource = currentSource;
  }

  onStep?.('validating');
  const graph = parseDiagram(source);
  if (
    refinedSource &&
    diagramSignature(graph) === diagramSignature(parseDiagram(refinedSource))
  ) {
    throw new Error(
      'The AI returned the current diagram without applying your instruction. Try again or make the change in Edit source.',
    );
  }
  onStep?.('rendering');

  return {
    message:
      'Diagram ready — ' +
      graph.nodes.length +
      ' nodes, ' +
      graph.edges.length +
      ' connections.',
    graph,
    mermaidSource: source,
    isOffTopic: false,
  };
}

/** The model proposes composition metadata; the original graph remains authoritative. */
export async function designPresentation(
  currentMermaid: string,
  apiKey: string,
  provider: LlmProvider,
  ollamaModel: OllamaModel = 'gemma3:4b',
  onStep?: ProgressCallback,
  signal?: AbortSignal,
  iconBounds?: Record<string, PresentationIconBounds>,
): Promise<SendMessageResult> {
  const graph = parseDiagram(currentMermaid);
  onStep?.('generating');

  const response = await requestCompletion({
    systemPrompt: PRESENTATION_ROLES_PROMPT,
    content: JSON.stringify({
      nodes: graph.nodes.map(({ id, label, type }) => ({ id, label, type })),
      edges: graph.edges.map(({ id, from, to, label, arrow, dashed, thick }) => ({
        id,
        from,
        to,
        label,
        arrow,
        dashed,
        thick,
      })),
      groups: graph.groups?.map(({ id, label, members, parentId }) => ({
        id,
        label,
        members,
        parentId,
      })),
    }),
    apiKey,
    provider,
    model: ollamaModel,
    signal,
  });

  const roles = validateRoles(
    response.roles,
    graph.nodes.map((node) => node.id),
  );
  onStep?.('validating');
  if (
    response.alternatives != null &&
    (!Array.isArray(response.alternatives) ||
      response.alternatives.length > 2 ||
      response.presentation == null)
  ) {
    throw new Error(
      'The AI returned invalid presentation choices. Your current diagram has been kept.',
    );
  }
  const presentation =
    response.presentation == null
      ? undefined
      : selectPresentation(
          graph,
          [
            response.presentation,
            ...(Array.isArray(response.alternatives) ? response.alternatives : []),
          ],
          iconBounds,
        );
  onStep?.('rendering');

  return {
    graph,
    roles,
    presentation,
    mermaidSource: currentMermaid,
    isOffTopic: false,
    message: 'Presentation ready. All original nodes, labels and connections preserved.',
  };
}

import type { Graph, ChatMessage, LlmProvider } from '../types';
import { parseMermaid, looksLikeMermaid } from '../parser/mermaidParser';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const OLLAMA_API_URL = 'http://localhost:11434/v1/chat/completions';

// ── Pass 1 — Generate canonical Mermaid from user intent ─────────────────────
const GENERATE_PROMPT = `You are a diagram architect. Convert the user's input into a valid Mermaid flowchart.

STRICT OUTPUT RULES:
- Output RAW Mermaid code ONLY. No markdown fences (\`\`\`), no explanation, no preamble.
- Start directly with "flowchart LR" or "flowchart TD".
- Use node SHAPES to encode semantic type:
    A[Label]     = service / process / backend
    A(Label)     = client / frontend / browser
    A{Label}     = gateway / router / decision / load balancer
    A[(Label)]   = database / storage (SQL, NoSQL)
    A[/Label/]   = cache / queue (Redis, Kafka, RabbitMQ)
    A((Label))   = user / actor / person
- Use short, clear edge labels (2-4 words max). Every edge MUST have a label.
- Use subgraph blocks to group related components.
- Use "flowchart LR" for most system diagrams.
- Use "flowchart TD" for sequential flows (CI/CD, login steps).
- ALWAYS convert to Flowcharts. If the user asks for a Mindmap, Sequence Diagram, Class Diagram, or Gantt chart, TRANSLATE their intent into a "flowchart TD" layout. Do NOT output "sequenceDiagram" or "mindmap".
- If the user already provided Mermaid code, output it cleaned and improved as a flowchart.
- If input is unrelated to diagrams: output exactly: OFFTOPIC`;

// ── Pass 2 — Validate and correct the generated Mermaid ──────────────────────
const VALIDATE_PROMPT = `You are a technical diagram reviewer. Given a Mermaid flowchart, validate and correct it.

CHECK FOR:
1. Missing return paths: if A calls B, is there a response edge from B back to A?
2. Dead-end nodes: nodes with no outgoing edge (unless they are terminal outputs like DB/user)
3. Wrong edge direction (should follow data/request flow)
4. Missing or vague edge labels
5. Nodes that should be grouped in subgraphs but aren't

OUTPUT RULES:
- Output ONLY the corrected Mermaid code. No explanation, no markdown fences.
- Start with "flowchart LR" or "flowchart TD".
- If the diagram is already complete and correct, output it UNCHANGED.
- Do NOT add unnecessary complexity. Keep it clean.`;

// ── LLM helper ────────────────────────────────────────────────────────────────
async function callLLM(
  systemPrompt: string,
  userContent: string,
  history: ChatMessage[],
  apiKey: string,
  provider: LlmProvider,
  temperature = 0.1,
): Promise<string> {
  const url = provider === 'deepseek' ? DEEPSEEK_API_URL : OLLAMA_API_URL;
  const model = provider === 'deepseek' ? 'deepseek-chat' : 'gemma3:4b';
  
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (provider === 'deepseek') {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-4).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userContent },
  ];

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: 2000,
    }),
  });
  
  if (!resp.ok) {
    const errorText = await resp.text();
    const providerName = provider === 'deepseek' ? 'DeepSeek' : 'Ollama';
    throw new Error(`${providerName} API ${resp.status}: ${errorText}`);
  }
  
  const data = await resp.json();
  const raw: string = data.choices[0]?.message?.content ?? '';
  // Strip markdown fences if LLM added them despite instructions
  return raw.replace(/^```(?:mermaid)?\n?/i, '').replace(/\n?```$/i, '').trim();
}

// ── Public API ────────────────────────────────────────────────────────────────
export interface SendMessageResult {
  message: string;
  graph: Graph | null;
  mermaidSource: string;
  isOffTopic: boolean;
}

export async function sendMessage(
  userMessage: string,
  history: ChatMessage[],
  currentGraph: Graph | null,
  apiKey: string,
  provider: LlmProvider,
  onStep?: (step: 'generating' | 'validating' | 'rendering') => void,
): Promise<SendMessageResult> {

  // ── Pass 1 ─ Generate Mermaid ───────────────────────────────────────────────
  let mermaidDraft: string;

  if (looksLikeMermaid(userMessage)) {
    // User already gave us Mermaid → skip Pass 1, validate directly
    mermaidDraft = userMessage;
    onStep?.('validating');
  } else {
    onStep?.('generating');
    // Provide conversation context if refining an existing diagram
    const contextNote = currentGraph
      ? `\n\nContext (current diagram Mermaid — refine it based on the request):\n${(currentGraph as Graph & { mermaidSource?: string }).mermaidSource ?? 'see graph JSON'}`
      : '';
    const pass1Input = userMessage + contextNote;
    mermaidDraft = await callLLM(GENERATE_PROMPT, pass1Input, history, apiKey, provider);
  }

  // ── Off-topic guard ─────────────────────────────────────────────────────────
  if (mermaidDraft.trim().toUpperCase() === 'OFFTOPIC') {
    return {
      message: 'I only create diagrams. Describe any system, flow or architecture!',
      graph: null,
      mermaidSource: '',
      isOffTopic: true,
    };
  }

  // ── Pass 2 ─ Validate and correct ──────────────────────────────────────────
  onStep?.('validating');
  const mermaidValidated = await callLLM(VALIDATE_PROMPT, mermaidDraft, history, apiKey, provider, 0.05);

  // Strip any remaining fences
  const mermaidFinal = mermaidValidated
    .replace(/^```(?:mermaid)?\n?/i, '')
    .replace(/\n?```$/i, '')
    .trim();

  // ── Parse Mermaid → Graph ──────────────────────────────────────────────────
  onStep?.('rendering');
  const graph = parseMermaid(mermaidFinal);

  // Attach the Mermaid source so App can display it
  (graph as Graph & { mermaidSource: string }).mermaidSource = mermaidFinal;

  // Build a short human message from node/edge count
  const msg = `Diagram ready — ${graph.nodes.length} nodes, ${graph.edges.length} connections.`;

  return { message: msg, graph, mermaidSource: mermaidFinal, isOffTopic: false };
}

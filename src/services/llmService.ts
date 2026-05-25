import type { Graph, ChatMessage, LlmProvider, OllamaModel } from '../types';
import { parseMermaid, looksLikeMermaid } from '../parser/mermaidParser';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const OLLAMA_API_URL = 'http://localhost:11434/v1/chat/completions';

// ── Pass 1 — Generate canonical Mermaid from user intent ─────────────────────
const GENERATE_PROMPT = `You are a diagram architect. Convert the user's input into a valid Mermaid flowchart, an animation sequence, and custom CSS animations.

STRICT OUTPUT RULES:
- Output a RAW JSON object ONLY. No markdown fences (\`\`\`), no explanation, no preamble.
- The JSON MUST have exactly three keys: "mermaidCode", "animationSteps", and "aiAnimations".
- "mermaidCode" must be a string containing the raw Mermaid flowchart code (starting with "flowchart LR" or "flowchart TD").
- "animationSteps" must be an array of arrays of strings. Each inner array contains the node IDs that should animate in together at that step.
- "aiAnimations" must be an object with two keys: "cssKeyframes" (raw CSS @keyframes definitions) and "nodeClasses" (a map of node IDs to the CSS class names you generated).
- IMPORTANT: You have full freedom to write CSS keyframes for floating, bouncing, pulsing, or glowing. Arrange the CSS correctly according to the flow or architecture (e.g., databases get data-ring animations, gateways get pulsing shields, floating effects for cloud nodes).
- Example: {"mermaidCode": "flowchart LR\\nA[User] --> B[API]", "animationSteps": [["A"], ["B"]], "aiAnimations": {"cssKeyframes": "@keyframes float { 0% { transform: translateY(0); } 50% { transform: translateY(-10px); } 100% { transform: translateY(0); } } .ai-float { animation: float 3s ease-in-out infinite; }", "nodeClasses": {"A": "ai-float", "B": "ai-float"}}}
- Use node SHAPES to encode semantic type:
    A[Label]     = service / process / backend
    A(Label)     = client / frontend / browser
    A{Label}     = gateway / router / decision / load balancer
    A[(Label)]   = database / storage (SQL, NoSQL)
    A[/Label/]   = cache / queue (Redis, Kafka, RabbitMQ)
    A((Label))   = user / actor / person
- Use short, clear edge labels (2-4 words max). Every edge MUST have a label.
- ALWAYS convert to Flowcharts. If the user asks for a Mindmap or Sequence Diagram, TRANSLATE their intent into a "flowchart TD".
- If input is unrelated to diagrams: output exactly: {"mermaidCode": "OFFTOPIC", "animationSteps": [], "aiAnimations": {"cssKeyframes": "", "nodeClasses": {}}}`;

// ── Pass 2 — Validate and correct the generated Mermaid ──────────────────────
const VALIDATE_PROMPT = `You are a technical diagram reviewer. Given a JSON object with Mermaid flowchart code, animation steps, and aiAnimations, validate and correct it.

CHECK FOR:
1. Missing return paths: if A calls B, is there a response edge from B back to A?
2. Dead-end nodes: nodes with no outgoing edge (unless they are terminal outputs like DB/user)
3. Wrong edge direction (should follow data/request flow)
4. Missing or vague edge labels
5. Animation sequence: Does the animation order logically follow the data flow? Do parallel processes animate together?
6. Ensure aiAnimations are preserved and semantically match the nodes.

OUTPUT RULES:
- Output a RAW JSON object ONLY. No markdown fences (\`\`\`), no explanation.
- The JSON MUST have exactly three keys: "mermaidCode", "animationSteps", and "aiAnimations".
- Example: {"mermaidCode": "...", "animationSteps": [["A"], ["B"]], "aiAnimations": {"cssKeyframes": "...", "nodeClasses": {"A": "..."}}}
- If it's already correct, output it UNCHANGED in the exact same JSON format.`;

// ── LLM helper ────────────────────────────────────────────────────────────────
async function callLLM(
  systemPrompt: string,
  userContent: string,
  history: ChatMessage[],
  apiKey: string,
  provider: LlmProvider,
  ollamaModel: OllamaModel = 'gemma3:4b',
  temperature = 0.1,
): Promise<string> {
  const url = provider === 'deepseek' ? DEEPSEEK_API_URL : OLLAMA_API_URL;
  const model = provider === 'deepseek' ? 'deepseek-chat' : ollamaModel;
  
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (provider === 'deepseek') {
    if (/[^\x00-\x7F]/.test(apiKey)) {
      throw new Error('Your DeepSeek API key contains invalid characters (e.g. emojis or foreign text). Please click "Change AI Model / Key" below to reset it.');
    }
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
  ollamaModel: OllamaModel = 'gemma3:4b',
  onStep?: (step: 'generating' | 'validating' | 'rendering') => void,
): Promise<SendMessageResult> {

  // ── Pass 1 ─ Generate Mermaid ───────────────────────────────────────────────
  let mermaidDraft: string;

  if (looksLikeMermaid(userMessage)) {
    const lowerMessage = userMessage.trim().toLowerCase();
    const unsupportedPrefixes = ['sequencediagram', 'statediagram', 'classdiagram', 'erdiagram', 'gantt', 'pie', 'journey', 'mindmap', 'gitgraph', 'quadrantchart', 'xychart'];
    
    if (unsupportedPrefixes.some(prefix => lowerMessage.startsWith(prefix))) {
      return {
        message: '❌ PulseGraph currently only supports **Flowcharts** and **Graphs** (e.g., `flowchart LR`). \n\nPlease convert your diagram to flowchart syntax, or describe your system in plain text so the AI can generate a supported diagram for you.',
        graph: null,
        mermaidSource: userMessage,
        isOffTopic: true,
      };
    }

    // User already gave us supported Mermaid → skip Pass 1, validate directly
    mermaidDraft = JSON.stringify({ mermaidCode: userMessage, animationSteps: [], aiAnimations: { cssKeyframes: "", nodeClasses: {} } });
    onStep?.('validating');
  } else {
    onStep?.('generating');
    // Provide conversation context if refining an existing diagram
    const contextNote = currentGraph
      ? `\n\nContext (current diagram Mermaid — refine it based on the request):\n${(currentGraph as Graph & { mermaidSource?: string }).mermaidSource ?? 'see graph JSON'}`
      : '';
    const pass1Input = userMessage + contextNote;
    mermaidDraft = await callLLM(GENERATE_PROMPT, pass1Input, history, apiKey, provider, ollamaModel);
  }

  // ── Off-topic guard ─────────────────────────────────────────────────────────
  let pass1Parsed: any = null;
  try {
    const cleanJson = mermaidDraft.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    pass1Parsed = JSON.parse(cleanJson);
  } catch (e) {
    // ignore
  }
  const isOffTopic = pass1Parsed?.mermaidCode === 'OFFTOPIC' || mermaidDraft.trim().toUpperCase() === 'OFFTOPIC';

  if (isOffTopic) {
    return {
      message: 'I only create diagrams. Describe any system, flow or architecture!',
      graph: null,
      mermaidSource: '',
      isOffTopic: true,
    };
  }

  // ── Pass 2 ─ Validate and correct ──────────────────────────────────────────
  onStep?.('validating');
  const validatedRaw = await callLLM(VALIDATE_PROMPT, mermaidDraft, history, apiKey, provider, ollamaModel, 0.05);

  let parsedResponse: { mermaidCode: string; animationSteps: string[][]; aiAnimations?: { cssKeyframes: string; nodeClasses: Record<string, string> } };
  try {
    const cleanJson = validatedRaw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    parsedResponse = JSON.parse(cleanJson);
  } catch (e) {
    // Fallback if parsing fails, try to extract Mermaid code as a string
    parsedResponse = { mermaidCode: validatedRaw, animationSteps: [], aiAnimations: { cssKeyframes: '', nodeClasses: {} } };
  }

  const mermaidFinal = parsedResponse.mermaidCode.trim();

  // ── Parse Mermaid → Graph ──────────────────────────────────────────────────
  onStep?.('rendering');
  const graph = parseMermaid(mermaidFinal);
  graph.animationSteps = parsedResponse.animationSteps;
  if (parsedResponse.aiAnimations) {
    graph.aiAnimations = parsedResponse.aiAnimations;
  }

  // Attach the Mermaid source so App can display it
  (graph as Graph & { mermaidSource: string }).mermaidSource = mermaidFinal;

  // Build a short human message from node/edge count
  const msg = `Diagram ready — ${graph.nodes.length} nodes, ${graph.edges.length} connections.`;

  return { message: msg, graph, mermaidSource: mermaidFinal, isOffTopic: false };
}

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { sendMessage, designPresentation } from '../src/services/llmService.ts';
import { parseDiagram, readCompletion } from '../src/services/llmValidation.ts';
import { requestCompletion } from '../src/services/llmClient.ts';
import { RESEARCH_FLOW } from './fixtures/researchFlow';
import { RESEARCH_ROLES, RESEARCH_PRESENTATION } from './fixtures/researchPresentation';

const SOURCE = 'flowchart LR\nA[Client] --> B[API]';
function completion(content: unknown, finishReason = 'stop'): Response {
  return Response.json({
    choices: [
      { finish_reason: finishReason, message: { content: JSON.stringify(content) } },
    ],
  });
}

test('AI composition receives edge labels and groups but cannot rewrite source', async () => {
  let body: { messages: { role: string; content: string }[] } | undefined;
  const fetchMock = mock.method(
    globalThis,
    'fetch',
    async (_input: unknown, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return completion({
        roles: RESEARCH_ROLES,
        presentation: RESEARCH_PRESENTATION,
        mermaidCode: 'flowchart LR; FAKE[Invented]',
      });
    },
  );
  try {
    const result = await designPresentation(RESEARCH_FLOW, 'test-key', 'deepseek');
    assert.equal(result.mermaidSource, RESEARCH_FLOW);
    assert.deepEqual(result.presentation, RESEARCH_PRESENTATION);
    const content = JSON.parse(
      body!.messages.find((item) => item.role === 'user')!.content,
    );
    assert.equal(
      content.edges.find((edge: { id: string }) => edge.id === 'e_14').label,
      'no, retry max 2',
    );
    assert.deepEqual(content.groups[0].members, ['A1', 'A2', 'A3', 'A4']);
  } finally {
    fetchMock.mock.restore();
  }
});

test('DeepSeek uses the current non-thinking model without changing Ollama options', async () => {
  const bodies: Record<string, unknown>[] = [];
  const fetchMock = mock.method(
    globalThis,
    'fetch',
    async (_input: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return completion({ roles: { A: 'lead-in', B: 'pipeline' } });
    },
  );
  try {
    await designPresentation(SOURCE, 'test-key', 'deepseek');
    await designPresentation(SOURCE, '', 'ollama', 'gemma3:4b');
    assert.equal(bodies[0]?.model, 'deepseek-flash');
    assert.deepEqual(bodies[0]?.thinking, { type: 'disabled' });
    assert.equal(bodies[1]?.model, 'gemma3:4b');
    assert.equal(bodies[1]?.thinking, undefined);
  } finally {
    fetchMock.mock.restore();
  }
});

test('clean Mermaid never contacts a provider', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => {
    throw new Error('Unexpected network request');
  });
  try {
    const result = await sendMessage(SOURCE, [], null, '', 'deepseek');
    assert.equal(result.graph?.nodes.length, 2);
    assert.equal(fetchMock.mock.callCount(), 0);
  } finally {
    fetchMock.mock.restore();
  }
});

test('malformed, empty and oversized diagrams are rejected', () => {
  for (const source of ['', 'flowchart LR', 'flowchart LR\nA -->', 'x'.repeat(30_001)]) {
    assert.throws(() => parseDiagram(source));
  }
  for (const envelope of [
    null,
    {},
    { choices: [] },
    { choices: [{ message: { content: '{}' }, finish_reason: 'length' }] },
  ]) {
    assert.throws(() => readCompletion(envelope));
  }
});

test('invalid generated code never yields a successful graph', async () => {
  for (const content of [{}, null, { mermaidCode: '' }, { mermaidCode: 123 }]) {
    const fetchMock = mock.method(globalThis, 'fetch', async () => completion(content));
    try {
      await assert.rejects(sendMessage('Draw an API', [], null, 'test-key', 'deepseek'));
    } finally {
      fetchMock.mock.restore();
    }
  }
});

test('refinement is explicit and unchanged model output is rejected', async () => {
  let requestBody: Record<string, unknown> | undefined;
  const fetchMock = mock.method(
    globalThis,
    'fetch',
    async (_input: string | URL | Request, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return completion({ mermaidCode: SOURCE });
    },
  );
  const current = parseDiagram(SOURCE);

  try {
    await assert.rejects(
      sendMessage(
        'Add a Redis cache before the API',
        [],
        current,
        'test-key',
        'deepseek',
      ),
      /without applying your instruction/,
    );
    const messages = requestBody?.messages as Array<{ role: string; content: string }>;
    const latest = JSON.parse(messages.at(-1)!.content) as Record<string, string>;
    assert.equal(latest.operation, 'refine');
    assert.equal(latest.instruction, 'Add a Redis cache before the API');
    assert.equal(latest.currentDiagram, SOURCE);
  } finally {
    fetchMock.mock.restore();
  }
});

test('presentation preserves source even if model attempts a topology rewrite', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () =>
    completion({
      roles: { A: 'lead-in', B: 'pipeline' },
      mermaidCode: 'flowchart LR\nX[Malicious replacement]',
    }),
  );
  try {
    const result = await designPresentation(SOURCE, 'test-key', 'deepseek');
    assert.equal(result.mermaidSource, SOURCE);
    assert.deepEqual(
      result.graph?.nodes.map((n) => n.id),
      ['A', 'B'],
    );
    assert.equal(result.graph?.edges.length, 1);
  } finally {
    fetchMock.mock.restore();
  }
});

test('presentation rejects incomplete or invalid roles', async () => {
  for (const roles of [[], {}, { A: 'lead-in', B: 'unknown' }]) {
    const fetchMock = mock.method(globalThis, 'fetch', async () => completion({ roles }));
    try {
      await assert.rejects(designPresentation(SOURCE, 'test-key', 'deepseek'));
    } finally {
      fetchMock.mock.restore();
    }
  }
});

test('HTTP errors omit provider response bodies and credentials', async () => {
  const fetchMock = mock.method(
    globalThis,
    'fetch',
    async () => new Response('secret-test-key', { status: 401 }),
  );
  try {
    await assert.rejects(
      sendMessage('Draw API', [], null, 'secret-test-key', 'deepseek'),
      (error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /rejected/);
        assert.ok(!error.message.includes('secret-test-key'));
        return true;
      },
    );
  } finally {
    fetchMock.mock.restore();
  }
});

test('cancellation and response limits are enforced', async () => {
  const controller = new AbortController();
  controller.abort();
  let fetchMock = mock.method(
    globalThis,
    'fetch',
    async (_input: string | URL | Request, init?: RequestInit) => {
      init?.signal?.throwIfAborted();
      return completion({});
    },
  );
  const request = {
    systemPrompt: 'test',
    content: 'test',
    apiKey: '',
    provider: 'ollama' as const,
    model: 'gemma3:4b' as const,
  };
  try {
    await assert.rejects(
      requestCompletion({ ...request, signal: controller.signal }),
      /cancelled/,
    );
  } finally {
    fetchMock.mock.restore();
  }

  fetchMock = mock.method(
    globalThis,
    'fetch',
    async () => new Response('x'.repeat(200_001)),
  );
  try {
    await assert.rejects(requestCompletion(request), /size limit/);
  } finally {
    fetchMock.mock.restore();
  }
});

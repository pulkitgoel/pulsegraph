import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { sendMessage, designPresentation } from '../src/services/llmService.ts';
import { parseDiagram, readCompletion } from '../src/services/llmValidation.ts';
import { requestCompletion } from '../src/services/llmClient.ts';
import { RESEARCH_FLOW } from './fixtures/researchFlow';
import {
  LIVE_RESEARCH_FLOW,
  LIVE_RESEARCH_DUPLICATE_PLAN,
} from './fixtures/liveAiResearch';
import { RESEARCH_ROLES, RESEARCH_PRESENTATION } from './fixtures/researchPresentation';
import {
  PRODUCTION_FLOW,
  PRODUCTION_ROLES,
  PRODUCTION_PRESENTATION,
} from './fixtures/productionPresentation';

const SOURCE = 'flowchart LR\nA[Client] --> B[API]';
function completion(content: unknown, finishReason = 'stop'): Response {
  return Response.json({
    choices: [
      { finish_reason: finishReason, message: { content: JSON.stringify(content) } },
    ],
  });
}

test('a structurally valid AI plan with an unreadable route label is rejected locally', async () => {
  const source = `flowchart LR\nA[Client] -->|${'very long label '.repeat(60)}| B[API]`;
  const fetchMock = mock.method(globalThis, 'fetch', async () =>
    completion({
      roles: { A: 'lead-in', B: 'pipeline' },
      presentation: {
        title: 'Request',
        mainPath: ['A', 'B'],
        lanes: [{ title: 'Request', kind: 'journey', nodeIds: ['A', 'B'] }],
      },
    }),
  );
  try {
    await assert.rejects(
      designPresentation(source, 'test-key', 'deepseek'),
      /current diagram has been kept/,
    );
    assert.equal(fetchMock.mock.callCount(), 1);
  } finally {
    fetchMock.mock.restore();
  }
});

test('one AI request compares checked arrangements and preserves all source content', async () => {
  const cleaner = structuredClone(PRODUCTION_PRESENTATION);
  cleaner.lanes[1].nodeIds = ['CACHE', 'AUTH', 'OBS', 'DB'];
  const fetchMock = mock.method(globalThis, 'fetch', async () =>
    completion({
      roles: PRODUCTION_ROLES,
      presentation: PRODUCTION_PRESENTATION,
      alternatives: [cleaner],
    }),
  );
  try {
    const result = await designPresentation(PRODUCTION_FLOW, 'test-key', 'deepseek');
    assert.deepEqual(result.presentation, cleaner);
    assert.equal(result.mermaidSource, PRODUCTION_FLOW);
    assert.deepEqual(result.graph, parseDiagram(PRODUCTION_FLOW));
    assert.equal(fetchMock.mock.callCount(), 1);
  } finally {
    fetchMock.mock.restore();
  }
});

test('an invalid AI choice can be skipped, but all invalid choices reject before commit', async () => {
  const bad = { ...PRODUCTION_PRESENTATION, mainPath: ['U', 'DB'] };
  for (const alternatives of [[PRODUCTION_PRESENTATION], [bad]]) {
    const fetchMock = mock.method(globalThis, 'fetch', async () =>
      completion({ roles: PRODUCTION_ROLES, presentation: bad, alternatives }),
    );
    try {
      if (alternatives[0] === bad)
        await assert.rejects(
          designPresentation(PRODUCTION_FLOW, 'test-key', 'deepseek'),
          /current diagram has been kept/,
        );
      else
        assert.deepEqual(
          (await designPresentation(PRODUCTION_FLOW, 'test-key', 'deepseek'))
            .presentation,
          PRODUCTION_PRESENTATION,
        );
      assert.equal(fetchMock.mock.callCount(), 1);
    } finally {
      fetchMock.mock.restore();
    }
  }
});

test('AI alternatives cannot replace the reading path or invent semantic sections', async () => {
  const shortcut = { ...PRODUCTION_PRESENTATION, mainPath: ['U'] };
  const regrouped = {
    ...PRODUCTION_PRESENTATION,
    lanes: [
      { title: 'Everything', kind: 'journey', nodeIds: Object.keys(PRODUCTION_ROLES) },
    ],
  };
  const fetchMock = mock.method(globalThis, 'fetch', async () =>
    completion({
      roles: PRODUCTION_ROLES,
      presentation: PRODUCTION_PRESENTATION,
      alternatives: [shortcut, regrouped],
    }),
  );
  try {
    assert.deepEqual(
      (await designPresentation(PRODUCTION_FLOW, 'test-key', 'deepseek')).presentation,
      PRODUCTION_PRESENTATION,
    );
  } finally {
    fetchMock.mock.restore();
  }
});

test('composition service accepts the safely normalized live AI regression', async () => {
  const graph = parseDiagram(LIVE_RESEARCH_FLOW);
  const roles = Object.fromEntries(graph.nodes.map((node) => [node.id, 'pipeline']));
  const fetchMock = mock.method(globalThis, 'fetch', async () =>
    completion({
      roles,
      presentation: LIVE_RESEARCH_DUPLICATE_PLAN,
    }),
  );
  try {
    const result = await designPresentation(LIVE_RESEARCH_FLOW, 'test-key', 'deepseek');
    assert.equal(result.mermaidSource, LIVE_RESEARCH_FLOW);
    assert.deepEqual(result.graph, graph);
    assert.equal(result.presentation?.mainPath.at(-1), 'GetResult');
    assert.equal(result.presentation?.lanes.flatMap((lane) => lane.nodeIds).length, 16);
  } finally {
    fetchMock.mock.restore();
  }
});

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
    assert.equal(
      content.nodes.find((node: { id: string }) => node.id === 'C').type,
      'gateway',
    );
    assert.equal(
      content.edges.find((edge: { id: string }) => edge.id === 'e_14').arrow,
      'arrow',
    );
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

test('refinement accepts case-sensitive IDs and label edits but rejects formatting-only output', async () => {
  const current = parseDiagram('flowchart LR\nA[api] --> B[Result]');
  for (const source of [
    'flowchart LR\nA[API] --> B[Result]',
    'flowchart LR\nA[api] --> b[Result]',
    'flowchart LR\nA[api  server] --> B[Result]',
  ]) {
    const fetchMock = mock.method(globalThis, 'fetch', async () =>
      completion({ mermaidCode: source }),
    );
    try {
      const result = await sendMessage(
        'Rename the component',
        [],
        current,
        'test-key',
        'deepseek',
      );
      assert.equal(result.mermaidSource, source);
    } finally {
      fetchMock.mock.restore();
    }
  }
  const fetchMock = mock.method(globalThis, 'fetch', async () =>
    completion({
      mermaidCode: 'flowchart LR; %% formatting only\n  A["api"]   --> B[Result]',
    }),
  );
  try {
    await assert.rejects(
      sendMessage('Rename the component', [], current, 'test-key', 'deepseek'),
      /without applying your instruction/,
    );
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

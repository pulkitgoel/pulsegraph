import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMermaid } from '../src/parser/mermaidParser.ts';
import { computeLayout } from '../src/parser/layoutEngine.ts';
import { buildBlueprintSvg } from '../src/render/blueprintSvg.ts';
import { sanitizeAnimationCss } from '../src/lib/sanitizeCss.ts';
import { presentationProfile } from '../src/lib/presentationProfile.ts';
import { pointsToRoundedPath } from '../src/lib/svgPath.ts';
import { pulseTravelWindow } from '../src/lib/pulseTravel.ts';

test('flow paths round routed vertices without moving their endpoints', () => {
  const path = pointsToRoundedPath([
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 80 },
  ]);
  assert.equal(path, 'M 0 0 L 82 0 Q 100 0 100 18 L 100 80');
});

test('animated edge markers stay inside the connector corridor', () => {
  const window = pulseTravelWindow(200);
  assert.equal(window.start, 0.12);
  assert.equal(window.end, 0.88);
  assert.equal(window.inset, 24);
});

test('operators and semicolons inside quoted node labels remain text', () => {
  const g = parseMermaid('flowchart LR; A["send --> receive; wait"] --> B; B --> C');
  assert.deepEqual(
    g.nodes.map((n) => n.id),
    ['A', 'B', 'C'],
  );
  assert.equal(g.nodes[0].label, 'send --> receive; wait');
  assert.equal(g.edges.length, 2);
  assert.equal(g.warnings?.length, 0);
});

test('nested ancestor with no direct nodes remains visible', () => {
  const g = computeLayout(
    parseMermaid('flowchart LR\nsubgraph Outer\nsubgraph Inner\nA-->B\nend\nend'),
  );
  assert.equal(g.groups?.length, 2);
  assert.ok(g.groups?.every((group) => Number.isFinite(group.width) && group.width! > 0));
});

test('six-stage presentation numbers by flow, independent of wrapped coordinates', () => {
  const graph = parseMermaid('flowchart LR\nA-->B-->C-->D-->E-->F');
  const roles = Object.fromEntries(graph.nodes.map((n) => [n.id, 'pipeline']));
  assert.ok(buildBlueprintSvg(graph, roles).includes('A  →  B  →  C  →  D  →  E  →  F'));
});

test('presentation profiles adapt labels and geometry to the flow', async () => {
  const delivery = parseMermaid(
    'flowchart LR\nG[GitHub] --> T[Tests]\nT --> P{Pass?}\nP -->|yes| D[Deploy]\nP -->|no| F[Fix]',
  );
  const profile = presentationProfile(delivery);
  assert.equal(profile.title, 'Delivery Workflow');
  assert.equal(profile.primaryZone, 'Checks & Delivery Paths');
  assert.equal(profile.layout, 'branching');

  const roles = { G: 'lead-in', T: 'pipeline', P: 'pipeline', D: 'output', F: 'output' };
  const { roleBlueprintLayout } = await import('../src/parser/layoutEngine.ts');
  const laid = roleBlueprintLayout(delivery, roles);
  assert.equal(laid.layout, 'LR');
  assert.ok(laid.groups?.some((group) => group.label === 'Checks & Delivery Paths'));
  const svg = buildBlueprintSvg(delivery, roles);
  assert.ok(svg.includes('Delivery Workflow'));
  assert.ok(svg.includes('CHECKS &amp; DELIVERY PATHS'));
  assert.ok(!svg.includes('BACKEND PIPELINE'));
  assert.ok(!svg.includes('>CLIENT<'));
});

test('authored CSS is rejected including escapes and global selectors', () => {
  for (const css of [
    'body { display:none }',
    '.x { background: u\\rl(https://example.invalid) }',
    '@keyframes a { to { opacity:0 } }',
  ]) {
    assert.equal(sanitizeAnimationCss(css), '');
  }
});

test('arrow semantics and reverse layout survive parsing', () => {
  const graph = parseMermaid('flowchart RL\nA --- B\nB --x C\nC --o D\nD ==> E');
  assert.equal(graph.layout, 'RL');
  assert.deepEqual(
    graph.edges.map((e) => e.arrow),
    ['none', 'cross', 'circle', 'arrow'],
  );
  assert.equal(graph.edges[3].thick, true);
});

test('edge label operators, semantic parallel edges, and invalid shapes', () => {
  const labelled = parseMermaid('flowchart LR\nA -->|send --> receive| B');
  assert.equal(labelled.edges.length, 1);
  assert.equal(labelled.edges[0].label, 'send --> receive');
  const parallel = parseMermaid('flowchart LR\nA --- B\nA --> B\nA ==> B');
  assert.equal(parallel.edges.length, 3);
  assert.ok(parseMermaid('flowchart LR\nA[Broken)').warnings?.length);
});

test('document round trips preserve source, roles and topology; untrusted payloads are rejected', async () => {
  const { createDocument, serializeDocument, deserializeDocument } =
    await import('../src/lib/document.ts');
  const source = 'flowchart LR\nA[Start] --> B[End]';
  const document = createDocument(source, { A: 'lead-in', B: 'output' });
  const restored = deserializeDocument(serializeDocument(document));
  assert.equal(restored.source, source);
  assert.deepEqual(
    restored.graph.edges.map((e) => [e.from, e.to]),
    [['A', 'B']],
  );
  for (const value of [
    '{}',
    'null',
    '{"version":2,"source":"A"}',
    '{"version":1,"source":"flowchart LR","roles":{}}',
  ]) {
    assert.throws(() => deserializeDocument(value));
  }
});

test('export geometry preserves aspect ratios and enforces pixel budgets', async () => {
  const { exportGeometry } = await import('../src/services/exportGeometry.ts');
  for (const frame of [
    'auto',
    '16:9',
    '16:10',
    '4:3',
    '1:1',
    'a4-landscape',
    'a4-portrait',
  ] as const) {
    const geometry = exportGeometry(30_000, 500, frame);
    assert.ok(geometry.width <= 2560 && geometry.height <= 2560);
    assert.ok(geometry.width > 0 && geometry.height > 0);
  }
  assert.equal(exportGeometry(100, 100, '16:9').width, 2560);
  assert.equal(exportGeometry(100, 100, '16:9').height, 1440);
  assert.throws(() => exportGeometry(NaN, 100, 'auto'));
});

test('seeded mixed-role corpus has no routed edge through a foreign node', async () => {
  const { roleBlueprintLayout } = await import('../src/parser/layoutEngine.ts');
  const { routeCrossesNode } = await import('../src/lib/routeEdges.ts');
  let seed = 713;
  const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let fixture = 0; fixture < 100; fixture++) {
    const count = 6 + Math.floor(random() * 12);
    const ids = Array.from({ length: count }, (_, index) => 'N' + index);
    let source = 'flowchart LR\n' + ids.map((id) => id + '[' + id + ']').join('\n');
    for (let index = 0; index < count * 2; index++) {
      const from = Math.floor(random() * count),
        to = Math.floor(random() * count);
      if (from !== to) source += '\nN' + from + '-->N' + to;
    }
    const roles = Object.fromEntries(
      ids.map((id) => [
        id,
        ['lead-in', 'pipeline', 'service', 'output'][Math.floor(random() * 4)],
      ]),
    );
    const graph = roleBlueprintLayout(parseMermaid(source), roles);
    for (const edge of graph.edges) {
      assert.equal(
        routeCrossesNode(edge, graph.nodes),
        false,
        'Fixture ' + fixture + ': ' + edge.from + ' -> ' + edge.to,
      );
      assert.ok(
        edge.points?.every(
          (point) => Number.isFinite(point.x) && point.x >= 0 && point.y >= 0,
        ),
      );
    }
  }
});

test('semantic self-loops route outside their own box', async () => {
  const { roleBlueprintLayout } = await import('../src/parser/layoutEngine.ts');
  const graph = roleBlueprintLayout(parseMermaid('flowchart LR\nA[Retry] --> A'), {
    A: 'pipeline',
  });
  assert.ok(graph.edges[0].points!.length >= 4);
  const node = graph.nodes[0];
  assert.ok(graph.edges[0].points!.some((point) => point.x > node.x! + node.width / 2));
});

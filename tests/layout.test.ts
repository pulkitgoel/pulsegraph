/**
 * Regression tests for the AI Presentation layout (roleBlueprintLayout +
 * buildBlueprintSvg), built around the real-world flow that exposed the
 * original issues: 9-stage pipeline, decision branches, retry cycle,
 * polling loop, fan-in services.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMermaid } from '../src/parser/mermaidParser.ts';
import { roleBlueprintLayout } from '../src/parser/layoutEngine.ts';
import { buildBlueprintSvg } from '../src/render/blueprintSvg.ts';
import { computeLevels, maxLevel } from '../src/lib/graphLevels.ts';
import { labelAnchor } from '../src/lib/edgeLabel.ts';

const SRC = `flowchart TD
    User([User])
    API[FastAPI<br/>POST /research]
    SEC[Auth<br/>Rate Limit]
    Q[Redis Stream]
    W[Worker]
    C{Cache hit}
    L{LTM hit}
    A1[Search Agent]
    A2[Summarize Agent]
    A3[Writer Agent]
    A4{Critic approves}
    TZ[TensorZero Gateway]
    GO[Output Guardrail]
    S[Store]
    RES[Result]
    POLL[GET /result/job_id]
    User --> API
    API --> SEC
    SEC -->|blocked| User
    SEC -->|safe| Q
    Q --> W
    W --> C
    C -->|yes| S
    C -->|no| L
    L -->|yes| S
    L -->|no| A1
    A1 --> A2
    A2 --> A3
    A3 --> A4
    A4 -->|no, retry| A1
    A4 -->|yes| GO
    GO --> S
    A1 -.-> TZ
    A2 -.-> TZ
    A3 -.-> TZ
    A4 -.-> TZ
    S --> RES
    User --> POLL
    RES --> POLL
    POLL --> User`;

const ROLES: Record<string, string> = {
  User: 'lead-in', API: 'lead-in', SEC: 'lead-in',
  Q: 'pipeline', W: 'pipeline', C: 'pipeline', L: 'pipeline',
  A1: 'pipeline', A2: 'pipeline', A3: 'pipeline', A4: 'pipeline', GO: 'pipeline',
  TZ: 'service', S: 'service',
  RES: 'output', POLL: 'output',
};

const BOX_W = 180, BOX_H = 92;

function layoutFixture() {
  const g = parseMermaid(SRC);
  const laid = roleBlueprintLayout(g, ROLES);
  const boxes = laid.nodes.map(n => ({
    id: n.id,
    x0: n.x! - BOX_W / 2, x1: n.x! + BOX_W / 2,
    y0: n.y! - BOX_H / 2, y1: n.y! + BOX_H / 2,
  }));
  return { g, laid, boxes };
}

test('role layout: no two node boxes overlap', () => {
  const { boxes } = layoutFixture();
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    const hit = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    assert.equal(hit, false, `${a.id} overlaps ${b.id}`);
  }
});

test('role layout: no edge segment passes through another node box', () => {
  const { laid, boxes } = layoutFixture();
  for (const e of laid.edges) {
    const pts = e.points || [];
    const skip = new Set([e.from, e.to]);
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1];
      const minX = Math.min(p.x, q.x), maxX = Math.max(p.x, q.x);
      const minY = Math.min(p.y, q.y), maxY = Math.max(p.y, q.y);
      for (const b of boxes) {
        if (skip.has(b.id)) continue;
        const hit = maxX > b.x0 && minX < b.x1 && maxY > b.y0 && minY < b.y1;
        assert.equal(hit, false, `edge ${e.from}->${e.to} passes through ${b.id}`);
      }
    }
  }
});

test('role layout: long pipelines wrap instead of producing a 3000px row', () => {
  const { boxes } = layoutFixture();
  const maxX = Math.max(...boxes.map(b => b.x1));
  assert.ok(maxX < 2600, `canvas is ${Math.round(maxX)}px wide — pipeline did not wrap`);
  const pipeYs = new Set(
    Object.keys(ROLES).filter(id => ROLES[id] === 'pipeline')
      .map(id => Math.round(boxes.find(b => b.id === id)!.y0)),
  );
  assert.ok(pipeYs.size >= 2, 'expected the 9-stage pipeline to span at least 2 rows');
});

test('role layout: all coordinates normalized (nothing negative)', () => {
  const { laid } = layoutFixture();
  laid.nodes.forEach(n => {
    assert.ok((n.x ?? 0) >= 0 && (n.y ?? 0) >= 0, `${n.id} has negative coords`);
  });
  laid.edges.forEach(e => (e.points || []).forEach(p => {
    assert.ok(p.x >= -1 && p.y >= -1, `edge ${e.from}->${e.to} point out of bounds`);
  }));
});

test('levels survive cycles: badges must not all collapse to "1"', () => {
  // SEC→User, A4→A1 and POLL→User put the entry node inside cycles; without
  // structural back-edge detection Kahn's finds no roots and every node
  // levels to 0 (the "every badge reads 1" bug).
  const g = parseMermaid(SRC);
  const lv = computeLevels(g);
  assert.ok(maxLevel(lv) >= 8, `expected a deep level chain, got max ${maxLevel(lv)}`);
  assert.equal(lv.get('User'), 0);
  assert.ok(lv.get('W')! > lv.get('Q')!, 'Worker must come after the queue');
  assert.ok(lv.get('A2')! > lv.get('A1')!, 'agents must be sequential');
});

test('label anchor: near the source on routed arcs, centred on straight edges', () => {
  // Straight 2-point edge → midpoint.
  const straight = labelAnchor([{ x: 0, y: 0 }, { x: 100, y: 0 }])!;
  assert.equal(straight.x, 50);
  // Long routed arc → ~70px from the source, NOT at the structural midpoint.
  const arc = labelAnchor([
    { x: 0, y: 0 }, { x: 0, y: 300 }, { x: 900, y: 300 }, { x: 900, y: 0 },
  ])!;
  const distFromStart = Math.hypot(arc.x - 0, arc.y - 0);
  assert.ok(distFromStart <= 80, `label sits ${Math.round(distFromStart)}px from source`);
});

test('blueprint SVG: edge labels (yes/no/blocked) are rendered', () => {
  const { g } = layoutFixture();
  const svg = buildBlueprintSvg(g, ROLES, { title: 'Test' });
  assert.ok(svg.includes('>yes<'), 'missing "yes" edge label');
  assert.ok(svg.includes('>blocked<'), 'missing "blocked" edge label');
  assert.ok(svg.includes('>safe<'), 'missing "safe" edge label');
});

test('blueprint SVG: canvas covers routed edge arcs', () => {
  const { g, laid } = layoutFixture();
  const svg = buildBlueprintSvg(g, ROLES, { title: 'Test' });
  const w = Number(/width="(\d+)"/.exec(svg)![1]);
  const h = Number(/height="(\d+)"/.exec(svg)![1]);
  let maxX = 0, maxY = 0;
  laid.edges.forEach(e => (e.points || []).forEach(p => {
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }));
  assert.ok(w >= maxX, `svg width ${w} clips edges at ${Math.round(maxX)}`);
  assert.ok(h >= maxY, `svg height ${h} clips edges at ${Math.round(maxY)}`);
});

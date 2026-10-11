import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDiagram } from '../src/services/llmValidation';
import { computeLayout, computeLayoutCandidate } from '../src/parser/layoutEngine';
import {
  inspectLayout,
  compareLayoutQuality,
  segmentIntersectsBox,
} from '../src/lib/layoutQuality';
import { placeEdgeLabels } from '../src/lib/edgeLabel';
import { LANDING_DEMO, DIAGRAM_EXAMPLES } from '../src/lib/examples';
import { RESEARCH_FLOW } from './fixtures/researchFlow';
import { LIVE_RESEARCH_FLOW } from './fixtures/liveAiResearch';
import { NOVATION_FLOW } from './fixtures/novationPresentation';
import { BENEFIT_FLOW } from './fixtures/benefitFlow';
import type { Graph } from '../src/types';

const PARALLEL =
  'flowchart LR\nA[Request] -->|authenticated request accepted| B[API]\nA -->|authentication failed, retry request| B\nB -->|return response| A';
const cases = [
  LANDING_DEMO,
  ...DIAGRAM_EXAMPLES,
  { name: 'Research', source: RESEARCH_FLOW },
  { name: 'Live research', source: LIVE_RESEARCH_FLOW },
  { name: 'Novation', source: NOVATION_FLOW },
  { name: 'Benefit', source: BENEFIT_FLOW },
  { name: 'Parallel long labels', source: PARALLEL },
];

test('independent audit finds missing routes, foreign node crossings, labels and tiny steps', () => {
  const graph: Graph = {
    nodes: [
      { id: 'A', label: 'A', type: 'service', width: 40, height: 40, x: 40, y: 80 },
      { id: 'B', label: 'B', type: 'service', width: 40, height: 40, x: 240, y: 80 },
      { id: 'C', label: 'C', type: 'service', width: 40, height: 40, x: 140, y: 80 },
    ],
    edges: [
      {
        id: 'through',
        from: 'A',
        to: 'B',
        points: [
          { x: 60, y: 80 },
          { x: 220, y: 80 },
        ],
      },
      { id: 'missing', from: 'A', to: 'B' },
      {
        id: 'jog',
        from: 'A',
        to: 'B',
        points: [
          { x: 60, y: 80 },
          { x: 80, y: 80 },
          { x: 80, y: 85 },
          { x: 220, y: 85 },
        ],
      },
      {
        id: 'zero',
        from: 'A',
        to: 'B',
        points: [
          { x: 60, y: 80 },
          { x: 60, y: 80 },
        ],
      },
    ],
  };
  const issues = inspectLayout(graph, false).issues;
  assert.ok(
    issues.some((issue) => issue.code === 'edge-through-node' && issue.ids.includes('C')),
  );
  assert.ok(issues.some((issue) => issue.code === 'short-jog'));
  assert.equal(issues.filter((issue) => issue.code === 'invalid-geometry').length, 2);
  graph.edges[0].label = 'overlap';
  const labels = new Map([
    ['through', { x: 140, y: 80, width: 50, height: 24, anchor: { x: 140, y: 80 } }],
  ]);
  assert.ok(
    inspectLayout(graph, labels).issues.some((issue) => issue.code === 'label-overlap'),
  );
});

test('diagonal intersection checks do not mistake an empty bounding rectangle for a collision', () => {
  assert.equal(
    segmentIntersectsBox(
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { left: 60, right: 70, top: 10, bottom: 20 },
    ),
    false,
  );
  assert.equal(
    segmentIntersectsBox(
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { left: 60, right: 70, top: 60, bottom: 70 },
    ),
    true,
  );
});

test('production fan-out has ordered ports, no crossings and clear arrow approaches', () => {
  for (const direction of ['LR', 'RL', 'TB', 'BT'] as const) {
    const graph = parseDiagram(
      DIAGRAM_EXAMPLES[0].source.replace('flowchart LR', `flowchart ${direction}`),
    );
    const baseline = inspectLayout(computeLayoutCandidate(graph));
    const selected = computeLayout(graph);
    const quality = inspectLayout(selected);
    assert.deepEqual(quality.cost.slice(0, 4), [0, 0, 0, 0]);
    assert.ok(compareLayoutQuality(quality, baseline) <= 0);
    const vertical = direction === 'TB' || direction === 'BT';
    const cross = (p: { x: number; y: number }) => (vertical ? p.x : p.y);
    const branches = selected.edges
      .filter((e) => e.from === 'API')
      .sort((a, b) => cross(a.points!.at(-1)!) - cross(b.points!.at(-1)!));
    for (let i = 0; i < branches.length; i++) {
      const points = branches[i].points!;
      const end = points.at(-1)!,
        bend = points.at(-2)!;
      assert.ok(Math.hypot(end.x - bend.x, end.y - bend.y) >= 32);
      if (i) assert.ok(cross(points[0]) > cross(branches[i - 1].points![0]));
    }
    assert.deepEqual(
      selected.edges.map(({ id, from, to, label }) => ({ id, from, to, label })),
      graph.edges.map(({ id, from, to, label }) => ({ id, from, to, label })),
    );
  }
});

test('audit reports connector crossings and short arrow approaches instead of hiding them', () => {
  const graph: Graph = {
    nodes: ['A', 'B', 'C', 'D'].map((id, index) => ({
      id,
      label: id,
      type: 'service',
      width: 10,
      height: 10,
      x: -100,
      y: index * 20,
    })),
    edges: [
      {
        id: 'horizontal',
        from: 'A',
        to: 'B',
        points: [
          { x: 0, y: 50 },
          { x: 100, y: 50 },
        ],
      },
      {
        id: 'vertical',
        from: 'C',
        to: 'D',
        points: [
          { x: 50, y: 0 },
          { x: 50, y: 100 },
          { x: 54, y: 100 },
        ],
      },
    ],
  };
  const quality = inspectLayout(graph, false);
  assert.ok(quality.issues.some((issue) => issue.code === 'edge-crossing'));
  assert.ok(
    quality.issues.some(
      (issue) => issue.code === 'short-approach' && issue.ids.includes('vertical'),
    ),
  );
  assert.equal(quality.cost[2], 1);
  assert.equal(quality.cost[3], 1);
});

test('real workflow corpus stays clear and deterministic in all four source directions', () => {
  for (const item of cases)
    for (const direction of ['LR', 'RL', 'TB', 'BT'] as const) {
      const graph = parseDiagram(
        item.source.replace(/^flowchart \w+/, `flowchart ${direction}`),
      );
      const result = computeLayout(graph);
      const quality = inspectLayout(result);
      assert.deepEqual(
        quality.cost.slice(0, 3),
        [0, 0, 0],
        `${item.name} ${direction}: ${JSON.stringify(quality.issues)}`,
      );
      assert.equal(result.layout, direction);
      assert.equal(
        placeEdgeLabels(result.edges, result.nodes).size,
        graph.edges.filter((e) => e.label).length,
      );
      assert.deepEqual(result, computeLayout(graph));
      assert.ok(
        compareLayoutQuality(quality, inspectLayout(computeLayoutCandidate(graph))) <= 0,
      );
    }
});

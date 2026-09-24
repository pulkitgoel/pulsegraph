import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDiagram } from '../src/services/llmValidation';
import {
  validatePresentationPlan,
  localPresentationPlan,
} from '../src/lib/presentationPlan';
import { presentationLayout } from '../src/lib/presentationLayout';
import { presentationLabel } from '../src/lib/presentationLabel';
import {
  NOVATION_FLOW,
  NOVATION_PRESENTATION,
  NOVATION_ROLES,
} from './fixtures/novationPresentation';
import { routeCrossesNode } from '../src/lib/routeEdges';
import {
  createDocument,
  deserializeDocument,
  serializeDocument,
} from '../src/lib/document';
import { RESEARCH_FLOW } from './fixtures/researchFlow';
import { RESEARCH_ROLES, RESEARCH_PRESENTATION } from './fixtures/researchPresentation';

test('Novation flow preserves full long labels and routes around their expanded bounds', () => {
  const graph = parseDiagram(NOVATION_FLOW);
  const before = JSON.stringify(graph);
  assert.equal(graph.nodes.length, 19);
  assert.equal(graph.edges.length, 20);
  const decline = graph.nodes.find((node) => node.id === 'R')!;
  const label = presentationLabel(decline.label);
  assert.ok(label.lines.length > 4);
  assert.equal(label.lines.join(' '), decline.label);
  for (const plan of [
    validatePresentationPlan(NOVATION_PRESENTATION, graph),
    localPresentationPlan(graph, NOVATION_ROLES),
  ]) {
    const scene = presentationLayout(graph, plan);
    assert.ok(Math.abs(scene.width / scene.height - 16 / 9) < 1e-10);
    assert.deepEqual(
      scene.graph.nodes.map((n) => [n.id, n.label]).sort(),
      graph.nodes.map((n) => [n.id, n.label]).sort(),
    );
    assert.deepEqual(
      scene.graph.edges.map((edge) => ({ ...edge, points: [] })),
      graph.edges,
    );
    for (const node of scene.graph.nodes) {
      const text = presentationLabel(node.label);
      assert.ok(
        text.firstBaseline + (text.lines.length - 1) * text.lineHeight < node.height,
      );
      const lane = scene.lanes.find((lane) => lane.nodeIds.includes(node.id))!;
      assert.ok(node.y! + node.height / 2 <= lane.y + lane.height);
    }
    for (const edge of scene.graph.edges) {
      assert.ok(
        !routeCrossesNode(edge, scene.graph.nodes),
        `${edge.id} crosses text bounds`,
      );
    }
  }
  assert.equal(JSON.stringify(graph), before);
});

test('AI slide metadata preserves every component and validates the reading path', () => {
  const graph = parseDiagram(RESEARCH_FLOW);
  assert.deepEqual(
    validatePresentationPlan(RESEARCH_PRESENTATION, graph),
    RESEARCH_PRESENTATION,
  );
  const invalid = [
    { ...RESEARCH_PRESENTATION, mainPath: ['User', 'TZ'] },
    { ...RESEARCH_PRESENTATION, mainPath: ['User', 'API', 'User'] },
    { ...RESEARCH_PRESENTATION, title: '<script>bad</script>' },
    { ...RESEARCH_PRESENTATION, lanes: RESEARCH_PRESENTATION.lanes.slice(1) },
    {
      ...RESEARCH_PRESENTATION,
      lanes: [
        ...RESEARCH_PRESENTATION.lanes,
        { title: 'Duplicate', kind: 'support', nodeIds: ['User'] },
      ],
    },
    {
      ...RESEARCH_PRESENTATION,
      lanes: RESEARCH_PRESENTATION.lanes.map((lane, i) =>
        i === 0 ? { ...lane, nodeIds: [...lane.nodeIds, 'unknown'] } : lane,
      ),
    },
  ];
  invalid.forEach((plan) => assert.throws(() => validatePresentationPlan(plan, graph)));
});

test('source subgraphs cannot be scattered across AI sections', () => {
  const split = structuredClone(RESEARCH_PRESENTATION);
  split.lanes[1].nodeIds.shift();
  split.lanes[0].nodeIds.push('A1');
  assert.throws(() => validatePresentationPlan(split, parseDiagram(RESEARCH_FLOW)));
});

test('legacy nested groups stay together even when parents have no direct members', () => {
  const graph = parseDiagram(`flowchart LR
    subgraph Outer[Outer]
      subgraph Inner[Inner]
        A[First] --> B[Second]
      end
      subgraph Other[Other]
        C[Third]
      end
    end
    B --> C
    C --> D[Result]`);
  const local = localPresentationPlan(graph, {
    A: 'pipeline',
    B: 'pipeline',
    C: 'pipeline',
    D: 'output',
  });
  assert.deepEqual(local.lanes[0].nodeIds, ['A', 'B', 'C']);
  assert.equal(local.lanes.flatMap((lane) => lane.nodeIds).length, 4);
  const split = structuredClone(local);
  split.lanes[0].nodeIds.pop();
  split.lanes[1].nodeIds.push('C');
  assert.throws(() => validatePresentationPlan(split, graph));
  assert.throws(() => createDocument(RESEARCH_FLOW, null, RESEARCH_PRESENTATION));
});

test('slide preview preserves topology and routes around component bounds', () => {
  const graph = parseDiagram(RESEARCH_FLOW);
  const before = JSON.stringify(graph);
  const scene = presentationLayout(graph, RESEARCH_PRESENTATION);
  assert.ok(Math.abs(scene.width / scene.height - 16 / 9) < 1e-10);
  assert.ok(scene.height >= 900);
  assert.equal(scene.graph.nodes.length, 16);
  assert.deepEqual(scene.warnings, []);
  assert.deepEqual(
    scene.graph.edges.map(({ id, from, to, label, arrow }) => ({
      id,
      from,
      to,
      label,
      arrow,
    })),
    graph.edges.map(({ id, from, to, label, arrow }) => ({ id, from, to, label, arrow })),
  );
  for (const edge of scene.graph.edges) {
    assert.ok(!routeCrossesNode(edge, scene.graph.nodes), `${edge.id} crosses a node`);
    assert.ok(
      edge.points!.every(
        (p) => p.x >= 0 && p.x <= scene.width && p.y >= 0 && p.y <= scene.height,
      ),
    );
  }
  // Crossing lines can occur in a non-planar graph; shared lengths must not.
  const segments = scene.graph.edges.flatMap((edge) =>
    edge.points!.slice(1).map((b, i) => ({ id: edge.id, a: edge.points![i], b })),
  );
  for (const a of segments)
    for (const b of segments) {
      if (a.id === b.id) continue;
      if (a.a.x === a.b.x && b.a.x === b.b.x && a.a.x === b.a.x) {
        assert.ok(
          Math.min(Math.max(a.a.y, a.b.y), Math.max(b.a.y, b.b.y)) -
            Math.max(Math.min(a.a.y, a.b.y), Math.min(b.a.y, b.b.y)) <=
            0.1,
          `${a.id}/${b.id} share a vertical rail`,
        );
      }
      if (a.a.y === a.b.y && b.a.y === b.b.y && a.a.y === b.a.y) {
        assert.ok(
          Math.min(Math.max(a.a.x, a.b.x), Math.max(b.a.x, b.b.x)) -
            Math.max(Math.min(a.a.x, a.b.x), Math.min(b.a.x, b.b.x)) <=
            0.1,
          `${a.id}/${b.id} share a horizontal rail`,
        );
      }
    }
  assert.equal(JSON.stringify(graph), before);
  assert.equal(
    Object.keys(scene.labels).length,
    graph.edges.filter((edge) => edge.label).length,
  );
});

test('slide plans round-trip without changing legacy document format or source', () => {
  const doc = createDocument(RESEARCH_FLOW, RESEARCH_ROLES, RESEARCH_PRESENTATION);
  const restored = deserializeDocument(serializeDocument(doc));
  assert.equal(restored.source, RESEARCH_FLOW.trim());
  assert.deepEqual(restored.presentation, RESEARCH_PRESENTATION);
  const legacy = createDocument(RESEARCH_FLOW, RESEARCH_ROLES);
  assert.equal(deserializeDocument(serializeDocument(legacy)).presentation, undefined);
  const local = localPresentationPlan(parseDiagram(RESEARCH_FLOW), RESEARCH_ROLES);
  assert.equal(local.lanes.length, 3);
  assert.equal(local.lanes.flatMap((lane) => lane.nodeIds).length, 16);
});

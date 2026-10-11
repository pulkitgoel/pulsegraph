import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDiagram } from '../src/services/llmValidation';
import {
  validatePresentationPlan,
  validateAiPresentationPlan,
  localPresentationPlan,
} from '../src/lib/presentationPlan';
import { presentationLayout } from '../src/lib/presentationLayout';
import { presentationLabel } from '../src/lib/presentationLabel';
import { DIAGRAM_EXAMPLES } from '../src/lib/examples';
import { DELIVERY_PRESENTATION } from './fixtures/deliveryPresentation';
import {
  PRODUCTION_FLOW,
  PRODUCTION_PRESENTATION,
} from './fixtures/productionPresentation';
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
import {
  LIVE_RESEARCH_FLOW,
  LIVE_RESEARCH_DUPLICATE_PLAN,
} from './fixtures/liveAiResearch';
import { RESEARCH_ROLES, RESEARCH_PRESENTATION } from './fixtures/researchPresentation';
import {
  INCIDENT_FLOW,
  INCIDENT_PRESENTATION,
  INCIDENT_ROLES,
} from './fixtures/incidentPresentation';

test('curated incident and delivery slides preserve alternate reading paths and retry topology', () => {
  for (const example of [
    {
      name: 'Incident response',
      plan: INCIDENT_PRESENTATION,
      alternatives: [['A', 'B', 'C', 'E', 'H']],
    },
    {
      name: 'Secure CI/CD pipeline',
      plan: DELIVERY_PRESENTATION,
      alternatives: [
        ['A', 'B', 'C', 'D', 'E'],
        ['A', 'B', 'C', 'D', 'F', 'G', 'H', 'I'],
      ],
    },
  ]) {
    const graph = parseDiagram(
      DIAGRAM_EXAMPLES.find((item) => item.name === example.name)!.source,
    );
    const before = JSON.stringify(graph);
    for (const mainPath of [example.plan.mainPath, ...example.alternatives]) {
      const plan = validatePresentationPlan({ ...example.plan, mainPath }, graph);
      const scene = presentationLayout(graph, plan);
      if (mainPath === example.plan.mainPath) assert.equal(scene.lanes.length, 1);
      assert.deepEqual(
        scene.graph.nodes.map((node) => [node.id, node.label]).sort(),
        graph.nodes.map((node) => [node.id, node.label]).sort(),
      );
      assert.deepEqual(
        scene.graph.edges.map((edge) => ({ ...edge, points: [] })),
        graph.edges,
      );
      assert.equal(Object.keys(scene.labels).length, 4);
      for (const edge of scene.graph.edges) {
        assert.ok(
          !routeCrossesNode(edge, scene.graph.nodes),
          `${example.name}: ${edge.id} crosses a node`,
        );
        assert.ok(
          edge.points!.every(
            (point) =>
              point.x >= 0 &&
              point.x <= scene.width &&
              point.y >= 0 &&
              point.y <= scene.height,
          ),
        );
      }
    }
    assert.equal(JSON.stringify(graph), before);
  }
});

test('production API fan-out keeps every port reachable and separates connector rails', () => {
  const graph = parseDiagram(PRODUCTION_FLOW);
  const before = JSON.stringify(graph);
  for (const mainPath of [
    PRODUCTION_PRESENTATION.mainPath,
    [...PRODUCTION_PRESENTATION.mainPath, 'DB'],
  ]) {
    for (const lanes of [
      PRODUCTION_PRESENTATION.lanes,
      [
        {
          title: 'System',
          kind: 'journey' as const,
          nodeIds: graph.nodes.map((n) => n.id),
        },
      ],
    ]) {
      const plan = validatePresentationPlan(
        { ...PRODUCTION_PRESENTATION, mainPath, lanes },
        graph,
      );
      const scene = presentationLayout(graph, plan);
      assert.equal(scene.graph.nodes.length, 9);
      assert.deepEqual(
        scene.graph.edges.map((edge) => ({ ...edge, points: [] })),
        graph.edges,
      );
      assert.ok(scene.labels.e_8);
      for (const edge of scene.graph.edges)
        assert.ok(
          !routeCrossesNode(edge, scene.graph.nodes),
          `${edge.id} crosses a node`,
        );
      const segments = scene.graph.edges.flatMap((edge) =>
        edge.points!.slice(1).map((b, i) => ({ id: edge.id, a: edge.points![i], b })),
      );
      for (const a of segments)
        for (const b of segments) {
          if (a.id === b.id) continue;
          for (const axis of ['x', 'y'] as const) {
            const other = axis === 'x' ? 'y' : 'x';
            if (a.a[axis] !== a.b[axis] || b.a[axis] !== b.b[axis]) continue;
            const overlap =
              Math.min(
                Math.max(a.a[other], a.b[other]),
                Math.max(b.a[other], b.b[other]),
              ) -
              Math.max(
                Math.min(a.a[other], a.b[other]),
                Math.min(b.a[other], b.b[other]),
              );
            if (overlap > 0.1)
              assert.ok(
                Math.abs(a.a[axis] - b.a[axis]) >= 23.9,
                `${a.id}/${b.id} run too close`,
              );
          }
        }
    }
  }
  assert.equal(JSON.stringify(graph), before);
});

test('real AI duplicate path and group sections normalize without changing topology', () => {
  const graph = parseDiagram(LIVE_RESEARCH_FLOW);
  const before = JSON.stringify({ graph, plan: LIVE_RESEARCH_DUPLICATE_PLAN });
  assert.throws(() => validatePresentationPlan(LIVE_RESEARCH_DUPLICATE_PLAN, graph));
  const plan = validateAiPresentationPlan(LIVE_RESEARCH_DUPLICATE_PLAN, graph);
  assert.equal(plan.mainPath.at(-1), 'GetResult');
  assert.equal(new Set(plan.mainPath).size, plan.mainPath.length);
  assert.deepEqual(plan.lanes[1].nodeIds, ['Search', 'Summarize', 'Writer', 'Critic']);
  assert.equal(plan.lanes[0].nodeIds.includes('Search'), false);
  assert.equal(plan.lanes.flatMap((lane) => lane.nodeIds).length, 16);
  const scene = presentationLayout(graph, plan);
  assert.equal(scene.graph.nodes.length, 16);
  assert.equal(scene.graph.edges.length, 24);
  for (const edge of scene.graph.edges)
    assert.ok(!routeCrossesNode(edge, scene.graph.nodes));
  assert.equal(JSON.stringify({ graph, plan: LIVE_RESEARCH_DUPLICATE_PLAN }), before);
});

test('AI normalization still rejects invented edges, missing nodes and ambiguous sections', () => {
  const graph = parseDiagram(LIVE_RESEARCH_FLOW);
  const clone = () => structuredClone(LIVE_RESEARCH_DUPLICATE_PLAN);
  const inventedEdge = clone();
  inventedEdge.mainPath = ['User', 'TensorZero', 'User'];
  const missingNode = clone();
  missingNode.lanes.pop();
  const unknownNode = clone();
  unknownNode.lanes[2].nodeIds.push('Invented');
  const middleCycle = clone();
  middleCycle.mainPath = ['User', 'FastAPI', 'Guardrail', 'User', 'GetResult'];
  const unrelatedDuplicate = clone();
  unrelatedDuplicate.lanes[2].nodeIds.push('Store');
  const ambiguousGroup = clone();
  ambiguousGroup.lanes.push(structuredClone(ambiguousGroup.lanes[1]));
  const invalidDiscardedLane = clone();
  invalidDiscardedLane.lanes[0] = {
    title: '<script>invalid</script>',
    kind: 'journey',
    nodeIds: ['Search', 'Summarize', 'Writer', 'Critic'],
  };
  for (const plan of [
    inventedEdge,
    missingNode,
    unknownNode,
    middleCycle,
    unrelatedDuplicate,
    ambiguousGroup,
    invalidDiscardedLane,
  ])
    assert.throws(() => validateAiPresentationPlan(plan, graph));
});

test('AI normalization leaves valid plans unchanged and rejects split source groups', () => {
  const graph = parseDiagram(RESEARCH_FLOW);
  assert.deepEqual(
    validateAiPresentationPlan(RESEARCH_PRESENTATION, graph),
    RESEARCH_PRESENTATION,
  );
  const liveGraph = parseDiagram(LIVE_RESEARCH_FLOW);
  const split = validateAiPresentationPlan(LIVE_RESEARCH_DUPLICATE_PLAN, liveGraph);
  split.lanes[1].nodeIds = ['Search', 'Summarize', 'Writer'];
  split.lanes[2].nodeIds.push('Critic');
  assert.throws(() => validateAiPresentationPlan(split, liveGraph));
});

test('role-only small process keeps its branch and terminal result in the journey', () => {
  const graph = parseDiagram(INCIDENT_FLOW);
  const plan = localPresentationPlan(graph, { ...INCIDENT_ROLES, H: 'output' });
  assert.equal(plan.lanes.length, 1);
  assert.equal(plan.lanes[0].nodeIds.length, 8);
  const scene = presentationLayout(graph, plan);
  assert.equal(scene.lanes.length, 1);
  assert.equal(scene.graph.edges.length, 9);
});

test('small incident journey stays in one section with its branch below the spine', () => {
  const graph = parseDiagram(INCIDENT_FLOW);
  const before = JSON.stringify(graph);
  const scene = presentationLayout(graph, INCIDENT_PRESENTATION);
  assert.equal(scene.lanes.length, 1);
  assert.equal(scene.graph.nodes.length, 8);
  assert.equal(scene.graph.edges.length, 9);
  const byId = new Map(scene.graph.nodes.map((node) => [node.id, node]));
  const spine = INCIDENT_PRESENTATION.mainPath.map((id) => byId.get(id)!);
  assert.ok(spine.every((node) => node.y === spine[0].y));
  assert.ok(spine.slice(1).every((node, index) => node.x! > spine[index].x!));
  assert.ok(byId.get('E')!.y! > byId.get('C')!.y! + 140);
  for (const edge of scene.graph.edges)
    assert.ok(!routeCrossesNode(edge, scene.graph.nodes));
  const segments = scene.graph.edges.flatMap((edge) =>
    edge.points!.slice(1).map((b, i) => ({ id: edge.id, a: edge.points![i], b })),
  );
  for (const a of segments)
    for (const b of segments) {
      if (a.id === b.id) continue;
      for (const axis of ['x', 'y'] as const) {
        const other = axis === 'x' ? 'y' : 'x';
        if (a.a[axis] !== a.b[axis] || b.a[axis] !== b.b[axis]) continue;
        const overlap =
          Math.min(Math.max(a.a[other], a.b[other]), Math.max(b.a[other], b.b[other])) -
          Math.max(Math.min(a.a[other], a.b[other]), Math.min(b.a[other], b.b[other]));
        if (overlap > 0.1)
          assert.ok(
            Math.abs(a.a[axis] - b.a[axis]) >= 23.9,
            `${a.id}/${b.id} run too close`,
          );
      }
    }
  assert.equal(JSON.stringify(graph), before);
});

test('eight sequential steps fit together and larger wraps do not orphan one step', () => {
  for (const count of [8, 9, 17]) {
    const ids = Array.from({ length: count }, (_, i) => `N${i}`);
    const graph = parseDiagram(`flowchart LR\n${ids.join(' --> ')}`);
    const scene = presentationLayout(graph, {
      title: 'Sequence',
      mainPath: ids,
      lanes: [{ title: 'Sequence', kind: 'journey', nodeIds: ids }],
    });
    if (count === 8) assert.equal(scene.lanes.length, 1);
    assert.ok(scene.lanes.every((lane) => lane.nodeIds.length > 1));
  }
});

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

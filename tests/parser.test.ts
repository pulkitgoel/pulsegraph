/**
 * Parser + sanitizer + levels test suite.
 * Runs with zero extra dependencies:  npm test
 * (node --experimental-strip-types --test tests/parser.test.ts)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMermaid } from '../src/parser/mermaidParser.ts';
import { computeLevels, maxLevel } from '../src/lib/graphLevels.ts';
import { sanitizeAnimationCss, sanitizeClassName } from '../src/lib/sanitizeCss.ts';

const ids = (g: ReturnType<typeof parseMermaid>) => g.nodes.map((n) => n.id).sort();
const edgePairs = (g: ReturnType<typeof parseMermaid>) =>
  g.edges.map((e) => `${e.from}->${e.to}`).sort();

// ── Chained edges ─────────────────────────────────────────────────────────────

test('chained edges: A --> B --> C yields 3 nodes, 2 edges', () => {
  const g = parseMermaid('flowchart LR\nA[One] --> B[Two] --> C[Three]');
  assert.deepEqual(ids(g), ['A', 'B', 'C']);
  assert.deepEqual(edgePairs(g), ['A->B', 'B->C']);
  assert.equal(g.warnings?.length, 0);
});

test('landing-page example #1 (chain after a labeled edge) parses fully', () => {
  const g = parseMermaid(
    'flowchart TD\n  A[Start] --> B{Is it working?}\n  B -->|Yes| C[Ship it!]\n  B -->|No| D[Debug] --> B',
  );
  assert.deepEqual(ids(g), ['A', 'B', 'C', 'D']);
  assert.deepEqual(edgePairs(g), ['A->B', 'B->C', 'B->D', 'D->B']);
  assert.equal(g.nodes.find((n) => n.id === 'B')!.type, 'gateway');
  assert.equal(g.edges.find((e) => e.to === 'C')!.label, 'Yes');
  assert.equal(g.edges.find((e) => e.to === 'D')!.label, 'No');
  assert.equal(g.warnings?.length, 0);
  assert.equal(g.layout, 'TB');
});

// ── Labels ────────────────────────────────────────────────────────────────────

test('inline-text label: A -- text --> B', () => {
  const g = parseMermaid('flowchart LR\nA[User] -- sends request --> B[API]');
  assert.deepEqual(ids(g), ['A', 'B']);
  assert.equal(g.edges.length, 1);
  assert.equal(g.edges[0].label, 'sends request');
  assert.equal(g.warnings?.length, 0);
});

test('dotted inline-text label: A -. async .-> B is dashed and labeled', () => {
  const g = parseMermaid('flowchart LR\nA -. async .-> B');
  assert.equal(g.edges.length, 1);
  assert.equal(g.edges[0].label, 'async');
  assert.equal(g.edges[0].dashed, true);
});

test('thick arrow with label: A == load ==> B', () => {
  const g = parseMermaid('flowchart LR\nA == load ==> B');
  assert.equal(g.edges.length, 1);
  assert.equal(g.edges[0].label, 'load');
});

// ── Multi-node shorthand / open links / arrow variants ────────────────────────

test('ampersand fan-in: A & B --> C', () => {
  const g = parseMermaid('flowchart LR\nA & B --> C');
  assert.deepEqual(ids(g), ['A', 'B', 'C']);
  assert.deepEqual(edgePairs(g), ['A->C', 'B->C']);
});

test('ampersand fan-out: A --> B & C', () => {
  const g = parseMermaid('flowchart LR\nA --> B & C');
  assert.deepEqual(edgePairs(g), ['A->B', 'A->C']);
});

test('open link A --- B produces an edge (was: blank canvas)', () => {
  const g = parseMermaid('flowchart LR\nA --- B');
  assert.deepEqual(ids(g), ['A', 'B']);
  assert.equal(g.edges.length, 1);
});

test('chained open links A --- B --- C are not eaten by label normalization', () => {
  const g = parseMermaid('flowchart LR\nA --- B --- C');
  assert.deepEqual(ids(g), ['A', 'B', 'C']);
  assert.deepEqual(edgePairs(g), ['A->B', 'B->C']);
});

test('cross and circle arrows: --x and --o', () => {
  const g = parseMermaid('flowchart LR\nA --x B\nC --o D');
  assert.deepEqual(edgePairs(g), ['A->B', 'C->D']);
});

test('dashed arrow -.-> sets dashed, not isBackEdge', () => {
  const g = parseMermaid('flowchart LR\nA -.-> B');
  assert.equal(g.edges[0].dashed, true);
  assert.equal(g.edges[0].isBackEdge, false);
});

// ── Duplicate / extra arrows ──────────────────────────────────────────────────

test('identical repeated edges are deduped (no extra arrows)', () => {
  const g = parseMermaid('flowchart LR\nA --> B\nA --> B\nA --> B');
  assert.equal(g.edges.length, 1);
});

test('parallel edges with DIFFERENT labels are both kept', () => {
  const g = parseMermaid('flowchart LR\nA -->|one| B\nA -->|two| B');
  assert.equal(g.edges.length, 2);
});

// ── Node shapes ───────────────────────────────────────────────────────────────

test('shape → type mapping matches the README table', () => {
  const g = parseMermaid(
    [
      'flowchart LR',
      'U((User))',
      'DB[(Store)]',
      'CA[/Cache/]',
      'GW{Router}',
      'SV[Service]',
      'CL(Client)',
      'LB[[Balancer]]',
      'Q>Queue]',
      'HX{{Hex}}',
    ].join('\n'),
  );
  const typeOf = (id: string) => g.nodes.find((n) => n.id === id)!.type;
  assert.equal(typeOf('U'), 'user');
  assert.equal(typeOf('DB'), 'database');
  assert.equal(typeOf('CA'), 'cache');
  assert.equal(typeOf('GW'), 'gateway');
  assert.equal(typeOf('SV'), 'service');
  assert.equal(typeOf('CL'), 'client');
  assert.equal(typeOf('LB'), 'loadbalancer');
  assert.equal(typeOf('Q'), 'queue');
  assert.equal(typeOf('HX'), 'gateway');
});

test('late shape definition upgrades an earlier plain reference', () => {
  const g = parseMermaid('flowchart LR\nB --> C\nB{Is valid?}');
  const b = g.nodes.find((n) => n.id === 'B')!;
  assert.equal(b.label, 'Is valid?');
  assert.equal(b.type, 'gateway');
});

// ── Subgraphs / directions / warnings ─────────────────────────────────────────

test('subgraph members are collected, direction lines skipped', () => {
  const g = parseMermaid(
    'flowchart TB\nsubgraph Backend\ndirection LR\nA --> B\nend\nB --> C',
  );
  assert.equal(g.groups!.length, 1);
  assert.deepEqual([...g.groups![0].members].sort(), ['A', 'B']);
});

test('reverse directions are preserved', () => {
  assert.equal(parseMermaid('flowchart RL\nA --> B').layout, 'RL');
  assert.equal(parseMermaid('flowchart BT\nA --> B').layout, 'BT');
});

test('un-parseable lines produce warnings instead of silent garbage', () => {
  const g = parseMermaid('flowchart LR\nA --> B\n!!! total garbage !!!');
  assert.deepEqual(ids(g), ['A', 'B']);
  assert.equal(g.warnings!.length, 1);
  assert.match(g.warnings![0], /not understood/i);
});

// ── Levels ────────────────────────────────────────────────────────────────────

test('computeLevels: linear chain has increasing levels; cycle members get fallback', () => {
  const g = parseMermaid('flowchart LR\nA --> B --> C');
  const lv = computeLevels(g);
  assert.equal(lv.get('A'), 0);
  assert.equal(lv.get('B'), 1);
  assert.equal(lv.get('C'), 2);
  assert.equal(maxLevel(lv), 2);
});

// ── CSS sanitizer ─────────────────────────────────────────────────────────────

test('legacy authored CSS is always rejected', () => {
  const ok =
    '@keyframes float { 0% { transform: translateY(0); } 100% { transform: translateY(-10px); } } .ai-float { animation: float 3s infinite; }';
  assert.equal(sanitizeAnimationCss(ok), '');
  assert.equal(
    sanitizeAnimationCss('.x { background: url(https://evil.example/p) }'),
    '',
  );
  assert.equal(sanitizeAnimationCss('@import "https://evil.example/x.css";'), '');
  assert.equal(sanitizeAnimationCss('.x { color: red } </style><script>1</script>'), '');
});

test('legacy authored animation classes are rejected', () => {
  assert.equal(sanitizeClassName('ai-float'), '');
  assert.equal(sanitizeClassName('x; background:url(a)'), '');
  assert.equal(sanitizeClassName('1bad'), '');
});

/**
 * Deterministic Mermaid flowchart parser → Graph JSON
 * Handles: flowchart LR/TD/TB/RL, node shapes, edge labels (both `-->|x|`
 * and `-- x -->` forms), chained edges (`A --> B --> C`), multi-node
 * shorthand (`A & B --> C`), open links (`A --- B`), dashed edges, and
 * nested subgraph groups.
 * Zero LLM calls — pure TypeScript syntax parsing.
 *
 * Anything that cannot be understood is reported in `Graph.warnings`
 * instead of silently producing garbage nodes.
 */
import type { Graph, GraphNode, GraphEdge, GraphGroup, NodeType } from '../types';

/** Protect quoted labels and shapes from operator/statement tokenization. */
function protect(source: string): { text: string; restore: (s: string) => string } {
  const saved: string[] = [];
  let text = '',
    i = 0;
  while (i < source.length) {
    const start = i;
    const first = source[i];
    if (first === '|') {
      const end = source.indexOf('|', i + 1);
      if (end !== -1) {
        saved.push(source.slice(i + 1, end));
        text += '|' + '\uE000' + (saved.length - 1) + '\uE001' + '|';
        i = end + 1;
        continue;
      }
    }
    if ('[({'.includes(first) || first === '"' || first === "'") {
      const stack: string[] = [];
      let quote = '';
      if (first === '"' || first === "'") {
        quote = first;
        i++;
      }
      do {
        const c = source[i];
        if (quote) {
          if (c === quote && source[i - 1] !== '\\') quote = '';
        } else if (c === '"' || c === "'") quote = c;
        else if ('[({'.includes(c)) stack.push(c);
        else if ('])}'.includes(c)) stack.pop();
        i++;
      } while (i < source.length && (stack.length || quote));
      saved.push(source.slice(start, i));
      text += '\uE000' + (saved.length - 1) + '\uE001';
    } else {
      text += first;
      i++;
    }
  }
  return {
    text,
    restore: (s) => s.replace(/\uE000(\d+)\uE001/g, (_, n: string) => saved[Number(n)]),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let _edgeIdx = 0;
function eid() {
  return `e_${++_edgeIdx}`;
}

/** Strip outer quotes from a string */
function unquote(s: string) {
  return s.replace(/^["']|["']$/g, '').trim();
}

/**
 * Map Mermaid node shape syntax to a NodeType.
 * e.g. A[(label)] → database
 */
function shapeToType(open: string, close: string): NodeType {
  const sig = open + close;
  if (sig === '((' + '))') return 'user'; // circle
  if (open === '[(') return 'database'; // cylinder
  if (sig === '[/' + '/]' || sig === '[/' + ']') return 'cache'; // parallelogram
  if (sig === '[[' + ']]') return 'loadbalancer'; // subroutine
  if (sig === '[' + ']') return 'service'; // rectangle (default)
  if (sig === '(' + ')') return 'client'; // rounded
  if (sig === '{{' + '}}') return 'gateway'; // hexagon
  if (sig === '{' + '}') return 'gateway'; // diamond
  if (open === '>') return 'queue'; // asymmetric
  return 'service';
}

// ── Node definition regex ─────────────────────────────────────────────────────
// Matches: ID[label], ID(label), ID{label}, ID[(label)], ID[/label/], ID((label)),
// ID[[label]], ID{{label}}, ID>label]
const NODE_DEF_RE =
  /^([A-Za-z0-9_.-]+)\s*(\[\[|\[\(|\[\/|\(\(|\{\{|\[|\(|\{|>)(.*?)(\]\]|\)\]|\/\]|\)\)|\}\}|\]|\)|\})\s*$/;

const PLAIN_ID_RE = /^[A-Za-z0-9_.-]+$/;

// ── Parse a single node token which may be ID[label], ID or malformed ─────────
function parseNodeToken(
  token: string,
  nodeMap: Map<string, GraphNode>,
  warnings: string[],
): string {
  token = token
    .trim()
    .replace(/:::[\w-]+$/, '') // strip :::className
    .replace(/\s+<$/, ''); // strip stray reverse-arrowhead remnant (A <--> B)
  const m = NODE_DEF_RE.exec(token);
  if (m) {
    const closing: Record<string, string> = {
      '[': ']',
      '(': ')',
      '{': '}',
      '[[': ']]',
      '[(': ')]',
      '[/': '/]',
      '((': '))',
      '{{': '}}',
      '>': ']',
    };
    if (closing[m[2]] !== m[4]) {
      warnings.push('Mismatched node shape: ' + token);
      return '';
    }
    const rawId = m[1].trim();
    const open = m[2];
    const label = unquote(m[3]);
    const close = m[4];
    const type = shapeToType(open, close);
    if (!nodeMap.has(rawId)) {
      nodeMap.set(rawId, { id: rawId, label: label || rawId, type, width: 0, height: 0 });
    } else {
      // A plain reference may have been created first (e.g. `B --> C` before
      // `B{Question}`); upgrade it with the richer label/shape info.
      const existing = nodeMap.get(rawId)!;
      if (label && (!existing.label || existing.label === existing.id)) {
        existing.label = label;
        existing.type = type;
      }
    }
    return rawId;
  }
  if (PLAIN_ID_RE.test(token)) {
    if (!nodeMap.has(token)) {
      nodeMap.set(token, {
        id: token,
        label: token,
        type: 'service',
        width: 0,
        height: 0,
      });
    }
    return token;
  }
  warnings.push('Could not parse node: ' + token);
  return '';
}

// ── Edge line tokenizer ───────────────────────────────────────────────────────
// Splits a line on ALL link operators, so chains (`A --> B --> C`) yield n-1
// edges. Supported operators: -->, --->, ---, --x, --o, ==>, ===, -.->, -.-,
// and legacy ..> forms.
const LINK_SPLIT_RE = /\s*(-\.+->|-\.+-|-{2,}>|-{2,}[xo]|-{3,}|={2,}>|={3,}|\.{2,}>)\s*/;

/** True if the line contains at least one link operator. */
function hasLink(line: string): boolean {
  return new RegExp(LINK_SPLIT_RE.source).test(line);
}

/**
 * Normalize inline-text links to the pipe-label form so the tokenizer only
 * has to deal with one label syntax:
 *   A -- text --> B   →  A -->|text| B
 *   A -. text .-> B   →  A -.->|text| B
 *   A == text ==> B   →  A ==>|text| B
 *   A -- text --- B   →  A ---|text| B
 */
function normalizeInlineLabels(s: string): string {
  // The left side of an inline-text link is EXACTLY two dashes (`-- text -->`),
  // `-.` (`-. text .->`) or `==` (`== text ==>`). Requiring that via lookbehind
  // prevents false positives on chained open links like `A --- B --- C`.
  return s
    .replace(/(?<!-)-\.\s+(.+?)\s+\.->/g, (_m, txt) => `-.->|${txt.trim()}|`)
    .replace(/(?<![=-])={2}\s+(.+?)\s+={2}>/g, (_m, txt) => `==>|${txt.trim()}|`)
    .replace(
      /(?<!-)-{2}\s+(.+?)\s+-{2}([>xo])/g,
      (_m, txt, arrow) => `--${arrow}|${txt.trim()}|`,
    );
}

/** Split a node segment on top-level `&` (multi-node shorthand). */
function splitAmp(seg: string): string[] {
  const out: string[] = [];
  let depth = 0,
    cur = '';
  for (const ch of seg) {
    if ('[({'.includes(ch)) depth++;
    else if ('])}'.includes(ch)) depth = Math.max(0, depth - 1);
    if (ch === '&' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((t) => t.trim()).filter(Boolean);
}

interface ParsedEdge {
  fromIds: string[];
  toIds: string[];
  label: string;
  isDashed: boolean;
  arrow: 'arrow' | 'none' | 'cross' | 'circle';
  thick: boolean;
}

/**
 * Parse a full edge line into 1+ edges. Returns null if the line contains no
 * link operator at all.
 */
function parseEdgeLine(
  line: string,
  nodeMap: Map<string, GraphNode>,
  warnings: string[],
): ParsedEdge[] | null {
  const protectedLine = protect(line.trim().replace(/;$/, ''));
  const s = normalizeInlineLabels(protectedLine.text);
  if (!hasLink(s)) return null;

  // split() with a capturing group alternates [seg, op, seg, op, seg, ...]
  const parts = s.split(new RegExp(LINK_SPLIT_RE.source, 'g'));
  if (parts.length < 3) return null;

  const results: ParsedEdge[] = [];
  // Walk segments pairwise: seg(i) --op--> seg(i+2)
  let prevIds: string[] | null = null;
  for (let i = 0; i < parts.length; i += 2) {
    let seg = (parts[i] ?? '').trim();
    let label = '';
    // A pipe label directly after the operator belongs to the incoming edge.
    const lm = /^\|([^|]*)\|\s*/.exec(seg);
    if (lm) {
      label = unquote(protectedLine.restore(lm[1].trim()));
      seg = seg.slice(lm[0].length).trim();
    }
    if (!seg) {
      warnings.push('An edge is missing a source or target node.');
      prevIds = null;
      continue;
    }

    const ids = splitAmp(seg)
      .map((t) => parseNodeToken(protectedLine.restore(t), nodeMap, warnings))
      .filter(Boolean);
    if (prevIds && ids.length) {
      const op = parts[i - 1] ?? '';
      results.push({
        fromIds: prevIds,
        toIds: ids,
        label,
        isDashed: op.includes('.'),
        arrow: op.endsWith('x')
          ? 'cross'
          : op.endsWith('o')
            ? 'circle'
            : op.endsWith('>')
              ? 'arrow'
              : 'none',
        thick: op.includes('='),
      });
    }
    prevIds = ids.length ? ids : null;
  }
  return results;
}

// ── Main parse function ───────────────────────────────────────────────────────
export function parseMermaid(mermaid: string): Graph {
  _edgeIdx = 0;

  if (mermaid.length > 30_000)
    throw new Error('Diagram source exceeds 30,000 characters.');
  const shield = protect(
    mermaid
      .trim()
      .replace(/^\x60\x60\x60(?:mermaid)?\s*/i, '')
      .replace(/\s*\x60\x60\x60$/, ''),
  );
  const lines = shield.text
    .split('\n')
    .map((line) => line.replace(/%%.*$/, ''))
    .join('\n')
    .split(/[;\n]/)
    .map(shield.restore)
    .map((l) => l.trim())
    .filter(Boolean);

  let layout: 'LR' | 'TB' | 'RL' | 'BT' = 'LR';
  const nodeMap = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const groups: GraphGroup[] = [];
  const warnings: string[] = [];
  const seenEdges = new Set<string>();

  // Parse layout direction from first line
  const firstLine = lines[0] ?? '';
  if (/flowchart\s+(TB|TD|BT)|graph\s+(TB|TD|BT)/i.test(firstLine)) layout = 'TB';
  if (/flowchart\s+(LR|RL)|graph\s+(LR|RL)/i.test(firstLine)) layout = 'LR';

  if (/^(?:flowchart|graph)\s+RL/i.test(firstLine)) layout = 'RL';
  if (/^(?:flowchart|graph)\s+BT/i.test(firstLine)) layout = 'BT';

  // Track subgraph context
  const subgraphStack: Array<{
    id: string;
    label: string;
    members: Set<string>;
    parentId?: string;
  }> = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    i++;

    // ── Skip directives / comments ──
    if (/^(flowchart|graph)\s/i.test(line)) continue;
    if (line.startsWith('%%')) continue;
    if (line === '---') continue;
    if (/^(accTitle|accDescr)\b/i.test(line)) continue;

    // ── Subgraph start ──
    const subStart =
      /^subgraph\s+(?:([A-Za-z0-9_]+)\s*\[["']?(.*?)["']?\]|(["']?)([^"'\n]+)\3)\s*$/i.exec(
        line,
      );
    if (subStart) {
      const label = (subStart[2] || subStart[4]).trim();
      const rawId = subStart[1] || label;
      const id = 'grp_' + rawId.toLowerCase().replace(/\W+/g, '_');

      let parentId: string | undefined = undefined;
      if (subgraphStack.length > 0) {
        parentId = subgraphStack[subgraphStack.length - 1].id;
      }

      if (subgraphStack.length >= 20) throw new Error('Use at most 20 nested groups.');
      if (
        groups.some((group) => group.id === id) ||
        subgraphStack.some((group) => group.id === id)
      ) {
        warnings.push('Subgraph IDs must be unique: ' + id);
      }
      subgraphStack.push({ id, label, members: new Set(), parentId });
      continue;
    }

    // ── Subgraph end ──
    if (/^end\s*$/i.test(line)) {
      const grp = subgraphStack.pop();
      if (grp) {
        const groupColors = [
          'rgba(147,51,234,0.1)',
          'rgba(16,185,129,0.1)',
          'rgba(59,130,246,0.1)',
          'rgba(234,179,8,0.1)',
          'rgba(239,68,68,0.1)',
        ];
        groups.push({
          id: grp.id,
          label: grp.label,
          members: [...grp.members],
          color: groupColors[groups.length % groupColors.length],
          parentId: grp.parentId,
        });
      }
      if (!grp) warnings.push('Unexpected end without a subgraph.');
      continue;
    }

    // ── Style / fill color parsing ──
    const styleMatch = /^style\s+([A-Za-z0-9_.-]+)\s+(.*)$/i.exec(line);
    if (styleMatch) {
      const id = styleMatch[1];
      const props = styleMatch[2];
      const fillMatch = /fill:\s*(#[A-Fa-f0-9]{3,6}|[a-zA-Z]+)/.exec(props);
      if (fillMatch) {
        if (!nodeMap.has(id)) {
          nodeMap.set(id, { id, label: id, type: 'service', width: 0, height: 0 });
        }
        nodeMap.get(id)!.color = fillMatch[1];
      }
      continue;
    }

    if (/^(style|classDef|class|linkStyle|click|direction)\b/i.test(line)) {
      warnings.push('Unsupported directive: ' + line);
      continue;
    }

    // ── Edge line(s) — may contain chains and multi-node shorthand ──
    const parsedEdges = parseEdgeLine(line, nodeMap, warnings);
    if (parsedEdges) {
      for (const pe of parsedEdges) {
        for (const fromId of pe.fromIds) {
          for (const toId of pe.toIds) {
            // Dedup identical edges so repeated lines never draw extra arrows.
            const key = JSON.stringify([
              fromId,
              toId,
              pe.label,
              pe.isDashed,
              pe.arrow,
              pe.thick,
            ]);
            if (seenEdges.has(key)) continue;
            seenEdges.add(key);
            if (edges.length >= 300)
              throw new Error('Use up to 300 connections per diagram.');
            edges.push({
              id: eid(),
              from: fromId,
              to: toId,
              label: pe.label,
              dashed: pe.isDashed,
              arrow: pe.arrow,
              thick: pe.thick,
              // Real cycle/back-edges are detected structurally in the layout
              // engine; a dashed style no longer implies a back-edge.
              isBackEdge: false,
              points: [],
            });
            if (subgraphStack.length > 0) {
              const top = subgraphStack[subgraphStack.length - 1];
              top.members.add(fromId);
              top.members.add(toId);
            }
          }
        }
      }
      continue;
    }

    // ── Standalone node definition ──
    if (NODE_DEF_RE.test(line) || PLAIN_ID_RE.test(line.replace(/:::[\w-]+$/, ''))) {
      const id = parseNodeToken(line, nodeMap, warnings);
      if (subgraphStack.length > 0) {
        subgraphStack[subgraphStack.length - 1].members.add(id);
      }
      continue;
    }

    // ── Nothing matched — record it instead of silently dropping it ──
    warnings.push(
      `Line not understood: "${line.length > 60 ? line.slice(0, 57) + '…' : line}"`,
    );
  }

  if (nodeMap.size > 100) throw new Error('Use up to 100 nodes per diagram.');
  if (subgraphStack.length) warnings.push('Unclosed subgraph: add end.');
  return {
    nodes: [...nodeMap.values()],
    edges,
    groups,
    layout,
    warnings,
  };
}

// ── Detect if input is already Mermaid ───────────────────────────────────────
export function looksLikeMermaid(text: string): boolean {
  const t = text
    .trim()
    .replace(/^\x60\x60\x60(?:mermaid)?\s*/i, '')
    .toLowerCase();
  return (
    /^(flowchart|graph|sequencediagram|statediagram|classdiagram|erdiagram|gantt|pie|journey|mindmap|gitgraph|quadrantchart|xychart)\b/.test(
      t,
    ) ||
    /^[a-z0-9_.-]+\s*[[({]/i.test(t) ||
    /-->|-\.->|==>/.test(t)
  );
}

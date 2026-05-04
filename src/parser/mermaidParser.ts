/**
 * Deterministic Mermaid flowchart parser → Graph JSON
 * Handles: flowchart LR/TD/TB/RL, node shapes, edge labels,
 * dashed edges, and subgraph groups.
 * Zero LLM calls — pure TypeScript syntax parsing.
 */
import type { Graph, GraphNode, GraphEdge, GraphGroup, NodeType } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

let _edgeIdx = 0;
function eid() { return `e_${++_edgeIdx}`; }

/** Strip outer quotes from a string */
function unquote(s: string) {
  return s.replace(/^["']|["']$/g, '').trim();
}

/**
 * Map Mermaid node shape syntax to a NodeType.
 *
 * Shape characters surround the label inside node definition.
 * e.g. A[(label)] → database
 */
function shapeToType(open: string, close: string): NodeType {
  const sig = open + close;
  if (sig === '((' + '))') return 'user';          // circle
  if (sig === '[(])'  || open === '[(')  return 'database';   // cylinder
  if (sig === '[/' + '/]' || sig === '[/]') return 'cache';   // parallelogram
  if (sig === '['  + ']') return 'service';        // rectangle (default)
  if (sig === '('  + ')') return 'client';         // rounded
  if (sig === '{'  + '}') return 'gateway';        // diamond
  if (sig === '{{' + '}}') return 'gateway';
  if (sig === '[[' + ']]') return 'loadbalancer';  // subroutine
  if (sig === '>'  + ']') return 'queue';          // asymmetric
  if (sig === '((' + '))') return 'user';
  return 'service';
}

// ── Node definition regex ─────────────────────────────────────────────────────
// Matches: ID[label], ID(label), ID{label}, ID[(label)], ID[/label/], ID((label))
const NODE_DEF_RE =
  /^([A-Za-z0-9_]+)\s*(\[{1,2}\/|\[{1,2}\(?|>\[|\({1,2}|\{{1,2})(.*?)(\/{1,2}\]{1,2}|\){1,2}\]{0,2}|\){1,2}|\}{1,2}|\]{1,2})$/;

// ── Parse a single "token" which may be ID[label] or just ID ─────────────────
function parseNodeToken(
  token: string,
  nodeMap: Map<string, GraphNode>
): string {
  token = token.trim();
  const m = NODE_DEF_RE.exec(token);
  if (m) {
    const rawId = m[1].trim();
    const open  = m[2];
    const label = unquote(m[3]);
    const close = m[4];
    const type  = shapeToType(open, close);
    if (!nodeMap.has(rawId)) {
      nodeMap.set(rawId, { id: rawId, label: label || rawId, type, width: 0, height: 0 });
    } else {
      // Update label/type if richer info available
      const existing = nodeMap.get(rawId)!;
      if (label && !existing.label) existing.label = label;
    }
    return rawId;
  }
  // Plain ID — ensure it exists in map
  if (!nodeMap.has(token)) {
    nodeMap.set(token, { id: token, label: token, type: 'service', width: 0, height: 0 });
  }
  return token;
}

// ── Main parse function ───────────────────────────────────────────────────────
export function parseMermaid(mermaid: string): Graph {
  _edgeIdx = 0;

  const lines = mermaid
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  let layout: 'LR' | 'TB' = 'LR';
  const nodeMap = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const groups: GraphGroup[] = [];

  // Parse layout direction from first line
  const firstLine = lines[0] ?? '';
  if (/flowchart\s+TB|graph\s+TB/i.test(firstLine)) layout = 'TB';
  if (/flowchart\s+TD|graph\s+TD/i.test(firstLine)) layout = 'TB';
  if (/flowchart\s+LR|graph\s+LR/i.test(firstLine)) layout = 'LR';
  if (/flowchart\s+RL|graph\s+RL/i.test(firstLine)) layout = 'LR';

  // Track subgraph context
  const subgraphStack: Array<{ id: string; label: string; members: Set<string>; parentId?: string }> = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    i++;

    // ── Skip directives ──
    if (/^(flowchart|graph)\s/i.test(line)) continue;
    if (line.startsWith('%%')) continue;
    if (line === '---') continue;

    // ── Subgraph start ──
    const subStart = /^subgraph\s+(?:([A-Za-z0-9_]+)\s*\[["']?(.*?)["']?\]|(["']?)([^"'\n]+)\3)\s*$/i.exec(line);
    if (subStart) {
      const label = (subStart[2] || subStart[4]).trim();
      const rawId = subStart[1] || label;
      const id    = 'grp_' + rawId.toLowerCase().replace(/\W+/g, '_');
      
      let parentId: string | undefined = undefined;
      if (subgraphStack.length > 0) {
        parentId = subgraphStack[subgraphStack.length - 1].id;
      }
      
      subgraphStack.push({ id, label, members: new Set(), parentId });
      continue;
    }

    // ── Subgraph end ──
    if (/^end\s*$/i.test(line)) {
      const grp = subgraphStack.pop();
      if (grp && grp.members.size > 0) {
        // Assign a color based on position in groups array
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
      continue;
    }

    // ── Style / classDef / class / linkStyle — skip ──
    if (/^(style|classDef|class|linkStyle)\s/i.test(line)) continue;

    // ── Edge line ──
    // Try to split on edge operators: -->, ==>, -.->  and variations
    // Strategy: split the line on the arrow token
    const edgeMatch = parseEdgeLine(line, nodeMap);
    if (edgeMatch) {
      const { fromId, toId, label: edgeLabel, isDashed } = edgeMatch;
      edges.push({
        id: eid(),
        from: fromId,
        to: toId,
        label: edgeLabel,
        isBackEdge: isDashed,
        points: [],
      });
      // Register members to current subgraph
      if (subgraphStack.length > 0) {
        const top = subgraphStack[subgraphStack.length - 1];
        top.members.add(fromId);
        top.members.add(toId);
      }
      continue;
    }

    // ── Standalone node definition ──
    const standaloneNode = NODE_DEF_RE.exec(line);
    if (standaloneNode) {
      parseNodeToken(line, nodeMap);
      if (subgraphStack.length > 0) {
        subgraphStack[subgraphStack.length - 1].members.add(standaloneNode[1].trim());
      }
    }
  }

  return {
    nodes: [...nodeMap.values()],
    edges,
    groups,
    layout,
  };
}

// ── Edge line parser ──────────────────────────────────────────────────────────
interface EdgeResult {
  fromId: string;
  toId: string;
  label: string;
  isDashed: boolean;
}

function parseEdgeLine(line: string, nodeMap: Map<string, GraphNode>): EdgeResult | null {
  // Normalize line: remove leading/trailing whitespace
  const s = line.trim();

  // Match arrow tokens: -->, ==>, -.->, ..-> etc.
  const arrowRe = /^(.*?)\s*(={2,}>|\.{2,}>|-\.->|-{2,}>)\s*(.*)$/;
  let arrowMatch = arrowRe.exec(s);
  
  // Also handle labeled arrow: A -->|label| B
  const labeledArrowRe = /^(.*?)\s*(={2,}>|\.{2,}>|-\.->|-{2,}>)\s*\|([^|]*)\|\s*(.*)$/;
  const labeledMatch = labeledArrowRe.exec(s);


  if (labeledMatch) {
    const fromRaw = labeledMatch[1].trim();
    const arrowToken = labeledMatch[2];
    const edgeLabel = labeledMatch[3].trim();
    const toRaw = labeledMatch[4].trim();
    if (!fromRaw || !toRaw) return null;
    const fromId = parseNodeToken(fromRaw, nodeMap);
    const toId = parseNodeToken(toRaw, nodeMap);
    return { fromId, toId, label: edgeLabel, isDashed: arrowToken.includes('.') };
  }

  if (arrowMatch) {
    const fromRaw = arrowMatch[1].trim();
    const arrowToken = arrowMatch[2];
    const toRaw = arrowMatch[3].trim();
    if (!fromRaw || !toRaw) return null;
    // toRaw might have a trailing |label| that belongs to the NEXT edge — ignore
    const cleanTo = toRaw.replace(/\|.*$/, '').trim();
    if (!cleanTo) return null;
    const fromId = parseNodeToken(fromRaw, nodeMap);
    const toId = parseNodeToken(cleanTo, nodeMap);
    return { fromId, toId, label: '', isDashed: arrowToken.includes('.') };
  }

  return null;
}

// ── Detect if input is already Mermaid ───────────────────────────────────────
export function looksLikeMermaid(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    t.startsWith('flowchart') ||
    t.startsWith('graph ') ||
    t.startsWith('sequencediagram') ||
    t.startsWith('statediagram') ||
    /^(a|b|c|node)\[/.test(t)
  );
}

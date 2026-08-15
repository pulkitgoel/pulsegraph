/**
 * Blueprint SVG renderer — emits a clean, presentation-quality architecture
 * diagram (light theme, zoned, numbered pipeline, services below, outputs
 * stacked right) in the same style as the hand-designed reference slides.
 * Driven by the AI-assigned node roles, so it works for any flow.
 *
 * This is a STATIC vector renderer (no animation) — the price of the clean look.
 */
import type { Graph, GraphNode } from '../types';
// .ts extensions so the node:test suite can import this module directly
// (allowImportingTsExtensions is enabled; Vite handles it fine).
import { roleBlueprintLayout } from '../parser/layoutEngine.ts';
import { labelAnchor } from '../lib/edgeLabel.ts';

const C = {
  bg: '#f7f8fb',
  text: '#1a1730',
  muted: '#6b7280',
  zoneStroke: '#e2ddf5',
  stageFill: '#f4f2fd',
  stageStroke: '#e2ddf5',
  accent: '#6d3bff',
  accentLight: '#9b6bff',
  green: '#3aa568',
  teal: '#2fa58a',
  blue: '#3b82f6',
  dark: '#1a1730',
  edge: '#8b8698',
  dash: '#9b6bff',
};

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function labelLines(label: string): string[] {
  const ls = label
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
  // Drop consecutive duplicate lines (guards against "Title<br/>Title" labels).
  const dd: string[] = [];
  for (const l of ls) if (!dd.length || dd[dd.length - 1].toLowerCase() !== l.toLowerCase()) dd.push(l);
  return dd;
}

function smoothPath(pts: { x: number; y: number }[]): string {
  if (!pts || pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
    d += ` Q ${pts[i].x} ${pts[i].y} ${mx} ${my}`;
  }
  const L = pts[pts.length - 1];
  return d + ` L ${L.x} ${L.y}`;
}

function serviceColor(label: string): string {
  const l = label.toLowerCase();
  if (/\b(ai|llm|gpt|openai|model|gateway|inference)\b/.test(l)) return C.accent;
  if (/\b(db|database|store|storage|cache|config|data|sql|mongo|redis)\b/.test(l)) return C.teal;
  return C.blue;
}

function bboxOf(nodes: GraphNode[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  nodes.forEach(n => {
    const w = n.width || 0, h = n.height || 0;
    x0 = Math.min(x0, (n.x || 0) - w / 2); y0 = Math.min(y0, (n.y || 0) - h / 2);
    x1 = Math.max(x1, (n.x || 0) + w / 2); y1 = Math.max(y1, (n.y || 0) + h / 2);
  });
  return { x0, y0, x1, y1 };
}

export function buildBlueprintSvg(
  graph: Graph,
  roles: Record<string, string>,
  opts?: { title?: string; subtitle?: string },
): string {
  const laid = roleBlueprintLayout(graph, roles);
  const roleOf = (id: string) => roles[id] || 'pipeline';

  // Shift everything down to leave room for the title.
  const DY = 62;
  laid.nodes.forEach(n => { n.y = (n.y || 0) + DY; });
  laid.edges.forEach(e => { e.points = (e.points || []).map(p => ({ x: p.x, y: p.y + DY })); });

  const nodes = laid.nodes;
  const leadIn = nodes.filter(n => roleOf(n.id) === 'lead-in');
  const pipeline = nodes.filter(n => roleOf(n.id) === 'pipeline').sort((a, b) => (a.x || 0) - (b.x || 0));
  const outputs = nodes.filter(n => roleOf(n.id) === 'output');

  // Root (in-degree 0) gets the dark "entry" treatment.
  const indeg = new Map<string, number>();
  nodes.forEach(n => indeg.set(n.id, 0));
  graph.edges.forEach(e => indeg.set(e.to, (indeg.get(e.to) || 0) + 1));
  const rootId = leadIn.find(n => (indeg.get(n.id) || 0) === 0)?.id;

  const numberOf = new Map<string, number>();
  pipeline.forEach((n, i) => numberOf.set(n.id, i + 1));

  // Canvas must cover routed edge arcs too, not just the node boxes.
  const overall = bboxOf(nodes);
  let maxX = overall.x1, maxY = overall.y1;
  laid.edges.forEach(e => (e.points || []).forEach(p => {
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }));
  const width = Math.round(maxX + 60);
  const height = Math.round(maxY + 74);

  const title = opts?.title || 'Architecture Flow';
  const stageNames = pipeline.map(n => labelLines(n.label)[0]);
  const subtitle = opts?.subtitle
    || (stageNames.length
      ? stageNames.slice(0, 6).join('  →  ') + (stageNames.length > 6 ? '  →  …' : '')
      : '');

  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="'Segoe UI','Helvetica Neue',Arial,sans-serif">`);
  out.push(`<defs>
    <linearGradient id="bpBadge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d3bff"/><stop offset="1" stop-color="#9b6bff"/></linearGradient>
    <filter id="bpSh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#1a1730" flood-opacity="0.12"/></filter>
    <marker id="bpArw" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0 L12,6 L0,12 z" fill="${C.edge}"/></marker>
    <marker id="bpArwd" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0 L12,6 L0,12 z" fill="${C.dash}"/></marker>
  </defs>`);
  out.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="${C.bg}"/>`);

  // Title
  out.push(`<text x="40" y="46" font-size="24" font-weight="700" fill="${C.text}">${esc(title)}</text>`);
  if (subtitle) out.push(`<text x="40" y="72" font-size="13" fill="${C.muted}">${esc(subtitle)}</text>`);

  // Pipeline container + zone headers
  if (pipeline.length) {
    const b = bboxOf(pipeline); const p = 22;
    out.push(`<rect x="${b.x0 - p}" y="${b.y0 - p}" width="${(b.x1 - b.x0) + 2 * p}" height="${(b.y1 - b.y0) + 2 * p}" rx="16" fill="#ffffff" stroke="${C.zoneStroke}" stroke-width="1.5"/>`);
    out.push(`<text x="${(b.x0 + b.x1) / 2}" y="${b.y0 - p - 12}" text-anchor="middle" font-size="11" font-weight="700" letter-spacing="0.1em" fill="${C.accentLight}">PROCESSING PIPELINE - runs in sequence</text>`);
  }
  if (leadIn.length) {
    const b = bboxOf(leadIn);
    out.push(`<text x="${(b.x0 + b.x1) / 2}" y="${b.y0 - 18}" text-anchor="middle" font-size="11" font-weight="700" letter-spacing="0.1em" fill="${C.accentLight}">CLIENT</text>`);
  }
  if (outputs.length) {
    const b = bboxOf(outputs);
    out.push(`<text x="${(b.x0 + b.x1) / 2}" y="${b.y0 - 18}" text-anchor="middle" font-size="11" font-weight="700" letter-spacing="0.1em" fill="${C.green}">OUTPUTS</text>`);
  }

  // Edges
  laid.edges.forEach(e => {
    const pts = e.points || [];
    const d = smoothPath(pts);
    if (!d) return;
    const dashed = (e as { dashed?: boolean }).dashed;
    out.push(`<path d="${d}" fill="none" stroke="${dashed ? C.dash : C.edge}" stroke-width="${dashed ? 1.6 : 1.8}"${dashed ? ' stroke-dasharray="6 5"' : ''} marker-end="url(#${dashed ? 'bpArwd' : 'bpArw'})"/>`);

    // Edge label — decision flows (yes / no / blocked / retry…) are unreadable
    // without them. Anchored near the source so the label sits next to the
    // node that makes the decision, not at a corner of a long routed lane.
    const anchor = e.label ? labelAnchor(pts) : null;
    if (e.label && anchor) {
      const mx = anchor.x, my = anchor.y;
      const text = e.label.length > 22 ? e.label.slice(0, 21) + '…' : e.label;
      const pw = Math.max(30, text.length * 5.6 + 12);
      out.push(`<rect x="${mx - pw / 2}" y="${my - 9}" width="${pw}" height="18" rx="9" fill="#ffffff" stroke="${dashed ? C.dash : C.zoneStroke}" stroke-width="1"/>`);
      out.push(`<text x="${mx}" y="${my + 3.5}" text-anchor="middle" font-size="9.5" font-weight="600" fill="${dashed ? C.dash : C.muted}">${esc(text)}</text>`);
    }
  });

  // Nodes
  nodes.forEach(n => {
    const w = n.width || 160, h = n.height || 82;
    const x = (n.x || 0) - w / 2, y = (n.y || 0) - h / 2;
    const role = roleOf(n.id);
    const lines = labelLines(n.label);
    const title0 = lines[0] || n.id;
    const sub = lines.slice(1).join(' ');
    const isRoot = n.id === rootId;

    if (isRoot) {
      out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${C.dark}" filter="url(#bpSh)"/>`);
      out.push(`<text x="${n.x}" y="${(n.y || 0) - 4}" text-anchor="middle" font-size="13" font-weight="700" fill="#ffffff">${esc(title0)}</text>`);
      if (sub) out.push(`<text x="${n.x}" y="${(n.y || 0) + 15}" text-anchor="middle" font-size="10.5" fill="#c7c6d0">${esc(sub)}</text>`);
      return;
    }

    const fill = role === 'pipeline' ? C.stageFill : '#ffffff';
    const stroke = role === 'pipeline' ? C.stageStroke : C.zoneStroke;
    const shadow = role === 'pipeline' ? '' : ' filter="url(#bpSh)"';
    out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="11" fill="${fill}" stroke="${stroke}" stroke-width="1.4"${shadow}/>`);

    // Accent bar for services / outputs
    if (role === 'service') out.push(`<rect x="${x}" y="${y}" width="6" height="${h}" rx="3" fill="${serviceColor(n.label)}"/>`);
    if (role === 'output') out.push(`<rect x="${x}" y="${y}" width="6" height="${h}" rx="3" fill="${C.green}"/>`);

    // Numbered badge for pipeline
    if (role === 'pipeline' && numberOf.has(n.id)) {
      out.push(`<circle cx="${x + 22}" cy="${y - 12}" r="13" fill="url(#bpBadge)"/>`);
      out.push(`<text x="${x + 22}" y="${y - 7}" text-anchor="middle" font-size="12" font-weight="700" fill="#fff">${numberOf.get(n.id)}</text>`);
    }

    out.push(`<text x="${n.x}" y="${(n.y || 0) - 4}" text-anchor="middle" font-size="12.5" font-weight="700" fill="${C.text}">${esc(title0)}</text>`);
    if (sub) out.push(`<text x="${n.x}" y="${(n.y || 0) + 15}" text-anchor="middle" font-size="10" fill="${C.muted}">${esc(sub)}</text>`);
  });

  // Footer legend
  out.push(`<text x="40" y="${height - 22}" font-size="11" fill="#a0a0ab">Solid = main data flow &#183; Dashed = service / AI calls</text>`);

  out.push('</svg>');
  return out.join('\n');
}

import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import type { Graph, NodeType } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const workerSelf = self as any;


type Pt = { x: number; y: number };

const NODE_COLORS: Record<NodeType, { bg: string; border: string; dot: string }> = {
  user:         { bg: '#12093A', border: '#8B5CF6', dot: '#A78BFA' },
  client:       { bg: '#071428', border: '#3B82F6', dot: '#60A5FA' },
  gateway:      { bg: '#051C28', border: '#06B6D4', dot: '#22D3EE' },
  loadbalancer: { bg: '#051C28', border: '#06B6D4', dot: '#22D3EE' },
  service:      { bg: '#041A0E', border: '#10B981', dot: '#34D399' },
  database:     { bg: '#1A1400', border: '#F59E0B', dot: '#FCD34D' },
  cache:        { bg: '#1C0E00', border: '#F97316', dot: '#FB923C' },
  queue:        { bg: '#1C0028', border: '#EC4899', dot: '#F472B6' },
  external:     { bg: '#111111', border: '#6B7280', dot: '#9CA3AF' },
};

function hex(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function roundRect(ctx: OffscreenCanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
}

/**
 * Convert dagre polyline waypoints → densely-sampled bezier curve points.
 * Uses the same quadratic-bezier-through-midpoints algorithm as the SVG renderer.
 * These fine points are used for pulse-dot animation so dots follow the curve.
 */
function expandBezierPoints(pts: Pt[], steps = 16): Pt[] {
  if (pts.length < 2) return pts;
  const result: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    const start = result[result.length - 1];
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      result.push({
        x: (1 - t) * (1 - t) * start.x + 2 * (1 - t) * t * pts[i].x + t * t * mx,
        y: (1 - t) * (1 - t) * start.y + 2 * (1 - t) * t * pts[i].y + t * t * my,
      });
    }
  }
  result.push(pts[pts.length - 1]);
  return result;
}

/** Interpolate a position along a polyline at fractional progress t (0→1) */
function getPathPoint(points: Pt[], t: number): Pt {
  if (!points || points.length < 2) return { x: 0, y: 0 };
  let total = 0;
  const segs: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const d = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    segs.push(d); total += d;
  }
  let rem = ((t % 1) + 1) % 1 * total;
  for (let i = 0; i < segs.length; i++) {
    if (rem <= segs[i]) {
      const s = rem / segs[i];
      return { x: points[i].x + (points[i + 1].x - points[i].x) * s, y: points[i].y + (points[i + 1].y - points[i].y) * s };
    }
    rem -= segs[i];
  }
  return points[points.length - 1];
}

/** Compute tight bounding box of the entire diagram */
function computeBounds(graph: Graph): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const node of graph.nodes) {
    const w = node.width ?? 140, h = node.height ?? 52;
    minX = Math.min(minX, (node.x ?? 0) - w / 2);
    minY = Math.min(minY, (node.y ?? 0) - h / 2);
    maxX = Math.max(maxX, (node.x ?? 0) + w / 2);
    maxY = Math.max(maxY, (node.y ?? 0) + h / 2);
  }
  for (const edge of graph.edges) {
    for (const pt of edge.points ?? []) {
      minX = Math.min(minX, pt.x); minY = Math.min(minY, pt.y);
      maxX = Math.max(maxX, pt.x); maxY = Math.max(maxY, pt.y);
    }
  }
  const PAD = 40;
  return { minX: minX - PAD, minY: minY - PAD, maxX: maxX + PAD, maxY: maxY + PAD };
}

function drawFrame(ctx: OffscreenCanvasRenderingContext2D, graph: Graph, t: number, W: number, H: number) {
  // Background
  ctx.fillStyle = '#090B10';
  ctx.fillRect(0, 0, W, H);

  // Compute scale + offset so diagram fills the canvas
  const b = computeBounds(graph);
  const dW = b.maxX - b.minX;
  const dH = b.maxY - b.minY;
  const scale = Math.min(W / dW, H / dH);
  const offsetX = (W - dW * scale) / 2 - b.minX * scale;
  const offsetY = (H - dH * scale) / 2 - b.minY * scale;

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  // Dot grid
  ctx.fillStyle = '#1E293B';
  const gs = 28;
  for (let gx = Math.floor(b.minX / gs) * gs; gx < b.maxX; gx += gs)
    for (let gy = Math.floor(b.minY / gs) * gs; gy < b.maxY; gy += gs)
      { ctx.beginPath(); ctx.arc(gx, gy, 0.8, 0, Math.PI * 2); ctx.fill(); }

  // Groups
  for (const g of graph.groups ?? []) {
    const members = graph.nodes.filter((n) => g.members.includes(n.id));
    if (!members.length) continue;
    const xs = members.map((n) => (n.x ?? 0) - (n.width ?? 140) / 2);
    const xe = members.map((n) => (n.x ?? 0) + (n.width ?? 140) / 2);
    const ys = members.map((n) => (n.y ?? 0) - (n.height ?? 52) / 2);
    const ye = members.map((n) => (n.y ?? 0) + (n.height ?? 52) / 2);
    const gx2 = Math.min(...xs) - 18, gy2 = Math.min(...ys) - 28;
    const gw = Math.max(...xe) - Math.min(...xs) + 36, gh = Math.max(...ye) - Math.min(...ys) + 46;
    ctx.fillStyle = g.color ?? 'rgba(100,116,139,0.08)';
    roundRect(ctx, gx2, gy2, gw, gh, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    roundRect(ctx, gx2, gy2, gw, gh, 10); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = `${Math.round(10 / scale)}px Arial, sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(g.label, gx2 + 10, gy2 + 8);
  }

  // Edges — smooth quadratic bezier (identical to SVG pointsToPath in DiagramCanvas)
  for (const edge of graph.edges) {
    const pts = edge.points ?? [];
    if (pts.length < 2) continue;
    ctx.strokeStyle = edge.isBackEdge ? '#6366F1' : '#334155';
    ctx.lineWidth = 2;
    ctx.setLineDash(edge.isBackEdge ? [5, 4] : []);
    // Draw smooth quadratic bezier through midpoints (same as SVG renderer)
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.stroke();
    ctx.setLineDash([]);
    // Arrowhead
    const last = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
    ctx.fillStyle = edge.isBackEdge ? '#6366F1' : '#475569';
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(last.x - 9 * Math.cos(angle - 0.4), last.y - 9 * Math.sin(angle - 0.4));
    ctx.lineTo(last.x - 9 * Math.cos(angle + 0.4), last.y - 9 * Math.sin(angle + 0.4));
    ctx.closePath(); ctx.fill();
    // Edge label at midpoint
    if (edge.label) {
      const mid = pts[Math.floor(pts.length / 2)];
      ctx.fillStyle = edge.isBackEdge ? '#818CF8' : '#64748B';
      ctx.font = `9px Arial, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(edge.label, mid.x, mid.y - 10);
    }
  }

  // Nodes
  for (const node of graph.nodes) {
    if (node.x === undefined || node.y === undefined) continue;
    const style = NODE_COLORS[node.type] ?? NODE_COLORS.service;
    const w = node.width ?? 140, h = node.height ?? 52;
    const nx = node.x, ny = node.y;
    const x = nx - w / 2, y = ny - h / 2;
    ctx.fillStyle = style.bg;
    roundRect(ctx, x, y, w, h, 8); ctx.fill();
    ctx.strokeStyle = style.border; ctx.lineWidth = 1.5;
    roundRect(ctx, x, y, w, h, 8); ctx.stroke();
    // Dot
    ctx.fillStyle = style.dot;
    ctx.beginPath(); ctx.arc(x + 13, ny, 4, 0, Math.PI * 2); ctx.fill();
    // Label
    ctx.fillStyle = '#E2E8F0';
    ctx.font = `500 ${Math.round(11 / scale)}px Arial, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const maxW = w - 30;
    const words = node.label.split(' ');
    let line1 = '', line2 = '';
    for (const word of words) {
      if ((line1 + ' ' + word).trim().length * 6.5 < maxW) line1 = (line1 + ' ' + word).trim();
      else line2 = (line2 + ' ' + word).trim();
    }
    if (line2) {
      ctx.fillText(line1, x + w / 2 + 6, ny - 7, maxW);
      ctx.fillText(line2, x + w / 2 + 6, ny + 7, maxW);
    } else {
      ctx.fillText(line1, x + w / 2 + 6, ny, maxW);
    }
  }

  // Pulse dots — animate along smooth bezier expanded points
  for (let i = 0; i < graph.edges.length; i++) {
    const edge = graph.edges[i];
    const rawPts = edge.points ?? [];
    if (rawPts.length < 2) continue;
    const pts = expandBezierPoints(rawPts, 12); // fine-grained for smooth motion
    const progress = ((t + i * 0.2) % 1 + 1) % 1;
    const pos = getPathPoint(pts, progress);
    const src = graph.nodes.find((n) => n.id === edge.from);
    const [r, g2, bv] = hex((src ? NODE_COLORS[src.type]?.dot : undefined) ?? '#34D399');
    const grad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 10);
    grad.addColorStop(0, `rgba(${r},${g2},${bv},0.8)`);
    grad.addColorStop(1, `rgba(${r},${g2},${bv},0)`);
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(pos.x, pos.y, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgb(${r},${g2},${bv})`; ctx.beginPath(); ctx.arc(pos.x, pos.y, 4.5, 0, Math.PI * 2); ctx.fill();
  }

  ctx.restore();
}

workerSelf.onmessage = (e: MessageEvent) => {
  const { graph, width, height, fps, duration } = e.data as {
    graph: Graph; width: number; height: number; fps: number; duration: number;
  };
  const frames = fps * duration;
  const delay = Math.round(1000 / fps);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  const gif = GIFEncoder();

  for (let f = 0; f < frames; f++) {
    drawFrame(ctx, graph, f / frames, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);
    const u8 = new Uint8Array(data.buffer);
    const palette = quantize(u8, 128);
    const index = applyPalette(u8, palette);
    gif.writeFrame(index, width, height, { palette, delay });
    workerSelf.postMessage({ type: 'progress', pct: Math.round(((f + 1) / frames) * 100) });
  }

  gif.finish();
  // gif.bytes() returns the correctly-sized Uint8Array (no trailing zeros)
  const bytes = gif.bytes();
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  workerSelf.postMessage({ type: 'progress', pct: 100 });
  workerSelf.postMessage({ type: 'done', buffer: buf }, [buf]);
};

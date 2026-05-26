import { useEffect, useRef, useState, useCallback } from 'react';
import gsap from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import type { Graph, NodeType } from '../types';
import { getGraphDimensions } from '../parser/layoutEngine';

gsap.registerPlugin(MotionPathPlugin);

const NODE_STYLES_RICH: Record<NodeType, { bg: string; border: string; dot: string; glow: string }> = {
  user:         { bg: 'rgba(139, 92, 246, 0.25)', border: '#A78BFA', dot: '#A78BFA', glow: 'rgba(139, 92, 246, 0.55)' },
  client:       { bg: 'rgba(59, 130, 246, 0.25)', border: '#60A5FA', dot: '#60A5FA', glow: 'rgba(59, 130, 246, 0.55)' },
  gateway:      { bg: 'rgba(6, 182, 212, 0.25)', border: '#22D3EE', dot: '#22D3EE', glow: 'rgba(6, 182, 212, 0.55)' },
  loadbalancer: { bg: 'rgba(6, 182, 212, 0.25)', border: '#22D3EE', dot: '#22D3EE', glow: 'rgba(6, 182, 212, 0.55)' },
  service:      { bg: 'rgba(16, 185, 129, 0.25)', border: '#34D399', dot: '#34D399', glow: 'rgba(16, 185, 129, 0.55)' },
  database:     { bg: 'rgba(245, 158, 11, 0.25)', border: '#FCD34D', dot: '#FCD34D', glow: 'rgba(245, 158, 11, 0.55)' },
  cache:        { bg: 'rgba(249, 115, 22, 0.25)', border: '#FB923C', dot: '#FB923C', glow: 'rgba(249, 115, 22, 0.55)' },
  queue:        { bg: 'rgba(236, 72, 153, 0.25)', border: '#F472B6', dot: '#F472B6', glow: 'rgba(236, 72, 153, 0.55)' },
  external:     { bg: 'rgba(156, 163, 175, 0.25)', border: '#9CA3AF', dot: '#9CA3AF', glow: 'rgba(156, 163, 175, 0.55)' },
};

function RichNodeIcon({ type, label }: { type: NodeType, label?: string }) {
  const lbl = (label || '').toLowerCase();
  const isRobot = /(agent|bot|ai|llm|openai|gpt)/i.test(lbl);
  const isAuth = /(auth|login|security|token|jwt|identity|password|oauth)/i.test(lbl);
  const isSearch = /(search|query|find|lookup|elasticsearch|algolia)/i.test(lbl);
  const isEmail = /(mail|email|smtp|sendgrid|ses)/i.test(lbl);
  const isCloud = /(cloud|aws|azure|gcp|s3|internet|cdn)/i.test(lbl);
  const isMobile = /(mobile|ios|android|phone|app)/i.test(lbl);
  const isWeb = /(web|browser|chrome|ui|frontend|react|vue|angular)/i.test(lbl);
  const isApi = /(api|rest|graphql|http|endpoint|webhook)/i.test(lbl);
  const isDoc = /(file|document|doc|pdf|storage|bucket)/i.test(lbl);
  const isPay = /(payment|stripe|checkout|billing|card|money)/i.test(lbl);
  const isWorker = /(worker|job|task|cron|background|process)/i.test(lbl);

  if (isRobot) {
    return (
      <g transform="translate(0,2) scale(1.1)">
        {/* Head */}
        <rect x="6" y="2" width="12" height="8" rx="2" fill="rgba(59, 130, 246, 0.2)" stroke="#93C5FD" strokeWidth="1.5"/>
        <circle cx="9" cy="5" r="1.5" fill="#FFF" className="led-blink"/>
        <circle cx="15" cy="5" r="1.5" fill="#FFF" className="led-blink" style={{ animationDelay: '0.5s' }}/>
        <line x1="12" y1="2" x2="12" y2="-1" stroke="#93C5FD" strokeWidth="1.5"/>
        <circle cx="12" cy="-2" r="1.5" fill="#F87171" className="rich-pulse"/>
        {/* Body */}
        <rect x="5" y="11" width="14" height="11" rx="3" fill="rgba(30, 58, 138, 0.3)" stroke="#60A5FA" strokeWidth="1.5" className="robot-body-dance"/>
        {/* Arms */}
        <rect x="1" y="12" width="3" height="8" rx="1.5" fill="#60A5FA" className="robot-arm-l"/>
        <rect x="20" y="12" width="3" height="8" rx="1.5" fill="#60A5FA" className="robot-arm-r"/>
      </g>
    );
  }
  
  if (isAuth) return (
    <g transform="translate(4,2) scale(1.1)">
      <path className="lock-shackle" d="M7,10 V6 C7,2 17,2 17,6 V10" fill="none" stroke="#A78BFA" strokeWidth="1.5" />
      <rect x="4" y="10" width="16" height="12" rx="2" fill="rgba(139, 92, 246, 0.25)" stroke="#A78BFA" strokeWidth="1.5" />
      <circle cx="12" cy="15.5" r="2" fill="#DDD6FE" />
      <rect x="11" y="17.5" width="2" height="2.5" fill="#DDD6FE" />
    </g>
  );

  if (isSearch) return (
    <g transform="translate(4,4) scale(1.1)">
      <circle cx="10" cy="10" r="6" fill="rgba(59, 130, 246, 0.25)" stroke="#60A5FA" strokeWidth="2" />
      <line x1="14" y1="14" x2="20" y2="20" stroke="#60A5FA" strokeWidth="3" strokeLinecap="round" />
      <circle cx="10" cy="10" r="2" fill="#BFDBFE" className="rich-pulse"/>
    </g>
  );

  if (isEmail) return (
    <g transform="translate(2,6) scale(1.1)">
      <rect x="0" y="0" width="24" height="16" rx="2" fill="rgba(245, 158, 11, 0.2)" stroke="#FBBF24" strokeWidth="1.5" />
      <path d="M0,0 L12,10 L24,0" fill="none" stroke="#FBBF24" strokeWidth="1.5" />
      <circle cx="12" cy="10" r="2" fill="#FDE68A" className="led-blink"/>
    </g>
  );

  if (isCloud) return (
    <g transform="translate(2,6) scale(1.1)">
      <path d="M 6 16 A 4 4 0 0 1 6 8 A 6 6 0 0 1 18 8 A 4 4 0 0 1 18 16 Z" fill="rgba(56, 189, 248, 0.2)" stroke="#38BDF8" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="1.5" fill="#BAE6FD" className="led-blink"/>
      <circle cx="8" cy="12" r="1.5" fill="#BAE6FD" className="led-blink" style={{animationDelay: '0.3s'}}/>
      <circle cx="16" cy="12" r="1.5" fill="#BAE6FD" className="led-blink" style={{animationDelay: '0.6s'}}/>
    </g>
  );

  if (isMobile) return (
    <g transform="translate(6,1) scale(1.1)">
      <rect x="0" y="0" width="14" height="24" rx="3" fill="rgba(59, 130, 246, 0.15)" stroke="#60A5FA" strokeWidth="1.5" />
      <rect x="2" y="2" width="10" height="16" rx="1" fill="rgba(30, 58, 138, 0.4)" />
      <line x1="5" y1="21" x2="9" y2="21" stroke="#60A5FA" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="7" cy="10" r="3" fill="#93C5FD" className="rich-pulse"/>
    </g>
  );

  if (isWeb) return (
    <g transform="translate(1,5) scale(1.1)">
      <rect x="0" y="0" width="26" height="18" rx="2" fill="rgba(148, 163, 184, 0.2)" stroke="#94A3B8" strokeWidth="1.5" />
      <line x1="0" y1="5" x2="26" y2="5" stroke="#94A3B8" strokeWidth="1.5" />
      <circle cx="3" cy="2.5" r="1" fill="#F87171" />
      <circle cx="6" cy="2.5" r="1" fill="#FBBF24" />
      <circle cx="9" cy="2.5" r="1" fill="#34D399" />
      <rect x="4" y="9" width="18" height="5" rx="1" fill="rgba(148, 163, 184, 0.35)" className="data-flow"/>
    </g>
  );

  if (isApi) return (
    <g transform="translate(2,4) scale(1.1)">
      <circle cx="4" cy="12" r="3" fill="rgba(16, 185, 129, 0.2)" stroke="#34D399" strokeWidth="1.5" />
      <circle cx="20" cy="6" r="3" fill="rgba(16, 185, 129, 0.2)" stroke="#34D399" strokeWidth="1.5" />
      <circle cx="20" cy="18" r="3" fill="rgba(16, 185, 129, 0.2)" stroke="#34D399" strokeWidth="1.5" />
      <path d="M7,12 L13,12 M13,12 L17,6 M13,12 L17,18" fill="none" stroke="#34D399" strokeWidth="1.5" />
      <circle cx="13" cy="12" r="2" fill="#A7F3D0" className="rich-pulse"/>
    </g>
  );

  if (isDoc) return (
    <g transform="translate(5,2) scale(1.1)">
      <path d="M0,0 L10,0 L16,6 L16,22 L0,22 Z" fill="rgba(249, 115, 22, 0.25)" stroke="#FB923C" strokeWidth="1.5" />
      <path d="M10,0 L10,6 L16,6" fill="none" stroke="#FB923C" strokeWidth="1.5" />
      <line x1="4" y1="10" x2="12" y2="10" stroke="#FDBA74" strokeWidth="1.5" />
      <line x1="4" y1="14" x2="12" y2="14" stroke="#FDBA74" strokeWidth="1.5" />
      <line x1="4" y1="18" x2="8" y2="18" stroke="#FDBA74" strokeWidth="1.5" className="led-blink"/>
    </g>
  );

  if (isPay) return (
    <g transform="translate(2,6) scale(1.1)">
      <rect x="0" y="0" width="24" height="16" rx="2" fill="rgba(16, 185, 129, 0.2)" stroke="#10B981" strokeWidth="1.5" />
      <rect x="0" y="4" width="24" height="4" fill="rgba(4, 120, 87, 0.4)" />
      <rect x="4" y="10" width="6" height="3" rx="0.5" fill="#34D399" className="rich-pulse" />
    </g>
  );

  if (isWorker) return (
    <g transform="translate(4,4) scale(1.1)">
      <circle cx="12" cy="12" r="8" fill="rgba(148, 163, 184, 0.2)" stroke="#94A3B8" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="3" fill="rgba(148, 163, 184, 0.4)" stroke="#CBD5E1" strokeWidth="1" className="rich-pulse" />
      <line x1="12" y1="0" x2="12" y2="4" stroke="#94A3B8" strokeWidth="2" />
      <line x1="12" y1="20" x2="12" y2="24" stroke="#94A3B8" strokeWidth="2" />
      <line x1="0" y1="12" x2="4" y2="12" stroke="#94A3B8" strokeWidth="2" />
      <line x1="20" y1="12" x2="24" y2="12" stroke="#94A3B8" strokeWidth="2" />
    </g>
  );

  switch (type) {
    case 'database':
      return (
        <g transform="translate(2,4) scale(1.1)">
          <path d="M0,16 C0,20 24,20 24,16 L24,4 C24,8 0,8 0,4 Z" fill="rgba(245, 158, 11, 0.25)" stroke="#F59E0B" strokeWidth="1.5" />
          <ellipse cx="12" cy="4" rx="12" ry="4" fill="rgba(245, 158, 11, 0.4)" stroke="#FCD34D" strokeWidth="1.5"/>
          <ellipse cx="12" cy="10" rx="12" ry="4" fill="none" stroke="#F59E0B" strokeWidth="1" strokeDasharray="2 2"/>
          <ellipse cx="12" cy="16" rx="12" ry="4" fill="none" stroke="#F59E0B" strokeWidth="1" strokeDasharray="2 2"/>
          <line x1="0" y1="10" x2="24" y2="10" stroke="#FCD34D" strokeWidth="1.5" className="scan-line" />
        </g>
      );
    case 'service':
      return (
        <g transform="translate(4,2) scale(1.1)">
          <rect x="0" y="0" width="20" height="24" rx="2" fill="rgba(16, 185, 129, 0.2)" stroke="#10B981" strokeWidth="1.5"/>
          <rect x="2" y="2" width="16" height="4" rx="1" fill="rgba(4, 120, 87, 0.4)"/>
          <rect x="2" y="10" width="16" height="4" rx="1" fill="rgba(4, 120, 87, 0.4)"/>
          <rect x="2" y="18" width="16" height="4" rx="1" fill="rgba(4, 120, 87, 0.4)"/>
          <circle cx="15" cy="4" r="1" className="led-blink"/>
          <circle cx="15" cy="12" r="1" className="led-blink" style={{ animationDelay: '0.3s' }}/>
          <circle cx="15" cy="20" r="1" className="led-blink" style={{ animationDelay: '0.6s' }}/>
          <line x1="4" y1="4" x2="10" y2="4" stroke="#34D399" strokeWidth="1.5" className="data-flow"/>
          <line x1="4" y1="12" x2="10" y2="12" stroke="#34D399" strokeWidth="1.5" className="data-flow" style={{ animationDelay: '0.5s' }}/>
        </g>
      );
    case 'gateway':
    case 'loadbalancer':
      return (
        <g transform="translate(2,2) scale(1.1)">
          <polygon points="12,0 24,12 12,24 0,12" fill="rgba(6, 182, 212, 0.25)" stroke="#22D3EE" strokeWidth="2"/>
          <circle cx="12" cy="12" r="4" fill="#00F2FE" className="rich-pulse"/>
          <path d="M6,12 L18,12 M12,6 L12,18" stroke="#FFFFFF" strokeWidth="1.5"/>
        </g>
      );
    case 'client':
    case 'user':
      return (
        <g transform="translate(1,6) scale(1.1)">
          <rect x="0" y="0" width="24" height="16" rx="2" fill="rgba(59, 130, 246, 0.25)" stroke="#60A5FA" strokeWidth="1.5"/>
          <polygon points="-2,16 26,16 28,18 -4,18" fill="#3B82F6"/>
          <rect x="2" y="2" width="20" height="12" fill="rgba(30, 58, 138, 0.4)"/>
          <text x="12" y="10" fill="#93C5FD" fontSize="8" textAnchor="middle" className="led-blink">&gt;_</text>
        </g>
      );
    case 'queue':
      return (
        <g transform="translate(3,6) scale(1.1)">
          <rect x="0" y="0" width="20" height="6" rx="1" fill="rgba(236, 72, 153, 0.2)" stroke="#F472B6" strokeWidth="1"/>
          <rect x="0" y="8" width="20" height="6" rx="1" fill="rgba(236, 72, 153, 0.3)" stroke="#F472B6" strokeWidth="1"/>
          <rect x="0" y="16" width="20" height="6" rx="1" fill="rgba(236, 72, 153, 0.45)" stroke="#F472B6" strokeWidth="1"/>
          <circle cx="16" cy="3" r="1.5" className="led-blink"/>
          <circle cx="16" cy="11" r="1.5" className="led-blink" style={{animationDelay: '0.4s'}}/>
          <circle cx="16" cy="19" r="1.5" className="led-blink" style={{animationDelay: '0.8s'}}/>
        </g>
      );
    case 'cache':
      return (
        <g transform="translate(2,4) scale(1.1)">
          <path d="M12,0 L24,6 L12,12 L0,6 Z" fill="rgba(249, 115, 22, 0.35)" stroke="#FB923C" strokeWidth="1.5"/>
          <path d="M0,6 L12,12 L12,24 L0,18 Z" fill="rgba(249, 115, 22, 0.2)" stroke="#FB923C" strokeWidth="1.5"/>
          <path d="M24,6 L12,12 L12,24 L24,18 Z" fill="rgba(249, 115, 22, 0.45)" stroke="#FB923C" strokeWidth="1.5"/>
          <circle cx="12" cy="6" r="2" fill="#FDBA74" className="rich-pulse"/>
        </g>
      );
    default:
      return (
        <g transform="translate(2,2) scale(1.1)">
          <circle cx="12" cy="12" r="10" fill="rgba(156, 163, 175, 0.25)" stroke="#9CA3AF" strokeWidth="2"/>
          <circle cx="12" cy="12" r="4" fill="#D1D5DB" className="rich-pulse"/>
        </g>
      );
  }
}

function pointsToPath(points: { x: number; y: number }[]): string {
  if (!points || points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const my = (points[i].y + points[i + 1].y) / 2;
    d += ` Q ${points[i].x} ${points[i].y} ${mx} ${my}`;
  }
  const L = points[points.length - 1];
  return d + ` L ${L.x} ${L.y}`;
}

function stripEmojis(text: string) {
  return text.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F1E6}-\u{1F1FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu, '').trim();
}

function parseLabel(text: string) {
  const cleanText = stripEmojis(text);
  const parts = cleanText.split(/(<[bB]>.*?<\/[bB]>|<[iI]>.*?<\/[iI]>|<br\s*\/?>)/g);
  return parts.map((part, i) => {
    if (!part) return null;
    const lower = part.toLowerCase();
    if (lower.startsWith('<b>')) return <tspan key={i} fontWeight="bold">{part.slice(3, -4)}</tspan>;
    if (lower.startsWith('<i>')) return <tspan key={i} fontStyle="italic">{part.slice(3, -4)}</tspan>;
    if (lower.startsWith('<br')) return null;
    return part.replace(/<[^>]+>/g, '');
  });
}

function wrapLabel(label: string, maxW: number): string[] {
  let cleanLabel = stripEmojis(label);
  cleanLabel = cleanLabel.replace(/\\n/g, '\n').replace(/<br\s*\/?>/g, '\n');
  if (cleanLabel.includes('\n')) {
    return cleanLabel.split('\n').map(l => l.trim()).slice(0, 5);
  }
  const approxChars = Math.floor(maxW / 6.8);
  const plainText = cleanLabel.replace(/<[^>]+>/g, '');
  if (plainText.length <= approxChars) return [cleanLabel];
  const words = cleanLabel.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).replace(/<[^>]+>/g, '').trim().length <= approxChars) cur = (cur + ' ' + w).trim();
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 5);
}

function getContrastColor(bgColor: string, theme: 'dark' | 'light'): string {
  if (bgColor) {
    const cleanColor = bgColor.replace(/\s+/g, '').toLowerCase();
    if (cleanColor.startsWith('rgba')) {
      const match = cleanColor.match(/rgba\((\d+),(\d+),(\d+),([\d.]+)\)/);
      if (match) {
        const alpha = parseFloat(match[4]);
        if (alpha <= 0.45) {
          return theme === 'light' ? '#0B0F19' : '#F8FAFC';
        }
        const r = parseInt(match[1]);
        const g = parseInt(match[2]);
        const b = parseInt(match[3]);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness > 140 ? '#0B0F19' : '#F8FAFC';
      }
    }
    if (cleanColor.startsWith('#')) {
      const hex = cleanColor.slice(1);
      let r = 0, g = 0, b = 0;
      if (hex.length === 3) {
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
      } else if (hex.length === 6 || hex.length === 8) {
        r = parseInt(hex.slice(0, 2), 16);
        g = parseInt(hex.slice(2, 4), 16);
        b = parseInt(hex.slice(4, 6), 16);
      }
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      return brightness > 140 ? '#0B0F19' : '#F8FAFC';
    }
  }
  return theme === 'light' ? '#0B0F19' : '#F8FAFC';
}

interface Props { graph: Graph; theme?: 'dark' | 'light'; }

export function RichDiagramCanvas({ graph, theme = 'dark' }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const transformContainerRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<gsap.Context | null>(null);
  
  const transform = useRef({ scale: 1, x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const { width, height } = getGraphDimensions(graph);

  // --- Flow-based Dynamic Color-Coding ---
  // 1. Calculate in-degrees and build adjacency list
  const inDegreeMap = new Map<string, number>();
  const adjList = new Map<string, string[]>();
  graph.nodes.forEach(n => {
    inDegreeMap.set(n.id, 0);
    adjList.set(n.id, []);
  });
  graph.edges.forEach(e => {
    if (!e.isBackEdge) {
      inDegreeMap.set(e.to, (inDegreeMap.get(e.to) || 0) + 1);
      adjList.get(e.from)?.push(e.to);
    }
  });

  // 2. Identify root nodes (inDegree === 0)
  let roots = graph.nodes.filter(n => inDegreeMap.get(n.id) === 0);
  // Fallback if no node has 0 in-degree (due to cycles)
  if (roots.length === 0 && graph.nodes.length > 0) {
    roots = [graph.nodes[0]];
  }

  // 3. Define the premium flow styles palette
  const FLOW_PALETTE = [
    { bg: 'rgba(129, 140, 248, 0.25)', border: '#818CF8', dot: '#818CF8', glow: 'rgba(129, 140, 248, 0.55)' }, // Indigo
    { bg: 'rgba(34, 211, 238, 0.25)', border: '#22D3EE', dot: '#22D3EE', glow: 'rgba(34, 211, 238, 0.55)' },  // Cyan
    { bg: 'rgba(244, 114, 182, 0.25)', border: '#F472B6', dot: '#F472B6', glow: 'rgba(244, 114, 182, 0.55)' }, // Pink
    { bg: 'rgba(52, 211, 153, 0.25)', border: '#34D399', dot: '#34D399', glow: 'rgba(52, 211, 153, 0.55)' },  // Emerald
    { bg: 'rgba(252, 211, 77, 0.25)',  border: '#FCD34D', dot: '#FCD34D', glow: 'rgba(252, 211, 77, 0.55)' },  // Amber
    { bg: 'rgba(251, 146, 60, 0.25)',  border: '#FB923C', dot: '#FB923C', glow: 'rgba(251, 146, 60, 0.55)' },  // Orange
    { bg: 'rgba(167, 139, 250, 0.25)', border: '#A78BFA', dot: '#A78BFA', glow: 'rgba(167, 139, 250, 0.55)' }, // Violet
    { bg: 'rgba(96, 165, 250, 0.25)',  border: '#60A5FA', dot: '#60A5FA', glow: 'rgba(96, 165, 250, 0.55)' },  // Blue
  ];

  const ROOT_STYLE = {
    bg: 'rgba(226, 232, 240, 0.22)',
    border: '#F1F5F9',
    dot: '#F1F5F9',
    glow: 'rgba(241, 245, 249, 0.55)'
  };

  // 4. Assign flow branch styles
  const nodeFlowStyles = new Map<string, typeof ROOT_STYLE>();
  const edgeFlowColors = new Map<string, string>();

  // Mark root nodes with the neutral Root Style
  const rootIds = new Set(roots.map(r => r.id));
  roots.forEach(r => {
    nodeFlowStyles.set(r.id, ROOT_STYLE);
  });

  // For each root, trace its outgoing flows
  let flowCounter = 0;
  roots.forEach(root => {
    const outgoingTargets = adjList.get(root.id) || [];
    outgoingTargets.forEach(target => {
      // Get a color for this branch
      const flowStyle = FLOW_PALETTE[flowCounter % FLOW_PALETTE.length];
      flowCounter++;

      // BFS to assign flowStyle to all reachable downstream nodes/edges
      const queue: string[] = [target];
      const visited = new Set<string>();

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (visited.has(currentId)) continue;
        visited.add(currentId);

        if (!nodeFlowStyles.has(currentId) && !rootIds.has(currentId)) {
          nodeFlowStyles.set(currentId, flowStyle);
        }

        const nextNodes = adjList.get(currentId) || [];
        nextNodes.forEach(next => {
          if (!visited.has(next)) {
            queue.push(next);
          }
        });
      }
    });
  });

  // Assign edge colors: an edge gets the color of its source node's flow.
  // If the source node is a root node, we color the edge based on the target node's flow color.
  graph.edges.forEach(edge => {
    const srcStyle = nodeFlowStyles.get(edge.from);
    const tgtStyle = nodeFlowStyles.get(edge.to);
    
    if (rootIds.has(edge.from)) {
      edgeFlowColors.set(edge.id, tgtStyle?.border || '#334155');
    } else {
      edgeFlowColors.set(edge.id, srcStyle?.border || '#334155');
    }
  });

  const applyTransform = useCallback(() => {
    if (transformContainerRef.current) {
      transformContainerRef.current.style.transform = `translate(${transform.current.x}px, ${transform.current.y}px) scale(${transform.current.scale})`;
    }
  }, []);

  useEffect(() => {
    if (containerRef.current) {
      const cw = containerRef.current.clientWidth;
      const ch = containerRef.current.clientHeight;
      const scaleX = (cw - 100) / width;
      const scaleY = (ch - 100) / height;
      const initialScale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.3), 1.5);
      
      transform.current = {
        scale: initialScale,
        x: (cw - width * initialScale) / 2,
        y: (ch - height * initialScale) / 2
      };
      applyTransform();
    }
  }, [width, height, applyTransform]);

  useEffect(() => {
    ctxRef.current?.revert();
    ctxRef.current = gsap.context(() => {
      const nodeLevels = new Map<string, number>();
      const inDegree = new Map<string, number>();
      const adj = new Map<string, string[]>();
      
      graph.nodes.forEach(n => { inDegree.set(n.id, 0); adj.set(n.id, []); });
      graph.edges.forEach(e => {
        if (!e.isBackEdge) {
          inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
          adj.get(e.from)?.push(e.to);
        }
      });
      
      let queue: string[] = [];
      graph.nodes.forEach(n => { if (inDegree.get(n.id) === 0) queue.push(n.id); });
      
      let currentLevel = 0;
      while (queue.length > 0) {
        const nextQueue: string[] = [];
        for (const u of queue) {
          nodeLevels.set(u, currentLevel);
          for (const v of (adj.get(u) || [])) {
            inDegree.set(v, (inDegree.get(v) || 0) - 1);
            if (inDegree.get(v) === 0) nextQueue.push(v);
          }
        }
        queue = nextQueue;
        currentLevel++;
      }
      
      // Assign fallback level for cycles or disconnected nodes
      graph.nodes.forEach(node => {
        if (!nodeLevels.has(node.id)) {
          nodeLevels.set(node.id, currentLevel);
        }
      });
      // Store globally on the graph so rendering badges can reuse it!
      (graph as any).computedLevels = nodeLevels;

      (graph.groups || []).forEach(grp => {
        const grpEl = svgRef.current?.getElementById(`group-${grp.id}`);
        if (grpEl) {
          let minLevel = Infinity;
          grp.members.forEach(m => {
            const l = nodeLevels.get(m);
            if (l !== undefined && l < minLevel) minLevel = l;
          });
          if (minLevel === Infinity) minLevel = 0;
          gsap.fromTo(grpEl, { opacity: 0 }, { opacity: 1, duration: 0.8, delay: minLevel * 0.6 });
        }
      });

      graph.nodes.forEach((node) => {
        const level = nodeLevels.get(node.id) || 0;
        const nodeEl = svgRef.current?.getElementById(`node-group-${node.id}`);
        if (nodeEl) {
          gsap.fromTo(nodeEl, 
            { opacity: 0, scale: 0.8, y: 15 }, 
            { opacity: 1, scale: 1, y: 0, duration: 0.7, delay: level * 0.6, ease: 'back.out(1.2)', clearProps: 'transform' }
          );
        }
      });

      // Continuous Icon Animations (Migrated from CSS)
      gsap.to('.led-blink', { opacity: 0.2, duration: 0.75, yoyo: true, repeat: -1, ease: 'power1.inOut' });
      gsap.fromTo('.scan-line', 
        { y: -10, opacity: 0 }, 
        { y: 10, opacity: 1, duration: 1.5, repeat: -1, ease: 'none', 
          keyframes: [
            { y: -10, opacity: 0, duration: 0 },
            { y: -8, opacity: 1, duration: 0.15 },
            { y: 8, opacity: 1, duration: 1.2 },
            { y: 10, opacity: 0, duration: 0.15 }
          ]
        }
      );
      gsap.fromTo('.data-flow', 
        { x: -5, opacity: 0 }, 
        { x: 5, opacity: 0, duration: 1.5, repeat: -1, ease: 'none', 
          keyframes: [
            { x: -5, opacity: 0, duration: 0 },
            { x: 0, opacity: 1, duration: 0.75 },
            { x: 5, opacity: 0, duration: 0.75 }
          ]
        }
      );
      gsap.to('.rich-pulse', { opacity: 0.4, scale: 1.2, duration: 1, yoyo: true, repeat: -1, transformOrigin: 'center' });
      gsap.fromTo('.robot-body-dance', 
        { y: 0, rotation: 0 }, 
        { y: -2, rotation: 5, duration: 0.25, repeat: -1, yoyo: true, ease: 'sine.inOut', transformOrigin: 'center bottom' }
      );
      gsap.fromTo('.robot-arm-l', 
        { y: 0, rotation: 0 }, 
        { y: -2, rotation: 30, duration: 0.5, repeat: -1, yoyo: true, ease: 'sine.inOut', transformOrigin: '3.5px 12px' }
      );
      gsap.fromTo('.robot-arm-r', 
        { y: 0, rotation: 0 }, 
        { y: -2, rotation: -30, duration: 0.5, repeat: -1, yoyo: true, ease: 'sine.inOut', transformOrigin: '20.5px 12px' }
      );
      gsap.to('.icon-spin', { rotation: 360, duration: 4, repeat: -1, ease: 'none', transformOrigin: 'center' });
      gsap.to('.lock-shackle', {
        repeat: -1,
        keyframes: [
           { y: 0, duration: 0.5, ease: 'none' },
           { y: -4, duration: 0.3, ease: 'back.out(2)' },
           { y: -4, duration: 0.8, ease: 'none' },
           { y: 0, duration: 0.2, ease: 'power2.in' },
           { y: 0, duration: 0.2, ease: 'none' }
        ]
      });

      graph.edges.forEach((edge, i) => {
        const pathEl = svgRef.current?.getElementById(`path-${edge.id}`) as SVGPathElement | null;
        const pulseEl = svgRef.current?.getElementById(`pulse-${edge.id}`);
        if (!pathEl || !pulseEl) return;
        
        const srcLevel = nodeLevels.get(edge.from) || 0;
        const edgeDelay = srcLevel * 0.6 + 0.4;
        
        if (!edge.isBackEdge) {
          const length = pathEl.getTotalLength();
          gsap.set(pathEl, { strokeDasharray: length, strokeDashoffset: length });
          gsap.to(pathEl, { 
            strokeDashoffset: 0, 
            duration: 1.2, 
            delay: edgeDelay, 
            ease: 'power2.out',
            onComplete: () => {
              gsap.set(pathEl, { strokeDasharray: "6 6" });
              gsap.to(pathEl, { strokeDashoffset: -12, duration: 0.6, repeat: -1, ease: 'none' });
            }
          });
        } else {
          gsap.set(pathEl, { opacity: 0 });
          gsap.to(pathEl, { 
            opacity: 1, 
            duration: 1.2, 
            delay: edgeDelay, 
            ease: 'power2.out',
            onComplete: () => {
              gsap.to(pathEl, { strokeDashoffset: -9, duration: 0.6, repeat: -1, ease: 'none' });
            }
          });
        }

        const duration = 1.5 + (i % 5) * 0.28;
        gsap.set(pulseEl, { opacity: 0 });
        gsap.to(pulseEl, { opacity: 1, duration: 0.3, delay: edgeDelay + 0.5 });
        gsap.to(pulseEl, {
          duration: duration, repeat: -1, ease: 'none', delay: edgeDelay + 0.5,
          motionPath: { path: pathEl as SVGPathElement, align: pathEl as SVGPathElement, alignOrigin: [0.5, 0.5] },
          onRepeat: () => {
            const glowEl = svgRef.current?.getElementById(`glow-${edge.to}`);
            if (glowEl) {
              gsap.fromTo(glowEl, 
                { opacity: 0.8, scale: 1.05, transformOrigin: 'center' }, 
                { opacity: 0.07, scale: 1, duration: 0.6, ease: 'power2.out', overwrite: 'auto' }
              );
            }
          }
        });
      });
    }, svgRef);
    return () => ctxRef.current?.revert();
  }, [graph]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX - transform.current.x, y: e.clientY - transform.current.y };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    transform.current.x = e.clientX - dragStart.current.x;
    transform.current.y = e.clientY - dragStart.current.y;
    applyTransform();
  }, [isDragging, applyTransform]);

  const handleMouseUp = useCallback(() => setIsDragging(false), []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let ticking = false;

    const handleWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const zoomSensitivity = Math.abs(e.deltaY) < 50 ? 0.005 : 0.0015;
          const delta = -e.deltaY * zoomSensitivity;
          const prevScale = transform.current.scale;
          const newScale = Math.min(Math.max(prevScale + delta, 0.05), 4);
          const rect = el.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;
          
          transform.current.scale = newScale;
          transform.current.x = mouseX - (mouseX - transform.current.x) * (newScale / prevScale);
          transform.current.y = mouseY - (mouseY - transform.current.y) * (newScale / prevScale);
          
          applyTransform();
          ticking = false;
        });
        ticking = true;
      }
    };
    el.addEventListener('wheel', handleWheelNative, { passive: false });
    return () => el.removeEventListener('wheel', handleWheelNative);
  }, [applyTransform]);

  const handleZoomIn = () => {
    transform.current.scale = Math.min(transform.current.scale * 1.2, 3);
    applyTransform();
  };
  const handleZoomOut = () => {
    transform.current.scale = Math.max(transform.current.scale / 1.2, 0.1);
    applyTransform();
  };
  const handleZoomReset = () => {
    if (containerRef.current) {
      const cw = containerRef.current.clientWidth;
      const ch = containerRef.current.clientHeight;
      const scaleX = (cw - 100) / width;
      const scaleY = (ch - 100) / height;
      const initialScale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.3), 1.5);
      transform.current = {
        scale: initialScale,
        x: (cw - width * initialScale) / 2,
        y: (ch - height * initialScale) / 2
      };
      applyTransform();
    }
  };

  return (
    <div 
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', cursor: isDragging ? 'grabbing' : 'grab' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div style={{ position: 'absolute', top: '1rem', right: '1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', zIndex: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '4px' }}>
        <button onClick={handleZoomIn} className="btn-icon" title="Zoom In"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>
        <button onClick={handleZoomReset} className="btn-icon" title="Reset Zoom"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path><path d="M2 12h20"></path></svg></button>
        <button onClick={handleZoomOut} className="btn-icon" title="Zoom Out"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>
      </div>

      <div ref={transformContainerRef} style={{ transformOrigin: '0 0', width: `${width}px`, height: `${height}px`, willChange: 'transform' }}>
        <svg id="pulsegraph-svg" ref={svgRef} width={width} height={height} style={{ display: 'block' }} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="pg-rich" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="3.5" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="glass" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="glow" />
              <feBlend in="SourceGraphic" in2="glow" mode="normal" />
            </filter>
            <marker id="arr-rich" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0,8 3,0 6" fill="#475569"/>
            </marker>
            {/* Dynamic Flow Markers */}
            <marker id="arr-flow-root" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0,8 3,0 6" fill={ROOT_STYLE.border}/>
            </marker>
            {FLOW_PALETTE.map((pal, idx) => (
              <marker key={idx} id={`arr-flow-${idx}`} markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0,8 3,0 6" fill={pal.border}/>
              </marker>
            ))}
            {graph.aiAnimations?.cssKeyframes && (
              <style dangerouslySetInnerHTML={{ __html: graph.aiAnimations.cssKeyframes }} />
            )}
            <linearGradient id="gradient-overlay" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Groups */}
          {(graph.groups ?? []).map((grp) => {
            if (!grp.width || !grp.height) return null;
            const gx = (grp.x ?? 0) - (grp.width / 2);
            const gy = (grp.y ?? 0) - (grp.height / 2);
            const groupBg = theme === 'light' ? 'rgba(15, 23, 42, 0.03)' : 'rgba(255, 255, 255, 0.03)';
            const groupStroke = theme === 'light' ? 'rgba(15, 23, 42, 0.15)' : 'rgba(255, 255, 255, 0.1)';
            const groupLabelColor = theme === 'light' ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.6)';
            return (
              <g key={grp.id} id={`group-${grp.id}`}>
                <rect x={gx} y={gy} width={grp.width} height={grp.height} rx="14"
                  fill={groupBg} stroke={groupStroke} strokeWidth="1" strokeDasharray="6 4"/>
                <text x={gx + 16} y={gy + 20} fill={groupLabelColor}
                  fontSize="12" fontFamily="Inter, system-ui, sans-serif" fontWeight="700" letterSpacing="0.05em">
                  {parseLabel(grp.label)}
                </text>
              </g>
            );
          })}

          {/* Edges */}
          {graph.edges.map((edge) => {
            const d = pointsToPath(edge.points ?? []);
            if (!d) return null;
            const defaultEdgeColor = theme === 'light' ? '#94A3B8' : '#334155';
            const edgeColor = edgeFlowColors.get(edge.id) || defaultEdgeColor;
            
            let markerId = 'arr-rich';
            if (edgeColor === ROOT_STYLE.border) {
              markerId = 'arr-flow-root';
            } else {
              const palIndex = FLOW_PALETTE.findIndex(p => p.border === edgeColor);
              if (palIndex !== -1) {
                markerId = `arr-flow-${palIndex}`;
              }
            }

            const mid = (edge.points ?? [])[ Math.floor((edge.points ?? []).length / 2) ];
            const edgeBg = theme === 'light' ? '#FFFFFF' : '#0F172A';
            const edgeStroke = theme === 'light' ? '#E2E8F0' : '#1E293B';
            const edgeText = theme === 'light' ? '#475569' : '#94A3B8';

            return (
              <g key={edge.id}>
                <path id={`path-${edge.id}`} d={d} fill="none"
                  stroke={edgeColor} strokeWidth="2.5" markerEnd={`url(#${markerId})`}/>
                {edge.label && mid && (
                  <g>
                    <rect x={mid.x - 45} y={mid.y - 12} width={90} height={24} rx="6" fill={edgeBg} opacity="0.9" stroke={edgeStroke} strokeWidth="1.5"/>
                    <text x={mid.x} y={mid.y} fill={edgeText}
                      fontSize="10" textAnchor="middle" dominantBaseline="middle"
                      fontFamily="Inter, system-ui, sans-serif" fontWeight="500">{parseLabel(edge.label)}</text>
                  </g>
                )}
                <circle id={`pulse-${edge.id}`} r="6" fill={edgeColor} filter="url(#pg-rich)" opacity="0"/>
              </g>
            );
          })}

          {/* Nodes */}
          {graph.nodes.map((node) => {
            if (node.x === undefined || node.y === undefined) return null;
            const st = nodeFlowStyles.get(node.id) ?? NODE_STYLES_RICH[node.type] ?? NODE_STYLES_RICH.service;
            const w = node.width ?? 160, h = node.height ?? 60;
            const nx = node.x, ny = node.y;
            const rx = nx - w / 2, ry = ny - h / 2;
            const lines = wrapLabel(node.label, w - 40);
            const lineH = 15;
            const startY = h / 2 - ((lines.length - 1) * lineH) / 2;
            const aiClass = graph.aiAnimations?.nodeClasses?.[node.id] || '';
            const textColor = getContrastColor(node.color || st.bg, theme);
            
            // Use the deterministically computed levels for badges (1-indexed)
            const computedLevels = (graph as any).computedLevels as Map<string, number> | undefined;
            const stepNumber = computedLevels && computedLevels.has(node.id) ? computedLevels.get(node.id)! + 1 : null;

            return (
              <g key={node.id} transform={`translate(${rx},${ry})`}>
                <g id={`node-group-${node.id}`} className={`node-group ${aiClass}`} style={{ transformOrigin: `${w / 2}px ${h / 2}px` }}>
                  {/* Glow */}
                  <rect id={`glow-${node.id}`} x="-6" y="-6" width={w + 12} height={h + 12} rx="16" fill={st.glow} filter="url(#pg-rich)" opacity="0.25"/>
                  
                  {/* Glassmorphism background */}
                  <rect width={w} height={h} rx="12" fill={node.color || st.bg} stroke={node.color ? 'rgba(255,255,255,0.4)' : st.border} strokeWidth="1.5" filter="url(#glass)"/>
                  <rect width={w} height={h} rx="12" fill="url(#gradient-overlay)" opacity="0.15" pointerEvents="none"/>

                  {/* Rich Icon */}
                  <g transform={`translate(12, ${h / 2 - 12})`}>
                    <svg width="24" height="24" viewBox="0 0 24 24" overflow="visible">
                      <RichNodeIcon type={node.type} label={node.label} />
                    </svg>
                  </g>

                  {/* Label */}
                  {lines.map((line, li) => (
                    <text key={li}
                      x={w / 2 + 14}
                      y={startY + li * lineH}
                      fill={textColor} fontSize="12" fontWeight="600" textAnchor="middle"
                      dominantBaseline="middle" fontFamily="Inter, system-ui, sans-serif">
                      {parseLabel(line)}
                    </text>
                  ))}

                  {/* Step Badge */}
                  {stepNumber !== null && (
                    <g transform={`translate(${w - 8}, -4)`}>
                      <circle cx="0" cy="0" r="9" fill="#FDE047" stroke="#CA8A04" strokeWidth="1.5" filter="url(#pg-rich)" />
                      <text x="0" y="1" fill="#000" fontSize="11" fontWeight="800" textAnchor="middle" dominantBaseline="middle" fontFamily="Inter, system-ui, sans-serif">
                        {stepNumber}
                      </text>
                    </g>
                  )}
                </g>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

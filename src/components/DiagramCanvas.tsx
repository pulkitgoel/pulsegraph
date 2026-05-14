import { useEffect, useRef, useState, useCallback } from 'react';
import gsap from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import type { Graph, NodeType } from '../types';
import { getGraphDimensions } from '../parser/layoutEngine';

gsap.registerPlugin(MotionPathPlugin);

const NODE_STYLES_DARK: Record<NodeType, { bg: string; border: string; dot: string }> = {
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

const NODE_STYLES_LIGHT: Record<NodeType, { bg: string; border: string; dot: string }> = {
  user:         { bg: '#F3E8FF', border: '#8B5CF6', dot: '#7C3AED' },
  client:       { bg: '#EFF6FF', border: '#3B82F6', dot: '#2563EB' },
  gateway:      { bg: '#ECFEFF', border: '#06B6D4', dot: '#0891B2' },
  loadbalancer: { bg: '#ECFEFF', border: '#06B6D4', dot: '#0891B2' },
  service:      { bg: '#ECFDF5', border: '#10B981', dot: '#059669' },
  database:     { bg: '#FFFBEB', border: '#F59E0B', dot: '#D97706' },
  cache:        { bg: '#FFF7ED', border: '#F97316', dot: '#EA580C' },
  queue:        { bg: '#FDF2F8', border: '#EC4899', dot: '#DB2777' },
  external:     { bg: '#F3F4F6', border: '#9CA3AF', dot: '#4B5563' },
};


/** Pure SVG icons — no emoji, fully cross-platform */
function NodeIcon({ type, color }: { type: NodeType; color: string }) {
  const s = { fill: 'none', stroke: color, strokeWidth: 1.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (type) {
    case 'user':
      return <g><circle cx="8" cy="5.5" r="2.5" stroke={color} strokeWidth="1.4" fill="none"/><path d="M2 15 Q2 10 8 10 Q14 10 14 15" {...s}/></g>;
    case 'client':
      return <g><rect x="2" y="4" width="12" height="8" rx="1.5" {...s}/><line x1="1" y1="12" x2="15" y2="12" stroke={color} strokeWidth="1.4"/><line x1="6" y1="12" x2="10" y2="14" stroke={color} strokeWidth="1.4"/></g>;
    case 'gateway':
      return <g><path d="M8 1.5L14.5 8L8 14.5L1.5 8Z" {...s}/><line x1="8" y1="5" x2="8" y2="11" stroke={color} strokeWidth="1.4"/><line x1="5" y1="8" x2="11" y2="8" stroke={color} strokeWidth="1.4"/></g>;
    case 'loadbalancer':
      return <g><path d="M8 3 v3 M4 12 h8 M8 6 L4 12 M8 6 L12 12" {...s}/><circle cx="8" cy="3" r="1.5" fill={color}/></g>;
    case 'service':
      return <g><circle cx="8" cy="8" r="2.5" {...s}/><path d="M8 1v2 M8 13v2 M1 8h2 M13 8h2 M3.1 3.1l1.4 1.4 M11.5 11.5l1.4 1.4 M3.1 12.9l1.4-1.4 M11.5 4.5l1.4-1.4" {...s}/></g>;
    case 'database':
      return <g><ellipse cx="8" cy="4.5" rx="5" ry="1.8" {...s}/><path d="M3 4.5v7 Q3 14 8 14 Q13 14 13 11.5v-7" {...s}/><path d="M3 8 Q3 10 8 10 Q13 10 13 8" {...s}/></g>;
    case 'cache':
      return <g><path d="M8 1.5 L11.5 6.5 H9.5 V9.5 H11.5 L8 14.5 L4.5 9.5 H6.5 V6.5 H4.5 Z" stroke={color} strokeWidth="1.4" fill={color} fillOpacity="0.25"/></g>;
    case 'queue':
      return <g><rect x="2" y="3.5" width="12" height="2.5" rx="1" fill={color} fillOpacity="0.8"/><rect x="2" y="7" width="12" height="2.5" rx="1" fill={color} fillOpacity="0.55"/><rect x="2" y="10.5" width="12" height="2.5" rx="1" fill={color} fillOpacity="0.3"/></g>;
    case 'external':
      return <g><circle cx="8" cy="8" r="6" {...s}/><line x1="2" y1="8" x2="14" y2="8" stroke={color} strokeWidth="1.2"/><path d="M8 2 Q11 8 8 14 Q5 8 8 2" {...s}/></g>;
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

function wrapLabel(label: string, maxW: number): string[] {
  // Support explicit line breaks from Mermaid
  if (label.includes('<br>') || label.includes('<br/>')) {
    return label.replace(/<br\s*\/?>/g, '\n').split('\n').map(l => l.trim()).slice(0, 4);
  }

  const approxChars = Math.floor(maxW / 6.8);
  if (label.length <= approxChars) return [label];
  const words = label.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length <= approxChars) cur = (cur + ' ' + w).trim();
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3); // Allow up to 3 lines
}

interface Props { graph: Graph; theme?: 'dark' | 'light'; }

export function DiagramCanvas({ graph, theme = 'dark' }: Props) {
  const isLight = theme === 'light';
  const NODE_STYLES = isLight ? NODE_STYLES_LIGHT : NODE_STYLES_DARK;
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<gsap.Context | null>(null);
  
  // Pan and Zoom state
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const { width, height } = getGraphDimensions(graph);

  // Center the graph initially
  useEffect(() => {
    if (containerRef.current) {
      const cw = containerRef.current.clientWidth;
      const ch = containerRef.current.clientHeight;
      // Calculate scale to fit with padding
      const scaleX = (cw - 100) / width;
      const scaleY = (ch - 100) / height;
      const initialScale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.3), 1.5); // Bound between 0.3x and 1.5x
      
      setScale(initialScale);
      setPan({
        x: (cw - width * initialScale) / 2,
        y: (ch - height * initialScale) / 2
      });
    }
  }, [width, height]);

  useEffect(() => {
    ctxRef.current?.revert();
    ctxRef.current = gsap.context(() => {
      graph.edges.forEach((edge, i) => {
        const pathEl = svgRef.current?.getElementById(`path-${edge.id}`);
        const pulseEl = svgRef.current?.getElementById(`pulse-${edge.id}`);
        if (!pathEl || !pulseEl) return;
        const duration = 1.5 + (i % 5) * 0.28;
        gsap.set(pulseEl, { opacity: 0 });
        gsap.to(pulseEl, { opacity: 1, duration: 0.3, delay: i * 0.1 });
        gsap.to(pulseEl, {
          duration: duration, repeat: -1, ease: 'none', delay: i * 0.1,
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

  // Mouse event handlers for panning
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    setIsDragging(true);
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => setIsDragging(false), []);

  // Wheel event handler for zooming
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      // Trackpad deltas are small, mouse wheel deltas are large (~100). Adjust sensitivity.
      const zoomSensitivity = Math.abs(e.deltaY) < 50 ? 0.005 : 0.0015;
      const delta = -e.deltaY * zoomSensitivity;
      
      setScale(prevScale => {
        const newScale = Math.min(Math.max(prevScale + delta, 0.05), 4);
        
        const rect = el.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        setPan(prevPan => ({
          x: mouseX - (mouseX - prevPan.x) * (newScale / prevScale),
          y: mouseY - (mouseY - prevPan.y) * (newScale / prevScale)
        }));
        return newScale;
      });
    };
    el.addEventListener('wheel', handleWheelNative, { passive: false });
    return () => el.removeEventListener('wheel', handleWheelNative);
  }, []);

  const handleZoomIn = () => setScale(s => Math.min(s * 1.2, 3));
  const handleZoomOut = () => setScale(s => Math.max(s / 1.2, 0.1));
  const handleZoomReset = () => {
    if (containerRef.current) {
      const cw = containerRef.current.clientWidth;
      const ch = containerRef.current.clientHeight;
      const scaleX = (cw - 100) / width;
      const scaleY = (ch - 100) / height;
      const initialScale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.3), 1.5);
      setScale(initialScale);
      setPan({ x: (cw - width * initialScale) / 2, y: (ch - height * initialScale) / 2 });
    }
  };

  return (
    <div 
      ref={containerRef}
      style={{ 
        width: '100%', 
        height: '100%', 
        position: 'relative', 
        overflow: 'hidden',
        cursor: isDragging ? 'grabbing' : 'grab'
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Zoom Controls */}
      <div style={{
        position: 'absolute',
        top: '1rem',
        right: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
        zIndex: 10,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '4px'
      }}>
        <button onClick={handleZoomIn} className="btn-icon" title="Zoom In">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
        <button onClick={handleZoomReset} className="btn-icon" title="Reset Zoom">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path><path d="M2 12h20"></path></svg>
        </button>
        <button onClick={handleZoomOut} className="btn-icon" title="Zoom Out">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
      </div>

      <div style={{
        transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
        transformOrigin: '0 0',
        width: `${width}px`,
        height: `${height}px`,
        willChange: 'transform'
      }}>
        <svg ref={svgRef} width={width} height={height} style={{ display: 'block' }} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="pg" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="3.5" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <marker id="arr" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0,8 3,0 6" fill={isLight ? "#94A3B8" : "#334155"}/>
            </marker>
            <marker id="arr-b" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0,8 3,0 6" fill={isLight ? "#6366F1" : "#6366F1"}/>
            </marker>
          </defs>

          {/* ── Groups (subgraph boxes) ── */}
          {(graph.groups ?? []).map((grp) => {
            // Use dagre's computed cluster dimensions (centered)
            if (!grp.width || !grp.height) return null;
            const gx = (grp.x ?? 0) - (grp.width / 2);
            const gy = (grp.y ?? 0) - (grp.height / 2);
            return (
              <g key={grp.id}>
                <rect x={gx} y={gy} width={grp.width} height={grp.height} rx="10"
                  fill={grp.color ?? (isLight ? 'rgba(241,245,249,0.5)' : 'rgba(100,116,139,0.08)')}
                  stroke={isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.12)"} strokeWidth="1" strokeDasharray="4 3"/>
                <text x={gx + 12} y={gy + 14} fill={isLight ? "rgba(71,85,105,0.7)" : "rgba(255,255,255,0.4)"}
                  fontSize="10" fontFamily="Inter, system-ui, sans-serif" fontWeight="600" letterSpacing="0.08em">
                  {grp.label}
                </text>
              </g>
            );
          })}

          {/* ── Edges ── */}
          {graph.edges.map((edge) => {
            const d = pointsToPath(edge.points ?? []);
            if (!d) return null;
            const src = graph.nodes.find((n) => n.id === edge.from);
            const dotColor = src ? NODE_STYLES[src.type].dot : '#00f2fe';
            const mid = (edge.points ?? [])[ Math.floor((edge.points ?? []).length / 2) ];
            return (
              <g key={edge.id}>
                <path id={`path-${edge.id}`} d={d} fill="none"
                  stroke={edge.isBackEdge ? (isLight ? '#6366F1' : '#4338CA') : (isLight ? '#CBD5E1' : '#1E293B')} strokeWidth="2"
                  strokeDasharray={edge.isBackEdge ? '5 4' : undefined}
                  markerEnd={edge.isBackEdge ? 'url(#arr-b)' : 'url(#arr)'}/>
                {edge.label && mid && (
                  <g>
                    <rect x={mid.x - 42} y={mid.y - 9} width={84} height={16} rx="3" fill={isLight ? '#FFFFFF' : '#090B10'} opacity={isLight ? "1" : "0.8"} stroke={isLight ? '#E2E8F0' : 'none'}/>
                    <text x={mid.x} y={mid.y} fill={edge.isBackEdge ? (isLight ? '#4F46E5' : '#818CF8') : (isLight ? '#475569' : '#475569')}
                      fontSize="9.5" textAnchor="middle" dominantBaseline="middle"
                      fontFamily="Inter, system-ui, sans-serif">{edge.label}</text>
                  </g>
                )}
                <circle id={`pulse-${edge.id}`} r="5" fill={dotColor} filter="url(#pg)" opacity="0"/>
              </g>
            );
          })}

          {/* ── Nodes ── */}
          {graph.nodes.map((node) => {
            if (node.x === undefined || node.y === undefined) return null;
            const st = NODE_STYLES[node.type] ?? NODE_STYLES.service;
            const w = node.width ?? 140, h = node.height ?? 52;
            const nx = node.x, ny = node.y;
            const rx = nx - w / 2, ry = ny - h / 2;
            const lines = wrapLabel(node.label, w - 36);
            const lineH = 14;
            const startY = h / 2 - ((lines.length - 1) * lineH) / 2;
            return (
              <g key={node.id} transform={`translate(${rx},${ry})`}>
                <g className="node-group" style={{ transformOrigin: `${w / 2}px ${h / 2}px` }}>
                  {/* Outer glow rect */}
                  <rect id={`glow-${node.id}`} x="-3" y="-3" width={w + 6} height={h + 6} rx="11" fill={st.border} opacity="0.07"/>
                  {/* Main box */}
                  <rect width={w} height={h} rx="8" fill={node.color || st.bg} stroke={node.color ? 'rgba(255,255,255,0.2)' : st.border} strokeWidth="1.5"/>
                  {/* Icon — 16×16 viewport at left margin */}
                  <g transform={`translate(8, ${h / 2 - 8})`}>
                    <svg width="16" height="16" viewBox="0 0 16 16" overflow="visible">
                      <NodeIcon type={node.type} color={st.dot}/>
                    </svg>
                  </g>
                  {/* Label */}
                  {lines.map((line, li) => (
                    <text key={li}
                      x={w / 2 + 10}
                      y={startY + li * lineH}
                      fill={isLight ? "#334155" : "#E2E8F0"} fontSize="11.5" fontWeight="500" textAnchor="middle"
                      dominantBaseline="middle" fontFamily="Inter, system-ui, sans-serif">
                      {line}
                    </text>
                  ))}
                </g>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import gsap from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import type { Graph, NodeType } from '../types';
import { getGraphDimensions } from '../parser/layoutEngine';
import { computeLevels } from '../lib/graphLevels';
import { labelAnchor } from '../lib/edgeLabel';

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
      return <g className="icon-bounce"><circle cx="8" cy="5.5" r="2.5" stroke={color} strokeWidth="1.4" fill="none"/><path d="M2 15 Q2 10 8 10 Q14 10 14 15" {...s}/></g>;
    case 'client':
      return <g className="icon-bounce"><rect x="2" y="4" width="12" height="8" rx="1.5" {...s}/><line x1="1" y1="12" x2="15" y2="12" stroke={color} strokeWidth="1.4"/><line x1="6" y1="12" x2="10" y2="14" stroke={color} strokeWidth="1.4"/></g>;
    case 'gateway':
      return <g className="icon-pulse"><path d="M8 1.5L14.5 8L8 14.5L1.5 8Z" {...s}/><line x1="8" y1="5" x2="8" y2="11" stroke={color} strokeWidth="1.4"/><line x1="5" y1="8" x2="11" y2="8" stroke={color} strokeWidth="1.4"/></g>;
    case 'loadbalancer':
      return <g className="icon-spin"><path d="M8 3 v3 M4 12 h8 M8 6 L4 12 M8 6 L12 12" {...s}/><circle cx="8" cy="3" r="1.5" fill={color}/></g>;
    case 'service':
      return <g className="icon-spin"><circle cx="8" cy="8" r="2.5" {...s}/><path d="M8 1v2 M8 13v2 M1 8h2 M13 8h2 M3.1 3.1l1.4 1.4 M11.5 11.5l1.4 1.4 M3.1 12.9l1.4-1.4 M11.5 4.5l1.4-1.4" {...s}/></g>;
    case 'database':
      return <g className="icon-pulse"><ellipse cx="8" cy="4.5" rx="5" ry="1.8" {...s}/><path d="M3 4.5v7 Q3 14 8 14 Q13 14 13 11.5v-7" {...s}/><path d="M3 8 Q3 10 8 10 Q13 10 13 8" {...s}/></g>;
    case 'cache':
      return <g className="icon-pulse"><path d="M8 1.5 L11.5 6.5 H9.5 V9.5 H11.5 L8 14.5 L4.5 9.5 H6.5 V6.5 H4.5 Z" stroke={color} strokeWidth="1.4" fill={color} fillOpacity="0.25"/></g>;
    case 'queue':
      return <g className="icon-pulse"><rect x="2" y="3.5" width="12" height="2.5" rx="1" fill={color} fillOpacity="0.8"/><rect x="2" y="7" width="12" height="2.5" rx="1" fill={color} fillOpacity="0.55"/><rect x="2" y="10.5" width="12" height="2.5" rx="1" fill={color} fillOpacity="0.3"/></g>;
    case 'external':
      return <g className="icon-spin"><circle cx="8" cy="8" r="6" {...s}/><line x1="2" y1="8" x2="14" y2="8" stroke={color} strokeWidth="1.2"/><path d="M8 2 Q11 8 8 14 Q5 8 8 2" {...s}/></g>;
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
    if (lower.startsWith('<b>')) {
      return <tspan key={i} fontWeight="bold">{part.slice(3, -4)}</tspan>;
    }
    if (lower.startsWith('<i>')) {
      return <tspan key={i} fontStyle="italic">{part.slice(3, -4)}</tspan>;
    }
    if (lower.startsWith('<br')) {
      return null; // breaks are handled by wrapLabel splitting
    }
    return part.replace(/<[^>]+>/g, '');
  });
}

function wrapLabel(label: string, maxW: number): string[] {
  let cleanLabel = stripEmojis(label);
  // Support explicit line breaks from Mermaid or literal \n
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
  return lines.slice(0, 5); // Allow up to 5 lines
}

interface Props { graph: Graph; theme?: 'dark' | 'light'; }

export function DiagramCanvas({ graph, theme = 'dark' }: Props) {
  const isLight = theme === 'light';
  const NODE_STYLES = isLight ? NODE_STYLES_LIGHT : NODE_STYLES_DARK;
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const transformContainerRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<gsap.Context | null>(null);
  
  // Pan and Zoom state stored in refs to avoid React renders on high-frequency wheel events
  const transform = useRef({ scale: 1, x: 0, y: 0 });
  
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const { width, height } = getGraphDimensions(graph);

  // Topological levels — pure function of the graph, computed during render
  // (NOT in an effect) so step badges are present on the very first paint.
  const nodeLevels = useMemo(() => computeLevels(graph), [graph]);

  // Apply transform to DOM
  const applyTransform = useCallback(() => {
    if (transformContainerRef.current) {
      transformContainerRef.current.style.transform = `translate(${transform.current.x}px, ${transform.current.y}px) scale(${transform.current.scale})`;
    }
  }, []);

  // Center the graph initially
  useEffect(() => {
    if (containerRef.current) {
      const cw = containerRef.current.clientWidth;
      const ch = containerRef.current.clientHeight;
      // Calculate scale to fit with padding
      const scaleX = (cw - 48) / width;
      const scaleY = (ch - 48) / height;
      const initialScale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.3), 2.6); // Bound between 0.3x and 2.6x
      
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
      // 1. Animate Subgraph Groups (levels come from the shared memo above)
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

      // 3. Animate Nodes
      graph.nodes.forEach((node) => {
        const level = nodeLevels.get(node.id) || 0;
        const nodeEl = svgRef.current?.getElementById(`node-group-${node.id}`);
        if (nodeEl) {
          gsap.fromTo(nodeEl, 
            { opacity: 0, scale: 0.8 }, 
            { opacity: 1, scale: 1, duration: 0.6, delay: level * 0.6, ease: 'back.out(1.5)', clearProps: 'transform' }
          );
        }
      });

      // 4. Animate Edges
      graph.edges.forEach((edge, i) => {
        const pathEl = svgRef.current?.getElementById(`path-${edge.id}`) as SVGPathElement | null;
        const pulseEl = svgRef.current?.getElementById(`pulse-${edge.id}`);
        if (!pathEl || !pulseEl) return;
        
        const srcLevel = nodeLevels.get(edge.from) || 0;
        const edgeDelay = srcLevel * 0.6 + 0.4; // Edge starts drawing just as node finishes popping
        
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

      // 5. Continuous Icon Animations (Migrated from CSS for SVG export compatibility)
      gsap.to('.icon-spin', { rotation: 360, duration: 4, repeat: -1, ease: 'none', transformOrigin: 'center' });
      gsap.to('.icon-pulse', { scale: 1.15, duration: 1.25, yoyo: true, repeat: -1, ease: 'power1.inOut', transformOrigin: 'center' });
      gsap.to('.icon-bounce', { y: -2, duration: 1, yoyo: true, repeat: -1, ease: 'power1.inOut' });
      gsap.to('.led-blink', { opacity: 0.2, duration: 0.8, yoyo: true, repeat: -1, ease: 'power1.inOut' });
      gsap.to('.rich-pulse', { scale: 1.25, opacity: 0.5, duration: 1.5, yoyo: true, repeat: -1, ease: 'power1.inOut', transformOrigin: 'center' });
      gsap.to('.data-flow', { strokeDashoffset: -20, strokeDasharray: "4 4", duration: 1, repeat: -1, ease: 'none' });
      gsap.to('.scan-line', { y: 6, duration: 2, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      gsap.to('.robot-body-dance', { y: -1, duration: 0.5, yoyo: true, repeat: -1, ease: 'power1.inOut' });
      gsap.to('.robot-arm-l', { rotation: 15, duration: 0.5, yoyo: true, repeat: -1, ease: 'power1.inOut', transformOrigin: 'top center' });
      gsap.to('.robot-arm-r', { rotation: -15, duration: 0.5, yoyo: true, repeat: -1, ease: 'power1.inOut', transformOrigin: 'top center' });

    }, svgRef);
    return () => ctxRef.current?.revert();
  }, [graph, nodeLevels]);

  // Mouse event handlers for panning
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
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

  // Wheel event handler for zooming
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let ticking = false;

    const handleWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      
      if (!ticking) {
        window.requestAnimationFrame(() => {
          // Trackpad deltas are small, mouse wheel deltas are large (~100). Adjust sensitivity.
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
      const scaleX = (cw - 48) / width;
      const scaleY = (ch - 48) / height;
      const initialScale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.3), 2.6);
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

      <div 
        ref={transformContainerRef}
        style={{
        transformOrigin: '0 0',
        width: `${width}px`,
        height: `${height}px`,
        willChange: 'transform'
      }}>
        <svg id="pulsegraph-svg" ref={svgRef} width={width} height={height} style={{ display: 'block' }} xmlns="http://www.w3.org/2000/svg">
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
            {graph.aiAnimations?.cssKeyframes && (
              <style dangerouslySetInnerHTML={{ __html: graph.aiAnimations.cssKeyframes }} />
            )}
          </defs>

          {/* ── Groups (subgraph boxes) ── */}
          {(graph.groups ?? []).map((grp) => {
            // Use dagre's computed cluster dimensions (centered)
            if (!grp.width || !grp.height) return null;
            const gx = (grp.x ?? 0) - (grp.width / 2);
            const gy = (grp.y ?? 0) - (grp.height / 2);
            return (
              <g key={grp.id} id={`group-${grp.id}`}>
                <rect x={gx} y={gy} width={grp.width} height={grp.height} rx="10"
                  fill={grp.color ?? (isLight ? 'rgba(241,245,249,0.5)' : 'rgba(100,116,139,0.08)')}
                  stroke={isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.12)"} strokeWidth="1" strokeDasharray="4 3"/>
                <text x={gx + 12} y={gy + 14} fill={isLight ? "rgba(71,85,105,0.7)" : "rgba(255,255,255,0.4)"}
                  fontSize="10" fontFamily="Inter, system-ui, sans-serif" fontWeight="600" letterSpacing="0.08em">
                  {parseLabel(grp.label)}
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
            // Anchor labels near the SOURCE on routed arcs (see lib/edgeLabel).
            const mid = labelAnchor(edge.points);
            const labelW = edge.label ? Math.min(140, Math.max(34, edge.label.length * 5.8 + 14)) : 0;
            return (
              <g key={edge.id}>
                <path id={`path-${edge.id}`} d={d} fill="none"
                  stroke={edge.isBackEdge ? (isLight ? '#6366F1' : '#4338CA') : (isLight ? '#CBD5E1' : '#1E293B')} strokeWidth="2"
                  strokeDasharray={edge.isBackEdge ? '5 4' : undefined}
                  markerEnd={edge.isBackEdge ? 'url(#arr-b)' : 'url(#arr)'}/>
                {edge.label && mid && (
                  <g>
                    <rect x={mid.x - labelW / 2} y={mid.y - 9} width={labelW} height={16} rx="3" fill={isLight ? '#FFFFFF' : '#090B10'} opacity={isLight ? "1" : "0.8"} stroke={isLight ? '#E2E8F0' : 'none'}/>
                    <text x={mid.x} y={mid.y} fill={edge.isBackEdge ? (isLight ? '#4F46E5' : '#818CF8') : (isLight ? '#475569' : '#475569')}
                      fontSize="9.5" textAnchor="middle" dominantBaseline="middle"
                      fontFamily="Inter, system-ui, sans-serif">{parseLabel(edge.label)}</text>
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
            const aiClass = graph.aiAnimations?.nodeClasses?.[node.id] || '';
            
            // Deterministically computed levels for badges (1-indexed)
            const stepNumber = nodeLevels.has(node.id) ? nodeLevels.get(node.id)! + 1 : null;

            return (
              <g key={node.id} transform={`translate(${rx},${ry})`}>
                <g id={`node-group-${node.id}`} className={`node-group ${aiClass}`} style={{ transformOrigin: `${w / 2}px ${h / 2}px` }}>
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
                      {parseLabel(line)}
                    </text>
                  ))}
                  
                  {/* Step Badge */}
                  {stepNumber !== null && (
                    <g transform={`translate(${w - 6}, -6)`}>
                      <circle cx="0" cy="0" r="9" fill="#FDE047" stroke="#CA8A04" strokeWidth="1.5" filter="url(#pg)" />
                      <text x="0" y="1" fill="#000" fontSize="10" fontWeight="800" textAnchor="middle" dominantBaseline="middle" fontFamily="Inter, system-ui, sans-serif">
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

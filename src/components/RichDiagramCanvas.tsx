import { useEffect, useRef, useState, useCallback } from 'react';
import gsap from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import type { Graph, NodeType } from '../types';
import { getGraphDimensions } from '../parser/layoutEngine';

gsap.registerPlugin(MotionPathPlugin);

const NODE_STYLES_RICH: Record<NodeType, { bg: string; border: string; dot: string; glow: string }> = {
  user:         { bg: 'rgba(18, 9, 58, 0.7)', border: '#8B5CF6', dot: '#A78BFA', glow: 'rgba(139, 92, 246, 0.4)' },
  client:       { bg: 'rgba(7, 20, 40, 0.7)', border: '#3B82F6', dot: '#60A5FA', glow: 'rgba(59, 130, 246, 0.4)' },
  gateway:      { bg: 'rgba(5, 28, 40, 0.7)', border: '#06B6D4', dot: '#22D3EE', glow: 'rgba(6, 182, 212, 0.4)' },
  loadbalancer: { bg: 'rgba(5, 28, 40, 0.7)', border: '#06B6D4', dot: '#22D3EE', glow: 'rgba(6, 182, 212, 0.4)' },
  service:      { bg: 'rgba(4, 26, 14, 0.7)', border: '#10B981', dot: '#34D399', glow: 'rgba(16, 185, 129, 0.4)' },
  database:     { bg: 'rgba(26, 20, 0, 0.7)', border: '#F59E0B', dot: '#FCD34D', glow: 'rgba(245, 158, 11, 0.4)' },
  cache:        { bg: 'rgba(28, 14, 0, 0.7)', border: '#F97316', dot: '#FB923C', glow: 'rgba(249, 115, 22, 0.4)' },
  queue:        { bg: 'rgba(28, 0, 40, 0.7)', border: '#EC4899', dot: '#F472B6', glow: 'rgba(236, 72, 153, 0.4)' },
  external:     { bg: 'rgba(17, 17, 17, 0.7)', border: '#6B7280', dot: '#9CA3AF', glow: 'rgba(107, 114, 128, 0.4)' },
};

function RichNodeIcon({ type, label }: { type: NodeType, label?: string }) {
  const isRobot = label && (label.toLowerCase().includes('agent') || label.toLowerCase().includes('bot') || label.toLowerCase().includes('ai'));
  
  if (isRobot) {
    return (
      <g transform="translate(0,2) scale(1.1)">
        {/* Head */}
        <rect x="6" y="2" width="12" height="8" rx="2" fill="#3B82F6" stroke="#93C5FD" strokeWidth="1.5"/>
        <circle cx="9" cy="5" r="1.5" fill="#FFF" className="led-blink"/>
        <circle cx="15" cy="5" r="1.5" fill="#FFF" className="led-blink" style={{ animationDelay: '0.5s' }}/>
        <line x1="12" y1="2" x2="12" y2="-1" stroke="#93C5FD" strokeWidth="1.5"/>
        <circle cx="12" cy="-2" r="1.5" fill="#F87171" className="rich-pulse"/>
        {/* Body */}
        <rect x="5" y="11" width="14" height="11" rx="3" fill="#1E3A8A" stroke="#60A5FA" strokeWidth="1.5" className="robot-body-dance"/>
        {/* Arms */}
        <rect x="1" y="12" width="3" height="8" rx="1.5" fill="#60A5FA" className="robot-arm-l"/>
        <rect x="20" y="12" width="3" height="8" rx="1.5" fill="#60A5FA" className="robot-arm-r"/>
      </g>
    );
  }

  switch (type) {
    case 'database':
      return (
        <g transform="translate(2,4) scale(1.1)">
          <path d="M0,16 C0,20 24,20 24,16 L24,4 C24,8 0,8 0,4 Z" fill="#451A03" stroke="#F59E0B" strokeWidth="1.5" />
          <ellipse cx="12" cy="4" rx="12" ry="4" fill="#78350F" stroke="#FCD34D" strokeWidth="1.5"/>
          <ellipse cx="12" cy="10" rx="12" ry="4" fill="none" stroke="#F59E0B" strokeWidth="1" strokeDasharray="2 2"/>
          <ellipse cx="12" cy="16" rx="12" ry="4" fill="none" stroke="#F59E0B" strokeWidth="1" strokeDasharray="2 2"/>
          <line x1="0" y1="10" x2="24" y2="10" stroke="#FCD34D" strokeWidth="1.5" className="scan-line" />
        </g>
      );
    case 'service':
      return (
        <g transform="translate(4,2) scale(1.1)">
          <rect x="0" y="0" width="20" height="24" rx="2" fill="#064E3B" stroke="#10B981" strokeWidth="1.5"/>
          <rect x="2" y="2" width="16" height="4" rx="1" fill="#022C22"/>
          <rect x="2" y="10" width="16" height="4" rx="1" fill="#022C22"/>
          <rect x="2" y="18" width="16" height="4" rx="1" fill="#022C22"/>
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
          <polygon points="12,0 24,12 12,24 0,12" fill="#164E63" stroke="#22D3EE" strokeWidth="2"/>
          <circle cx="12" cy="12" r="4" fill="#00F2FE" className="rich-pulse"/>
          <path d="M6,12 L18,12 M12,6 L12,18" stroke="#FFFFFF" strokeWidth="1.5"/>
        </g>
      );
    case 'client':
    case 'user':
      return (
        <g transform="translate(1,6) scale(1.1)">
          <rect x="0" y="0" width="24" height="16" rx="2" fill="#1E3A8A" stroke="#60A5FA" strokeWidth="1.5"/>
          <polygon points="-2,16 26,16 28,18 -4,18" fill="#3B82F6"/>
          <rect x="2" y="2" width="20" height="12" fill="#172554"/>
          <text x="12" y="10" fill="#93C5FD" fontSize="8" textAnchor="middle" className="led-blink">&gt;_</text>
        </g>
      );
    case 'queue':
      return (
        <g transform="translate(3,6) scale(1.1)">
          <rect x="0" y="0" width="20" height="6" rx="1" fill="#831843" stroke="#F472B6" strokeWidth="1"/>
          <rect x="0" y="8" width="20" height="6" rx="1" fill="#BE185D" stroke="#F472B6" strokeWidth="1"/>
          <rect x="0" y="16" width="20" height="6" rx="1" fill="#9D174D" stroke="#F472B6" strokeWidth="1"/>
          <circle cx="16" cy="3" r="1.5" className="led-blink"/>
          <circle cx="16" cy="11" r="1.5" className="led-blink" style={{animationDelay: '0.4s'}}/>
          <circle cx="16" cy="19" r="1.5" className="led-blink" style={{animationDelay: '0.8s'}}/>
        </g>
      );
    case 'cache':
      return (
        <g transform="translate(2,4) scale(1.1)">
          <path d="M12,0 L24,6 L12,12 L0,6 Z" fill="#9A3412" stroke="#FB923C" strokeWidth="1.5"/>
          <path d="M0,6 L12,12 L12,24 L0,18 Z" fill="#7C2D12" stroke="#FB923C" strokeWidth="1.5"/>
          <path d="M24,6 L12,12 L12,24 L24,18 Z" fill="#C2410C" stroke="#FB923C" strokeWidth="1.5"/>
          <circle cx="12" cy="6" r="2" fill="#FDBA74" className="rich-pulse"/>
        </g>
      );
    default:
      return (
        <g transform="translate(2,2) scale(1.1)">
          <circle cx="12" cy="12" r="10" fill="#374151" stroke="#9CA3AF" strokeWidth="2"/>
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
  const cleanLabel = stripEmojis(label);
  if (cleanLabel.includes('<br>') || cleanLabel.includes('<br/>')) {
    return cleanLabel.replace(/<br\s*\/?>/g, '\n').split('\n').map(l => l.trim()).slice(0, 5);
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

interface Props { graph: Graph; theme?: 'dark' | 'light'; }

export function RichDiagramCanvas({ graph }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const transformContainerRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<gsap.Context | null>(null);
  
  const transform = useRef({ scale: 1, x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const { width, height } = getGraphDimensions(graph);

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
      if (graph.animationSteps && graph.animationSteps.length > 0) {
        graph.animationSteps.forEach((stepNodes, level) => {
          stepNodes.forEach(nodeId => {
            const cleanId = nodeId.split(/[[({]/)[0].trim();
            if (!nodeLevels.has(cleanId)) nodeLevels.set(cleanId, level);
          });
        });
      }

      const maxLevel = Math.max(-1, ...Array.from(nodeLevels.values()));
      graph.nodes.forEach((node, i) => {
        if (!nodeLevels.has(node.id)) {
          const fallback = (graph.animationSteps?.length) ? maxLevel + 1 : i;
          nodeLevels.set(node.id, fallback);
        }
      });

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
            {graph.aiAnimations?.cssKeyframes && (
              <style dangerouslySetInnerHTML={{ __html: graph.aiAnimations.cssKeyframes }} />
            )}
          </defs>

          {/* Groups */}
          {(graph.groups ?? []).map((grp) => {
            if (!grp.width || !grp.height) return null;
            const gx = (grp.x ?? 0) - (grp.width / 2);
            const gy = (grp.y ?? 0) - (grp.height / 2);
            return (
              <g key={grp.id} id={`group-${grp.id}`}>
                <rect x={gx} y={gy} width={grp.width} height={grp.height} rx="14"
                  fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.1)" strokeWidth="1" strokeDasharray="6 4"/>
                <text x={gx + 16} y={gy + 20} fill="rgba(255,255,255,0.6)"
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
            const src = graph.nodes.find((n) => n.id === edge.from);
            const dotColor = src ? NODE_STYLES_RICH[src.type].dot : '#00f2fe';
            const mid = (edge.points ?? [])[ Math.floor((edge.points ?? []).length / 2) ];
            return (
              <g key={edge.id}>
                <path id={`path-${edge.id}`} d={d} fill="none"
                  stroke="#334155" strokeWidth="2.5" markerEnd="url(#arr-rich)"/>
                {edge.label && mid && (
                  <g>
                    <rect x={mid.x - 45} y={mid.y - 12} width={90} height={24} rx="6" fill="#0F172A" opacity="0.9" stroke="#1E293B" strokeWidth="1.5"/>
                    <text x={mid.x} y={mid.y} fill="#94A3B8"
                      fontSize="10" textAnchor="middle" dominantBaseline="middle"
                      fontFamily="Inter, system-ui, sans-serif" fontWeight="500">{parseLabel(edge.label)}</text>
                  </g>
                )}
                <circle id={`pulse-${edge.id}`} r="6" fill={dotColor} filter="url(#pg-rich)" opacity="0"/>
              </g>
            );
          })}

          {/* Nodes */}
          {graph.nodes.map((node) => {
            if (node.x === undefined || node.y === undefined) return null;
            const st = NODE_STYLES_RICH[node.type] ?? NODE_STYLES_RICH.service;
            const w = node.width ?? 160, h = node.height ?? 60;
            const nx = node.x, ny = node.y;
            const rx = nx - w / 2, ry = ny - h / 2;
            const lines = wrapLabel(node.label, w - 40);
            const lineH = 15;
            const startY = h / 2 - ((lines.length - 1) * lineH) / 2;
            const aiClass = graph.aiAnimations?.nodeClasses?.[node.id] || '';
            return (
              <g key={node.id} transform={`translate(${rx},${ry})`}>
                <g id={`node-group-${node.id}`} className={`node-group ${aiClass}`} style={{ transformOrigin: `${w / 2}px ${h / 2}px` }}>
                  {/* Glow */}
                  <rect id={`glow-${node.id}`} x="-6" y="-6" width={w + 12} height={h + 12} rx="16" fill={st.glow} filter="url(#pg-rich)" opacity="0.15"/>
                  
                  {/* Glassmorphism background */}
                  <rect width={w} height={h} rx="12" fill={node.color || st.bg} stroke={node.color ? 'rgba(255,255,255,0.4)' : st.border} strokeWidth="1.5" filter="url(#glass)"/>
                  <rect width={w} height={h} rx="12" fill="url(#gradient-overlay)" opacity="0.1" pointerEvents="none"/>

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
                      fill="#F8FAFC" fontSize="12" fontWeight="600" textAnchor="middle"
                      dominantBaseline="middle" fontFamily="Inter, system-ui, sans-serif">
                      {parseLabel(line)}
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

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';

gsap.registerPlugin(MotionPathPlugin);

export const ArchitectureDiagram = () => {
  const containerRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const pulses = gsap.utils.toArray('.flow-pulse');
      
      pulses.forEach((pulse: any) => {
        const pathId = pulse.getAttribute('data-path');
        const duration = 2.5 + Math.random(); // Add slight variance for organic feel
        
        // Start pulse at 0 scale and scale up, then scale down at the end
        gsap.to(pulse, {
          duration: duration,
          repeat: -1,
          ease: "none",
          motionPath: {
            path: pathId,
            align: pathId,
            alignOrigin: [0.5, 0.5],
            autoRotate: true,
          }
        });

        // Add a pulsing opacity effect
        gsap.to(pulse, {
          opacity: 0.4,
          duration: 0.5,
          yoyo: true,
          repeat: -1,
          ease: "sine.inOut"
        });
      });
    }, containerRef);
    
    return () => ctx.revert();
  }, []);

  const nodes = [
    { id: 'client', label: 'Client', x: 80, y: 250, type: 'source' },
    { id: 'gateway', label: 'API Gateway', x: 280, y: 250, type: 'proxy' },
    { id: 'auth', label: 'Auth Service', x: 530, y: 100, type: 'service' },
    { id: 'api', label: 'Core API', x: 530, y: 250, type: 'service' },
    { id: 'worker', label: 'Worker', x: 530, y: 400, type: 'service' },
    { id: 'db', label: 'Primary DB', x: 780, y: 250, type: 'database' },
    { id: 'cache', label: 'Redis Cache', x: 780, y: 100, type: 'database' },
  ];

  const paths = [
    { id: 'p1', d: "M 130 250 L 230 250" }, 
    { id: 'p2', d: "M 330 250 C 430 250 430 100 480 100" }, 
    { id: 'p3', d: "M 330 250 L 480 250" }, 
    { id: 'p4', d: "M 330 250 C 430 250 430 400 480 400" }, 
    { id: 'p5', d: "M 580 100 L 730 100" }, 
    { id: 'p6', d: "M 580 250 L 730 250" }, 
    { id: 'p7', d: "M 580 250 C 680 250 680 100 730 100" }, 
    { id: 'p8', d: "M 580 400 C 680 400 680 250 730 250" }, 
  ];

  const getNodeColor = (type: string) => {
    switch(type) {
      case 'source': return '#8B5CF6'; // Purple
      case 'proxy': return '#3B82F6'; // Blue
      case 'service': return '#10B981'; // Green
      case 'database': return '#F59E0B'; // Orange
      default: return '#38BDF8';
    }
  };

  return (
    <svg 
      ref={containerRef}
      width="860" 
      height="500" 
      viewBox="0 0 860 500" 
      style={{ overflow: 'visible' }}
    >
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        <filter id="nodeGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="15" result="blur"/>
          <feComponentTransfer in="blur" result="glow">
            <feFuncA type="linear" slope="0.3"/>
          </feComponentTransfer>
          <feMerge>
            <feMergeNode in="glow"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      {/* Draw Paths */}
      {paths.map(p => (
        <path 
          key={p.id}
          id={p.id}
          d={p.d}
          fill="none"
          stroke="#1E293B"
          strokeWidth="3"
        />
      ))}

      {/* Draw Flow Lines (Dashed Overlay) */}
      {paths.map(p => (
        <path 
          key={`dashed-${p.id}`}
          d={p.d}
          fill="none"
          stroke="#334155"
          strokeWidth="1"
          strokeDasharray="4 4"
        />
      ))}

      {/* Draw Pulses */}
      {paths.map(p => (
        <circle 
          key={`pulse-${p.id}`}
          className="flow-pulse"
          data-path={`#${p.id}`}
          r="4"
          fill="#00f2fe"
          filter="url(#glow)"
        />
      ))}
      
      {/* Draw Nodes */}
      {nodes.map(n => {
        const color = getNodeColor(n.type);
        return (
          <g key={n.id} transform={`translate(${n.x}, ${n.y})`}>
            {/* Background Glow */}
            <rect 
              x="-50" y="-25" 
              width="100" height="50" 
              rx="8" 
              fill={color}
              filter="url(#nodeGlow)"
              opacity="0.2"
            />
            {/* Main Box */}
            <rect 
              x="-50" y="-25" 
              width="100" height="50" 
              rx="8" 
              fill="#0F172A" 
              stroke={color} 
              strokeWidth="2"
            />
            <text 
              x="0" y="2" 
              fill="#F8FAFC" 
              fontSize="13" 
              fontWeight="500"
              textAnchor="middle"
              alignmentBaseline="middle"
            >
              {n.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

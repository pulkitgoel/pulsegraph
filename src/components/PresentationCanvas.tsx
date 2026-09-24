import { useEffect, useMemo, useRef } from 'react';
import gsap from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import type { Graph } from '../types';
import { presentationGroupMembers, type PresentationPlan } from '../lib/presentationPlan';
import { presentationLayout } from '../lib/presentationLayout';
import { presentationLabel } from '../lib/presentationLabel';
import { pointsToPath } from '../lib/svgPath';
import {
  pulseRepeatDelay,
  pulseTravelDuration,
  pulseTravelWindow,
} from '../lib/pulseTravel';
import { RichNodeIcon } from './RichDiagramCanvas';
import './PresentationCanvas.css';

gsap.registerPlugin(MotionPathPlugin);

export function PresentationCanvas({
  graph,
  plan,
  theme,
  reducedMotion,
  onPrevious,
  aiPlanned,
  onCompose,
  busy,
}: {
  graph: Graph;
  plan: PresentationPlan;
  theme: 'dark' | 'light';
  reducedMotion: boolean;
  onPrevious: () => void;
  aiPlanned: boolean;
  onCompose: () => void;
  busy: boolean;
}) {
  const result = useMemo(() => {
    try {
      return { scene: presentationLayout(graph, plan), error: '' };
    } catch (error) {
      return {
        scene: null,
        error: error instanceof Error ? error.message : 'Slide layout unavailable.',
      };
    }
  }, [graph, plan]);
  const { scene } = result;
  const root = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const svg = root.current;
    if (!scene || reducedMotion || !svg) return;
    let active = true;
    const context = gsap.context((ctx) => {
      for (const edge of scene.graph.edges) {
        const path = svg.getElementById(`path-${edge.id}`) as SVGPathElement | null;
        const pulse = svg.getElementById(`pulse-${edge.id}`);
        if (!path || !pulse) continue;
        const length = path.getTotalLength(),
          window = pulseTravelWindow(length);
        gsap.set(pulse, { opacity: 1 });
        gsap.timeline({ repeat: -1, repeatDelay: pulseRepeatDelay(length) }).to(pulse, {
          duration: pulseTravelDuration(length),
          ease: 'none',
          motionPath: {
            path,
            align: path,
            alignOrigin: [0.5, 0.5],
            start: window.start,
            end: window.end,
          },
          onComplete: () =>
            active &&
            ctx.add(() => {
              const glow = svg.getElementById(`glow-${edge.to}`);
              if (glow)
                gsap.fromTo(
                  glow,
                  { opacity: 0.4 },
                  { opacity: 0, duration: 0.4, ease: 'power2.out', overwrite: 'auto' },
                );
            }),
        });
      }
    }, svg);
    return () => {
      active = false;
      context.revert();
    };
  }, [scene, reducedMotion]);
  const dark = theme === 'dark';
  const background = dark ? '#0d131d' : '#f8fafc';
  const ink = dark ? '#edf4ff' : '#17263d';
  const muted = dark ? '#9baec4' : '#52657c';
  const blue = dark ? '#78b6ff' : '#2563b5';
  const green = dark ? '#6dc9a8' : '#16775a';
  const red = dark ? '#ed94a5' : '#b9435b';
  const mainEdges = new Set(
    plan.mainPath.slice(1).map((id, i) => `${plan.mainPath[i]}:${id}`),
  );
  const color = (edge: Graph['edges'][number]) =>
    edge.isBackEdge || /retry|blocked|reject|fail/i.test(edge.label ?? '')
      ? red
      : mainEdges.has(`${edge.from}:${edge.to}`)
        ? blue
        : green;
  return (
    <section className="presentation-preview" aria-label="Architecture slide preview">
      <div className="presentation-preview-toolbar">
        <span>
          <strong>Architecture preview</strong> · 16:9 ·{' '}
          {aiPlanned ? 'AI-composed' : 'Local composition'}
        </span>
        <div className="presentation-preview-actions">
          <button className="btn-icon" disabled={busy} onClick={onCompose}>
            {aiPlanned ? 'Recompose with AI' : 'Compose with AI'}
          </button>
          <button className="btn-icon" disabled={busy} onClick={onPrevious}>
            Previous layout
          </button>
        </div>
      </div>
      {result.error && <p role="alert">{result.error}</p>}
      {scene && (
        <>
          {scene.warnings.length > 0 && (
            <details className="presentation-preview-warning">
              <summary>Layout review: {scene.warnings.length} item(s)</summary>
              {scene.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </details>
          )}
          <div className="presentation-slide-stage">
            <svg
              ref={root}
              id="pulsegraph-svg"
              data-visual-style="presentation"
              width={scene.width}
              height={scene.height}
              viewBox={`0 0 ${scene.width} ${scene.height}`}
              role="img"
              aria-label={plan.title}
              xmlns="http://www.w3.org/2000/svg"
              fontFamily="Inter, Segoe UI, Arial, sans-serif"
            >
              <title>{plan.title}</title>
              <g fontFamily="Inter, Segoe UI, Arial, sans-serif">
                <rect width={scene.width} height={scene.height} fill={background} />
                <text
                  x="64"
                  y="58"
                  fill={ink}
                  fontSize={Math.min(
                    30,
                    (scene.width - 500) / (plan.title.length * 0.65),
                  )}
                  fontWeight="700"
                >
                  {plan.title}
                </text>
                <text x="64" y="88" fill={muted} fontSize="15">
                  Follow the blue journey · Supporting connections in green · Returns and
                  exceptions in rose
                </text>
                <text
                  x={scene.width - 64}
                  y="58"
                  textAnchor="end"
                  fill={muted}
                  fontSize="13"
                  letterSpacing="2"
                >
                  PULSEGRAPH / PRESENTATION
                </text>
                <defs>
                  {[blue, green, red].map((stroke, index) => (
                    <marker
                      key={stroke}
                      id={`slide-arrow-${index}`}
                      viewBox="0 0 10 10"
                      refX="9"
                      refY="5"
                      markerWidth="8"
                      markerHeight="8"
                      orient="auto-start-reverse"
                      markerUnits="userSpaceOnUse"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill={stroke} />
                    </marker>
                  ))}
                  <marker
                    id="slide-cross"
                    viewBox="0 0 10 10"
                    refX="5"
                    refY="5"
                    markerWidth="10"
                    markerHeight="10"
                    orient="auto"
                  >
                    <path
                      d="M2 2L8 8M2 8L8 2"
                      fill="none"
                      stroke={muted}
                      strokeWidth="2"
                    />
                  </marker>
                  <marker
                    id="slide-circle"
                    viewBox="0 0 10 10"
                    refX="5"
                    refY="5"
                    markerWidth="10"
                    markerHeight="10"
                  >
                    <circle
                      cx="5"
                      cy="5"
                      r="3"
                      fill={background}
                      stroke={muted}
                      strokeWidth="2"
                    />
                  </marker>
                </defs>
                {scene.lanes.map((lane, index) => (
                  <g key={index} data-slide-lane={lane.kind}>
                    <rect
                      x={lane.x}
                      y={lane.y}
                      width={lane.width}
                      height={lane.height}
                      rx="14"
                      fill={dark ? '#152332' : '#edf3f9'}
                      fillOpacity={lane.kind === 'journey' ? 0.8 : 0.45}
                      stroke={lane.kind === 'journey' ? blue : green}
                      strokeOpacity="0.3"
                    />
                    <text
                      x={lane.x + 18}
                      y={lane.y + 24}
                      fill={lane.kind === 'journey' ? blue : green}
                      fontSize="13"
                      fontWeight="700"
                      letterSpacing="1"
                    >
                      {lane.title.toUpperCase()}
                    </text>
                  </g>
                ))}
                {(graph.groups ?? []).map((group) => {
                  const memberIds = presentationGroupMembers(graph, group.id);
                  const members = scene.graph.nodes.filter((node) =>
                    memberIds.includes(node.id),
                  );
                  if (!members.length) return null;
                  const left =
                    Math.min(...members.map((node) => node.x! - node.width / 2)) - 8;
                  const top =
                    Math.min(...members.map((node) => node.y! - node.height / 2)) - 4;
                  const right =
                    Math.max(...members.map((node) => node.x! + node.width / 2)) + 8;
                  const bottom =
                    Math.max(...members.map((node) => node.y! + node.height / 2)) + 4;
                  return (
                    <g
                      key={group.id}
                      id={`group-${group.id}`}
                      data-source-group={group.id}
                    >
                      <title>{group.label}</title>
                      <rect
                        x={left}
                        y={top}
                        width={right - left}
                        height={bottom - top}
                        rx="10"
                        fill="none"
                        stroke={blue}
                        strokeOpacity="0.22"
                        strokeDasharray="4 5"
                      />
                    </g>
                  );
                })}
                <g data-slide-edges="true">
                  {scene.graph.edges.map((edge) => {
                    const stroke = color(edge);
                    const marker =
                      edge.arrow === 'none'
                        ? undefined
                        : edge.arrow === 'cross'
                          ? 'url(#slide-cross)'
                          : edge.arrow === 'circle'
                            ? 'url(#slide-circle)'
                            : `url(#slide-arrow-${[blue, green, red].indexOf(stroke)})`;
                    return (
                      <g key={edge.id}>
                        <path
                          id={`path-${edge.id}`}
                          d={pointsToPath(edge.points!)}
                          fill="none"
                          stroke={stroke}
                          strokeWidth={edge.thick ? 3 : 1.8}
                          strokeOpacity="0.75"
                          markerEnd={marker}
                          data-dashed={edge.dashed || undefined}
                          strokeDasharray={edge.dashed ? '6 5' : undefined}
                          strokeLinejoin="round"
                        />
                        <circle id={`pulse-${edge.id}`} r="4" fill={stroke} opacity="0" />
                      </g>
                    );
                  })}
                </g>
                {scene.graph.nodes.map((node) => {
                  const text = presentationLabel(node.label);
                  return (
                    <g
                      key={node.id}
                      transform={`translate(${node.x! - node.width / 2},${node.y! - node.height / 2})`}
                    >
                      <g id={`node-group-${node.id}`} className="node-group">
                        <title>{node.label.replace(/<br\s*\/?\s*>/gi, ' ')}</title>
                        <rect
                          data-node-body="true"
                          width={node.width}
                          height={node.height}
                          fill="none"
                        />
                        <rect
                          id={`glow-${node.id}`}
                          x="36"
                          y="10"
                          width="84"
                          height="72"
                          rx="18"
                          fill={blue}
                          opacity="0"
                        />
                        <g transform="translate(47,16) scale(2.15)">
                          <RichNodeIcon type={node.type} label={node.label} />
                        </g>
                        {text.lines.map((line, index) => (
                          <text
                            key={index}
                            x={node.width / 2}
                            y={text.firstBaseline + index * text.lineHeight}
                            textAnchor="middle"
                            fill={index ? muted : ink}
                            fontSize={text.fontSize}
                            fontWeight={index ? 450 : 650}
                          >
                            {line}
                          </text>
                        ))}
                      </g>
                    </g>
                  );
                })}
                <g data-slide-labels="true">
                  {scene.graph.edges
                    .filter((edge) => edge.label)
                    .map((edge) => {
                      const point = scene.labels[edge.id],
                        width = Math.max(36, edge.label!.length * 7.6 + 20);
                      return (
                        <g
                          key={edge.id}
                          data-edge-label="true"
                          transform={`translate(${point.x},${point.y})`}
                        >
                          <rect
                            x={-width / 2}
                            y="-13"
                            width={width}
                            height="26"
                            rx="5"
                            fill={background}
                            stroke={color(edge)}
                            strokeOpacity="0.28"
                          />
                          <text
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize="13"
                            fontWeight="550"
                            fill={ink}
                          >
                            {edge.label}
                          </text>
                        </g>
                      );
                    })}
                </g>
                <line
                  x1="64"
                  x2={scene.width - 64}
                  y1={scene.height - 60}
                  y2={scene.height - 60}
                  stroke={muted}
                  strokeOpacity="0.2"
                />
                <text x="64" y={scene.height - 34} fill={muted} fontSize="13">
                  {graph.nodes.length} components · {graph.edges.length} original
                  connections · Flow overview, not an execution trace
                </text>
                <text
                  x={scene.width - 64}
                  y={scene.height - 34}
                  fill={muted}
                  fontSize="13"
                  textAnchor="end"
                >
                  SOURCE PRESERVED
                </text>
              </g>
            </svg>
          </div>
        </>
      )}
    </section>
  );
}

import { useState } from 'react';
import './LandingPage.css';

interface Example {
  name: string;
  source: string;
}

interface LandingPageProps {
  input: string;
  busy: boolean;
  examples: readonly Example[];
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onExample: (source: string) => void;
  onSettings: () => void;
}

const EXAMPLE_DETAILS = [
  { symbol: '01', description: 'Connect services, data, and the people using them.' },
  { symbol: '02', description: 'Make decisions and feedback loops easy to follow.' },
  { symbol: '03', description: 'Trace an idea from its first commit to production.' },
];

function FlowPreview() {
  const [paused, setPaused] = useState(false);

  return (
    <div className={'flow-preview' + (paused ? ' is-paused' : '')}>
      <div className="preview-toolbar">
        <span>
          <span className="status-dot" /> A request, brought to life
        </span>
        <button type="button" onClick={() => setPaused(!paused)} aria-pressed={paused}>
          {paused ? 'Play preview' : 'Pause preview'}
        </button>
      </div>
      <svg
        className="preview-diagram"
        viewBox="0 0 540 380"
        role="img"
        aria-labelledby="preview-title preview-description"
      >
        <title id="preview-title">An animated request flow</title>
        <desc id="preview-description">
          A user sends a request through an API gateway to an auth service and a product
          service. The product service connects to Redis and PostgreSQL.
        </desc>
        <defs>
          <pattern id="preview-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="currentColor" opacity="0.16" />
          </pattern>
        </defs>
        <rect width="540" height="380" fill="url(#preview-grid)" />
        <g className="preview-connections">
          <path d="M114 180 H166" />
          <path d="M282 180 H310 Q322 180 322 168 V96 Q322 84 334 84 H354" />
          <path d="M282 180 H354" />
          <path d="M412 204 V248 Q412 260 400 260 H294 Q282 260 282 272 V290" />
          <path d="M412 204 V290" />
        </g>
        <g className="preview-beams">
          <path d="M114 180 H166" />
          <path d="M282 180 H310 Q322 180 322 168 V96 Q322 84 334 84 H354" />
          <path d="M282 180 H354" />
          <path d="M412 204 V248 Q412 260 400 260 H294 Q282 260 282 272 V290" />
          <path d="M412 204 V290" />
        </g>
        {[
          { x: 28, y: 156, w: 86, label: 'User', icon: '01' },
          { x: 166, y: 156, w: 116, label: 'API gateway', icon: '02' },
          { x: 354, y: 60, w: 116, label: 'Auth service', icon: '03' },
          { x: 354, y: 156, w: 116, label: 'Product service', icon: '04' },
          { x: 230, y: 290, w: 104, label: 'Redis cache', icon: '05' },
          { x: 360, y: 290, w: 104, label: 'PostgreSQL', icon: '06' },
        ].map((node) => (
          <g
            key={node.label}
            className="preview-node"
            transform={`translate(${node.x} ${node.y})`}
          >
            <rect width={node.w} height="48" rx="10" />
            <text className="preview-node-number" x="12" y="-9">
              {node.icon}
            </text>
            <text x={node.w / 2} y="28" textAnchor="middle">
              {node.label}
            </text>
          </g>
        ))}
        <text className="preview-edge-label" x="122" y="166">
          GET
        </text>
        <text className="preview-edge-label" x="332" y="122">
          verify
        </text>
      </svg>
      <div className="preview-caption">
        <span>ONE FLOW. EVERY CONNECTION.</span>
        <span>
          Rich view <span aria-hidden="true">↗</span>
        </span>
      </div>
    </div>
  );
}

export function LandingPage({
  input,
  busy,
  examples,
  onInputChange,
  onSubmit,
  onExample,
  onSettings,
}: LandingPageProps) {
  return (
    <main className="landing-page">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="status-dot" /> IDEAS IN MOTION
          </p>
          <h1 id="landing-title">
            Every flow
            <br />
            has a story.
            <br />
            <span>Bring yours to life.</span>
          </h1>
          <p className="hero-description">
            Turn a few lines into a diagram people actually understand. Create, refine,
            and share your next big idea in motion.
          </p>
          <form
            className="creation-card"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            <label htmlFor="idle-chat-input">What are you building?</label>
            <textarea
              id="idle-chat-input"
              aria-label="Diagram description or Mermaid source"
              value={input}
              onChange={(event) => onInputChange(event.target.value)}
              rows={3}
              maxLength={30_000}
              placeholder="Describe a flow, or paste your Mermaid code…"
              disabled={busy}
            />
            <div className="creation-actions">
              <span>
                Mermaid works instantly.
                <br />
                Connect AI for descriptions.
              </span>
              <button
                className="btn-primary"
                type="submit"
                disabled={busy || !input.trim()}
              >
                Generate diagram <span aria-hidden="true">↗</span>
              </button>
            </div>
          </form>
          <p className="hero-note">
            <span aria-hidden="true">✓</span> No account needed{' '}
            <span aria-hidden="true">·</span> Mermaid renders in your browser
          </p>
        </div>
        <div className="hero-visual">
          <div className="visual-label">
            <span>FROM THOUGHT TO FLOW</span>
            <span>01 — 06</span>
          </div>
          <FlowPreview />
          <div className="visual-benefits">
            <span>Editable by design</span>
            <span>Animated by default</span>
            <span>Ready to share</span>
          </div>
        </div>
      </section>
      <section
        className="landing-examples"
        id="examples"
        aria-labelledby="examples-title"
      >
        <div className="examples-heading">
          <div>
            <p className="eyebrow">A LITTLE INSPIRATION</p>
            <h2 id="examples-title">Start with a working example.</h2>
          </div>
          <p>No setup. Just open and make it yours.</p>
        </div>
        <div className="example-grid">
          {examples.map((example, index) => (
            <button
              className="example-card"
              key={example.name}
              disabled={busy}
              onClick={() => onExample(example.source)}
              aria-label={example.name}
            >
              <span className="example-number">{EXAMPLE_DETAILS[index]?.symbol}</span>
              <span>
                <strong>{example.name}</strong>
                <span className="example-description">
                  {EXAMPLE_DETAILS[index]?.description}
                </span>
              </span>
              <span className="example-arrow" aria-hidden="true">
                ↗
              </span>
            </button>
          ))}
        </div>
      </section>
      <footer className="landing-footer">
        <div>
          <strong>
            PulseGraph<span className="footer-dot">.</span>
          </strong>
          <p>Clear thinking. Connected.</p>
        </div>
        <p className="footer-formats">
          Make it yours. Take it anywhere.
          <br />
          <span>PNG · Animated GIF · SVG · Mermaid</span>
        </p>
        <nav aria-label="Footer">
          <a href="#examples">Explore examples</a>
          <button onClick={onSettings} disabled={busy}>
            Connect AI
          </button>
          <span>Open source · MIT licensed</span>
        </nav>
      </footer>
    </main>
  );
}

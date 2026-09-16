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

const EXAMPLE_DESCRIPTIONS = [
  'A user request moving through a gateway, auth service, cache and database.',
  'A yes or no check that loops back through debugging until it passes.',
  'A commit running through tests, container build and deploy.',
];

const BROWSER_FACTS = [
  {
    title: 'No account',
    body: 'Open the page and start. There is nothing to sign up for and nothing to install.',
  },
  {
    title: 'Local by default',
    body: 'Mermaid is parsed and rendered on your own machine. Drafts are recovered from local storage.',
  },
  {
    title: 'Optional AI',
    body: 'Add a DeepSeek key or point PulseGraph at a local Ollama model when you want plain English.',
  },
];

const PREVIEW_EDGES = [
  'M114 180 H166',
  'M282 180 H310 Q322 180 322 168 V96 Q322 84 334 84 H354',
  'M282 180 H354',
  'M412 204 V248 Q412 260 400 260 H294 Q282 260 282 272 V290',
  'M412 204 V290',
];

const PREVIEW_NODES = [
  { x: 28, y: 156, w: 86, label: 'User' },
  { x: 166, y: 156, w: 116, label: 'API gateway' },
  { x: 354, y: 60, w: 116, label: 'Auth service' },
  { x: 354, y: 156, w: 116, label: 'Product service' },
  { x: 230, y: 290, w: 104, label: 'Redis cache' },
  { x: 360, y: 290, w: 104, label: 'PostgreSQL' },
];

function FlowPreview() {
  const [paused, setPaused] = useState(false);

  return (
    <div className={'flow-preview' + (paused ? ' is-paused' : '')}>
      <div className="preview-toolbar">
        <span className="preview-title">Request flow</span>
        <button type="button" onClick={() => setPaused(!paused)} aria-pressed={paused}>
          {paused ? 'Play' : 'Pause'}
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
          {PREVIEW_EDGES.map((edge) => (
            <path key={edge} d={edge} />
          ))}
        </g>
        <g className="preview-beams">
          {PREVIEW_EDGES.map((edge) => (
            <path key={edge} d={edge} />
          ))}
        </g>
        {PREVIEW_NODES.map((node) => (
          <g
            key={node.label}
            className="preview-node"
            transform={`translate(${node.x} ${node.y})`}
          >
            <rect width={node.w} height="48" rx="10" />
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
          <h1 id="landing-title">
            Mermaid in.
            <br />
            <span>Animated diagram out.</span>
          </h1>
          <p className="hero-description">
            Paste a flowchart or describe your system in plain English. Pan, edit and
            export it without leaving the browser.
          </p>
          <form
            className="creation-card"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            <label htmlFor="idle-chat-input">What are you building?</label>
            <p className="creation-help" id="idle-chat-help">
              Mermaid renders instantly. Plain English needs an AI key.
            </p>
            <textarea
              id="idle-chat-input"
              aria-label="Diagram description or Mermaid source"
              aria-describedby="idle-chat-help"
              value={input}
              onChange={(event) => onInputChange(event.target.value)}
              rows={3}
              maxLength={30_000}
              placeholder="Describe a flow, or paste your Mermaid code…"
              disabled={busy}
            />
            <div className="creation-actions">
              <button
                className="btn-primary"
                type="submit"
                disabled={busy || !input.trim()}
              >
                Generate diagram
              </button>
            </div>
          </form>
        </div>
        <div className="hero-visual">
          <FlowPreview />
        </div>
      </section>

      <section className="landing-browser" aria-labelledby="browser-title">
        <div className="browser-heading">
          <h2 id="browser-title">Everything runs in the browser.</h2>
          <p>
            Your diagram, its Mermaid source and every edit stay on this device. AI is
            optional and stays off until you add a key.
          </p>
        </div>
        <figure className="browser-shot">
          <img
            src="/workspace.png"
            alt="The PulseGraph workspace with an animated architecture diagram, the chat panel and the export menu"
            width={1440}
            height={810}
            loading="lazy"
            decoding="async"
          />
        </figure>
        <div className="browser-facts">
          {BROWSER_FACTS.map((fact) => (
            <div key={fact.title}>
              <h3>{fact.title}</h3>
              <p>{fact.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section
        className="landing-examples"
        id="examples"
        aria-labelledby="examples-title"
      >
        <div className="examples-heading">
          <h2 id="examples-title">Start from a working example.</h2>
          <p>Each one opens straight into the editor.</p>
        </div>
        <div className="example-grid">
          {examples.map((example, index) => (
            <button
              className="example-card"
              key={example.name}
              disabled={busy}
              onClick={() => onExample(example.source)}
            >
              <strong>{example.name}</strong>
              <span className="example-description">{EXAMPLE_DESCRIPTIONS[index]}</span>
              <span className="example-open">Open in editor</span>
            </button>
          ))}
        </div>
      </section>

      <footer className="landing-footer">
        <div className="footer-brand">
          <strong>PulseGraph</strong>
          <p>Animated architecture diagrams, made in the browser.</p>
        </div>
        <nav aria-label="Footer">
          <a href="#examples">Examples</a>
          <button type="button" onClick={onSettings} disabled={busy}>
            AI settings
          </button>
          <span>Export to PNG, GIF, SVG or Mermaid</span>
          <span>MIT licensed</span>
        </nav>
      </footer>
    </main>
  );
}

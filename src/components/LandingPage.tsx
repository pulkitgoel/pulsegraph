import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  ArrowRight,
  Code,
  Cube,
  Export,
  GitBranch,
  Presentation,
  ShieldCheck,
} from '@phosphor-icons/react';
import './LandingPage.css';

interface Example {
  name: string;
  description: string;
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

const STARTER =
  'flowchart LR\n  A[Customer] --> B[API gateway]\n  B --> C{Cache hit?}\n  C -->|Yes| D[Return response]\n  C -->|No| E[(Database)]\n  E --> D';
const BROWSER_FACTS = [
  {
    icon: Code,
    title: 'Start with what you have',
    body: 'Paste Mermaid, import a diagram, or describe a process with optional AI. Your source stays editable.',
  },
  {
    icon: GitBranch,
    title: 'Make the connections clear',
    body: 'Follow branches, dependencies and retry loops. Switch between Classic, Rich and Flow to find your view.',
  },
  {
    icon: Presentation,
    title: 'Take the story with you',
    body: 'Compose a landscape presentation, or share a GIF, PNG or SVG. No viewer account needed for exported files.',
  },
];
const QUESTIONS = [
  {
    title: 'Do I need an account or an AI key?',
    body: 'No account is needed. Paste Mermaid or open an example to start without AI. Plain-English generation and AI presentation composition use your configured DeepSeek key or Ollama model.',
  },
  {
    title: 'Does my diagram stay on my device?',
    body: 'Mermaid parsing, editing and exports happen in your browser. Drafts are saved in this browser. If you choose cloud AI, your prompt and relevant diagram content are sent to that provider.',
  },
  {
    title: 'Can I use the animation in a presentation?',
    body: 'Export a looping GIF for slide tools that support animated images, or use Slide PNG and SVG for stills. Presentation mode composes a landscape view; PulseGraph does not generate PowerPoint files.',
  },
  {
    title: 'Is the animation an execution simulation?',
    body: 'No. Moving markers illustrate the connections in your diagram. They do not simulate real traffic or decide which conditional branch runs.',
  },
];

function BrowserShowcase({ onOpen, busy }: { onOpen: () => void; busy: boolean }) {
  const windowRef = useRef<HTMLElement>(null);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  const base = import.meta.env.BASE_URL;
  function updateTilt(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      event.pointerType === 'touch' ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    const bounds = event.currentTarget.getBoundingClientRect();
    windowRef.current?.style.setProperty(
      '--tilt-x',
      `${((event.clientY - bounds.top) / bounds.height - 0.5) * -3}deg`,
    );
    windowRef.current?.style.setProperty(
      '--tilt-y',
      `${((event.clientX - bounds.left) / bounds.width - 0.5) * 4}deg`,
    );
  }
  function resetTilt() {
    windowRef.current?.style.setProperty('--tilt-x', '0deg');
    windowRef.current?.style.setProperty('--tilt-y', '-3deg');
  }
  return (
    <div className="browser-stage" onPointerMove={updateTilt} onPointerLeave={resetTilt}>
      <figure className="browser-shot" ref={windowRef}>
        <div className="browser-window-bar">
          <span className="window-controls" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className="window-address">
            Production API architecture <span>· Rich mode</span>
          </span>
          <button
            className="preview-toggle"
            type="button"
            onClick={() => setPaused(!paused)}
            aria-pressed={paused}
            disabled={failed}
            title={
              failed ? 'Animation unavailable; showing the static preview' : undefined
            }
          >
            {failed ? 'Preview' : paused ? 'Play' : 'Pause'}
          </button>
        </div>
        <div className="browser-screen">
          <picture>
            <source
              media="(prefers-reduced-motion: reduce)"
              srcSet={`${base}pulsegraph-live-flow-static.png`}
            />
            <img
              src={`${base}${paused || failed ? 'pulsegraph-live-flow-static.png' : 'pulsegraph-live-flow.gif?v=8'}`}
              alt="PulseGraph production API diagram showing customer traffic through edge security, services, Redis, PostgreSQL and monitoring"
              width={2560}
              height={1440}
              decoding="async"
              fetchPriority="high"
              onError={() => setFailed(true)}
            />
          </picture>
        </div>
        <figcaption className="demo-caption">
          <span>
            <span className="demo-dot" aria-hidden />
            Actual PulseGraph export{' '}
            <span className="demo-caption-detail">
              · {paused || failed ? 'Static preview' : 'Animated GIF'}
            </span>
          </span>
          <button type="button" onClick={onOpen} disabled={busy}>
            Open this diagram <ArrowRight size={15} aria-hidden />
          </button>
        </figcaption>
      </figure>
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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const demo = examples[0];
  return (
    <main className="landing-page">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="hero-copy">
          <span className="hero-eyebrow">
            <span aria-hidden />
            DIAGRAMS WITH A STORY
          </span>
          <h1 id="landing-title">
            Don’t just draw it.
            <br />
            <span>Show how it flows.</span>
          </h1>
          <p className="hero-description">
            Turn Mermaid into animated diagrams that make systems and processes easier to
            explain. From the first connection to the final slide.
          </p>
          <a className="hero-example-link" href="#examples">
            Explore ready-to-run examples <ArrowRight size={17} aria-hidden />
          </a>
          <div className="hero-assurances" aria-label="Getting started">
            <span>
              <ShieldCheck size={16} aria-hidden />
              Mermaid stays local
            </span>
            <span>No sign-up</span>
            <span>AI optional</span>
          </div>
        </div>
        <form
          className="creation-card"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="creation-heading">
            <Code size={20} aria-hidden />
            <span>YOUR SOURCE. YOUR FLOW.</span>
          </div>
          <label htmlFor="idle-chat-input">Bring your diagram to life.</label>
          <p className="creation-help" id="idle-chat-help">
            Paste Mermaid to start locally. Describing it in words? Connect AI in
            settings.
          </p>
          <textarea
            ref={inputRef}
            id="idle-chat-input"
            aria-label="Diagram description or Mermaid source"
            aria-describedby="idle-chat-help"
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            rows={4}
            maxLength={30_000}
            placeholder={'flowchart LR\n  Customer --> API\n  API --> Database'}
            disabled={busy}
          />
          <div className="creation-actions">
            <button
              className="starter-button"
              type="button"
              disabled={busy}
              onClick={() => {
                onInputChange(STARTER);
                inputRef.current?.focus();
              }}
            >
              Use a Mermaid starter
            </button>
            <button
              className="btn-primary"
              type="submit"
              disabled={busy || !input.trim()}
            >
              {busy ? 'Creating…' : 'Animate my diagram'}
              <ArrowRight size={16} aria-hidden />
            </button>
          </div>
          <span className="creation-note">
            Edit the source. Keep the connections. Make it yours.
          </span>
        </form>
      </section>

      <section className="landing-browser" aria-labelledby="browser-title">
        <div className="browser-heading">
          <div>
            <span className="section-kicker">SEE IT IN MOTION</span>
            <h2 id="browser-title">A diagram people can follow.</h2>
          </div>
          <p>
            A real diagram, animated and exported in PulseGraph. Open it in the editor and
            try it yourself—no AI key needed.
          </p>
        </div>
        <BrowserShowcase
          onOpen={() => demo && onExample(demo.source)}
          busy={busy || !demo}
        />
        <div className="browser-facts">
          {BROWSER_FACTS.map((fact, index) => (
            <article key={fact.title}>
              <div className="fact-heading">
                <fact.icon size={22} aria-hidden />
                <span>0{index + 1}</span>
              </div>
              <h3>{fact.title}</h3>
              <p>{fact.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        className="landing-examples"
        id="examples"
        aria-labelledby="examples-title"
      >
        <div className="examples-heading">
          <span className="section-kicker">SKIP THE BLANK CANVAS</span>
          <h2 id="examples-title">Pick a flow. Make it yours.</h2>
          <p>
            Working examples with real branches and dependencies. One click to start
            editing.
          </p>
        </div>
        <div className="example-grid">
          {examples.map((example, index) => {
            const Icon = [Cube, GitBranch, Code][index % 3];
            return (
              <button
                className="example-card"
                key={example.name}
                disabled={busy}
                onClick={() => onExample(example.source)}
              >
                <strong>{example.name}</strong>
                <span className="example-symbol" aria-hidden>
                  <Icon size={28} weight="duotone" />
                  <span>0{index + 1}</span>
                </span>
                <span className="example-description">{example.description}</span>
                <span className="example-open">
                  Open in editor <ArrowRight size={16} aria-hidden />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="landing-faq" aria-labelledby="faq-title">
        <div>
          <span className="section-kicker">GOOD TO KNOW</span>
          <h2 id="faq-title">
            A little clarity
            <br />
            before you start.
          </h2>
          <p>
            No accounts. No installation.
            <br />
            Just your diagram and a browser.
          </p>
        </div>
        <div className="faq-list">
          {QUESTIONS.map((question) => (
            <details key={question.title}>
              <summary>
                {question.title}
                <span aria-hidden>+</span>
              </summary>
              <p>{question.body}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="landing-cta" aria-labelledby="cta-title">
        <Export size={26} aria-hidden />
        <h2 id="cta-title">Make your next explanation click.</h2>
        <p>Start with a flow. Leave with something worth sharing.</p>
        <a href="#idle-chat-input" onClick={() => inputRef.current?.focus()}>
          Create your diagram <ArrowRight size={17} aria-hidden />
        </a>
      </section>
      <footer className="landing-footer">
        <div className="footer-brand">
          <strong>PulseGraph</strong>
          <p>Make complex systems click.</p>
        </div>
        <nav aria-label="Footer">
          <a href="#examples">Examples</a>
          <button type="button" onClick={onSettings} disabled={busy}>
            AI settings
          </button>
          <span>PNG · GIF · SVG · Mermaid</span>
          <span>MIT licensed</span>
        </nav>
      </footer>
    </main>
  );
}

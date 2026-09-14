import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiKeyModal } from './components/ApiKeyModal';
import { ChatPanel } from './components/ChatPanel';
import { DiagramCanvas } from './components/DiagramCanvas';
import { RichDiagramCanvas } from './components/RichDiagramCanvas';
import { SourceEditor } from './components/SourceEditor';
import { LandingPage } from './components/LandingPage';
import { ToolIcon } from './components/ToolIcon';
import { sendMessage, designPresentation } from './services/llmService';
import type { ExportFrame } from './services/gifExporter';
import { buildBlueprintSvg } from './render/blueprintSvg';
import { createDocument, deserializeDocument, serializeDocument } from './lib/document';
import { readPreference, writePreference } from './lib/storage';
import {
  clearSessionApiKey,
  readSessionApiKey,
  writeSessionApiKey,
} from './lib/sessionCredentials';
import { useDocument } from './lib/useDocument';
import { looksLikeMermaid } from './parser/mermaidParser';
import type { ChatMessage, LlmProvider } from './types';

export type LoadingStep = 'generating' | 'validating' | 'rendering' | null;
type ExportKind = 'png' | 'gif' | 'slide' | 'svg' | 'source' | 'document';

const EXAMPLES = [
  {
    name: 'Request flow',
    source:
      'flowchart LR\nU((User)) --> API[API Gateway]\nAPI --> AUTH[Auth Service]\nAPI --> S[Product Service]\nS --> DB[(PostgreSQL)]\nS -.-> CACHE[/Redis/]',
  },
  {
    name: 'Decision loop',
    source:
      'flowchart TB\nA[Start] --> B{Is it working?}\nB -->|Yes| C[Ship it]\nB -->|No| D[Debug]\nD --> B',
  },
  {
    name: 'Delivery pipeline',
    source:
      'flowchart LR\nA[GitHub] --> B[Tests]\nB --> C{Pass?}\nC -->|Yes| D[Build container]\nD --> E[Deploy]\nC -->|No| F[Fix code]\nF --> A',
  },
];

function message(role: ChatMessage['role'], content: string): ChatMessage {
  return { id: crypto.randomUUID(), role, content, timestamp: new Date() };
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export default function App() {
  const workspace = useDocument();
  const diagram = workspace.document;
  const [apiKey, setApiKey] = useState(readSessionApiKey);
  const [provider, setProvider] = useState<LlmProvider>(() =>
    readPreference('pulsegraph_llm_provider') === 'ollama' ? 'ollama' : 'deepseek',
  );
  const [model, setModel] = useState(
    () => readPreference('pulsegraph_ollama_model') || 'gemma3:4b',
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resumePresentation, setResumePresentation] = useState(false);
  const [isPresenting, setIsPresenting] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    readPreference('pulsegraph_theme') === 'light' ? 'light' : 'dark',
  );
  const [loadingStep, setLoadingStep] = useState<LoadingStep>(null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<'classic' | 'rich'>('rich');
  const [presentationMode, setPresentationMode] = useState(false);
  const [showChat, setShowChat] = useState(() => window.innerWidth > 700);
  const [showSource, setShowSource] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);
  const [exportFrame, setExportFrame] = useState<ExportFrame>('auto');
  const [reducedMotion, setReducedMotion] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const operation = useRef<AbortController | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const busy = loadingStep !== null || exporting;
  const active = !!diagram || messages.length > 0;
  const diagramSource = diagram?.source ?? null;
  const standardGraph = useMemo(
    () => (diagramSource ? createDocument(diagramSource).graph : null),
    [diagramSource],
  );
  const isPresentation = presentationMode && !!diagram?.roles;
  const displayedGraph = isPresentation ? diagram?.graph : standardGraph;

  useEffect(() => {
    if (!toolsOpen) return;
    function closeOutside(event: PointerEvent) {
      if (!toolsRef.current?.contains(event.target as Node)) setToolsOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setToolsOpen(false);
        toolsRef.current?.querySelector('button')?.focus();
      }
    }
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [toolsOpen]);

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    writePreference('pulsegraph_theme', theme);
  }, [theme]);

  useEffect(() => {
    // Remove credentials persisted by earlier versions; new keys stay in memory.
    writePreference('pulsegraph_deepseek_key', null);
    return () => operation.current?.abort();
  }, []);

  function applySource(source: string) {
    try {
      workspace.commit(createDocument(source));
      setPresentationMode(false);
      setError('');
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Could not parse the source.',
      );
    }
  }

  function resetWorkspace() {
    operation.current?.abort();
    workspace.reset();
    setMessages([]);
    setInput('');
    setPresentationMode(false);
    setShowSource(false);
    setShowChat(window.innerWidth > 700);
    setError('');
    setToolsOpen(false);
  }

  async function submit(text: string) {
    if (!text.trim() || operation.current) return;
    if (!looksLikeMermaid(text) && provider === 'deepseek' && !apiKey) {
      setSettingsOpen(true);
      return;
    }

    const controller = new AbortController();
    operation.current = controller;
    setLoadingStep('generating');
    setError('');
    setMessages((previous) => [...previous, message('user', text)]);
    setInput('');

    try {
      const result = await sendMessage(
        text,
        messages,
        diagram?.graph ?? null,
        apiKey,
        provider,
        model,
        setLoadingStep,
        controller.signal,
      );
      controller.signal.throwIfAborted();
      if (result.graph) {
        workspace.commit(createDocument(result.mermaidSource));
        setPresentationMode(false);
      }
      setMessages((previous) =>
        [...previous, message('assistant', result.message)].slice(-80),
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Generation failed.');
      setInput(text);
    } finally {
      operation.current = null;
      setLoadingStep(null);
    }
  }

  async function present(credentials = { apiKey, provider, model }) {
    if (!diagram || operation.current) return;
    if (diagram.roles) {
      setViewMode('rich');
      setPresentationMode(true);
      return;
    }
    if (credentials.provider === 'deepseek' && !credentials.apiKey) {
      setResumePresentation(true);
      setSettingsOpen(true);
      return;
    }

    const controller = new AbortController();
    operation.current = controller;
    setIsPresenting(true);
    setLoadingStep('generating');
    setError('');

    try {
      const result = await designPresentation(
        diagram.source,
        credentials.apiKey,
        credentials.provider,
        credentials.model,
        setLoadingStep,
        controller.signal,
      );
      controller.signal.throwIfAborted();
      workspace.commit(createDocument(result.mermaidSource, result.roles ?? null));
      setViewMode('rich');
      setPresentationMode(true);
      setMessages((previous) => [...previous, message('assistant', result.message)]);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Presentation failed.');
    } finally {
      operation.current = null;
      setIsPresenting(false);
      setLoadingStep(null);
    }
  }

  async function exportDiagram(kind: ExportKind) {
    if (!diagram || operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setExporting(true);
    setError('');

    try {
      if (kind === 'source' || kind === 'document') {
        const content = kind === 'source' ? diagram.source : serializeDocument(diagram);
        download(
          new Blob([content], { type: 'text/plain;charset=utf-8' }),
          kind === 'source' ? 'pulsegraph.mmd' : 'pulsegraph.json',
        );
        return;
      }

      const exporter = await import('./services/gifExporter');
      const liveSvg = document.getElementById('pulsegraph-svg');
      if (!liveSvg) throw new Error('No diagram to export.');

      let svg: Element = liveSvg;
      if (kind === 'slide') {
        if (!diagram.roles)
          throw new Error('Choose Presentation before exporting a slide.');
        svg = new DOMParser().parseFromString(
          buildBlueprintSvg(diagram.graph, diagram.roles),
          'image/svg+xml',
        ).documentElement;
      }

      if (kind === 'svg') {
        download(
          new Blob([exporter.snapshotSvg(svg)], { type: 'image/svg+xml' }),
          'pulsegraph.svg',
        );
        return;
      }

      const blob =
        kind === 'gif'
          ? await exporter.exportGif(
              svg,
              theme,
              3,
              setExportProgress,
              exportFrame,
              controller.signal,
            )
          : await exporter.exportPng(
              svg,
              kind === 'slide' ? 'light' : theme,
              setExportProgress,
              exportFrame,
              controller.signal,
            );
      download(
        blob,
        kind === 'gif'
          ? 'pulsegraph.gif'
          : kind === 'slide'
            ? 'pulsegraph-slide.png'
            : 'pulsegraph.png',
      );
    } catch (failure) {
      setError(
        controller.signal.aborted
          ? 'Export cancelled.'
          : failure instanceof Error
            ? failure.message
            : 'Export failed.',
      );
    } finally {
      operation.current = null;
      setExporting(false);
      setExportProgress(0);
    }
  }

  async function importFile(file?: File) {
    if (!file || busy) return;
    try {
      if (file.size > 100_000)
        throw new Error('Import files must be smaller than 100 KB.');
      const text = await file.text();
      const imported = file.name.endsWith('.json')
        ? deserializeDocument(text)
        : createDocument(text);
      workspace.commit(imported);
      setPresentationMode(false);
      setError('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Import failed.');
    }
  }

  return (
    <div className={'app-layout ' + (active ? 'active' : 'idle')}>
      <header className="app-header">
        <div className="app-logo">
          <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="9" fill="currentColor" />
            <path
              d="M6 17h6l3-8 4 15 3-7h4"
              fill="none"
              stroke="var(--surface)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="brand-name">
            PulseGraph<span className="brand-dot">.</span>
          </span>
        </div>
        <nav className="app-header-right" aria-label="Diagram tools">
          <input
            ref={importRef}
            type="file"
            accept=".mmd,.txt,.json"
            hidden
            onChange={(event) => {
              void importFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          {diagram && (
            <>
              <div className="view-toggle" aria-label="Diagram appearance">
                <button
                  disabled={busy}
                  className={viewMode === 'classic' && !isPresentation ? 'active' : ''}
                  aria-pressed={viewMode === 'classic' && !isPresentation}
                  onClick={() => {
                    setViewMode('classic');
                    setPresentationMode(false);
                  }}
                >
                  Classic
                </button>
                <button
                  disabled={busy}
                  className={viewMode === 'rich' && !isPresentation ? 'active' : ''}
                  aria-pressed={viewMode === 'rich' && !isPresentation}
                  onClick={() => {
                    setViewMode('rich');
                    setPresentationMode(false);
                  }}
                >
                  Rich
                </button>
                <button
                  disabled={busy}
                  className={
                    isPresentation ? 'active presentation-tab' : 'presentation-tab'
                  }
                  aria-pressed={isPresentation}
                  aria-label="Presentation"
                  aria-busy={isPresenting}
                  onClick={() => void present()}
                  title="Create or reopen a presentation layout"
                >
                  {isPresenting ? 'Designing…' : 'Presentation'}
                </button>
              </div>
              <div className="history-controls" aria-label="History">
                <button
                  className="btn-icon"
                  disabled={busy || !workspace.canUndo}
                  onClick={workspace.undo}
                  title="Undo"
                  aria-label="Undo"
                >
                  ↶
                </button>
                <button
                  className="btn-icon"
                  disabled={busy || !workspace.canRedo}
                  onClick={workspace.redo}
                  title="Redo"
                  aria-label="Redo"
                >
                  ↷
                </button>
              </div>
              <details className="export-menu-wrap">
                <summary className="btn-export-menu">Export</summary>
                <div className="export-menu">
                  {(['png', 'gif', 'slide', 'svg', 'source', 'document'] as const).map(
                    (kind) => (
                      <button
                        key={kind}
                        className="export-menu-item"
                        disabled={busy || (kind === 'slide' && !diagram.roles)}
                        title={
                          kind === 'slide' && !diagram.roles
                            ? 'Choose Presentation first'
                            : undefined
                        }
                        onClick={(event) => {
                          event.currentTarget.closest('details')?.removeAttribute('open');
                          void exportDiagram(kind);
                        }}
                      >
                        {
                          {
                            png: 'PNG',
                            gif: 'GIF',
                            slide: 'Slide PNG',
                            svg: 'SVG',
                            source: 'Mermaid source',
                            document: 'Editable document',
                          }[kind]
                        }
                      </button>
                    ),
                  )}
                  <label className="export-menu-label">
                    Frame size
                    <select
                      value={exportFrame}
                      disabled={busy}
                      onChange={(event) =>
                        setExportFrame(event.target.value as ExportFrame)
                      }
                    >
                      {[
                        'auto',
                        '16:9',
                        '16:10',
                        '4:3',
                        '1:1',
                        'a4-landscape',
                        'a4-portrait',
                      ].map((frame) => (
                        <option key={frame} value={frame}>
                          {frame === 'auto' ? 'Fit to content' : frame}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </details>
              <button
                className="btn-icon"
                onClick={() => setShowChat(!showChat)}
                aria-expanded={showChat}
              >
                Chat
              </button>
            </>
          )}
          {!active ? (
            <div className="landing-actions">
              <a className="header-examples" href="#examples">
                Examples
              </a>
              <button
                className="btn-icon"
                disabled={busy}
                onClick={() => importRef.current?.click()}
              >
                Import diagram
              </button>
              <button
                className="btn-icon"
                disabled={busy}
                onClick={() => setSettingsOpen(true)}
              >
                AI settings
              </button>
              <button
                className="btn-icon"
                aria-label={theme === 'dark' ? 'Use light theme' : 'Use dark theme'}
                title={theme === 'dark' ? 'Use light theme' : 'Use dark theme'}
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              >
                <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
              </button>
            </div>
          ) : (
            <div className="tools-menu-wrap" ref={toolsRef}>
              <button
                className="btn-icon"
                aria-label="Workspace tools"
                aria-expanded={toolsOpen}
                onClick={() => setToolsOpen((open) => !open)}
              >
                Tools <span aria-hidden="true">⌄</span>
              </button>
              {toolsOpen && (
                <div className="tools-menu">
                  <span className="tools-menu-heading">Workspace tools</span>
                  <p className="tools-menu-description">Make this workspace yours.</p>
                  <button
                    onClick={() => {
                      setToolsOpen(false);
                      setSettingsOpen(true);
                    }}
                    disabled={busy}
                  >
                    <ToolIcon name="settings" /> AI settings
                  </button>
                  <button
                    onClick={() => {
                      setToolsOpen(false);
                      setTheme(theme === 'dark' ? 'light' : 'dark');
                    }}
                    disabled={busy}
                  >
                    <ToolIcon name="theme" />
                    {theme === 'dark' ? 'Use light theme' : 'Use dark theme'}
                  </button>
                  <button
                    onClick={() => {
                      setToolsOpen(false);
                      importRef.current?.click();
                    }}
                    disabled={busy}
                  >
                    <ToolIcon name="import" /> Import diagram
                  </button>
                  {diagram && (
                    <>
                      <button
                        disabled={busy}
                        aria-pressed={!reducedMotion}
                        onClick={() => {
                          setToolsOpen(false);
                          setReducedMotion(!reducedMotion);
                        }}
                      >
                        <ToolIcon name="animation" />
                        {reducedMotion ? 'Play animation' : 'Pause animation'}
                      </button>
                      <button
                        onClick={() => {
                          setToolsOpen(false);
                          setShowSource(!showSource);
                        }}
                        aria-expanded={showSource}
                      >
                        <ToolIcon name="source" /> Edit Mermaid source
                      </button>
                      <button
                        className="tools-reset"
                        disabled={busy}
                        onClick={resetWorkspace}
                      >
                        <ToolIcon name="reset" /> Reset workspace
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </nav>
      </header>

      <div className={'app-main ' + (active ? 'active' : '')}>
        {active && showChat && (
          <ChatPanel
            messages={messages}
            isLoading={busy}
            loadingStep={loadingStep}
            input={input}
            onInputChange={setInput}
            onSubmit={() => void submit(input)}
            isExporting={exporting}
            exportProgress={exportProgress}
            onResetKey={() => setSettingsOpen(true)}
          />
        )}
        <main className={'canvas-section ' + (diagram ? 'canvas-section--visible' : '')}>
          {diagram &&
            displayedGraph &&
            (viewMode === 'rich' ? (
              <RichDiagramCanvas
                graph={displayedGraph}
                theme={theme}
                reducedMotion={reducedMotion}
              />
            ) : (
              <DiagramCanvas
                graph={displayedGraph}
                theme={theme}
                reducedMotion={reducedMotion}
              />
            ))}
          {diagram && showSource && (
            <SourceEditor
              key={diagram.source}
              source={diagram.source}
              disabled={busy}
              onApply={applySource}
              onClose={() => setShowSource(false)}
            />
          )}
        </main>
        {!active && (
          <LandingPage
            input={input}
            busy={busy}
            examples={EXAMPLES}
            onInputChange={setInput}
            onSubmit={() => void submit(input)}
            onExample={applySource}
            onSettings={() => setSettingsOpen(true)}
          />
        )}
      </div>
      {diagram && (
        <footer className="document-status">
          <span role="status">
            <span className="status-dot" />
            {workspace.saved
              ? 'Draft saved in this browser'
              : 'Browser storage unavailable — export your document to keep it'}
          </span>
          <span className="workspace-summary">
            {diagram.graph.nodes.length} nodes · {diagram.graph.edges.length} connections
          </span>
        </footer>
      )}
      {busy && (
        <div className="operation-status" role="status">
          {exporting
            ? 'Exporting… ' + exportProgress + '%'
            : isPresenting
              ? 'Designing presentation… Waiting for AI.'
              : 'Working…'}
          <button className="btn-icon" onClick={() => operation.current?.abort()}>
            Cancel
          </button>
        </div>
      )}
      {error && (
        <div className="error-toast" role="alert">
          <span>{error}</span>
          <button
            className="btn-icon"
            onClick={() => setError('')}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}
      {settingsOpen && (
        <ApiKeyModal
          provider={provider}
          model={model}
          hasApiKey={Boolean(apiKey)}
          onClose={() => {
            setSettingsOpen(false);
            setResumePresentation(false);
          }}
          onSave={(key, nextProvider, nextModel) => {
            if (key) {
              writeSessionApiKey(key);
              setApiKey(key);
            }
            setProvider(nextProvider);
            setModel(nextModel);
            writePreference('pulsegraph_llm_provider', nextProvider);
            writePreference('pulsegraph_ollama_model', nextModel);
            setSettingsOpen(false);
            if (resumePresentation) {
              setResumePresentation(false);
              void present({
                apiKey: key || apiKey,
                provider: nextProvider,
                model: nextModel,
              });
            }
          }}
          onReset={() => {
            setResumePresentation(false);
            clearSessionApiKey();
            setApiKey('');
            setProvider('deepseek');
            setModel('gemma3:4b');
            writePreference('pulsegraph_llm_provider', null);
            writePreference('pulsegraph_ollama_model', null);
            setSettingsOpen(false);
          }}
        />
      )}
    </div>
  );
}

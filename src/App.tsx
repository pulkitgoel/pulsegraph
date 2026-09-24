import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiKeyModal } from './components/ApiKeyModal';
import { ChatPanel } from './components/ChatPanel';
import { DiagramCanvas } from './components/DiagramCanvas';
import { RichDiagramCanvas } from './components/RichDiagramCanvas';
import { PresentationCanvas } from './components/PresentationCanvas';
import { localPresentationPlan } from './lib/presentationPlan';
import { SourceEditor } from './components/SourceEditor';
import { LandingPage } from './components/LandingPage';
import { ToolIcon } from './components/ToolIcon';
import { sendMessage, designPresentation } from './services/llmService';
import type { ExportFrame } from './services/gifExporter';
import { buildBlueprintSvg } from './render/blueprintSvg';
import { createDocument, deserializeDocument, serializeDocument } from './lib/document';
import { DIAGRAM_EXAMPLES } from './lib/examples';
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

const EXPORT_IMAGE_KINDS = [
  { kind: 'png', label: 'PNG', icon: 'image' },
  { kind: 'gif', label: 'Animated GIF', icon: 'motion' },
  { kind: 'svg', label: 'SVG', icon: 'vector' },
  { kind: 'slide', label: 'Slide PNG', icon: 'slide' },
] as const;

const EXPORT_SOURCE_KINDS = [
  { kind: 'source', label: 'Mermaid source', icon: 'source' },
  { kind: 'document', label: 'Editable document', icon: 'document' },
] as const;

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
  const [viewMode, setViewMode] = useState<'classic' | 'rich' | 'flow'>('rich');
  const [presentationMode, setPresentationMode] = useState(false);
  const [architecturePreview, setArchitecturePreview] = useState(false);
  const [showChat, setShowChat] = useState(() => window.innerWidth > 700);
  const [showSource, setShowSource] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
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
  const slidePlan = useMemo(() => {
    if (!isPresentation || !architecturePreview || !diagram?.roles || !standardGraph)
      return null;
    return diagram.presentation ?? localPresentationPlan(standardGraph, diagram.roles);
  }, [diagram, standardGraph, isPresentation, architecturePreview]);

  useEffect(() => {
    if (!toolsOpen && !exportOpen) return;
    function closeOutside(event: PointerEvent) {
      const target = event.target as Node;
      if (!toolsRef.current?.contains(target)) setToolsOpen(false);
      if (!exportRef.current?.contains(target)) setExportOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      const open = toolsOpen ? toolsRef : exportRef;
      setToolsOpen(false);
      setExportOpen(false);
      open.current?.querySelector('button')?.focus();
    }
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [toolsOpen, exportOpen]);

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

  async function present(credentials = { apiKey, provider, model }, recompose = false) {
    if (!diagram || operation.current) return;
    if (diagram.roles && !recompose) {
      setViewMode('rich');
      setPresentationMode(true);
      setArchitecturePreview(Boolean(diagram.presentation));
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
      workspace.commit(
        createDocument(result.mermaidSource, result.roles ?? null, result.presentation),
      );
      setViewMode('rich');
      setPresentationMode(true);
      setArchitecturePreview(Boolean(result.presentation));
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
      if (kind === 'slide' && !(isPresentation && architecturePreview)) {
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
              isPresentation && architecturePreview ? '16:9' : exportFrame,
              controller.signal,
            )
          : await exporter.exportPng(
              svg,
              kind === 'slide' && !(isPresentation && architecturePreview)
                ? 'light'
                : theme,
              setExportProgress,
              isPresentation && architecturePreview ? '16:9' : exportFrame,
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
          <span className="brand-name">PulseGraph</span>
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
                  className={viewMode === 'flow' && !isPresentation ? 'active' : ''}
                  aria-pressed={viewMode === 'flow' && !isPresentation}
                  onClick={() => {
                    setViewMode('flow');
                    setPresentationMode(false);
                  }}
                  title="Rounded nodes with curved connectors and flowing segments"
                >
                  Flow
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
            </>
          )}
          {active && (
            <div className="toolbar-cluster">
              {diagram && (
                <>
                  <div className="menu-wrap export-menu-wrap" ref={exportRef}>
                    <button
                      className="cluster-btn menu-trigger"
                      aria-expanded={exportOpen}
                      disabled={busy}
                      onClick={() => {
                        setExportOpen((open) => !open);
                        setToolsOpen(false);
                      }}
                    >
                      <ToolIcon name="export" size={15} />
                      Export
                      <ToolIcon name="chevron" size={12} className="menu-chevron" />
                    </button>
                    {exportOpen && (
                      <div className="menu-panel export-menu">
                        <span className="menu-group-label">Image</span>
                        {EXPORT_IMAGE_KINDS.map(({ kind, label, icon }) => (
                          <button
                            key={kind}
                            disabled={busy || (kind === 'slide' && !diagram.roles)}
                            title={
                              kind === 'slide' && !diagram.roles
                                ? 'Choose Presentation first'
                                : undefined
                            }
                            onClick={() => {
                              setExportOpen(false);
                              void exportDiagram(kind);
                            }}
                          >
                            <ToolIcon name={icon} /> {label}
                          </button>
                        ))}
                        <span className="menu-group-label">Source</span>
                        {EXPORT_SOURCE_KINDS.map(({ kind, label, icon }) => (
                          <button
                            key={kind}
                            disabled={busy}
                            onClick={() => {
                              setExportOpen(false);
                              void exportDiagram(kind);
                            }}
                          >
                            <ToolIcon name={icon} /> {label}
                          </button>
                        ))}
                        <label className="menu-field">
                          Frame size
                          <select
                            value={
                              isPresentation && architecturePreview ? '16:9' : exportFrame
                            }
                            disabled={busy || (isPresentation && architecturePreview)}
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
                    )}
                  </div>
                  <button
                    className="cluster-btn"
                    onClick={() => setShowChat(!showChat)}
                    aria-pressed={showChat}
                  >
                    <ToolIcon name="chat" size={15} />
                    Chat
                  </button>
                </>
              )}
              <div className="menu-wrap tools-menu-wrap" ref={toolsRef}>
                <button
                  className="cluster-btn menu-trigger"
                  aria-label="Workspace tools"
                  aria-expanded={toolsOpen}
                  onClick={() => {
                    setToolsOpen((open) => !open);
                    setExportOpen(false);
                  }}
                >
                  <ToolIcon name="tools" size={15} />
                  Tools
                  <ToolIcon name="chevron" size={12} className="menu-chevron" />
                </button>
                {toolsOpen && (
                  <div className="menu-panel tools-menu">
                    <span className="menu-group-label">Workspace</span>
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
                      <ToolIcon name={theme === 'dark' ? 'themeLight' : 'themeDark'} />
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
                          <ToolIcon name={reducedMotion ? 'play' : 'pause'} />
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
            </div>
          )}
          {!active && (
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
                className="btn-icon btn-square"
                aria-label={theme === 'dark' ? 'Use light theme' : 'Use dark theme'}
                title={theme === 'dark' ? 'Use light theme' : 'Use dark theme'}
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              >
                <ToolIcon name={theme === 'dark' ? 'themeLight' : 'themeDark'} />
              </button>
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
            (isPresentation && architecturePreview && standardGraph && slidePlan ? (
              <PresentationCanvas
                graph={standardGraph}
                plan={slidePlan}
                theme={theme}
                reducedMotion={reducedMotion}
                onPrevious={() => setArchitecturePreview(false)}
                aiPlanned={Boolean(diagram.presentation)}
                onCompose={() => void present({ apiKey, provider, model }, true)}
                busy={busy}
              />
            ) : viewMode !== 'classic' ? (
              <RichDiagramCanvas
                graph={displayedGraph}
                theme={theme}
                reducedMotion={reducedMotion}
                variant={viewMode === 'flow' ? 'flow' : 'rich'}
              />
            ) : (
              <DiagramCanvas
                graph={displayedGraph}
                theme={theme}
                reducedMotion={reducedMotion}
              />
            ))}
          {isPresentation && !architecturePreview && (
            <button
              className="btn-icon presentation-preview-toggle"
              onClick={() => setArchitecturePreview(true)}
            >
              Architecture preview · 16:9
            </button>
          )}
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
            examples={DIAGRAM_EXAMPLES}
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
              : 'Browser storage unavailable. Export your document to keep it.'}
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
              void present(
                {
                  apiKey: key || apiKey,
                  provider: nextProvider,
                  model: nextModel,
                },
                true,
              );
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

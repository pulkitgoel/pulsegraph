import { useState, useRef, useCallback, useEffect } from 'react';
import { ApiKeyModal } from './components/ApiKeyModal';
import { ChatPanel } from './components/ChatPanel';
import { DiagramCanvas } from './components/DiagramCanvas';
import { RichDiagramCanvas } from './components/RichDiagramCanvas';
import { sendMessage, designPresentation } from './services/llmService';
import { exportPng, exportGif, type ExportFrame } from './services/gifExporter';
import { computeLayout, roleBlueprintLayout } from './parser/layoutEngine';
import { buildBlueprintSvg } from './render/blueprintSvg';
import { computeLevels, maxLevel } from './lib/graphLevels';
import type { Graph, ChatMessage, LlmProvider, OllamaModel } from './types';

const STORAGE_KEY = 'pulsegraph_deepseek_key';
const PROVIDER_KEY = 'pulsegraph_llm_provider';
const OLLAMA_MODEL_KEY = 'pulsegraph_ollama_model';

function getId() { return Math.random().toString(36).slice(2); }

export type LoadingStep = 'generating' | 'validating' | 'rendering' | null;

const EXAMPLES = [
  'flowchart TD\n  A[Start] --> B{Is it working?}\n  B -->|Yes| C[Ship it!]\n  B -->|No| D[Debug] --> B',
  'Design a microservices backend: API Gateway → Auth, Product, Order services → PostgreSQL',
  'Create a CI/CD pipeline: GitHub → Actions → Docker Registry → Kubernetes',
  'User logs in → Auth Service checks Redis cache → if miss, query PostgreSQL → return JWT',
];

export default function App() {
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem(STORAGE_KEY) ?? '');
  const [provider, setProvider] = useState<LlmProvider>(() => (localStorage.getItem(PROVIDER_KEY) as LlmProvider) ?? 'deepseek');
  const [ollamaModel, setOllamaModel] = useState<OllamaModel>(() => (localStorage.getItem(OLLAMA_MODEL_KEY) as OllamaModel) ?? 'gemma3:4b');
  const [appState, setAppState] = useState<'idle' | 'active'>('idle');
  const [graph, setGraph] = useState<Graph | null>(null);
  const [mermaidSource, setMermaidSource] = useState('');
  const [showMermaid, setShowMermaid] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('pulsegraph_theme') as 'dark' | 'light') || 'dark');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<LoadingStep>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'classic' | 'rich'>('rich');
  const [showChat, setShowChat] = useState(true);
  const [exportType, setExportType] = useState<'png' | 'gif' | null>(null);
  const [exportFrame, setExportFrame] = useState<ExportFrame>('auto');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [presentationRoles, setPresentationRoles] = useState<Record<string, string> | null>(null);

  const canvasContainerRef = useRef<HTMLDivElement>(null);

  const handleSaveConfig = (key: string, newProvider: LlmProvider, newOllamaModel?: OllamaModel) => {
    localStorage.setItem(STORAGE_KEY, key);
    localStorage.setItem(PROVIDER_KEY, newProvider);
    if (newOllamaModel) localStorage.setItem(OLLAMA_MODEL_KEY, newOllamaModel);
    setApiKey(key);
    setProvider(newProvider);
    if (newOllamaModel) setOllamaModel(newOllamaModel);
  };

  const handleResetConfig = () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PROVIDER_KEY);
    setApiKey('');
    setProvider('deepseek');
  };

  useEffect(() => {
    if (theme === 'light') document.documentElement.classList.add('light');
    else document.documentElement.classList.remove('light');
    localStorage.setItem('pulsegraph_theme', theme);
  }, [theme]);

  const submitMessage = useCallback(
    async (text: string) => {
      const userText = text.trim();
      if (!userText || isLoading) return;
      setError('');

      const userMsg: ChatMessage = { id: getId(), role: 'user', content: userText, timestamp: new Date() };
      const newHistory = [...messages, userMsg];
      setMessages(newHistory);
      setInput('');
      setIsLoading(true);
      setLoadingStep('generating');

      try {
        const result = await sendMessage(userText, messages, graph ? { ...graph, mermaidSource } : null, apiKey, provider, ollamaModel, (step) => setLoadingStep(step));

        const aiMsg: ChatMessage = {
          id: getId(),
          role: 'assistant',
          content: result.message,
          timestamp: new Date(),
        };
        setMessages([...newHistory, aiMsg]);

        if (result.graph && !result.isOffTopic) {
          const laid = computeLayout(result.graph);
          setGraph(laid);
          setMermaidSource(result.mermaidSource);
          // A freshly generated/edited diagram invalidates any previous
          // Presentation roles — Blueprint PNG must be re-run for this graph.
          setPresentationRoles(null);
        }
        
        // Always switch to active state to show the chat panel for the response,
        // even if it's an off-topic/validation message with no graph.
        if (appState === 'idle') setAppState('active');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setError(msg);
        setMessages([...newHistory, { id: getId(), role: 'assistant', content: `⚠️ Error: ${msg}`, timestamp: new Date() }]);
      } finally {
        setIsLoading(false);
        setLoadingStep(null);
      }
    },
    [apiKey, provider, ollamaModel, appState, graph, isLoading, messages]
  );

  const handleIdleSubmit = () => { if (input.trim()) submitMessage(input); };

  const handleDesignPresentation = useCallback(async () => {
    if (!mermaidSource || isLoading) return;
    setError('');
    setIsLoading(true);
    setLoadingStep('generating');
    try {
      const result = await designPresentation(mermaidSource, apiKey, provider, ollamaModel, (step) => setLoadingStep(step));
      if (result.graph && !result.isOffTopic) {
        // Role-based semantic layout when the AI provided roles; otherwise fall back.
        const laid = result.roles
          ? roleBlueprintLayout(result.graph, result.roles)
          : computeLayout(result.graph);
        setGraph(laid);
        setMermaidSource(result.mermaidSource);
        setViewMode('rich');
        setPresentationRoles(result.roles ?? null);
      }
      setMessages((prev) => [...prev, { id: getId(), role: 'assistant', content: result.message, timestamp: new Date() }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to redesign diagram';
      setError(msg);
    } finally {
      setIsLoading(false);
      setLoadingStep(null);
    }
  }, [mermaidSource, isLoading, apiKey, provider, ollamaModel]);

  const handleExportBlueprint = useCallback(async () => {
    if (!graph || !presentationRoles || isExporting) return;
    setError('');
    setIsExporting(true);
    const svg = buildBlueprintSvg(graph, presentationRoles, { title: 'Architecture Flow' });
    const w = Number(/width="(\d+)"/.exec(svg)?.[1] || 1200);
    const h = Number(/height="(\d+)"/.exec(svg)?.[1] || 700);
    const scale = 2;

    // Scale the SVG's pixel dimensions (keeping the original viewBox) so the
    // browser rasterises directly at target resolution — upscaling the bitmap
    // afterwards is the blurry path the canvas exporter explicitly avoids.
    const scaledSvg = svg.replace(
      `width="${w}" height="${h}"`,
      `width="${w * scale}" height="${h * scale}"`,
    );

    const svgUrl = URL.createObjectURL(new Blob([scaledSvg], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error('Could not rasterize the blueprint SVG.'));
        img.src = svgUrl;
      });
      const canvas = document.createElement('canvas');
      canvas.width = w * scale; canvas.height = h * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#f7f8fb'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      const pngUrl = await new Promise<string>((res, rej) =>
        canvas.toBlob(b => (b ? res(URL.createObjectURL(b)) : rej(new Error('canvas.toBlob failed'))), 'image/png'));
      const a = document.createElement('a'); a.href = pngUrl; a.download = 'blueprint.png'; a.click();
      setTimeout(() => URL.revokeObjectURL(pngUrl), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Blueprint PNG export failed');
    } finally {
      URL.revokeObjectURL(svgUrl);
      setIsExporting(false);
    }
  }, [graph, presentationRoles, isExporting]);

  const handleExport = async (type: 'png' | 'gif') => {
    if (!graph) return;
    const svgElement = document.getElementById('pulsegraph-svg');
    if (!svgElement) return;

    setExportType(type);
    let fileHandle: FileSystemFileHandle | null = null;
    if ('showSaveFilePicker' in window) {
      try {
        const suggestedName = `pulsegraph-flow.${type}`;
        const description = type === 'png' ? 'PNG Image' : 'GIF Image';
        const accept = type === 'png' ? { 'image/png': ['.png'] } : { 'image/gif': ['.gif'] };
        fileHandle = await (window as unknown as {
          showSaveFilePicker: (opts: object) => Promise<FileSystemFileHandle>;
        }).showSaveFilePicker({
          suggestedName,
          types: [{ description, accept }],
        });
      } catch { return; }
    }
    setIsExporting(true); setExportProgress(0); setGifUrl(null); setError('');
    try {
      // GIF capture must outlast the entry animation: nodes appear at
      // level * 0.6s, so deep graphs need a longer loop than shallow ones.
      const gifDuration = Math.min(12, Math.max(3, maxLevel(computeLevels(graph)) * 0.6 + 2.4));
      const url = type === 'png'
        ? await exportPng(svgElement, theme, (pct) => setExportProgress(pct), exportFrame)
        : await exportGif(svgElement, theme, gifDuration, (pct) => setExportProgress(pct), exportFrame);
      if (fileHandle) {
        const blob = await fetch(url).then((r) => r.blob());
        URL.revokeObjectURL(url);
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        setGifUrl(url);
        setTimeout(() => { URL.revokeObjectURL(url); setGifUrl(null); }, 120_000);
      }
    } catch (err) {
      console.error(`${type.toUpperCase()} export failed:`, err);
      setError(`${type.toUpperCase()} export failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
    finally { setIsExporting(false); setExportProgress(0); }
  };

  const handleCopyMermaid = () => {
    navigator.clipboard.writeText(mermaidSource).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const isConfigured = provider === 'ollama' || (provider === 'deepseek' && apiKey);
  if (!isConfigured) return <ApiKeyModal onSave={handleSaveConfig} />;

  return (
    <div className={`app-layout ${appState}`}>
      {/* ── Header ── */}
      <header className="app-header">
        <div className="app-logo">
          <span>⚡</span>
          <span>PulseGraph</span>
        </div>
        <div className="app-header-right">
          <button className="btn-icon" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} title="Toggle theme" style={{ padding: '0.4rem', fontSize: '1.1rem' }}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <div className="active-provider" title={provider === 'deepseek' ? 'AI model: DeepSeek (cloud)' : `AI model: Ollama (local) — ${ollamaModel}`}>
            <span className="provider-dot" style={{ background: provider === 'deepseek' ? '#818CF8' : '#F472B6' }} />
            {provider === 'deepseek' ? 'DeepSeek' : 'Ollama'}
          </div>
          {appState === 'active' && graph && (
            <>
              <div className="view-toggle">
                <button className={viewMode === 'classic' ? 'active' : ''} onClick={() => setViewMode('classic')}>Classic</button>
                <button className={viewMode === 'rich' ? 'active' : ''} onClick={() => setViewMode('rich')}>Rich</button>
              </div>
              <button
                className="btn-design"
                onClick={handleDesignPresentation}
                disabled={isLoading}
                title="AI reinterprets this diagram into a clean, sectioned presentation layout — then use Export → Slide PNG"
              >
                ✨ AI Presentation
              </button>
              <div className="export-menu-wrap">
                <button
                  className="btn-export-menu"
                  onClick={() => setShowExportMenu(v => !v)}
                  disabled={isExporting}
                  title="Export the diagram as an image"
                >
                  {isExporting ? `Exporting… ${exportProgress}%` : '⬇ Export'}
                </button>
                {showExportMenu && (
                  <>
                    <div className="menu-backdrop" onClick={() => setShowExportMenu(false)} />
                    <div className="export-menu">
                      <button className="export-menu-item" onClick={() => { setShowExportMenu(false); handleExport('png'); }}>
                        <span>PNG</span>
                        <small>hi-res still of the current view</small>
                      </button>
                      <button className="export-menu-item" onClick={() => { setShowExportMenu(false); handleExport('gif'); }}>
                        <span>GIF</span>
                        <small>animated loop of the diagram</small>
                      </button>
                      <button
                        className="export-menu-item"
                        disabled={!presentationRoles}
                        title={presentationRoles ? 'Download the presentation layout as a polished slide' : 'Run ✨ AI Presentation first — this unlocks once it finishes'}
                        onClick={() => { setShowExportMenu(false); handleExportBlueprint(); }}
                      >
                        <span>Slide PNG</span>
                        <small>{presentationRoles ? 'clean presentation-style slide' : 'run ✨ AI Presentation first'}</small>
                      </button>
                      <div className="export-menu-divider" />
                      <label className="export-menu-label">
                        Frame size
                        <select
                          className="frame-select"
                          value={exportFrame}
                          onChange={(e) => setExportFrame(e.target.value as ExportFrame)}
                        >
                          <option value="auto">Fit to content</option>
                          <option value="16:9">16:9 (widescreen slide)</option>
                          <option value="16:10">16:10 (slide)</option>
                          <option value="4:3">4:3 (slide)</option>
                          <option value="1:1">1:1 (square)</option>
                          <option value="a4-landscape">A4 landscape (doc)</option>
                          <option value="a4-portrait">A4 portrait (doc)</option>
                        </select>
                      </label>
                    </div>
                  </>
                )}
              </div>
              <button className="btn-icon" onClick={() => setShowChat(!showChat)} title={showChat ? 'Hide chat panel' : 'Show chat panel'} style={{ padding: '0.4rem 0.55rem' }}>
                💬
              </button>
              <button className="btn-icon" onClick={() => setShowMermaid(!showMermaid)} title={showMermaid ? 'Hide Mermaid source' : 'Show Mermaid source'} style={{ padding: '0.4rem 0.55rem', fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 700 }}>
                {'</>'}
              </button>
            </>
          )}
        </div>
      </header>

      <div className={`app-main ${appState}`}>
        {/* ── Active chat panel (LEFT) ── */}
        {appState === 'active' && showChat && (
          <ChatPanel
            messages={messages}
            isLoading={isLoading}
            loadingStep={loadingStep}
            input={input}
            onInputChange={setInput}
            onSubmit={() => submitMessage(input)}
            isExporting={isExporting}
            exportProgress={exportProgress}
            onResetKey={handleResetConfig}
          />
        )}

        {/* ── Canvas (RIGHT) ── */}
      <main className={`canvas-section ${graph ? 'canvas-section--visible' : ''}`} ref={canvasContainerRef}>
        {graph && (
          viewMode === 'rich'
            ? <RichDiagramCanvas graph={graph} theme={theme} />
            : <DiagramCanvas graph={graph} theme={theme} />
        )}

        {/* Mermaid source panel */}
        {showMermaid && graph && (
          <div className="mermaid-panel">
            <div className="mermaid-panel-header">
              <span>Mermaid Source</span>
              <button className="mermaid-copy-btn" onClick={handleCopyMermaid}>
                {copied ? '✓ Copied!' : '⎘ Copy'}
              </button>
            </div>
            <pre className="mermaid-panel-code">{mermaidSource}</pre>
          </div>
        )}
      </main>

      {/* ── Error Toast (app-level: visible in idle AND active states) ── */}
      {error && appState === 'active' && (
        <div className="error-toast" role="alert">
          <span>⚠️ {error}</span>
          <button className="gif-toast-close" onClick={() => setError('')}>✕</button>
        </div>
      )}

      {/* ── PNG Ready Toast ── */}
      {gifUrl && (
        <div className="gif-toast">
          <span>🎉 {exportType === 'png' ? 'PNG' : 'GIF'} ready!</span>
          <a href={gifUrl} download={`pulsegraph-flow.${exportType}`} className="gif-toast-btn"
            style={{ background: exportType === 'png' ? 'linear-gradient(135deg, var(--accent), var(--accent-2))' : 'linear-gradient(135deg, #10B981, #34D399)' }}
            onClick={() => setTimeout(() => setGifUrl(null), 500)}>
            ⬇ Download pulsegraph-flow.{exportType}
          </a>
          <button className="gif-toast-close" onClick={() => setGifUrl(null)}>✕</button>
        </div>
      )}

        {/* ── Idle hero ── */}
      {appState === 'idle' && (
        <div className="idle-hero">
          <div className="idle-glow" />
          <h1 className="idle-title">
            Describe your architecture.<br />
            <span>Watch it come alive.</span>
          </h1>
          <p className="idle-subtitle">
            Paste any <strong>Mermaid diagram</strong>, describe a system in plain English, or sketch any process flow — PulseGraph turns it into a live animated diagram.
          </p>
          <div className="idle-input-wrap">
            <textarea
              id="idle-chat-input"
              className="idle-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleIdleSubmit(); } }}
              placeholder="Paste Mermaid code, or describe any flow in plain English…"
              rows={3}
              disabled={isLoading}
            />
            <button id="idle-send-btn" className="btn-primary idle-send"
              onClick={handleIdleSubmit} disabled={isLoading || !input.trim()}>
              {isLoading ? <span className="thinking-dots"><span/><span/><span/></span>
                : <>Generate Diagram <span>→</span></>}
            </button>
          </div>
          <div className="example-pills">
            {EXAMPLES.map((ex) => (
              <button key={ex} className="example-pill" onClick={() => submitMessage(ex)} disabled={isLoading}>
                {ex.length > 60 ? ex.slice(0, 57) + '…' : ex}
              </button>
            ))}
          </div>
          <button className="btn-change-provider" onClick={handleResetConfig}>
            ⚙️ Change AI Model / Key
          </button>
          {error && <p className="error-msg">{error}</p>}
        </div>
      )}
      </div>
    </div>
  );
}

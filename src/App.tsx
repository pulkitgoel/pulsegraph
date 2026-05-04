import { useState, useRef, useCallback } from 'react';
import { ApiKeyModal } from './components/ApiKeyModal';
import { ChatPanel } from './components/ChatPanel';
import { DiagramCanvas } from './components/DiagramCanvas';
import { sendMessage } from './services/llmService';
import { exportGif } from './services/gifExporter';
import { computeLayout } from './parser/layoutEngine';
import type { Graph, ChatMessage, LlmProvider } from './types';

const STORAGE_KEY = 'pulsegraph_deepseek_key';
const PROVIDER_KEY = 'pulsegraph_llm_provider';

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
  const [appState, setAppState] = useState<'idle' | 'active'>('idle');
  const [graph, setGraph] = useState<Graph | null>(null);
  const [mermaidSource, setMermaidSource] = useState('');
  const [showMermaid, setShowMermaid] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<LoadingStep>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const canvasContainerRef = useRef<HTMLDivElement>(null);

  const handleSaveConfig = (key: string, newProvider: LlmProvider) => {
    localStorage.setItem(STORAGE_KEY, key);
    localStorage.setItem(PROVIDER_KEY, newProvider);
    setApiKey(key);
    setProvider(newProvider);
  };

  const handleResetConfig = () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PROVIDER_KEY);
    setApiKey('');
    setProvider('deepseek');
  };

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
        const result = await sendMessage(userText, messages, graph, apiKey, provider, (step) => setLoadingStep(step));

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
          if (appState === 'idle') setAppState('active');
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setError(msg);
        setMessages([...newHistory, { id: getId(), role: 'assistant', content: `⚠️ Error: ${msg}`, timestamp: new Date() }]);
      } finally {
        setIsLoading(false);
        setLoadingStep(null);
      }
    },
    [apiKey, provider, appState, graph, isLoading, messages]
  );

  const handleIdleSubmit = () => { if (input.trim()) submitMessage(input); };

  const handleExport = async () => {
    if (!graph) return;
    let fileHandle: FileSystemFileHandle | null = null;
    if ('showSaveFilePicker' in window) {
      try {
        fileHandle = await (window as unknown as {
          showSaveFilePicker: (opts: object) => Promise<FileSystemFileHandle>;
        }).showSaveFilePicker({
          suggestedName: 'pulsegraph-flow.gif',
          types: [{ description: 'Animated GIF', accept: { 'image/gif': ['.gif'] } }],
        });
      } catch { return; }
    }
    setIsExporting(true); setExportProgress(0); setGifUrl(null);
    try {
      const url = await exportGif(graph, (pct) => setExportProgress(pct));
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
    } catch (err) { console.error('GIF export failed:', err); }
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
          <div className="active-provider">
            <span className="provider-dot" style={{ background: provider === 'deepseek' ? '#818CF8' : '#F472B6' }} />
            {provider === 'deepseek' ? 'DeepSeek' : 'Local Ollama'}
          </div>
          {appState === 'active' && (
            <>
              {mermaidSource && (
                <button className="btn-mermaid-toggle" onClick={() => setShowMermaid((v) => !v)}>
                  {showMermaid ? '▲ Hide Source' : '⟨/⟩ Mermaid Source'}
                </button>
              )}
              <p className="app-tagline">AI-powered architecture animation</p>
            </>
          )}
        </div>
      </header>

      {/* ── Canvas ── */}
      <div
        className={`canvas-section ${appState === 'active' ? 'canvas-section--visible' : ''}`}
        ref={canvasContainerRef}
      >
        {graph && <DiagramCanvas graph={graph} />}

        {/* Mermaid source panel */}
        {showMermaid && mermaidSource && (
          <div className="mermaid-panel">
            <div className="mermaid-panel-header">
              <span>Validated Mermaid Source</span>
              <button className="mermaid-copy-btn" onClick={handleCopyMermaid}>
                {copied ? '✓ Copied!' : '⎘ Copy'}
              </button>
            </div>
            <pre className="mermaid-panel-code">{mermaidSource}</pre>
          </div>
        )}
      </div>

      {/* ── GIF Ready Toast ── */}
      {gifUrl && (
        <div className="gif-toast">
          <span>🎉 GIF ready!</span>
          <a href={gifUrl} download="pulsegraph-flow.gif" className="gif-toast-btn"
            onClick={() => setTimeout(() => setGifUrl(null), 500)}>
            ⬇ Download pulsegraph-flow.gif
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

      {/* ── Active chat panel ── */}
      {appState === 'active' && (
        <ChatPanel
          messages={messages}
          isLoading={isLoading}
          loadingStep={loadingStep}
          input={input}
          onInputChange={setInput}
          onSubmit={() => submitMessage(input)}
          onExportGif={handleExport}
          isExporting={isExporting}
          exportProgress={exportProgress}
          onResetKey={handleResetConfig}
        />
      )}
    </div>
  );
}

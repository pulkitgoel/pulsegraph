import { useRef, useEffect } from 'react';
import type { ChatMessage } from '../types';
import type { LoadingStep } from '../App';

interface Props {
  messages: ChatMessage[];
  isLoading: boolean;
  loadingStep: LoadingStep;
  input: string;
  onInputChange: (val: string) => void;
  onSubmit: () => void;
  onExportGif: () => void;
  isExporting: boolean;
  exportProgress: number;
  onResetKey: () => void;
}

const STEP_LABELS: Record<NonNullable<LoadingStep>, string> = {
  generating: '🧠 Generating diagram…',
  validating: '✅ Validating…',
  rendering:  '🎨 Rendering…',
};

export function ChatPanel({
  messages, isLoading, loadingStep, input, onInputChange,
  onSubmit, onExportGif, isExporting, exportProgress, onResetKey,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!isLoading) onSubmit(); }
  };

  return (
    <div className="chat-panel">
      {/* Toolbar */}
      <div className="chat-toolbar">
        <span className="chat-toolbar-title">
          <span className="chat-toolbar-dot" />
          Architecture Chat
        </span>
        <div className="chat-toolbar-actions">
          {isExporting ? (
            <div className="export-progress">
              <div className="export-progress-bar" style={{ width: `${exportProgress}%` }} />
              <span>Encoding GIF… {exportProgress}%</span>
            </div>
          ) : (
            <button id="export-gif-btn" className="btn-export" onClick={onExportGif}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              Export GIF
            </button>
          )}
          <button id="reset-key-btn" className="btn-icon" onClick={onResetKey} title="Change AI Model / API Key">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Message thread */}
      <div className="chat-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-bubble chat-bubble--${msg.role}`}>
            <div className="chat-bubble-avatar">{msg.role === 'user' ? '🧑‍💻' : '⚡'}</div>
            <div className="chat-bubble-content">{msg.content}</div>
          </div>
        ))}

        {/* 3-step loading indicator */}
        {isLoading && (
          <div className="chat-bubble chat-bubble--assistant">
            <div className="chat-bubble-avatar">⚡</div>
            <div className="chat-bubble-content">
              {loadingStep ? (
                <div className="loading-steps">
                  {(['generating', 'validating', 'rendering'] as NonNullable<LoadingStep>[]).map((step) => {
                    const steps = ['generating', 'validating', 'rendering'] as NonNullable<LoadingStep>[];
                    const currentIdx = loadingStep ? steps.indexOf(loadingStep) : -1;
                    const stepIdx = steps.indexOf(step);
                    const isDone = stepIdx < currentIdx;
                    const isActive = step === loadingStep;
                    return (
                      <div key={step} className={`loading-step ${isActive ? 'active' : isDone ? 'done' : 'pending'}`}>
                        <span className="loading-step-icon">
                          {isDone ? '✓' : isActive ? '●' : '○'}
                        </span>
                        <span>{STEP_LABELS[step]}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <span className="thinking-dots"><span /><span /><span /></span>
              )}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="chat-input-row">
        <textarea
          id="chat-input"
          className="chat-input"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Refine your diagram… (e.g. 'Add a Redis cache between the gateway and database')"
          rows={2}
          disabled={isLoading}
        />
        <button id="chat-send-btn" className="btn-send" onClick={onSubmit} disabled={isLoading || !input.trim()}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

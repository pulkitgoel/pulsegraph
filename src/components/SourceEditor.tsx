import { useState } from 'react';

interface SourceEditorProps {
  source: string;
  disabled: boolean;
  onApply: (source: string) => void;
  onClose: () => void;
}

export function SourceEditor({ source, disabled, onApply, onClose }: SourceEditorProps) {
  const [draft, setDraft] = useState(source);

  return (
    <section className="mermaid-panel" aria-label="Mermaid source editor">
      <div className="mermaid-panel-header">
        <label htmlFor="mermaid-source">Edit Mermaid</label>
        <button className="btn-icon" onClick={onClose} aria-label="Close source editor">
          ×
        </button>
      </div>
      <textarea
        id="mermaid-source"
        className="source-editor"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        spellCheck={false}
        maxLength={30_000}
        disabled={disabled}
      />
      <div className="source-actions">
        <span>Ctrl/⌘ + Enter in chat to keep new lines.</span>
        <button
          className="btn-primary"
          disabled={disabled || !draft.trim()}
          onClick={() => onApply(draft)}
        >
          Apply source
        </button>
      </div>
    </section>
  );
}

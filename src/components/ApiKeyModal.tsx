import { useEffect, useRef, useState } from 'react';
import type { LlmProvider, OllamaModel } from '../types';

interface Props {
  provider: LlmProvider;
  model: OllamaModel;
  hasApiKey: boolean;
  onSave: (key: string, provider: LlmProvider, model: OllamaModel) => void;
  onReset: () => void;
  onClose: () => void;
}

export function ApiKeyModal({
  provider: initialProvider,
  model,
  hasApiKey,
  onSave,
  onReset,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [provider, setProvider] = useState(initialProvider);
  const [key, setKey] = useState('');
  const [ollamaModel, setOllamaModel] = useState(model);
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  function save(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = key.trim();
    if (
      provider === 'deepseek' &&
      ((!trimmed && !hasApiKey) ||
        [...trimmed].some(
          (character) => character.charCodeAt(0) < 33 || character.charCodeAt(0) > 126,
        ))
    ) {
      setError('Enter a valid API key using printable characters without spaces.');
      return;
    }
    onSave(provider === 'deepseek' ? trimmed : '', provider, ollamaModel);
  }

  return (
    <dialog
      ref={dialogRef}
      className="settings-dialog"
      aria-labelledby="settings-title"
      onCancel={onClose}
    >
      <form className="modal-box" onSubmit={save}>
        <div className="mermaid-panel-header">
          <h2 id="settings-title">AI settings</h2>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            aria-label="Close AI settings"
          >
            ×
          </button>
        </div>
        <p className="modal-subtitle">
          Mermaid editing works without an account or AI key.
        </p>
        <p className={'credential-status ' + (hasApiKey ? 'configured' : '')}>
          <span aria-hidden="true">{hasApiKey ? '●' : '○'}</span>
          {hasApiKey
            ? 'DeepSeek key configured for this tab'
            : 'No DeepSeek key configured'}
        </p>
        <label className="modal-field">
          Provider
          <select
            value={provider}
            onChange={(event) => setProvider(event.target.value as LlmProvider)}
          >
            <option value="deepseek">DeepSeek (cloud)</option>
            <option value="ollama">Ollama (local)</option>
          </select>
        </label>
        {provider === 'deepseek' ? (
          <label className="modal-field">
            DeepSeek API key
            <input
              type="password"
              autoComplete="off"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              placeholder={hasApiKey ? 'Key configured — leave blank to keep it' : 'sk-…'}
            />
            <small>
              Your key is kept in memory until this page closes. Requests go directly to
              DeepSeek.
            </small>
          </label>
        ) : (
          <label className="modal-field">
            Installed Ollama model
            <input
              value={ollamaModel}
              onChange={(event) => setOllamaModel(event.target.value)}
              maxLength={100}
              required
              pattern="[A-Za-z0-9._:/-]+"
            />
            <small>
              Ollama must run at localhost:11434 and allow this page's origin. No external
              font requests are made.
            </small>
          </label>
        )}
        {error && (
          <p role="alert" className="error-msg">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button className="btn-primary" type="submit">
            Save AI settings
          </button>
          <button
            className="btn-reset-settings"
            type="button"
            onClick={onReset}
            disabled={!hasApiKey && initialProvider === 'deepseek'}
          >
            Reset AI settings
          </button>
        </div>
        <button className="btn-change-provider" type="button" onClick={onClose}>
          Continue without AI
        </button>
      </form>
    </dialog>
  );
}

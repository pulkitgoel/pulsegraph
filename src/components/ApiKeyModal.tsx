import React, { useState } from 'react';
import type { LlmProvider } from '../types';

interface Props {
  onSave: (key: string, provider: LlmProvider) => void;
}

export const ApiKeyModal: React.FC<Props> = ({ onSave }) => {
  const [key, setKey] = useState('');
  const [provider, setProvider] = useState<LlmProvider>('deepseek');
  const [error, setError] = useState('');

  const handleSave = () => {
    if (provider === 'deepseek') {
      const trimmed = key.trim();
      if (!trimmed) {
        setError('Please enter your DeepSeek API key.');
        return;
      }
      onSave(trimmed, 'deepseek');
    } else {
      onSave('', 'ollama');
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-box">
        <div className="modal-logo">
          <span className="modal-icon">⚡</span>
          <h2>PulseGraph</h2>
        </div>
        
        <div className="provider-tabs">
          <button 
            className={`provider-tab ${provider === 'deepseek' ? 'active' : ''}`}
            onClick={() => setProvider('deepseek')}
          >
            DeepSeek (Cloud)
          </button>
          <button 
            className={`provider-tab ${provider === 'ollama' ? 'active' : ''}`}
            onClick={() => setProvider('ollama')}
          >
            Ollama (Local)
          </button>
        </div>

        {provider === 'deepseek' ? (
          <>
            <p className="modal-subtitle">
              Connect your DeepSeek API key to start building animated architecture diagrams with AI.
            </p>
            <div className="modal-field">
              <label htmlFor="api-key-input">DeepSeek API Key</label>
              <input
                id="api-key-input"
                type="password"
                placeholder="sk-..."
                value={key}
                onChange={(e) => { setKey(e.target.value); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              />
              {error && <span className="modal-error">{error}</span>}
            </div>
            <a
              href="https://platform.deepseek.com/api_keys"
              target="_blank"
              rel="noopener noreferrer"
              className="modal-link"
            >
              Get a DeepSeek API key →
            </a>
          </>
        ) : (
          <div className="ollama-info">
            <p className="modal-subtitle">
              Use your local Ollama instance for complete privacy and free processing.
            </p>
            <ul className="ollama-requirements">
              <li>Ensure Ollama is running on <code>localhost:11434</code></li>
              <li>Make sure <code>gemma3:4b</code> is installed (<code>ollama pull gemma3:4b</code>)</li>
              <li>Enable CORS if running in a browser environment</li>
            </ul>
            <p className="modal-note">
              Note: Local models may be slower than cloud APIs depending on your hardware.
            </p>
          </div>
        )}

        <button id="api-key-save" className="btn-primary" onClick={handleSave}>
          {provider === 'ollama' ? 'Use Local Model' : 'Start Building'}
        </button>
        
        <p className="modal-note">
          🔒 {provider === 'deepseek' 
            ? "Your key is stored only in your browser's localStorage and sent directly to DeepSeek."
            : "No data leaves your machine. PulseGraph connects directly to your local Ollama server."}
        </p>
      </div>
    </div>
  );
};

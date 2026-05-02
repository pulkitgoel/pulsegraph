import React, { useState } from 'react';

interface Props {
  onSave: (key: string) => void;
}

export const ApiKeyModal: React.FC<Props> = ({ onSave }) => {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');

  const handleSave = () => {
    const trimmed = key.trim();
    if (!trimmed) {
      setError('Please enter your DeepSeek API key.');
      return;
    }
    onSave(trimmed);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-box">
        <div className="modal-logo">
          <span className="modal-icon">⚡</span>
          <h2>PulseGraph</h2>
        </div>
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
          Get a free DeepSeek API key →
        </a>
        <button id="api-key-save" className="btn-primary" onClick={handleSave}>
          Start Building
        </button>
        <p className="modal-note">
          🔒 Your key is stored only in your browser's localStorage and sent directly to DeepSeek.
        </p>
      </div>
    </div>
  );
};

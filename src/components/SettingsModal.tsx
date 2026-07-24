import { useState } from "react";
import type { AgentSettings, ProviderPreset } from "../types";
import { PROVIDER_PRESETS } from "../storage";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: AgentSettings;
  onSave: (newSettings: AgentSettings) => void;
}

export default function SettingsModal({ isOpen, onClose, settings, onSave }: Props) {
  const [useRemote, setUseRemote] = useState(settings.useRemote);
  const [provider, setProvider] = useState<ProviderPreset>(settings.provider || "openai");
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [model, setModel] = useState(settings.model);

  if (!isOpen) return null;

  const handleProviderChange = (p: ProviderPreset) => {
    setProvider(p);
    const preset = PROVIDER_PRESETS[p];
    if (preset) {
      setBaseUrl(preset.baseUrl);
      setModel(preset.defaultModel);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      useRemote,
      provider,
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      model: model.trim(),
    });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>⚙️ Agent Settings</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} className="modal-body">
          <div className="form-group toggle-group">
            <label htmlFor="use-remote-toggle" className="toggle-label">
              <span>Enable Remote LLM</span>
              <small>Use a live model API (OpenAI, Groq, Ollama) instead of local skills</small>
            </label>
            <input
              id="use-remote-toggle"
              type="checkbox"
              checked={useRemote}
              onChange={(e) => setUseRemote(e.target.checked)}
            />
          </div>

          {useRemote && (
            <>
              <div className="form-group">
                <label htmlFor="provider-select">Provider Preset</label>
                <select
                  id="provider-select"
                  value={provider}
                  onChange={(e) => handleProviderChange(e.target.value as ProviderPreset)}
                >
                  {Object.entries(PROVIDER_PRESETS).map(([key, info]) => (
                    <option key={key} value={key}>
                      {info.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="base-url-input">API Base URL</label>
                <input
                  id="base-url-input"
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                  required={useRemote}
                />
              </div>

              {PROVIDER_PRESETS[provider]?.needsKey && (
                <div className="form-group">
                  <label htmlFor="api-key-input">API Key</label>
                  <input
                    id="api-key-input"
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    required={useRemote && PROVIDER_PRESETS[provider]?.needsKey}
                  />
                  <small className="help-text">Saved locally in your browser. Never sent elsewhere.</small>
                </div>
              )}

              <div className="form-group">
                <label htmlFor="model-input">Model Name</label>
                <input
                  id="model-input"
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g. gpt-4o-mini, llama3, llama-3.1-8b-instant"
                  required={useRemote}
                />
              </div>
            </>
          )}

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save Settings
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'preact/hooks';
import { loadConfig, saveConfig } from '../../../data/config';
import { db } from '../../../db';

export default function Settings() {
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    const cfg = loadConfig();
    setBaseUrl(cfg.baseUrl);
    setApiKey(cfg.apiKey);
    setModel(cfg.model);
  }, []);

  const onSubmit = async (e: Event) => {
    e.preventDefault();
    const cfg = { baseUrl, apiKey, model };
    saveConfig(cfg);
    try {
      await db.saveSettings(cfg);
      setStatus('Saved');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section id="settings">
      <h2>Provider settings</h2>
      <form onSubmit={onSubmit}>
        <div>
          <label htmlFor="base-url">Base URL</label>
          <input
            id="base-url"
            type="text"
            value={baseUrl}
            onInput={(e) => setBaseUrl(e.currentTarget.value)}
          />
        </div>
        <div>
          <label htmlFor="api-key">API key</label>
          <input
            id="api-key"
            type="password"
            value={apiKey}
            onInput={(e) => setApiKey(e.currentTarget.value)}
          />
        </div>
        <div>
          <label htmlFor="model">Model</label>
          <input
            id="model"
            type="text"
            value={model}
            onInput={(e) => setModel(e.currentTarget.value)}
          />
        </div>
        <button type="submit">Save</button>
      </form>
      <p role="status">{status}</p>
    </section>
  );
}
import { useEffect, useState } from 'preact/hooks';
import { loadConfig, saveConfig, loadSyncConfig, saveSyncConfig } from '../../../data/config';
import { db } from '../../../db';

type SyncState = {
  endpoint: string;
  region: string;
  bucket: string;
  path: string;
  accessKey: string;
  secretKey: string;
};

function emptySync(): SyncState {
  return { endpoint: '', region: 'us-east-1', bucket: '', path: 'inventory.sqlite', accessKey: '', secretKey: '' };
}

export default function Settings() {
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [supportsResponseFormat, setSupportsResponseFormat] = useState(false);
  const [status, setStatus] = useState('');

  const [sync, setSync] = useState<SyncState>(emptySync());
  const [syncStatus, setSyncStatus] = useState('');

  useEffect(() => {
    const cfg = loadConfig();
    setBaseUrl(cfg.baseUrl);
    setApiKey(cfg.apiKey);
    setModel(cfg.model);
    setSupportsResponseFormat(cfg.supportsResponseFormat);
    setSync(loadSyncConfig());
  }, []);

  const onSubmit = async (e: Event) => {
    e.preventDefault();
    const cfg = { baseUrl, apiKey, model, supportsResponseFormat };
    saveConfig(cfg);
    try {
      await db.saveSettings(cfg);
      setStatus('Saved');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  };

  const onSyncSubmit = async (e: Event) => {
    e.preventDefault();
    saveSyncConfig(sync);
    try {
      await db.saveSyncSettings(sync);
      setSyncStatus('Saved');
    } catch (err) {
      setSyncStatus(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section id="settings">
      <h2>Provider settings</h2>
      <form onSubmit={onSubmit}>
        <div>
          <label htmlFor="base-url">Base URL</label>
          <input id="base-url" type="text" value={baseUrl} onInput={(e) => setBaseUrl(e.currentTarget.value)} />
        </div>
        <div>
          <label htmlFor="api-key">API key</label>
          <input id="api-key" type="password" value={apiKey} onInput={(e) => setApiKey(e.currentTarget.value)} />
        </div>
        <div>
          <label htmlFor="model">Model</label>
          <input id="model" type="text" value={model} onInput={(e) => setModel(e.currentTarget.value)} />
        </div>
        <div>
          <label htmlFor="supports-response-format">
            <input
              id="supports-response-format"
              type="checkbox"
              checked={supportsResponseFormat}
              onChange={(e) => setSupportsResponseFormat(e.currentTarget.checked)}
            />{' '}
            Model supports response_format (json_schema)
          </label>
        </div>
        <button type="submit">Save</button>
      </form>
      <p role="status">{status}</p>

      <h2>Cloud sync</h2>
      <form onSubmit={onSyncSubmit}>
        <div>
          <label htmlFor="sync-endpoint">Endpoint</label>
          <input
            id="sync-endpoint"
            type="text"
            placeholder="https://s3.amazonaws.com"
            value={sync.endpoint}
            onInput={(e) => setSync({ ...sync, endpoint: e.currentTarget.value })}
          />
        </div>
        <div>
          <label htmlFor="sync-region">Region</label>
          <input
            id="sync-region"
            type="text"
            value={sync.region}
            onInput={(e) => setSync({ ...sync, region: e.currentTarget.value })}
          />
        </div>
        <div>
          <label htmlFor="sync-bucket">Bucket</label>
          <input
            id="sync-bucket"
            type="text"
            value={sync.bucket}
            onInput={(e) => setSync({ ...sync, bucket: e.currentTarget.value })}
          />
        </div>
        <div>
          <label htmlFor="sync-path">Object key</label>
          <input
            id="sync-path"
            type="text"
            value={sync.path}
            onInput={(e) => setSync({ ...sync, path: e.currentTarget.value })}
          />
        </div>
        <div>
          <label htmlFor="sync-access">Access key</label>
          <input
            id="sync-access"
            type="text"
            value={sync.accessKey}
            onInput={(e) => setSync({ ...sync, accessKey: e.currentTarget.value })}
          />
        </div>
        <div>
          <label htmlFor="sync-secret">Secret key</label>
          <input
            id="sync-secret"
            type="password"
            value={sync.secretKey}
            onInput={(e) => setSync({ ...sync, secretKey: e.currentTarget.value })}
          />
        </div>
        <button type="submit">Save</button>
      </form>
      <p role="status">{syncStatus}</p>

      <h2>Encryption</h2>
      <p>
        Your database is encrypted with a passphrase you provide when uploading or restoring. It
        is never stored anywhere - keep it safe, as a lost passphrase means an unrecoverable backup.
      </p>
    </section>
  );
}
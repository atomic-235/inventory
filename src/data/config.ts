import { SettingsSchema, SyncConfigSchema, type ProviderConfig, type SyncConfig } from '../domain/settings';

const KEY = 'inventory.provider';
const SYNC_KEY = 'inventory.sync';

export function loadConfig(): ProviderConfig {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    try {
      return SettingsSchema.parse(JSON.parse(raw));
    } catch {
      /* fall through to defaults */
    }
  }
  return SettingsSchema.parse({});
}

export function saveConfig(config: ProviderConfig): void {
  localStorage.setItem(KEY, JSON.stringify(config));
}

export function loadSyncConfig(): SyncConfig {
  const raw = localStorage.getItem(SYNC_KEY);
  if (!raw) return { endpoint: '', region: 'us-east-1', bucket: '', path: 'inventory.sqlite', accessKey: '', secretKey: '' };
  try {
    return SyncConfigSchema.parse(JSON.parse(raw));
  } catch {
    return { endpoint: '', region: 'us-east-1', bucket: '', path: 'inventory.sqlite', accessKey: '', secretKey: '' };
  }
}

export function saveSyncConfig(config: SyncConfig): void {
  localStorage.setItem(SYNC_KEY, JSON.stringify(config));
}
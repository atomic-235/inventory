import { SettingsSchema, type ProviderConfig } from '../domain/settings';

const KEY = 'inventory.provider';

export function loadConfig(): ProviderConfig {
  const raw = localStorage.getItem(KEY);
  if (!raw) return { baseUrl: '', apiKey: '', model: '' };
  try {
    return SettingsSchema.parse(JSON.parse(raw));
  } catch {
    return { baseUrl: '', apiKey: '', model: '' };
  }
}

export function saveConfig(config: ProviderConfig): void {
  localStorage.setItem(KEY, JSON.stringify(config));
}
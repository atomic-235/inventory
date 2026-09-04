import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { SyncConfig, SyncConfigSchema } from '@inventory/core';

function configDir(): string {
  return process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
}

function dataDir(): string {
  return process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share');
}

export function configPath(): string {
  return join(configDir(), 'inventory', 'config.json');
}

export function dbPath(): string {
  return join(dataDir(), 'inventory', 'inventory.db');
}

export function loadConfig(): SyncConfig {
  let cfg: SyncConfig;
  const p = configPath();
  if (existsSync(p)) {
    try {
      cfg = SyncConfigSchema.parse(JSON.parse(readFileSync(p, 'utf8')));
    } catch {
      cfg = SyncConfigSchema.parse({});
    }
  } else {
    cfg = SyncConfigSchema.parse({});
  }

  const env = process.env;
  cfg.endpoint = env.AWS_ENDPOINT_URL_S3 ?? env.AWS_ENDPOINT_URL ?? env.S3_ENDPOINT ?? cfg.endpoint;
  cfg.region = env.AWS_REGION ?? env.AWS_DEFAULT_REGION ?? cfg.region;
  cfg.accessKey = env.AWS_ACCESS_KEY_ID ?? cfg.accessKey;
  cfg.secretKey = env.AWS_SECRET_ACCESS_KEY ?? cfg.secretKey;
  cfg.bucket = env.S3_BUCKET ?? cfg.bucket;
  cfg.path = env.S3_OBJECT_KEY ?? cfg.path;
  return cfg;
}

export function saveConfig(cfg: SyncConfig): void {
  const p = configPath();
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, JSON.stringify(cfg, null, 2));
}

export function ensureDataDir(): void {
  const p = dbPath();
  mkdirSync(join(p, '..'), { recursive: true });
}

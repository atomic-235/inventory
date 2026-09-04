import type { SyncConfig } from './config';

function toHex(buf: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(data: Uint8Array<ArrayBuffer> | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return toHex(await crypto.subtle.digest('SHA-256', bytes));
}

async function hmacBytes(key: Uint8Array<ArrayBuffer>, data: string): Promise<Uint8Array<ArrayBuffer>> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

async function signingKey(secret: string, date: string, region: string): Promise<Uint8Array<ArrayBuffer>> {
  const kDate = await hmacBytes(new TextEncoder().encode(`AWS4${secret}`), date);
  const kRegion = await hmacBytes(kDate, region);
  const kService = await hmacBytes(kRegion, 's3');
  return hmacBytes(kService, 'aws4_request');
}

export const EMPTY_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

function encodeKeyPath(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}

function assertConfigured(cfg: SyncConfig): void {
  if (!cfg.endpoint || !cfg.bucket || !cfg.path || !cfg.accessKey || !cfg.secretKey) {
    throw new Error('Sync is not fully configured. Set endpoint, bucket, path, access key and secret key.');
  }
}

function objectUrl(cfg: SyncConfig): string {
  const base = cfg.endpoint.replace(/\/+$/, '');
  return `${base}/${cfg.bucket}/${encodeKeyPath(cfg.path)}`;
}

export async function signRequest(
  cfg: SyncConfig,
  method: 'GET' | 'PUT',
  payloadHash: string,
  now: Date = new Date(),
): Promise<{ url: string; headers: Record<string, string> }> {
  assertConfigured(cfg);
  const url = objectUrl(cfg);
  const u = new URL(url);
  const host = u.host;
  const canonicalUri = encodeKeyPath(`${cfg.bucket}/${cfg.path}`).replace(/^/, '/');

  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const scope = `${date}/${cfg.region}/s3/aws4_request`;

  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalHeaders =
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;

  const canonicalRequest =
    `${method}\n` +
    `${canonicalUri}\n` +
    `\n` +
    `${canonicalHeaders}\n` +
    `${signedHeaders}\n` +
    `${payloadHash}`;

  const stringToSign =
    `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${await sha256Hex(canonicalRequest)}`;

  const key = await signingKey(cfg.secretKey, date, cfg.region);
  const sig = toHex(await hmacBytes(key, stringToSign));

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${sig}`;

  return {
    url,
    headers: {
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      authorization,
    },
  };
}

export async function putObject(cfg: SyncConfig, body: Uint8Array<ArrayBuffer>): Promise<void> {
  const payloadHash = await sha256Hex(body);
  const { url, headers } = await signRequest(cfg, 'PUT', payloadHash);
  const res = await fetch(url, { method: 'PUT', headers, body });
  if (!res.ok) {
    throw new Error(`S3 upload failed (${res.status} ${res.statusText})`);
  }
}

export async function getObject(cfg: SyncConfig): Promise<Uint8Array<ArrayBuffer>> {
  const { url, headers } = await signRequest(cfg, 'GET', EMPTY_HASH);
  const res = await fetch(url, { method: 'GET', headers });
  if (!res.ok) {
    throw new Error(`S3 download failed (${res.status} ${res.statusText})`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

export async function getObjectOptional(cfg: SyncConfig): Promise<Uint8Array<ArrayBuffer> | null> {
  const { url, headers } = await signRequest(cfg, 'GET', EMPTY_HASH);
  const res = await fetch(url, { method: 'GET', headers });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`S3 download failed (${res.status} ${res.statusText})`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

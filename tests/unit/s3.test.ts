import { describe, it, expect } from 'vitest';
import { createHmac, createHash } from 'node:crypto';
import { signRequest, EMPTY_HASH } from '../../src/data/s3';
import type { SyncConfig } from '../../src/domain/settings';

const cfg: SyncConfig = {
  endpoint: 'https://s3.amazonaws.com',
  region: 'us-east-1',
  bucket: 'my-bucket',
  path: 'inventory.sqlite',
  accessKey: 'AKIDEXAMPLE',
  secretKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
};

const now = new Date('2013-05-24T00:00:00Z');
const AMZ_DATE = '20130524T000000Z';
const SCOPE = '20130524/us-east-1/s3/aws4_request';

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

function sha256hex(str: string): string {
  return createHash('sha256').update(str).digest('hex');
}

function expectedSignature(method: 'GET' | 'PUT', payloadHash: string): string {
  const canonicalRequest =
    `${method}\n` +
    `/my-bucket/inventory.sqlite\n` +
    `\n` +
    `host:s3.amazonaws.com\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${AMZ_DATE}\n` +
    `\n` +
    `host;x-amz-content-sha256;x-amz-date\n` +
    `${payloadHash}`;

  const stringToSign =
    `AWS4-HMAC-SHA256\n${AMZ_DATE}\n${SCOPE}\n${sha256hex(canonicalRequest)}`;

  const kDate = hmac(`AWS4${cfg.secretKey}`, '20130524');
  const kRegion = hmac(kDate, 'us-east-1');
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  return hmac(kSigning, stringToSign).toString('hex');
}

describe('signRequest', () => {
  it('produces a signature matching an independent node:crypto oracle (GET)', async () => {
    const { url, headers } = await signRequest(cfg, 'GET', EMPTY_HASH, now);
    expect(url).toBe('https://s3.amazonaws.com/my-bucket/inventory.sqlite');
    expect(headers['x-amz-date']).toBe(AMZ_DATE);
    const sig = /Signature=([0-9a-f]+)/.exec(headers.authorization)?.[1];
    expect(sig).toBe(expectedSignature('GET', EMPTY_HASH));
  });

  it('produces a signature matching an independent node:crypto oracle (PUT)', async () => {
    const payloadHash = sha256hex('some sqlite bytes');
    const { headers } = await signRequest(cfg, 'PUT', payloadHash, now);
    const sig = /Signature=([0-9a-f]+)/.exec(headers.authorization)?.[1];
    expect(sig).toBe(expectedSignature('PUT', payloadHash));
  });

  it('is deterministic for a fixed timestamp', async () => {
    const a = await signRequest(cfg, 'GET', EMPTY_HASH, now);
    const b = await signRequest(cfg, 'GET', EMPTY_HASH, now);
    expect(a.headers.authorization).toBe(b.headers.authorization);
  });

  it('throws when config is incomplete', async () => {
    await expect(signRequest({ ...cfg, secretKey: '' }, 'GET', EMPTY_HASH, now)).rejects.toThrow(
      /not fully configured/,
    );
  });
});
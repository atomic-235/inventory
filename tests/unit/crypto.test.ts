import { describe, it, expect } from 'vitest';
import { encryptBytes, decryptBytes } from '../../src/data/crypto';

const passphrase = 'correct horse battery staple';

describe('encryptBytes / decryptBytes', () => {
  it('round-trips bytes through a passphrase-derived AES-GCM key', async () => {
    const data = new TextEncoder().encode('hello inventory');
    const encrypted = await encryptBytes(passphrase, data);
    expect(encrypted[0]).toBe(0x49); // "I" of INVENC
    const decrypted = await decryptBytes(passphrase, encrypted);
    expect(new TextDecoder().decode(decrypted)).toBe('hello inventory');
  });

  it('produces different ciphertext each time (random salt + iv)', async () => {
    const data = new TextEncoder().encode('same payload');
    const a = await encryptBytes(passphrase, data);
    const b = await encryptBytes(passphrase, data);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it('rejects a tampered payload', async () => {
    const data = new TextEncoder().encode('secret');
    const encrypted = await encryptBytes(passphrase, data);
    encrypted[encrypted.length - 1] ^= 0xff;
    await expect(decryptBytes(passphrase, encrypted)).rejects.toThrow(/Decryption failed/);
  });

  it('rejects decryption with the wrong passphrase', async () => {
    const data = new TextEncoder().encode('secret');
    const encrypted = await encryptBytes(passphrase, data);
    await expect(decryptBytes('wrong passphrase', encrypted)).rejects.toThrow(/Decryption failed/);
  });

  it('rejects a non-encrypted payload', async () => {
    await expect(decryptBytes(passphrase, new TextEncoder().encode('not encrypted'))).rejects.toThrow(
      /Not a valid encrypted file/,
    );
  });
});
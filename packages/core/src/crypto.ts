const MAGIC = [0x49, 0x4e, 0x56, 0x45, 0x4e, 0x43]; // "INVENC"
const VERSION = 2;
const SALT_LEN = 16;
const IV_LEN = 12;
const ITERATIONS = 600_000;
const KEY_USAGES: KeyUsage[] = ['encrypt', 'decrypt'];

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    KEY_USAGES,
  );
}

export async function encryptBytes(
  passphrase: string,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const key = await deriveKey(passphrase, salt);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, data),
  );
  const out = new Uint8Array(MAGIC.length + 1 + SALT_LEN + IV_LEN + ct.length);
  let o = 0;
  out.set(MAGIC, o);
  o += MAGIC.length;
  out[o++] = VERSION;
  out.set(salt, o);
  o += salt.length;
  out.set(iv, o);
  o += iv.length;
  out.set(ct, o);
  return out;
}

export async function decryptBytes(
  passphrase: string,
  payload: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  if (payload.length < MAGIC.length + 1 + SALT_LEN + IV_LEN + 16) {
    throw new Error('Not a valid encrypted file');
  }
  for (let i = 0; i < MAGIC.length; i++) {
    if (payload[i] !== MAGIC[i]) throw new Error('Not a valid encrypted file');
  }
  const version = payload[MAGIC.length];
  if (version !== VERSION) throw new Error(`Unsupported encryption version ${version}`);

  const saltOffset = MAGIC.length + 1;
  const ivOffset = saltOffset + SALT_LEN;
  const salt = payload.slice(saltOffset, ivOffset);
  const iv = payload.slice(ivOffset, ivOffset + IV_LEN);
  const ct = payload.slice(ivOffset + IV_LEN);

  const key = await deriveKey(passphrase, salt);
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, ct),
    );
  } catch {
    throw new Error('Decryption failed (wrong passphrase or corrupted data)');
  }
}

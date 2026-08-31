import { db } from '../db';
import type { SyncConfig } from '../domain/settings';
import { encryptBytes, decryptBytes } from './crypto';
import { putObject, getObject } from './s3';

export async function uploadToCloud(cfg: SyncConfig, passphrase: string): Promise<void> {
  const blob = await db.exportDatabase();
  const encrypted = await encryptBytes(passphrase, blob);
  await putObject(cfg, encrypted);
}

export async function restoreFromCloud(cfg: SyncConfig, passphrase: string): Promise<void> {
  const encrypted = await getObject(cfg);
  const blob = await decryptBytes(passphrase, encrypted);
  await db.importDatabase(blob);
}
import { db } from '../db';
import type { SyncConfig } from '../domain/settings';
import { mergeItems } from '../domain/merge';
import { encryptBytes, decryptBytes } from './crypto';
import { putObject, getObject, getObjectOptional } from './s3';

export async function syncCloud(cfg: SyncConfig, passphrase: string): Promise<void> {
  const remoteBlob = await getObjectOptional(cfg);
  let remoteItems: Awaited<ReturnType<typeof db.readBlobItems>> = [];
  let remoteSettings: Record<string, string> = {};
  if (remoteBlob) {
    const decrypted = await decryptBytes(passphrase, remoteBlob);
    remoteItems = await db.readBlobItems(decrypted);
    remoteSettings = await db.readBlobSettings(decrypted);
  }
  const localItems = await db.listAllItems();
  const merged = mergeItems(localItems, remoteItems);
  await db.replaceItems(merged);
  await db.mergeSettings(remoteSettings);
  const blob = await db.exportDatabase();
  await putObject(cfg, await encryptBytes(passphrase, blob));
}

export async function restoreFromCloud(cfg: SyncConfig, passphrase: string): Promise<void> {
  const blob = await decryptBytes(passphrase, await getObject(cfg));
  await db.importDatabase(blob);
}
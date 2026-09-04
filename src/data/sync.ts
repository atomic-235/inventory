import { db } from '../db';
import type { SyncConfig } from '../domain/settings';
import { mergeItems } from '../domain/merge';
import { encryptBytes, decryptBytes } from './crypto';
import { putObject, getObject, getObjectOptional } from './s3';

export async function syncCloud(cfg: SyncConfig, passphrase: string): Promise<void> {
  const remoteBlob = await getObjectOptional(cfg);
  const remoteItems = remoteBlob ? await db.readBlobItems(await decryptBytes(passphrase, remoteBlob)) : [];
  const localItems = await db.listAllItems();
  const merged = mergeItems(localItems, remoteItems);
  await db.replaceItems(merged);
  const blob = await db.exportDatabase();
  await putObject(cfg, await encryptBytes(passphrase, blob));
}

export async function restoreFromCloud(cfg: SyncConfig, passphrase: string): Promise<void> {
  const blob = await decryptBytes(passphrase, await getObject(cfg));
  await db.importDatabase(blob);
}
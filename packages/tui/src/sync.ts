import { writeFileSync } from 'node:fs';
import {
  mergeItems,
  encryptBytes,
  decryptBytes,
  getObject,
  getObjectOptional,
  putObject,
  type SyncConfig,
} from '@inventory/core';
import { Db } from './db';

export async function syncCloud(db: Db, cfg: SyncConfig, passphrase: string): Promise<void> {
  const remoteBlob = await getObjectOptional(cfg);
  const remoteItems = remoteBlob
    ? db.readItemsFromBlob(await decryptBytes(passphrase, remoteBlob))
    : [];
  const localItems = db.listAllItems();
  db.replaceItems(mergeItems(localItems, remoteItems));
  await putObject(cfg, await encryptBytes(passphrase, db.exportBlob()));
}

export async function restoreCloud(dbPath: string, cfg: SyncConfig, passphrase: string): Promise<void> {
  const blob = await decryptBytes(passphrase, await getObject(cfg));
  writeFileSync(dbPath, blob);
}

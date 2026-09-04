import { writeFileSync, readFileSync, existsSync } from 'node:fs';
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
import { dbPath } from './config';

// Snapshot the live DB (a self-contained VACUUM copy) before any operation that
// rewrites it, so a failed sync/restore can never leave a wiped store behind.
function backupDb(db: Db): string {
  const dst = `${dbPath()}.bak-${Date.now()}`;
  writeFileSync(dst, db.exportBlob());
  return dst;
}

export async function syncCloud(db: Db, cfg: SyncConfig, passphrase: string): Promise<void> {
  const remoteBlob = await getObjectOptional(cfg);
  const remoteItems = remoteBlob
    ? db.readItemsFromBlob(await decryptBytes(passphrase, remoteBlob))
    : [];
  const localItems = db.listAllItems();
  backupDb(db);
  db.replaceItems(mergeItems(localItems, remoteItems));
  await putObject(cfg, await encryptBytes(passphrase, db.exportBlob()));
}

export async function restoreCloud(dbPath: string, cfg: SyncConfig, passphrase: string): Promise<void> {
  const blob = await decryptBytes(passphrase, await getObject(cfg));
  const dst = `${dbPath}.bak-${Date.now()}`;
  if (existsSync(dbPath)) writeFileSync(dst, readFileSync(dbPath));
  writeFileSync(dbPath, blob);
}

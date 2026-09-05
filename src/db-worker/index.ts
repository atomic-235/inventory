import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite-async.mjs';
import { Factory } from 'wa-sqlite';
import type { SQLiteAPI } from 'wa-sqlite';
import { OriginPrivateFileSystemVFS } from 'wa-sqlite/src/examples/OriginPrivateFileSystemVFS.js';
import { MIGRATIONS } from '../db/migrations';
import { RequestSchema } from '../db/protocol';
import type { Request } from '../db/protocol';
import { ItemSchema } from '../domain/item';
import { LOOKUP_TABLES } from '../domain/lookup';
import type { Item } from '../domain/item';
import type { Lookup, LookupTable } from '../domain/lookup';

const ctx = self as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((e: MessageEvent) => void) | null;
};

const ITEM_COLUMN: Record<LookupTable, string> = {
  categories: 'category_id',
  units: 'unit_id',
  conditions: 'condition_id',
};

let sqlite3: SQLiteAPI;
let db: number;

async function migrate(target: number): Promise<void> {
  const { rows } = await sqlite3.execWithParams(target, 'PRAGMA user_version');
  const version = Number(rows[0]?.[0] ?? 0);
  for (let i = version; i < MIGRATIONS.length; i++) {
    await sqlite3.run(target, MIGRATIONS[i]);
    await sqlite3.run(target, `PRAGMA user_version = ${i + 1}`);
  }
}

const CODE_BACKFILL_SQL = `UPDATE items SET code = (
  SELECT printf('%04d', rn) FROM (
    SELECT id, row_number() OVER (ORDER BY name COLLATE NOCASE, id) AS rn
    FROM items WHERE code = ''
  ) WHERE id = items.id
) WHERE code = '';`;

async function getSetting(target: number, key: string): Promise<string | null> {
  const { rows } = await sqlite3.execWithParams(target, `SELECT value FROM app_settings WHERE key = ?`, [key]);
  return rows[0]?.[0] != null ? String(rows[0][0]) : null;
}

async function backfillCodes(target: number): Promise<void> {
  if (await getSetting(target, 'code_backfilled')) return;
  await sqlite3.run(target, CODE_BACKFILL_SQL);
  await sqlite3.run(
    target,
    `INSERT INTO app_settings(key, value) VALUES ('code_backfilled', '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  );
}

const ready = (async () => {
  const module = await SQLiteESMFactory();
  sqlite3 = Factory(module);
  sqlite3.vfs_register(new OriginPrivateFileSystemVFS(), true);
  db = await sqlite3.open_v2('inventory', undefined, 'opfs');
  await migrate(db);
  await backfillCodes(db);
})();

function rowsToItems(rows: unknown[][], columns: string[]): Item[] {
  return rows.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return ItemSchema.parse(obj);
  });
}

async function resolveLookup(table: LookupTable, name: string): Promise<number | null> {
  if (!name) return null;
  await sqlite3.run(db, `INSERT OR IGNORE INTO ${table}(name) VALUES (?)`, [name]);
  const { rows } = await sqlite3.execWithParams(db, `SELECT id FROM ${table} WHERE name = ?`, [name]);
  return Number(rows[0][0]);
}

async function nextCode(): Promise<string> {
  const { rows } = await sqlite3.execWithParams(
    db,
    `SELECT MAX(CAST(code AS INTEGER)) FROM items WHERE code != ''`,
  );
  const m = Number(rows[0]?.[0] ?? 0);
  return String((Number.isFinite(m) ? m : 0) + 1).padStart(4, '0');
}

async function parentCategory(parentId?: string | null): Promise<string> {
  if (!parentId) return '';
  const { rows } = await sqlite3.execWithParams(
    db,
    `SELECT COALESCE(categories.name, '') FROM items
     LEFT JOIN categories ON items.category_id = categories.id
     WHERE items.id = ?`,
    [parentId],
  );
  return rows[0]?.[0] != null ? String(rows[0][0]) : '';
}

function lookupRowsToLookups(rows: unknown[][]): Lookup[] {
  return rows.map((row) => ({ id: Number(row[0]), name: String(row[1]) }));
}

function itemsSql(includeDeleted: boolean): string {
  const where = includeDeleted ? '' : 'WHERE items.deleted_at IS NULL';
  return `SELECT
    items.id AS id,
    items.name AS name,
    items.code AS code,
    COALESCE(categories.name, '') AS category,
    items.quantity AS quantity,
    COALESCE(units.name, '') AS unit,
    items.purchase_date AS purchase_date,
    items.purchase_price AS purchase_price,
    COALESCE(conditions.name, '') AS condition,
    items.notes AS notes,
    items.parent_id AS parent_id,
    items.updated_at AS updated_at,
    items.deleted_at AS deleted_at
    FROM items
    LEFT JOIN categories ON items.category_id = categories.id
    LEFT JOIN units ON items.unit_id = units.id
    LEFT JOIN conditions ON items.condition_id = conditions.id
    ${where}
    ORDER BY items.name`;
}

let tail: Promise<void> = Promise.resolve();

ctx.onmessage = (event: MessageEvent) => {
  const request = RequestSchema.parse(event.data);
  tail = tail.then(() => handle(request));
};

async function handle(request: Request): Promise<void> {
  try {
    await ready;

    switch (request.type) {
      case 'list': {
        const { rows, columns } = await sqlite3.execWithParams(db, itemsSql(false));
        ctx.postMessage({
          type: 'ok',
          requestId: request.requestId,
          data: rowsToItems(rows, columns),
        });
        break;
      }

      case 'listAllItems': {
        const { rows, columns } = await sqlite3.execWithParams(db, itemsSql(true));
        ctx.postMessage({
          type: 'ok',
          requestId: request.requestId,
          data: rowsToItems(rows, columns),
        });
        break;
      }

      case 'readBlobItems': {
        const root = await navigator.storage.getDirectory();
        const tmpName = 'read-items-tmp.sqlite';
        const tmpHandle = await root.getFileHandle(tmpName, { create: true });
        const tmpWritable = await tmpHandle.createWritable();
        await tmpWritable.write(request.data);
        await tmpWritable.close();

        let tmpDb: number | undefined;
        let rows: unknown[][] = [];
        let columns: string[] = [];
        try {
          tmpDb = await sqlite3.open_v2(tmpName, undefined, 'opfs');
          await migrate(tmpDb);
          const result = await sqlite3.execWithParams(tmpDb, itemsSql(true));
          rows = result.rows;
          columns = result.columns;
        } finally {
          if (tmpDb !== undefined) await sqlite3.close(tmpDb);
          try {
            await root.removeEntry(tmpName);
            await root.removeEntry(`${tmpName}-journal`);
          } catch {
            /* ignore */
          }
        }
        ctx.postMessage({
          type: 'ok',
          requestId: request.requestId,
          data: rowsToItems(rows, columns),
        });
        break;
      }

      case 'readBlobSettings': {
        const root = await navigator.storage.getDirectory();
        const tmpName = 'read-settings-tmp.sqlite';
        const tmpHandle = await root.getFileHandle(tmpName, { create: true });
        const tmpWritable = await tmpHandle.createWritable();
        await tmpWritable.write(request.data);
        await tmpWritable.close();

        let tmpDb: number | undefined;
        const settings: Record<string, string> = {};
        try {
          tmpDb = await sqlite3.open_v2(tmpName, undefined, 'opfs');
          await migrate(tmpDb);
          const { rows } = await sqlite3.execWithParams(tmpDb, 'SELECT key, value FROM app_settings');
          for (const row of rows) settings[String(row[0])] = String(row[1]);
        } finally {
          if (tmpDb !== undefined) await sqlite3.close(tmpDb);
          try {
            await root.removeEntry(tmpName);
            await root.removeEntry(`${tmpName}-journal`);
          } catch {
            /* ignore */
          }
        }
        ctx.postMessage({ type: 'ok', requestId: request.requestId, data: settings });
        break;
      }

      case 'mergeSettings': {
        for (const [key, value] of Object.entries(request.settings)) {
          const { rows } = await sqlite3.execWithParams(
            db,
            `SELECT value FROM app_settings WHERE key = ?`,
            [key],
          );
          if (!rows.length || rows[0][0] == null || String(rows[0][0]) === '') {
            await sqlite3.run(
              db,
              `INSERT INTO app_settings(key, value) VALUES (?, ?)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
              [key, value],
            );
          }
        }
        ctx.postMessage({ type: 'ok', requestId: request.requestId });
        break;
      }

      case 'replaceItems': {
        await sqlite3.run(db, 'DELETE FROM items');
        for (const item of request.items) {
          const categoryId = await resolveLookup('categories', item.category);
          const unitId = await resolveLookup('units', item.unit);
          const conditionId = await resolveLookup('conditions', item.condition);
          const code = item.code || (await nextCode());
          await sqlite3.run(
            db,
            `INSERT INTO items
              (id, name, code, category_id, quantity, unit_id, purchase_date, purchase_price, condition_id, notes, parent_id, updated_at, deleted_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              item.id, item.name, code, categoryId, item.quantity, unitId,
              item.purchase_date, item.purchase_price, conditionId, item.notes, item.parent_id,
              item.updated_at, item.deleted_at,
            ],
          );
        }
        ctx.postMessage({ type: 'ok', requestId: request.requestId });
        break;
      }

      case 'insert': {
        const { item } = request;
        const category = (item.category ?? '').trim()
          ? item.category
          : await parentCategory(item.parent_id);
        const categoryId = await resolveLookup('categories', category);
        const unitId = await resolveLookup('units', item.unit);
        const conditionId = await resolveLookup('conditions', item.condition);
        const code = await nextCode();
        await sqlite3.run(
          db,
          `INSERT INTO items
            (id, name, code, category_id, quantity, unit_id, purchase_date, purchase_price, condition_id, notes, parent_id, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            item.id, item.name, code, categoryId, item.quantity, unitId,
            item.purchase_date, item.purchase_price, conditionId, item.notes, item.parent_id, Date.now(),
          ],
        );
        ctx.postMessage({ type: 'ok', requestId: request.requestId, data: code });
        break;
      }

      case 'update': {
        const { item } = request;
        const categoryId = await resolveLookup('categories', item.category);
        const unitId = await resolveLookup('units', item.unit);
        const conditionId = await resolveLookup('conditions', item.condition);
        if (item.parent_id) {
          const cycle = await sqlite3.execWithParams(
            db,
            `WITH RECURSIVE descendants(id) AS (
              SELECT id FROM items WHERE parent_id = ?
              UNION ALL
              SELECT i.id FROM items i JOIN descendants d ON i.parent_id = d.id
            )
            SELECT 1 FROM descendants WHERE id = ?`,
            [item.id, item.parent_id],
          );
          if (cycle.rows.length > 0) {
            throw new Error('Cannot place an item inside its own contents');
          }
        }
        await sqlite3.run(
          db,
          `UPDATE items SET
            name = ?, category_id = ?, quantity = ?, unit_id = ?,
            purchase_date = ?, purchase_price = ?, condition_id = ?, notes = ?, parent_id = ?,
            updated_at = ?, deleted_at = NULL
            WHERE id = ?`,
          [
            item.name, categoryId, item.quantity, unitId,
            item.purchase_date, item.purchase_price, conditionId, item.notes, item.parent_id,
            Date.now(), item.id,
          ],
        );
        ctx.postMessage({ type: 'ok', requestId: request.requestId });
        break;
      }

      case 'remove': {
        await sqlite3.run(db, `UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ?`, [
          Date.now(),
          Date.now(),
          request.id,
        ]);
        ctx.postMessage({ type: 'ok', requestId: request.requestId });
        break;
      }

      case 'export': {
        const filename = 'export.sqlite';
        await sqlite3.run(db, `VACUUM INTO '${filename}'`);
        const root = await navigator.storage.getDirectory();
        const handle = await root.getFileHandle(filename);
        const file = await handle.getFile();
        const bytes = new Uint8Array(await file.arrayBuffer());
        await root.removeEntry(filename);
        ctx.postMessage({
          type: 'ok',
          requestId: request.requestId,
          data: bytes,
        });
        break;
      }

      case 'import': {
        const bytes = request.data;
        const root = await navigator.storage.getDirectory();
        const rm = async (name: string) => {
          try {
            await root.removeEntry(name);
          } catch {
            /* ignore */
          }
        };

        const tmpName = 'import-tmp.sqlite';
        const tmpHandle = await root.getFileHandle(tmpName, { create: true });
        const tmpWritable = await tmpHandle.createWritable();
        await tmpWritable.write(bytes);
        await tmpWritable.close();

        let tmpDb: number | undefined;
        try {
          tmpDb = await sqlite3.open_v2(tmpName, undefined, 'opfs');
          await sqlite3.execWithParams(tmpDb, 'SELECT count(*) FROM sqlite_master');
        } catch {
          if (tmpDb !== undefined) await sqlite3.close(tmpDb);
          await rm(tmpName);
          await rm(`${tmpName}-journal`);
          throw new Error('Not a valid SQLite database');
        }
        await sqlite3.close(tmpDb);
        await rm(tmpName);
        await rm(`${tmpName}-journal`);

        await sqlite3.close(db);
        await rm('inventory');
        await rm('inventory-journal');
        await rm('inventory-wal');

        const mainHandle = await root.getFileHandle('inventory', { create: true });
        const mainWritable = await mainHandle.createWritable();
        await mainWritable.write(bytes);
        await mainWritable.close();

        db = await sqlite3.open_v2('inventory', undefined, 'opfs');
        await migrate(db);
        await backfillCodes(db);
        ctx.postMessage({ type: 'ok', requestId: request.requestId });
        break;
      }

      case 'getSettings': {
        const { rows } = await sqlite3.execWithParams(
          db,
          `SELECT value FROM app_settings WHERE key = 'provider'`,
        );
        ctx.postMessage({
          type: 'ok',
          requestId: request.requestId,
          data: rows[0]?.[0] ?? null,
        });
        break;
      }

      case 'saveSettings': {
        await sqlite3.run(
          db,
          `INSERT INTO app_settings(key, value) VALUES ('provider', ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          [request.value],
        );
        ctx.postMessage({ type: 'ok', requestId: request.requestId });
        break;
      }

      case 'getSyncSettings': {
        const { rows } = await sqlite3.execWithParams(
          db,
          `SELECT value FROM app_settings WHERE key = 'sync'`,
        );
        ctx.postMessage({
          type: 'ok',
          requestId: request.requestId,
          data: rows[0]?.[0] ?? null,
        });
        break;
      }

      case 'saveSyncSettings': {
        await sqlite3.run(
          db,
          `INSERT INTO app_settings(key, value) VALUES ('sync', ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          [request.value],
        );
        ctx.postMessage({ type: 'ok', requestId: request.requestId });
        break;
      }

      case 'getMeta': {
        const meta: Record<string, Lookup[]> = {};
        for (const table of LOOKUP_TABLES) {
          const { rows } = await sqlite3.execWithParams(
            db,
            `SELECT id, name FROM ${table} ORDER BY name`,
          );
          meta[table] = lookupRowsToLookups(rows);
        }
        ctx.postMessage({ type: 'ok', requestId: request.requestId, data: meta });
        break;
      }

      case 'lookupAdd': {
        const id = await resolveLookup(request.table, request.name);
        ctx.postMessage({
          type: 'ok',
          requestId: request.requestId,
          data: { id: id as number, name: request.name },
        });
        break;
      }

      case 'lookupRename': {
        await sqlite3.run(db, `UPDATE ${request.table} SET name = ? WHERE id = ?`, [
          request.name,
          request.id,
        ]);
        ctx.postMessage({ type: 'ok', requestId: request.requestId });
        break;
      }

      case 'lookupRemove': {
        const column = ITEM_COLUMN[request.table];
        await sqlite3.run(db, `UPDATE items SET ${column} = NULL WHERE ${column} = ?`, [request.id]);
        await sqlite3.run(db, `DELETE FROM ${request.table} WHERE id = ?`, [request.id]);
        ctx.postMessage({ type: 'ok', requestId: request.requestId });
        break;
      }
    }
  } catch (err) {
    ctx.postMessage({
      type: 'error',
      requestId: request.requestId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
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
  locations: 'location_id',
  units: 'unit_id',
  conditions: 'condition_id',
};

let sqlite3: SQLiteAPI;
let db: number;

async function migrate(): Promise<void> {
  const { rows } = await sqlite3.execWithParams(db, 'PRAGMA user_version');
  const version = Number(rows[0]?.[0] ?? 0);
  for (let i = version; i < MIGRATIONS.length; i++) {
    await sqlite3.run(db, MIGRATIONS[i]);
    await sqlite3.run(db, `PRAGMA user_version = ${i + 1}`);
  }
}

const ready = (async () => {
  const module = await SQLiteESMFactory();
  sqlite3 = Factory(module);
  sqlite3.vfs_register(new OriginPrivateFileSystemVFS(), true);
  db = await sqlite3.open_v2('inventory', undefined, 'opfs');
  await migrate();
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

function lookupRowsToLookups(rows: unknown[][]): Lookup[] {
  return rows.map((row) => ({ id: Number(row[0]), name: String(row[1]) }));
}

function listSql(): string {
  return `SELECT
    items.id AS id,
    items.name AS name,
    COALESCE(categories.name, '') AS category,
    items.quantity AS quantity,
    COALESCE(units.name, '') AS unit,
    COALESCE(locations.name, '') AS location,
    items.purchase_date AS purchase_date,
    items.purchase_price AS purchase_price,
    COALESCE(conditions.name, '') AS condition,
    items.notes AS notes,
    items.parent_id AS parent_id
    FROM items
    LEFT JOIN categories ON items.category_id = categories.id
    LEFT JOIN locations ON items.location_id = locations.id
    LEFT JOIN units ON items.unit_id = units.id
    LEFT JOIN conditions ON items.condition_id = conditions.id
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
        const { rows, columns } = await sqlite3.execWithParams(db, listSql());
        ctx.postMessage({
          type: 'ok',
          requestId: request.requestId,
          data: rowsToItems(rows, columns),
        });
        break;
      }

      case 'insert': {
        const { item } = request;
        const categoryId = await resolveLookup('categories', item.category);
        const locationId = await resolveLookup('locations', item.location);
        const unitId = await resolveLookup('units', item.unit);
        const conditionId = await resolveLookup('conditions', item.condition);
        await sqlite3.run(
          db,
          `INSERT INTO items
            (id, name, category_id, quantity, unit_id, location_id, purchase_date, purchase_price, condition_id, notes, parent_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            item.id, item.name, categoryId, item.quantity, unitId, locationId,
            item.purchase_date, item.purchase_price, conditionId, item.notes, item.parent_id,
          ],
        );
        ctx.postMessage({ type: 'ok', requestId: request.requestId });
        break;
      }

      case 'update': {
        const { item } = request;
        const categoryId = await resolveLookup('categories', item.category);
        const locationId = await resolveLookup('locations', item.location);
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
            name = ?, category_id = ?, quantity = ?, unit_id = ?, location_id = ?,
            purchase_date = ?, purchase_price = ?, condition_id = ?, notes = ?, parent_id = ?
            WHERE id = ?`,
          [
            item.name, categoryId, item.quantity, unitId, locationId,
            item.purchase_date, item.purchase_price, conditionId, item.notes, item.parent_id, item.id,
          ],
        );
        ctx.postMessage({ type: 'ok', requestId: request.requestId });
        break;
      }

      case 'remove': {
        await sqlite3.run(db, 'DELETE FROM items WHERE id = ?', [request.id]);
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
        await migrate();
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
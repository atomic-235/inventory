import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite-async.mjs';
import { Factory } from 'wa-sqlite';
import type { SQLiteAPI } from 'wa-sqlite';
import { OriginPrivateFileSystemVFS } from 'wa-sqlite/src/examples/OriginPrivateFileSystemVFS.js';
import { MIGRATIONS } from '../db/migrations';
import { RequestSchema } from '../db/protocol';
import { ItemSchema } from '../domain/item';
import type { Item } from '../domain/item';

const ctx = self as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((e: MessageEvent) => void) | null;
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

ctx.onmessage = async (event: MessageEvent) => {
  const request = RequestSchema.parse(event.data);

  try {
    await ready;

    switch (request.type) {
      case 'list': {
        const { rows, columns } = await sqlite3.execWithParams(db, 'SELECT * FROM items');
        ctx.postMessage({ type: 'ok', requestId: request.requestId, data: rowsToItems(rows, columns) });
        break;
      }
      case 'insert': {
        const { item } = request;
        await sqlite3.run(
          db,
          `INSERT INTO items
            (id, name, category, quantity, unit, location, purchase_date, purchase_price, condition, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            item.id, item.name, item.category, item.quantity, item.unit, item.location,
            item.purchase_date, item.purchase_price, item.condition, item.notes,
          ],
        );
        ctx.postMessage({ type: 'ok', requestId: request.requestId });
        break;
      }
      case 'update': {
        const { item } = request;
        await sqlite3.run(
          db,
          `UPDATE items SET
            name = ?, category = ?, quantity = ?, unit = ?, location = ?,
            purchase_date = ?, purchase_price = ?, condition = ?, notes = ?
            WHERE id = ?`,
          [
            item.name, item.category, item.quantity, item.unit, item.location,
            item.purchase_date, item.purchase_price, item.condition, item.notes, item.id,
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
    }
  } catch (err) {
    ctx.postMessage({
      type: 'error',
      requestId: request.requestId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
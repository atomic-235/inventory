import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes, randomUUID } from 'node:crypto';
import { ItemSchema, type Item, type LookupTable, type Lookup, LOOKUP_TABLES } from '@inventory/core';

interface NewItem {
  name: string;
  category?: string;
  quantity?: number;
  unit?: string;
  purchase_date?: string;
  purchase_price?: number | null;
  condition?: string;
  notes?: string;
  parent_id?: string | null;
}

const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    quantity INTEGER NOT NULL DEFAULT 1,
    unit TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    purchase_date TEXT NOT NULL DEFAULT '',
    purchase_price REAL,
    condition TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT ''
  );`,
  `CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS conditions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );
  ALTER TABLE items ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;
  ALTER TABLE items ADD COLUMN location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL;
  ALTER TABLE items ADD COLUMN unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL;
  ALTER TABLE items ADD COLUMN condition_id INTEGER REFERENCES conditions(id) ON DELETE SET NULL;
  INSERT OR IGNORE INTO categories(name) SELECT DISTINCT category FROM items WHERE category <> '';
  INSERT OR IGNORE INTO locations(name) SELECT DISTINCT location FROM items WHERE location <> '';
  INSERT OR IGNORE INTO units(name) SELECT DISTINCT unit FROM items WHERE unit <> '';
  INSERT OR IGNORE INTO conditions(name) SELECT DISTINCT condition FROM items WHERE condition <> '';
  UPDATE items SET category_id = (SELECT id FROM categories WHERE categories.name = items.category);
  UPDATE items SET location_id = (SELECT id FROM locations WHERE locations.name = items.location);
  UPDATE items SET unit_id = (SELECT id FROM units WHERE units.name = items.unit);
  UPDATE items SET condition_id = (SELECT id FROM conditions WHERE conditions.name = items.condition);
  ALTER TABLE items DROP COLUMN category;
  ALTER TABLE items DROP COLUMN location;
  ALTER TABLE items DROP COLUMN unit;
  ALTER TABLE items DROP COLUMN condition;`,
  `ALTER TABLE items ADD COLUMN parent_id TEXT REFERENCES items(id) ON DELETE SET NULL;`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );`,
  `INSERT INTO items
    (id, name, category_id, quantity, unit_id, purchase_date, purchase_price, condition_id, notes, parent_id)
   SELECT 'loc-' || locations.id, locations.name, NULL, 1, NULL, '', NULL, NULL, '', NULL
   FROM locations;
   UPDATE items
     SET parent_id = (SELECT 'loc-' || locations.id FROM locations WHERE locations.id = items.location_id)
     WHERE location_id IS NOT NULL AND parent_id IS NULL;
   ALTER TABLE items DROP COLUMN location_id;
   DROP TABLE locations;`,
  `ALTER TABLE items ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE items ADD COLUMN deleted_at INTEGER;
   UPDATE items SET updated_at = ${Date.now()} WHERE updated_at = 0;`,
  `ALTER TABLE items ADD COLUMN code TEXT NOT NULL DEFAULT '';`,
];

const CODE_BACKFILL_SQL = `UPDATE items SET code = (
  SELECT printf('%04d', rn) FROM (
    SELECT id, row_number() OVER (ORDER BY name COLLATE NOCASE, id) AS rn
    FROM items WHERE code = ''
  ) WHERE id = items.id
) WHERE code = '';`;

function applyMigrations(database: DatabaseSync): void {
  const row = database.prepare('PRAGMA user_version').get() as { user_version: number };
  const version = Number(row.user_version ?? 0);
  for (let i = version; i < MIGRATIONS.length; i++) {
    database.exec(MIGRATIONS[i]);
    database.exec(`PRAGMA user_version = ${i + 1}`);
  }
}

const LOOKUP_COLUMN: Record<string, string> = {
  categories: 'category_id',
  units: 'unit_id',
  conditions: 'condition_id',
};

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

export class Db {
  private db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.migrate();
  }

  private migrate(): void {
    applyMigrations(this.db);
    this.backfillCodes();
  }

  private backfillCodes(): void {
    if (this.getSetting('code_backfilled')) return;
    this.db.exec(CODE_BACKFILL_SQL);
    this.setSetting('code_backfilled', '1');
  }

  private resolveLookup(table: string, name: string): number | null {
    if (!name) return null;
    this.db.prepare(`INSERT OR IGNORE INTO ${table}(name) VALUES (?)`).run(name);
    const row = this.db.prepare(`SELECT id FROM ${table} WHERE name = ?`).get(name) as { id: number };
    return row?.id ?? null;
  }

  private nextCode(): string {
    const row = this.db
      .prepare('SELECT MAX(CAST(code AS INTEGER)) AS m FROM items')
      .get() as { m: number | null };
    return String((row?.m ?? 0) + 1).padStart(4, '0');
  }

  getSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  setSetting(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO app_settings(key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  }

  listItems(): Item[] {
    return (this.db.prepare(itemsSql(false)).all() as Record<string, unknown>[]).map((r) =>
      ItemSchema.parse(r),
    );
  }

  listAllItems(): Item[] {
    return (this.db.prepare(itemsSql(true)).all() as Record<string, unknown>[]).map((r) =>
      ItemSchema.parse(r),
    );
  }

  replaceItems(items: Item[]): void {
    this.db.exec('BEGIN');
    try {
      this.db.exec('DELETE FROM items');
      const insert = this.db.prepare(
        `INSERT INTO items
          (id, name, code, category_id, quantity, unit_id, purchase_date, purchase_price, condition_id, notes, parent_id, updated_at, deleted_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      );
      for (const it of items) {
        insert.run(
          it.id,
          it.name,
          it.code || this.nextCode(),
          this.resolveLookup('categories', it.category),
          it.quantity,
          this.resolveLookup('units', it.unit),
          it.purchase_date,
          it.purchase_price,
          this.resolveLookup('conditions', it.condition),
          it.notes,
          it.updated_at,
          it.deleted_at,
        );
      }
      const setParent = this.db.prepare('UPDATE items SET parent_id = ? WHERE id = ?');
      for (const it of items) {
        if (it.parent_id) setParent.run(it.parent_id, it.id);
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  insertItem(f: NewItem): void {
    const id: string = randomUUID();
    const code = this.nextCode();
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO items
          (id, name, code, category_id, quantity, unit_id, purchase_date, purchase_price, condition_id, notes, parent_id, updated_at, deleted_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        f.name,
        code,
        this.resolveLookup('categories', f.category ?? ''),
        f.quantity ?? 1,
        this.resolveLookup('units', f.unit ?? ''),
        f.purchase_date ?? '',
        f.purchase_price ?? null,
        this.resolveLookup('conditions', f.condition ?? ''),
        f.notes ?? '',
        f.parent_id ?? null,
        now,
        null,
      );
  }

  removeItem(id: string): void {
    const now = Date.now();
    this.db.prepare('UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now, now, id);
  }

  updateItem(item: Item): void {
    if (item.parent_id) {
      const cycle = this.db
        .prepare(
          `WITH RECURSIVE descendants(id) AS (
            SELECT id FROM items WHERE parent_id = ?
            UNION ALL
            SELECT i.id FROM items i JOIN descendants d ON i.parent_id = d.id
          ) SELECT 1 FROM descendants WHERE id = ?`,
        )
        .get(item.id, item.parent_id);
      if (cycle) throw new Error('Cannot place an item inside its own contents');
    }
    this.db
      .prepare(
        `UPDATE items SET name = ?, category_id = ?, quantity = ?, unit_id = ?,
           purchase_date = ?, purchase_price = ?, condition_id = ?, notes = ?, parent_id = ?,
           updated_at = ?, deleted_at = NULL
         WHERE id = ?`,
      )
      .run(
        item.name,
        this.resolveLookup('categories', item.category),
        item.quantity,
        this.resolveLookup('units', item.unit),
        item.purchase_date,
        item.purchase_price,
        this.resolveLookup('conditions', item.condition),
        item.notes,
        item.parent_id,
        Date.now(),
        item.id,
      );
  }

  listLookups(table: LookupTable): Lookup[] {
    return (this.db.prepare(`SELECT id, name FROM ${table} ORDER BY name`).all() as {
      id: number;
      name: string;
    }[]).map((r) => ({ id: Number(r.id), name: String(r.name) }));
  }

  addLookup(table: LookupTable, name: string): void {
    this.resolveLookup(table, name);
  }

  renameLookup(table: LookupTable, id: number, name: string): void {
    this.db.prepare(`UPDATE ${table} SET name = ? WHERE id = ?`).run(name, id);
  }

  removeLookup(table: LookupTable, id: number): void {
    this.db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
  }

  exportBlob(): Uint8Array<ArrayBuffer> {
    const tmp = join(tmpdir(), `inventory-export-${randomBytes(6).toString('hex')}.sqlite`);
    this.db.exec(`VACUUM INTO '${tmp}'`);
    const bytes = new Uint8Array(readFileSync(tmp));
    rmSync(tmp, { force: true });
    return bytes;
  }

  readItemsFromBlob(bytes: Uint8Array<ArrayBuffer>): Item[] {
    const tmp = join(tmpdir(), `inventory-read-${randomBytes(6).toString('hex')}.sqlite`);
    writeFileSync(tmp, bytes);
    let rows: Record<string, unknown>[] = [];
    try {
      const remote = new DatabaseSync(tmp);
      applyMigrations(remote);
      rows = remote.prepare(itemsSql(true)).all() as Record<string, unknown>[];
      remote.close();
    } finally {
      rmSync(tmp, { force: true });
    }
    return rows.map((r) => ItemSchema.parse(r));
  }

  readSettingsFromBlob(bytes: Uint8Array<ArrayBuffer>): Record<string, string> {
    const tmp = join(tmpdir(), `inventory-read-settings-${randomBytes(6).toString('hex')}.sqlite`);
    writeFileSync(tmp, bytes);
    const out: Record<string, string> = {};
    try {
      const remote = new DatabaseSync(tmp);
      applyMigrations(remote);
      const rows = remote.prepare('SELECT key, value FROM app_settings').all() as {
        key: string;
        value: string;
      }[];
      for (const r of rows) out[r.key] = r.value;
      remote.close();
    } finally {
      rmSync(tmp, { force: true });
    }
    return out;
  }

  mergeSettings(remote: Record<string, string>): void {
    for (const [key, value] of Object.entries(remote)) {
      const current = this.getSetting(key);
      if (current == null || current === '') this.setSetting(key, value);
    }
  }

  close(): void {
    this.db.close();
  }
}

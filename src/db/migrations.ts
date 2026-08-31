export const MIGRATIONS: string[] = [
  // v1: initial items table (denormalized)
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

  // v2: normalize categories/locations/units/conditions into lookup tables with FKs
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

  // v3: containment graph — self-referential parent FK (adjacency list)
  `ALTER TABLE items ADD COLUMN parent_id TEXT REFERENCES items(id) ON DELETE SET NULL;`,

  // v4: app settings (key/value) so a full export/import carries config too
  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );`,
];
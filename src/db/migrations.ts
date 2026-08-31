export const MIGRATIONS: string[] = [
  // v1: initial items table
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
];
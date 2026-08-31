import type { Item } from './item';

export const CSV_COLUMNS = [
  'id',
  'name',
  'category',
  'quantity',
  'unit',
  'location',
  'purchase_date',
  'purchase_price',
  'condition',
  'notes',
] as const;

function escape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function itemsToCsv(items: Item[]): string {
  const header = CSV_COLUMNS.join(',');
  const rows = items.map((item) =>
    CSV_COLUMNS.map((col) => escape(item[col])).join(','),
  );
  return [header, ...rows].join('\n');
}
import { describe, it, expect } from 'vitest';
import { itemsToCsv, CSV_COLUMNS } from '../../src/domain/csv';
import type { Item } from '../../src/domain/item';

const item: Item = {
  id: '1',
  name: 'Lamp',
  parent_id: null,
  category: 'Furniture',
  quantity: 2,
  unit: 'pc',
  purchase_date: '2026-01-15',
  purchase_price: 99.99,
  condition: 'good',
  notes: '',
};

describe('itemsToCsv', () => {
  it('emits header matching the CSV template columns', () => {
    const csv = itemsToCsv([]);
    expect(csv).toBe(CSV_COLUMNS.join(','));
  });

  it('emits rows in the correct column order', () => {
    const csv = itemsToCsv([item]);
    const [header, row] = csv.split('\n');
    expect(header).toBe('id,name,parent_id,category,quantity,unit,purchase_date,purchase_price,condition,notes');
    expect(row).toBe('1,Lamp,,Furniture,2,pc,2026-01-15,99.99,good,');
  });

  it('quotes values containing commas or quotes', () => {
    const csv = itemsToCsv([{ ...item, name: 'Lamp, "Blue"' }]);
    expect(csv).toContain('"Lamp, ""Blue"""');
  });

  it('renders null price as empty', () => {
    const csv = itemsToCsv([{ ...item, purchase_price: null }]);
    expect(csv).toContain('good,');
  });
});
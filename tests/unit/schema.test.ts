import { describe, it, expect } from 'vitest';
import { ItemSchema, ItemFieldsSchema } from '../../src/schema';

describe('ItemSchema', () => {
  it('accepts a valid full item', () => {
    const result = ItemSchema.parse({
      id: 'abc',
      name: 'Lamp',
      category: 'Furniture',
      quantity: 2,
      unit: 'pc',
      location: 'Living Room',
      purchase_date: '2026-01-15',
      purchase_price: 99.99,
      condition: 'good',
      notes: 'blue',
    });
    expect(result.name).toBe('Lamp');
    expect(result.quantity).toBe(2);
    expect(result.purchase_price).toBe(99.99);
  });

  it('applies defaults for omitted optional fields', () => {
    const result = ItemSchema.parse({ id: 'x', name: 'Chair' });
    expect(result.category).toBe('');
    expect(result.quantity).toBe(1);
    expect(result.unit).toBe('');
    expect(result.location).toBe('');
    expect(result.purchase_price).toBeNull();
  });

  it('rejects a missing name', () => {
    expect(() => ItemSchema.parse({ id: 'x' })).toThrow();
  });

  it('rejects a non-positive quantity', () => {
    expect(() => ItemSchema.parse({ id: 'x', name: 'a', quantity: 0 })).toThrow();
  });

  it('coerces numeric strings', () => {
    const result = ItemSchema.parse({
      id: 'x',
      name: 'a',
      quantity: '3',
      purchase_price: '4.50',
    });
    expect(result.quantity).toBe(3);
    expect(result.purchase_price).toBe(4.5);
  });
});

describe('ItemFieldsSchema', () => {
  it('requires no id', () => {
    const result = ItemFieldsSchema.parse({ name: 'Table' });
    expect(result.name).toBe('Table');
    expect('id' in result).toBe(false);
  });
});
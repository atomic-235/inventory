import { describe, it, expect } from 'vitest';
import { buildAutocomplete, findLastBy } from '../../src/domain/autocomplete';
import type { Item } from '../../src/domain/item';

function item(partial: Partial<Item>): Item {
  return {
    id: '1',
    name: 'x',
    category: '',
    quantity: 1,
    unit: '',
    location: '',
    purchase_date: '',
    purchase_price: null,
    condition: '',
    notes: '',
    parent_id: null,
    ...partial,
  };
}

describe('buildAutocomplete', () => {
  const items = [
    item({ id: '1', category: 'Electronics', location: 'Office', unit: 'pc' }),
    item({ id: '2', category: 'Electronics', location: 'Garage', unit: 'pc' }),
    item({ id: '3', category: 'Furniture', location: 'Living Room', unit: 'set' }),
  ];

  const lookups = {
    categories: ['Electronics', 'Furniture'],
    locations: ['Garage', 'Living Room', 'Office'],
    units: ['pc', 'set'],
    conditions: [],
  };

  it('lists distinct sorted categories, locations, units from lookups', () => {
    const a = buildAutocomplete(items, lookups);
    expect(a.categories).toEqual(['Electronics', 'Furniture']);
    expect(a.locations).toEqual(['Garage', 'Living Room', 'Office']);
    expect(a.units).toEqual(['pc', 'set']);
  });

  it('lists distinct names from items', () => {
    const a = buildAutocomplete(
      items.map((i, idx) => ({ ...i, name: ['TV', 'Drill', 'Sofa'][idx] })),
      lookups,
    );
    expect(a.names).toEqual(['Drill', 'Sofa', 'TV']);
  });

  it('restricts locations to the matching category', () => {
    const a = buildAutocomplete(items, lookups);
    expect(a.locationsFor('Electronics')).toEqual(['Garage', 'Office']);
  });

  it('restricts units to the matching category', () => {
    const a = buildAutocomplete(items, lookups);
    expect(a.unitsFor('Furniture')).toEqual(['set']);
  });

  it('falls back to all locations when category has none', () => {
    const a = buildAutocomplete([item({ category: 'Other' })], lookups);
    expect(a.locationsFor('Unknown')).toEqual(['Garage', 'Living Room', 'Office']);
  });
});

describe('findLastBy', () => {
  const items = [
    item({ id: '1', name: 'Sony TV', category: 'Electronics', unit: 'pc', location: 'Office' }),
    item({ id: '2', name: 'Sofa', category: 'Furniture', unit: 'set', location: 'Living Room' }),
    item({ id: '3', name: 'sony tv', category: 'Media', unit: 'pc', location: 'Garage' }),
  ];

  it('returns the most recent item with a matching name, case-insensitive', () => {
    const found = findLastBy(items, 'name', 'sOnY Tv');
    expect(found?.id).toBe('3');
    expect(found?.category).toBe('Media');
  });

  it('returns undefined when no match', () => {
    expect(findLastBy(items, 'name', 'Lamp')).toBeUndefined();
  });

  it('matches by category', () => {
    expect(findLastBy(items, 'category', 'furniture')?.id).toBe('2');
  });
});
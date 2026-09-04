import { describe, it, expect } from 'vitest';
import { mergeItems } from '../../src/domain/merge';
import type { Item } from '../../src/domain/item';

function item(partial: Partial<Item>): Item {
  return {
    id: '1',
    name: 'x',
    category: '',
    quantity: 1,
    unit: '',
    purchase_date: '',
    purchase_price: null,
    condition: '',
    notes: '',
    parent_id: null,
    updated_at: 0,
    deleted_at: null,
    ...partial,
  };
}

describe('mergeItems', () => {
  it('prefers the newer updated_at for the same id', () => {
    const local = [item({ id: 'a', name: 'local', updated_at: 100 })];
    const remote = [item({ id: 'a', name: 'remote', updated_at: 200 })];
    expect(mergeItems(local, remote)).toEqual([remote[0]]);
  });

  it('unions ids present on only one side', () => {
    const local = [item({ id: 'a', updated_at: 1 })];
    const remote = [item({ id: 'b', updated_at: 2 })];
    const merged = mergeItems(local, remote);
    expect(merged.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('propagates a tombstone when it is newer than an edit', () => {
    const local = [item({ id: 'a', updated_at: 100, deleted_at: null })];
    const remote = [item({ id: 'a', updated_at: 200, deleted_at: 300 })];
    expect(mergeItems(local, remote)[0].deleted_at).toBe(300);
  });

  it('keeps an edit alive when it is newer than a tombstone', () => {
    const local = [item({ id: 'a', updated_at: 300, deleted_at: null })];
    const remote = [item({ id: 'a', updated_at: 200, deleted_at: 100 })];
    expect(mergeItems(local, remote)[0].deleted_at).toBeNull();
  });

  it('prefers the live copy on an exact timestamp tie', () => {
    const local = [item({ id: 'a', updated_at: 100, deleted_at: null })];
    const remote = [item({ id: 'a', updated_at: 100, deleted_at: 100 })];
    expect(mergeItems(local, remote)[0].deleted_at).toBeNull();
  });
});
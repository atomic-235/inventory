import { describe, it, expect, vi } from 'vitest';
import { Store, ItemsStore } from '../../src/store';
import type { ItemsDb } from '../../src/store';
import type { Item } from '../../src/domain/item';

describe('Store', () => {
  it('notifies subscribers on set', () => {
    const s = new Store(1);
    const fn = vi.fn();
    s.subscribe(fn);
    s.set(2);
    expect(fn).toHaveBeenCalledOnce();
    expect(s.get()).toBe(2);
  });

  it('unsubscribe stops notifications', () => {
    const s = new Store(1);
    const fn = vi.fn();
    const off = s.subscribe(fn);
    off();
    s.set(2);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('ItemsStore', () => {
  const item: Item = {
    id: '1',
    name: 'Lamp',
    parent_id: null,
    category: '',
    quantity: 1,
    unit: '',
    location: '',
    purchase_date: '',
    purchase_price: null,
    condition: '',
    notes: '',
  };

  function makeDb(items: Item[] = [item]): ItemsDb {
    return {
      listItems: vi.fn(async () => items),
      insertItem: vi.fn(async () => item),
      updateItem: vi.fn(async () => item),
      removeItem: vi.fn(async () => undefined),
    };
  }

  it('refresh loads items into state', async () => {
    const s = new ItemsStore(makeDb());
    await s.refresh();
    expect(s.get().items).toEqual([item]);
    expect(s.get().loading).toBe(false);
  });

  it('add inserts then refreshes', async () => {
    const db = makeDb();
    const s = new ItemsStore(db);
    const { id: _id, ...fields } = item;
    await s.add(fields);
    expect(db.insertItem).toHaveBeenCalledOnce();
    expect(s.get().items).toEqual([item]);
  });

  it('sets error state on list failure', async () => {
    const db = makeDb();
    db.listItems = vi.fn(async () => {
      throw new Error('nope');
    });
    const s = new ItemsStore(db);
    await s.refresh();
    expect(s.get().error).toBe('nope');
  });
});
import { describe, it, expect } from 'vitest';
import { buildTree, itemPath } from '../../src/domain/tree';
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

describe('buildTree', () => {
  it('returns items with no parent as roots, sorted by name', () => {
    const tree = buildTree([
      item({ id: 'b', name: 'Box', parent_id: null }),
      item({ id: 'a', name: 'Apple', parent_id: null }),
      item({ id: 'c', name: 'Cable', parent_id: 'b' }),
    ]);
    expect(tree.roots.map((i) => i.id)).toEqual(['a', 'b']);
    expect(tree.childrenOf('b').map((i) => i.id)).toEqual(['c']);
    expect(tree.childrenOf('a')).toEqual([]);
  });

  it('groups grandchildren under their immediate parent only', () => {
    const tree = buildTree([
      item({ id: 'room', name: 'Room', parent_id: null }),
      item({ id: 'box', name: 'Box', parent_id: 'room' }),
      item({ id: 'inner', name: 'Inner', parent_id: 'box' }),
    ]);
    expect(tree.roots.map((i) => i.id)).toEqual(['room']);
    expect(tree.childrenOf('room').map((i) => i.id)).toEqual(['box']);
    expect(tree.childrenOf('box').map((i) => i.id)).toEqual(['inner']);
    expect(tree.childrenOf('inner')).toEqual([]);
  });

  it('surfaces orphaned items as roots instead of hiding them', () => {
    const tree = buildTree([
      item({ id: 'orphan', name: 'Orphan', parent_id: 'missing' }),
      item({ id: 'root', name: 'Root', parent_id: null }),
    ]);
    expect(tree.childrenOf('missing')).toEqual([]);
    expect(tree.roots.map((i) => i.id)).toEqual(['orphan', 'root']);
  });
});

describe('itemPath', () => {
  const items = [
    item({ id: 'home-a', name: 'Home A', parent_id: null }),
    item({ id: 'lr-a', name: 'Living room', parent_id: 'home-a' }),
    item({ id: 'home-b', name: 'Home B', parent_id: null }),
    item({ id: 'lr-b', name: 'Living room', parent_id: 'home-b' }),
    item({ id: 'box', name: 'Box', parent_id: 'lr-b' }),
  ];

  it('returns the root-to-node breadcrumb path', () => {
    expect(itemPath('lr-a', items)).toBe('Home A > Living room');
    expect(itemPath('lr-b', items)).toBe('Home B > Living room');
    expect(itemPath('box', items)).toBe('Home B > Living room > Box');
  });

  it('returns just the name for a top-level item', () => {
    expect(itemPath('home-a', items)).toBe('Home A');
  });

  it('returns an empty path for an unknown id', () => {
    expect(itemPath('nope', items)).toBe('');
  });
});
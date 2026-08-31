import type { Item } from './item';

export interface ItemTree {
  roots: Item[];
  childrenOf(id: string): Item[];
}

function byName(list: Item[]): Item[] {
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

export function buildTree(items: Item[]): ItemTree {
  const byId = new Map<string, Item>();
  for (const item of items) byId.set(item.id, item);

  const children = new Map<string, Item[]>();
  const roots: Item[] = [];

  for (const item of items) {
    if (item.parent_id && byId.has(item.parent_id)) {
      const bucket = children.get(item.parent_id);
      if (bucket) bucket.push(item);
      else children.set(item.parent_id, [item]);
    } else {
      roots.push(item);
    }
  }

  for (const bucket of children.values()) byName(bucket);
  byName(roots);

  return {
    roots,
    childrenOf: (id: string) => byName(children.get(id) ?? []),
  };
}

export function itemPath(id: string, items: Item[]): string {
  const byId = new Map(items.map((i) => [i.id, i]));
  const names: string[] = [];
  const seen = new Set<string>();
  let current: Item | undefined = byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.push(current.name);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return names.reverse().join(' > ');
}
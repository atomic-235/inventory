import type { Item } from './item';

function pick(a?: Item, b?: Item): Item | undefined {
  if (!a) return b;
  if (!b) return a;
  if (a.updated_at > b.updated_at) return a;
  if (b.updated_at > a.updated_at) return b;
  const aAlive = a.deleted_at == null;
  const bAlive = b.deleted_at == null;
  if (aAlive !== bAlive) return aAlive ? a : b;
  return a;
}

export function mergeItems(local: Item[], remote: Item[]): Item[] {
  const byId = new Map<string, { a?: Item; b?: Item }>();
  for (const it of local) {
    const e = byId.get(it.id) ?? {};
    e.a = it;
    byId.set(it.id, e);
  }
  for (const it of remote) {
    const e = byId.get(it.id) ?? {};
    e.b = it;
    byId.set(it.id, e);
  }
  const merged: Item[] = [];
  for (const { a, b } of byId.values()) {
    const chosen = pick(a, b);
    if (chosen) merged.push(chosen);
  }
  merged.sort((x, y) => x.id.localeCompare(y.id));
  return merged;
}
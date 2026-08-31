import type { Item } from './item';

export interface Autocomplete {
  names: string[];
  categories: string[];
  units: string[];
  conditions: string[];
  unitsFor(category: string): string[];
}

export interface LookupNames {
  categories: string[];
  units: string[];
  conditions: string[];
}

export function findLastBy(
  items: Item[],
  field: 'name' | 'category',
  value: string,
): Item | undefined {
  const needle = value.trim().toLowerCase();
  if (!needle) return undefined;
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i][field].toLowerCase() === needle) return items[i];
  }
  return undefined;
}

export function buildAutocomplete(items: Item[], lookups: LookupNames): Autocomplete {
  const names = unique(items.map((i) => i.name).filter(Boolean));
  const categories = unique(lookups.categories);
  const units = unique(lookups.units);
  const conditions = unique(lookups.conditions);

  function unitsFor(category: string): string[] {
    const subset = unique(
      items
        .filter((i) => i.category === category)
        .map((i) => i.unit)
        .filter((v): v is string => Boolean(v)),
    );
    return subset.length ? subset : units;
  }

  return {
    names,
    categories,
    units,
    conditions,
    unitsFor,
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}
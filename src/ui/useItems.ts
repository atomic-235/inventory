import { useEffect, useState } from 'preact/hooks';
import { db } from '../db';
import { ItemsStore } from '../store';
import type { ItemsState } from '../store';

export const items = new ItemsStore(db);

export function useItems(): ItemsState {
  const [state, setState] = useState<ItemsState>(items.get());

  useEffect(() => {
    return items.subscribe(() => setState(items.get()));
  }, []);

  return state;
}
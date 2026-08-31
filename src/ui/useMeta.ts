import { useEffect, useState } from 'preact/hooks';
import { db } from '../db';
import { MetaStore } from '../meta';
import type { Meta } from '../domain/lookup';

export const meta = new MetaStore(db);

export function useMeta(): Meta {
  const [state, setState] = useState<Meta>(meta.get());

  useEffect(() => {
    meta.refresh();
    return meta.subscribe(() => setState(meta.get()));
  }, []);

  return state;
}
import { Store } from './store';
import type { Meta, Lookup, LookupTable } from './domain/lookup';

export interface MetaDb {
  getMeta(): Promise<Meta>;
  addLookup(table: LookupTable, name: string): Promise<Lookup>;
  renameLookup(table: LookupTable, id: number, name: string): Promise<void>;
  removeLookup(table: LookupTable, id: number): Promise<void>;
}

const EMPTY: Meta = { categories: [], locations: [], units: [], conditions: [] };

export class MetaStore extends Store<Meta> {
  constructor(private db: MetaDb) {
    super(EMPTY);
  }

  async refresh(): Promise<void> {
    this.set(await this.db.getMeta());
  }

  async add(table: LookupTable, name: string): Promise<void> {
    await this.db.addLookup(table, name);
    await this.refresh();
  }

  async rename(table: LookupTable, id: number, name: string): Promise<void> {
    await this.db.renameLookup(table, id, name);
    await this.refresh();
  }

  async remove(table: LookupTable, id: number): Promise<void> {
    await this.db.removeLookup(table, id);
    await this.refresh();
  }
}
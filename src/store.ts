import type { Item, ItemFields } from './domain/item';

type Listener = () => void;

export class Store<T> {
  #value: T;
  #listeners = new Set<Listener>();

  constructor(initial: T) {
    this.#value = initial;
  }

  get(): T {
    return this.#value;
  }

  set(next: T): void {
    this.#value = next;
    this.#listeners.forEach((l) => l());
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
}

export interface ItemsState {
  items: Item[];
  loading: boolean;
  error: string | null;
}

export interface ItemsDb {
  listItems(): Promise<Item[]>;
  insertItem(fields: ItemFields): Promise<Item>;
  updateItem(item: Item): Promise<Item>;
  removeItem(id: string): Promise<void>;
}

export class ItemsStore extends Store<ItemsState> {
  constructor(private db: ItemsDb) {
    super({ items: [], loading: false, error: null });
  }

  async refresh(): Promise<void> {
    this.set({ ...this.get(), loading: true });
    try {
      const items = await this.db.listItems();
      this.set({ items, loading: false, error: null });
    } catch (err) {
      this.set({
        ...this.get(),
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async add(fields: ItemFields): Promise<void> {
    await this.db.insertItem(fields);
    await this.refresh();
  }

  async update(item: Item): Promise<void> {
    await this.db.updateItem(item);
    await this.refresh();
  }

  async remove(id: string): Promise<void> {
    await this.db.removeItem(id);
    await this.refresh();
  }
}
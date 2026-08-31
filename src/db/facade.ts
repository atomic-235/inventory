import { ResponseSchema, ListResult } from './protocol';
import type { Request } from './protocol';
import type { Item, ItemFieldsInput } from '../domain/item';

export interface Transport {
  postMessage(message: Request): void;
  onMessage(handler: (message: unknown) => void): void;
}

export class DbFacade {
  private pending = new Map<
    string,
    { resolve: (data: unknown) => void; reject: (err: Error) => void }
  >();

  constructor(private transport: Transport) {
    transport.onMessage((raw) => {
      const parsed = ResponseSchema.safeParse(raw);
      if (!parsed.success) return;

      const entry = this.pending.get(parsed.data.requestId);
      if (!entry) return;
      this.pending.delete(parsed.data.requestId);

      if (parsed.data.type === 'ok') {
        entry.resolve(parsed.data.data);
      } else {
        entry.reject(new Error(parsed.data.message));
      }
    });
  }

  private request<T>(request: Request): Promise<T> {
    const id = request.requestId;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (d: unknown) => void, reject });
      this.transport.postMessage(request);
    });
  }

  listItems(): Promise<Item[]> {
    const parsed = ListResult;
    return this.request<unknown>({ type: 'list', requestId: crypto.randomUUID() }).then(
      (data) => parsed.parse(data),
    );
  }

  insertItem(item: ItemFieldsInput): Promise<Item> {
    const full: Item = { ...item, id: crypto.randomUUID() } as Item;
    return this.request<unknown>({ type: 'insert', requestId: crypto.randomUUID(), item: full }).then(
      () => full,
    );
  }

  updateItem(item: Item): Promise<Item> {
    return this.request<unknown>({ type: 'update', requestId: crypto.randomUUID(), item }).then(
      () => item,
    );
  }

  removeItem(id: string): Promise<void> {
    return this.request<unknown>({ type: 'remove', requestId: crypto.randomUUID(), id }).then(
      () => undefined,
    );
  }
}
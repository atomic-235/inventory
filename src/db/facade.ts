import { ResponseSchema, ListResult } from './protocol';
import type { Request } from './protocol';
import { MetaSchema, LookupSchema } from '../domain/lookup';
import { SettingsSchema, SyncConfigSchema } from '../domain/settings';
import type { Item, ItemFieldsInput } from '../domain/item';
import type { Meta, Lookup, LookupTable } from '../domain/lookup';
import type { ProviderConfig, SyncConfig } from '../domain/settings';

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
    return new Promise<T>((resolve, reject) => {
      this.pending.set(request.requestId, {
        resolve: resolve as (d: unknown) => void,
        reject,
      });
      this.transport.postMessage(request);
    });
  }

  listItems(): Promise<Item[]> {
    return this.request<unknown>({ type: 'list', requestId: crypto.randomUUID() }).then((data) =>
      ListResult.parse(data),
    );
  }

  listAllItems(): Promise<Item[]> {
    return this.request<unknown>({ type: 'listAllItems', requestId: crypto.randomUUID() }).then(
      (data) => ListResult.parse(data),
    );
  }

  readBlobItems(data: Uint8Array<ArrayBuffer>): Promise<Item[]> {
    return this.request<unknown>({ type: 'readBlobItems', requestId: crypto.randomUUID(), data }).then(
      (rows) => ListResult.parse(rows),
    );
  }

  readBlobSettings(data: Uint8Array<ArrayBuffer>): Promise<Record<string, string>> {
    return this.request<unknown>({ type: 'readBlobSettings', requestId: crypto.randomUUID(), data }).then(
      (settings) => settings as Record<string, string>,
    );
  }

  mergeSettings(settings: Record<string, string>): Promise<void> {
    return this.request<unknown>({ type: 'mergeSettings', requestId: crypto.randomUUID(), settings }).then(
      () => undefined,
    );
  }

  replaceItems(items: Item[]): Promise<void> {
    return this.request<unknown>({ type: 'replaceItems', requestId: crypto.randomUUID(), items }).then(
      () => undefined,
    );
  }

  insertItem(item: ItemFieldsInput): Promise<Item> {
    const full: Item = { ...item, id: crypto.randomUUID() } as Item;
    return this.request<unknown>({ type: 'insert', requestId: crypto.randomUUID(), item: full }).then(
      (code) => ({ ...full, code: code == null ? '' : String(code) }),
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

  getMeta(): Promise<Meta> {
    return this.request<unknown>({ type: 'getMeta', requestId: crypto.randomUUID() }).then((data) =>
      MetaSchema.parse(data),
    );
  }

  getSettings(): Promise<ProviderConfig | null> {
    return this.request<unknown>({ type: 'getSettings', requestId: crypto.randomUUID() }).then(
      (data) => {
        if (data == null) return null;
        return SettingsSchema.parse(JSON.parse(String(data)));
      },
    );
  }

  saveSettings(config: ProviderConfig): Promise<void> {
    return this.request<unknown>({
      type: 'saveSettings',
      requestId: crypto.randomUUID(),
      value: JSON.stringify(config),
    }).then(() => undefined);
  }

  getSyncSettings(): Promise<SyncConfig | null> {
    return this.request<unknown>({ type: 'getSyncSettings', requestId: crypto.randomUUID() }).then(
      (data) => {
        if (data == null) return null;
        return SyncConfigSchema.parse(JSON.parse(String(data)));
      },
    );
  }

  saveSyncSettings(config: SyncConfig): Promise<void> {
    return this.request<unknown>({
      type: 'saveSyncSettings',
      requestId: crypto.randomUUID(),
      value: JSON.stringify(config),
    }).then(() => undefined);
  }

  exportDatabase(): Promise<Uint8Array<ArrayBuffer>> {
    return this.request<unknown>({ type: 'export', requestId: crypto.randomUUID() }).then((data) => {
      if (!(data instanceof Uint8Array)) {
        throw new Error('Unexpected export payload');
      }
      return data as Uint8Array<ArrayBuffer>;
    });
  }

  importDatabase(data: Uint8Array<ArrayBuffer>): Promise<void> {
    return this.request<unknown>({ type: 'import', requestId: crypto.randomUUID(), data }).then(
      () => undefined,
    );
  }

  addLookup(table: LookupTable, name: string): Promise<Lookup> {
    return this.request<unknown>({ type: 'lookupAdd', requestId: crypto.randomUUID(), table, name }).then(
      (data) => LookupSchema.parse(data),
    );
  }

  renameLookup(table: LookupTable, id: number, name: string): Promise<void> {
    return this.request<unknown>({ type: 'lookupRename', requestId: crypto.randomUUID(), table, id, name }).then(
      () => undefined,
    );
  }

  removeLookup(table: LookupTable, id: number): Promise<void> {
    return this.request<unknown>({ type: 'lookupRemove', requestId: crypto.randomUUID(), table, id }).then(
      () => undefined,
    );
  }
}
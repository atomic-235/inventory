import { describe, it, expect } from 'vitest';
import { DbFacade } from '../../src/db/facade';
import type { Request } from '../../src/db/protocol';
import type { Item } from '../../src/domain/item';

class FakeTransport {
  handler?: (message: unknown) => void;
  posted: Request[] = [];

  postMessage(message: Request): void {
    this.posted.push(message);
  }

  onMessage(handler: (message: unknown) => void): void {
    this.handler = handler;
  }

  respond(requestId: string, data?: unknown): void {
    this.handler!({ type: 'ok', requestId, data });
  }

  error(requestId: string, message: string): void {
    this.handler!({ type: 'error', requestId, message });
  }
}

const item: Item = {
  id: '1',
  name: 'Lamp',
  parent_id: null,
  category: 'Furniture',
  quantity: 2,
  unit: 'pc',
  location: 'Living Room',
  purchase_date: '2026-01-15',
  purchase_price: 99.99,
  condition: 'good',
  notes: '',
};

describe('DbFacade', () => {
  it('listItems posts a list request and returns parsed items', async () => {
    const t = new FakeTransport();
    const f = new DbFacade(t);

    const p = f.listItems();
    expect(t.posted).toHaveLength(1);
    expect(t.posted[0].type).toBe('list');

    t.respond(t.posted[0].requestId, [item]);
    await expect(p).resolves.toEqual([item]);
  });

  it('insertItem generates an id and posts an insert request', async () => {
    const t = new FakeTransport();
    const f = new DbFacade(t);

    const { id: _id, ...fields } = item;
    const p = f.insertItem(fields);
    const req = t.posted[0];
    expect(req.type).toBe('insert');

    t.respond(req.requestId);
    const result = await p;
    expect(result.id).toBeTruthy();
    expect(result.name).toBe('Lamp');
  });

  it('rejects when the worker responds with an error', async () => {
    const t = new FakeTransport();
    const f = new DbFacade(t);

    const p = f.listItems();
    t.error(t.posted[0].requestId, 'failed');
    await expect(p).rejects.toThrow('failed');
  });

  it('removeItem posts a remove request', async () => {
    const t = new FakeTransport();
    const f = new DbFacade(t);

    const p = f.removeItem('42');
    expect(t.posted[0].type).toBe('remove');
    t.respond(t.posted[0].requestId);
    await expect(p).resolves.toBeUndefined();
  });
});
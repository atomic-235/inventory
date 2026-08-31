import { describe, it, expect } from 'vitest';
import { RequestSchema, ResponseSchema } from '../../src/db/protocol';

const item = {
  id: '1',
  name: 'Lamp',
  category: '',
  quantity: 1,
  unit: '',
  purchase_date: '',
  purchase_price: null,
  condition: '',
  notes: '',
};

describe('protocol RequestSchema', () => {
  it('parses a list request', () => {
    const r = RequestSchema.parse({ type: 'list', requestId: 'x' });
    expect(r.type).toBe('list');
  });

  it('parses an insert request with an item', () => {
    const r = RequestSchema.parse({ type: 'insert', requestId: 'x', item });
    expect(r.type).toBe('insert');
    if (r.type === 'insert') expect(r.item.name).toBe('Lamp');
  });

  it('rejects unknown request types', () => {
    expect(() => RequestSchema.parse({ type: 'bogus', requestId: 'x' })).toThrow();
  });
});

describe('protocol ResponseSchema', () => {
  it('parses an ok response with data', () => {
    const r = ResponseSchema.parse({ type: 'ok', requestId: 'x', data: [item] });
    expect(r.type).toBe('ok');
  });

  it('parses an error response', () => {
    const r = ResponseSchema.parse({ type: 'error', requestId: 'x', message: 'boom' });
    expect(r.type).toBe('error');
    if (r.type === 'error') expect(r.message).toBe('boom');
  });
});
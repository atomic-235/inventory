import { Db } from '@inventory/tui/db';
import { dbPath, ensureDataDir } from '@inventory/tui/config';
import {
  buildTree,
  itemPath,
  LOOKUP_TABLES,
  type Item,
  type LookupTable,
} from '@inventory/core';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'inventory';
const SERVER_VERSION = '0.0.0';

ensureDataDir();
const db = new Db(dbPath());

type Json = Record<string, unknown>;

interface RpcRequest {
  jsonrpc: string;
  id: number | string;
  method: string;
  params?: Json;
}

function json(obj: unknown): string {
  return JSON.stringify(obj, null, 2);
}

function send(msg: unknown): void {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function sendResult(id: number | string, result: unknown): void {
  send({ jsonrpc: '2.0', id, result });
}

function sendToolResult(id: number | string, text: string, isError = false): void {
  send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], isError } });
}

function sendError(id: number | string, code: number, message: string): void {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

function allItems(): Item[] {
  return db.listAllItems();
}

function activeItems(): Item[] {
  return db.listItems();
}

function withPath(items: Item[]): (Item & { path: string })[] {
  const all = allItems();
  return items.map((i) => ({ ...i, path: itemPath(i.id, all) }));
}

function resolveParent(args: Json): string | null {
  const parentId = args.parent_id;
  if (typeof parentId === 'string' && parentId) return parentId;
  const parent = args.parent;
  if (typeof parent !== 'string' || !parent) return null;
  const items = activeItems();
  const lower = parent.toLowerCase();
  const exact = items.find((i) => i.name.toLowerCase() === lower);
  if (exact) return exact.id;
  const sub = items.find((i) => i.name.toLowerCase().includes(lower));
  return sub?.id ?? null;
}

function num(v: unknown, dflt: number): number {
  return v === undefined || v === null ? dflt : Number(v);
}

// ---- tool handlers ----

const handlers: Record<string, (args: Json) => string> = {
  list_items() {
    return json(withPath(activeItems()));
  },

  list_all_items() {
    return json(withPath(allItems()));
  },

  get_item(args) {
    const id = args.id;
    if (typeof id !== 'string') throw new Error('id is required');
    const item = allItems().find((i) => i.id === id);
    if (!item) throw new Error(`no item with id ${id}`);
    return json(withPath([item])[0]);
  },

  find_items(args) {
    const query = args.query;
    if (typeof query !== 'string' || !query) throw new Error('query is required');
    const lower = query.toLowerCase();
    const hits = activeItems().filter(
      (i) =>
        i.name.toLowerCase().includes(lower) ||
        i.category.toLowerCase().includes(lower) ||
        i.notes.toLowerCase().includes(lower),
    );
    return json(withPath(hits));
  },

  add_item(args) {
    const name = args.name;
    if (typeof name !== 'string' || !name.trim()) throw new Error('name is required');
    db.insertItem({
      name: name.trim(),
      category: typeof args.category === 'string' ? args.category : undefined,
      quantity: typeof args.quantity === 'number' ? args.quantity : undefined,
      unit: typeof args.unit === 'string' ? args.unit : undefined,
      purchase_date: typeof args.purchase_date === 'string' ? args.purchase_date : undefined,
      purchase_price: typeof args.purchase_price === 'number' ? args.purchase_price : undefined,
      condition: typeof args.condition === 'string' ? args.condition : undefined,
      notes: typeof args.notes === 'string' ? args.notes : undefined,
      parent_id: resolveParent(args),
    });
    return json(withPath(activeItems()));
  },

  update_item(args) {
    const id = args.id;
    if (typeof id !== 'string') throw new Error('id is required');
    const items = allItems();
    const item = items.find((i) => i.id === id);
    if (!item) throw new Error(`no item with id ${id}`);

    const next: Item = { ...item };
    if (typeof args.name === 'string') next.name = args.name;
    if (typeof args.category === 'string') next.category = args.category;
    if (args.quantity !== undefined) next.quantity = num(args.quantity, item.quantity);
    if (typeof args.unit === 'string') next.unit = args.unit;
    if (typeof args.purchase_date === 'string') next.purchase_date = args.purchase_date;
    if (args.purchase_price !== undefined)
      next.purchase_price = args.purchase_price === null ? null : num(args.purchase_price, 0);
    if (typeof args.condition === 'string') next.condition = args.condition;
    if (typeof args.notes === 'string') next.notes = args.notes;
    if (args.parent_id !== undefined || args.parent !== undefined) {
      next.parent_id = resolveParent(args);
    }

    db.updateItem(next);
    return json(withPath(allItems().filter((i) => i.id === id)));
  },

  remove_item(args) {
    const id = args.id;
    if (typeof id !== 'string') throw new Error('id is required');
    db.removeItem(id);
    return `removed item ${id}`;
  },

  list_lookups(args) {
    const table = args.table;
    if (typeof table !== 'string' || !LOOKUP_TABLES.includes(table as LookupTable))
      throw new Error(`table must be one of: ${LOOKUP_TABLES.join(', ')}`);
    return json(db.listLookups(table as LookupTable));
  },

  add_lookup(args) {
    const table = args.table;
    const name = args.name;
    if (typeof table !== 'string' || !LOOKUP_TABLES.includes(table as LookupTable))
      throw new Error(`table must be one of: ${LOOKUP_TABLES.join(', ')}`);
    if (typeof name !== 'string' || !name.trim()) throw new Error('name is required');
    db.addLookup(table as LookupTable, name.trim());
    return json(db.listLookups(table as LookupTable));
  },

  rename_lookup(args) {
    const table = args.table;
    const id = args.id;
    const name = args.name;
    if (typeof table !== 'string' || !LOOKUP_TABLES.includes(table as LookupTable))
      throw new Error(`table must be one of: ${LOOKUP_TABLES.join(', ')}`);
    if (typeof id !== 'number') throw new Error('id is required');
    if (typeof name !== 'string' || !name.trim()) throw new Error('name is required');
    db.renameLookup(table as LookupTable, id, name.trim());
    return json(db.listLookups(table as LookupTable));
  },

  remove_lookup(args) {
    const table = args.table;
    const id = args.id;
    if (typeof table !== 'string' || !LOOKUP_TABLES.includes(table as LookupTable))
      throw new Error(`table must be one of: ${LOOKUP_TABLES.join(', ')}`);
    if (typeof id !== 'number') throw new Error('id is required');
    db.removeLookup(table as LookupTable, id);
    return json(db.listLookups(table as LookupTable));
  },

  tree() {
    const items = activeItems();
    const tree = buildTree(items);
    const lines: string[] = [];
    const walk = (children: Item[], depth: number) => {
      for (const c of children) {
        lines.push(
          `${'  '.repeat(depth)}${c.code ? `[${c.code}] ` : ''}${c.name}${c.quantity > 1 ? ` x${c.quantity}` : ''}${
            c.category ? `  [${c.category}]` : ''
          }`,
        );
        walk(tree.childrenOf(c.id), depth + 1);
      }
    };
    walk(tree.roots, 0);
    return lines.join('\n');
  },
};

// ---- tool definitions ----

const tools = [
  {
    name: 'list_items',
    description: 'List all active (non-deleted) inventory items, each with its containment path.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_all_items',
    description: 'List all items including tombstoned/deleted ones.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_item',
    description: 'Get a single item by id, with its full containment path.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Item UUID' } },
      required: ['id'],
    },
  },
  {
    name: 'find_items',
    description: 'Search active items by name, category, or notes (case-insensitive substring).',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Substring to match' } },
      required: ['query'],
    },
  },
  {
    name: 'add_item',
    description:
      'Add a new item. Category/unit/condition are free strings (auto-resolved/created as lookups, same as the TUI). parent can be an item name or parent_id a UUID.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        category: { type: 'string' },
        quantity: { type: 'number' },
        unit: { type: 'string' },
        purchase_date: { type: 'string' },
        purchase_price: { type: 'number' },
        condition: { type: 'string' },
        notes: { type: 'string' },
        parent_id: { type: 'string', description: 'Container item UUID' },
        parent: { type: 'string', description: 'Container item name (resolved to id)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_item',
    description: 'Update an existing item by id. Only provided fields change.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        category: { type: 'string' },
        quantity: { type: 'number' },
        unit: { type: 'string' },
        purchase_date: { type: 'string' },
        purchase_price: { type: 'number' },
        condition: { type: 'string' },
        notes: { type: 'string' },
        parent_id: { type: 'string' },
        parent: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'remove_item',
    description: 'Soft-delete an item (tombstone), same as the TUI.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'list_lookups',
    description: 'List entries of a lookup table (categories, units, or conditions).',
    inputSchema: {
      type: 'object',
      properties: { table: { type: 'string', enum: [...LOOKUP_TABLES] } },
      required: ['table'],
    },
  },
  {
    name: 'add_lookup',
    description: 'Add an entry to a lookup table.',
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string', enum: [...LOOKUP_TABLES] },
        name: { type: 'string' },
      },
      required: ['table', 'name'],
    },
  },
  {
    name: 'rename_lookup',
    description: 'Rename a lookup entry by id.',
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string', enum: [...LOOKUP_TABLES] },
        id: { type: 'number' },
        name: { type: 'string' },
      },
      required: ['table', 'id', 'name'],
    },
  },
  {
    name: 'remove_lookup',
    description: 'Delete a lookup entry by id.',
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string', enum: [...LOOKUP_TABLES] },
        id: { type: 'number' },
      },
      required: ['table', 'id'],
    },
  },
  {
    name: 'tree',
    description: 'Show the item containment tree.',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ---- protocol loop ----

function handle(msg: RpcRequest): void {
  if (msg.method === 'initialize') {
    sendResult(msg.id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    });
    return;
  }
  if (msg.method === 'ping') {
    sendResult(msg.id, {});
    return;
  }
  if (msg.method === 'tools/list') {
    sendResult(msg.id, { tools });
    return;
  }
  if (msg.method === 'tools/call') {
    const params = msg.params ?? {};
    const name = params.name as string;
    const args = (params.arguments ?? {}) as Json;
    const handler = handlers[name];
    if (!handler) {
      sendToolResult(msg.id, `unknown tool: ${name}`, true);
      return;
    }
    try {
      const text = handler(args);
      sendToolResult(msg.id, text);
    } catch (e) {
      sendToolResult(msg.id, e instanceof Error ? e.message : String(e), true);
    }
    return;
  }
  sendError(msg.id, -32601, `method not found: ${msg.method}`);
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => {
  buf += chunk;
  let idx: number;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg: RpcRequest;
    try {
      msg = JSON.parse(line) as RpcRequest;
    } catch {
      sendError(-1, -32700, 'parse error');
      continue;
    }
    if (msg.method === 'notifications/initialized') continue;
    handle(msg);
  }
});

import React, { useState } from 'react';
import { render, Box, Text, useApp, useInput } from 'ink';
import {
  type Item,
  buildTree,
  itemPath,
  LOOKUP_TABLES,
  type LookupTable,
} from '@inventory/core';
import { Db } from './db';
import { loadConfig, dbPath, ensureDataDir } from './config';
import { syncCloud, restoreCloud } from './sync';

const FIELD_LABELS = ['Name', 'Category', 'Quantity', 'Unit', 'Purchase date', 'Purchase price', 'Condition', 'Notes'];

function setAt(arr: string[], i: number, v: string): string[] {
  const next = arr.slice();
  next[i] = v;
  return next;
}

function Prompt(props: {
  label: string;
  initial: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(props.initial);
  useInput((input, key) => {
    if (key.escape) props.onCancel();
    else if (key.return) props.onSubmit(value);
    else if (key.backspace) setValue((v) => v.slice(0, -1));
    else if (input && input.length === 1 && !key.ctrl && !key.meta) setValue((v) => v + input);
  });
  return (
    <Box flexDirection="column">
      <Text>
        {props.label}: <Text color="cyan">{value}</Text>
      </Text>
      <Text color="gray">Enter=confirm  Esc=cancel</Text>
    </Box>
  );
}

function ItemForm(props: {
  initial: Partial<Item>;
  items: Item[];
  submitLabel: string;
  onSubmit: (data: {
    name: string;
    category: string;
    quantity: number;
    unit: string;
    purchase_date: string;
    purchase_price: number | null;
    condition: string;
    notes: string;
    parent_id: string | null;
  }) => void;
  onCancel: () => void;
}) {
  const init = props.initial;
  const [values, setValues] = useState<string[]>([
    init.name ?? '',
    init.category ?? '',
    String(init.quantity ?? 1),
    init.unit ?? '',
    init.purchase_date ?? '',
    init.purchase_price != null ? String(init.purchase_price) : '',
    init.condition ?? '',
    init.notes ?? '',
  ]);
  const [focus, setFocus] = useState(0);

  const containers = [
    { id: '', label: '(none)' },
    ...props.items
      .filter((i) => i.id !== init.id)
      .map((i) => ({ id: i.id, label: itemPath(i.id, props.items) })),
  ];
  const [ci, setCi] = useState(() => {
    const idx = containers.findIndex((c) => c.id === (init.parent_id ?? ''));
    return idx >= 0 ? idx : 0;
  });

  const submit = () => {
    const qty = parseInt(values[2], 10);
    const price = values[5].trim() === '' ? null : Number(values[5]);
    props.onSubmit({
      name: values[0].trim(),
      category: values[1].trim(),
      quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
      unit: values[3].trim(),
      purchase_date: values[4].trim(),
      purchase_price: price != null && Number.isFinite(price) ? price : null,
      condition: values[6].trim(),
      notes: values[7].trim(),
      parent_id: containers[ci].id || null,
    });
  };

  useInput((input, key) => {
    if (key.escape) {
      props.onCancel();
      return;
    }
    if (key.return) {
      if (focus === 8) submit();
      else setFocus(focus + 1);
      return;
    }
    if (focus === 8) {
      if (key.leftArrow) setCi((i) => (i + containers.length - 1) % containers.length);
      else if (key.rightArrow) setCi((i) => (i + 1) % containers.length);
      else if (key.tab) setFocus(0);
      else if (key.upArrow) setFocus(7);
      else if (key.downArrow) setFocus(0);
      return;
    }
    if (key.tab || key.downArrow) setFocus((focus + 1) % 9);
    else if (key.upArrow) setFocus((focus + 8) % 9);
    else if (key.backspace) setValues((v) => setAt(v, focus, v[focus].slice(0, -1)));
    else if (input && input.length === 1 && !key.ctrl && !key.meta)
      setValues((v) => setAt(v, focus, v[focus] + input));
  });

  return (
    <Box flexDirection="column">
      <Text bold>
        {props.submitLabel} item <Text color="gray">(Enter=next/save · Esc=cancel · ↑/↓ move)</Text>
      </Text>
      {FIELD_LABELS.map((label, i) => (
        <Text key={label}>
          {focus === i ? <Text color="cyan">›</Text> : ' '} {label}:{' '}
          <Text color={focus === i ? 'cyan' : undefined}>{values[i] || '—'}</Text>
        </Text>
      ))}
      <Text>
        {focus === 8 ? <Text color="cyan">›</Text> : ' '} Container:{' '}
        <Text color={focus === 8 ? 'cyan' : undefined}>{containers[ci].label}</Text>{' '}
        <Text color="gray">(← → choose)</Text>
      </Text>
    </Box>
  );
}

function flatten(items: Item[]): { item: Item; depth: number }[] {
  const tree = buildTree(items);
  const out: { item: Item; depth: number }[] = [];
  const walk = (roots: Item[], depth: number) => {
    for (const r of roots) {
      out.push({ item: r, depth });
      walk(tree.childrenOf(r.id), depth + 1);
    }
  };
  walk(tree.roots, 0);
  return out;
}

function App({ db }: { db: Db }) {
  const { exit } = useApp();
  const [items, setItems] = useState<Item[]>(db.listItems());
  const [view, setView] = useState<'list' | 'tree' | 'manage'>('list');
  const [select, setSelect] = useState(0);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [form, setForm] = useState<null | { kind: 'add' } | { kind: 'edit'; item: Item }>(null);
  const [table, setTable] = useState<LookupTable>('categories');
  const [lookups, setLookups] = useState(db.listLookups('categories'));
  const [lkSel, setLkSel] = useState(0);
  const [prompt, setPrompt] = useState<null | { label: string; initial: string; onSubmit: (v: string) => void }>(null);
  const [status, setStatus] = useState('');

  const refresh = () => setItems(db.listItems());
  const filtered = query ? items.filter((i) => i.name.toLowerCase().includes(query.toLowerCase())) : items;

  useInput((input, key) => {
    if (prompt) return;
    if (form) return;

    if (searching) {
      if (key.escape) {
        setSearching(false);
        setQuery('');
      } else if (key.return) {
        setSearching(false);
      } else if (key.backspace) {
        setQuery((q) => q.slice(0, -1));
      } else if (input && input.length === 1 && !key.ctrl && !key.meta) {
        setQuery((q) => q + input);
      }
      return;
    }

    if (key.escape) {
      if (view === 'manage') setView('list');
      else setQuery('');
      return;
    }
    if (key.return) {
      if (view === 'list' || view === 'tree') {
        const current = view === 'list' ? filtered[select] : flatten(filtered)[select]?.item;
        if (current) setForm({ kind: 'edit', item: current });
      }
      return;
    }
    if (input === 'q') {
      exit();
      return;
    }
    if (input === '/') {
      setSearching(true);
      setQuery('');
      return;
    }
    if (input === 'a') {
      if (view === 'manage') {
        setPrompt({
          label: `New ${table.slice(0, -1)}`,
          initial: '',
          onSubmit: (v) => {
            db.addLookup(table, v);
            setLookups(db.listLookups(table));
          },
        });
      } else {
        setForm({ kind: 'add' });
      }
      return;
    }
    if (input === 'd') {
      if (view === 'manage') {
        const l = lookups[lkSel];
        if (l) {
          db.removeLookup(table, l.id);
          setLookups(db.listLookups(table));
          setLkSel((s) => Math.min(s, Math.max(0, lookups.length - 2)));
        }
      } else {
        const current = view === 'list' ? filtered[select] : flatten(filtered)[select]?.item;
        if (current) {
          db.removeItem(current.id);
          refresh();
        }
      }
      return;
    }
    if (input === 'r') {
      if (view === 'manage') {
        const l = lookups[lkSel];
        if (l)
          setPrompt({
            label: 'Rename',
            initial: l.name,
            onSubmit: (v) => {
              db.renameLookup(table, l.id, v);
              setLookups(db.listLookups(table));
            },
          });
      } else {
        setStatus('restoring…');
        (async () => {
          try {
            await restoreCloud(dbPath(), loadConfig(), process.env.INVENTORY_PASSPHRASE ?? '');
            setStatus('restored — restart to reload');
          } catch (e) {
            setStatus(`error: ${e instanceof Error ? e.message : String(e)}`);
          }
        })();
      }
      return;
    }
    if (input === 's') {
      setStatus('syncing…');
      (async () => {
        try {
          await syncCloud(db, loadConfig(), process.env.INVENTORY_PASSPHRASE ?? '');
          refresh();
          setStatus('synced');
        } catch (e) {
          setStatus(`error: ${e instanceof Error ? e.message : String(e)}`);
        }
      })();
      return;
    }
    if (input === 't') {
      setView((v) => (v === 'tree' ? 'list' : 'tree'));
      setSelect(0);
      return;
    }
    if (input === 'm') {
      if (view === 'manage') {
        const idx = (LOOKUP_TABLES.indexOf(table) + 1) % LOOKUP_TABLES.length;
        const t = LOOKUP_TABLES[idx];
        setTable(t);
        setLookups(db.listLookups(t));
        setLkSel(0);
      } else {
        setView('manage');
        setTable('categories');
        setLookups(db.listLookups('categories'));
        setLkSel(0);
      }
      return;
    }

    if (view === 'manage') {
      if (key.downArrow) setLkSel((s) => Math.min(s + 1, lookups.length - 1));
      else if (key.upArrow) setLkSel((s) => Math.max(0, s - 1));
    } else {
      const len = view === 'list' ? filtered.length : flatten(filtered).length;
      if (key.downArrow) setSelect((s) => Math.min(s + 1, len - 1));
      else if (key.upArrow) setSelect((s) => Math.max(0, s - 1));
    }
  });

  if (form) {
    const initial = form.kind === 'edit' ? form.item : {};
    return (
      <ItemForm
        initial={initial}
        items={items}
        submitLabel={form.kind === 'edit' ? 'Save' : 'Add'}
        onSubmit={(data) => {
          if (data.name === '') {
            setForm(null);
            return;
          }
          if (form.kind === 'edit') {
            db.updateItem({ ...form.item, ...data });
          } else {
            db.insertItem(data);
          }
          refresh();
          setForm(null);
        }}
        onCancel={() => setForm(null)}
      />
    );
  }

  if (prompt) {
    return (
      <Prompt
        label={prompt.label}
        initial={prompt.initial}
        onSubmit={(v) => {
          prompt.onSubmit(v.trim());
          setPrompt(null);
        }}
        onCancel={() => setPrompt(null)}
      />
    );
  }

  if (view === 'manage') {
    return (
      <Box flexDirection="column">
        <Text bold underline>Manage</Text>
        <Box width={60}>
          {LOOKUP_TABLES.map((t) => (
            <Text key={t} color={t === table ? 'cyan' : undefined}>
              {t === table ? `›${t}` : t}{'   '}
            </Text>
          ))}
        </Box>
        {lookups.length === 0 ? (
          <Text color="gray">(empty)</Text>
        ) : (
          lookups.map((l, i) => (
            <Text key={l.id} color={i === lkSel ? 'cyan' : undefined}>
              {i === lkSel ? '›' : ' '} {l.name}
            </Text>
          ))
        )}
        <Text color="gray">a=Add  r=Rename  d=Delete  m=next table  Esc=back  q=Quit</Text>
      </Box>
    );
  }

  const entries = view === 'tree' ? flatten(filtered) : filtered.map((i) => ({ item: i, depth: 0 }));
  const sel = Math.min(select, Math.max(0, entries.length - 1));

  return (
    <Box flexDirection="column">
      <Text bold underline>
        Inventory <Text color="gray">[{view}]{query ? ` filter: ${query}` : ''}</Text>
      </Text>
      {entries.length === 0 ? (
        <Text color="gray">(no items{query ? ' matching' : ''})</Text>
      ) : (
        entries.map((e, i) => (
          <Text key={e.item.id} color={i === sel ? 'cyan' : undefined}>
            {i === sel ? '›' : ' '} {' '.repeat(e.depth * 2)}
            {e.item.name}
            {e.item.category ? ` — ${e.item.category}` : ''}
            {e.item.quantity > 1 ? ` ×${e.item.quantity}` : ''}
          </Text>
        ))
      )}
      <Text color="gray">↑/↓ nav · Enter edit · a add · d delete · t tree · / search · m manage · s sync · r restore · q quit</Text>
      {status ? <Text color="gray">{status}</Text> : null}
    </Box>
  );
}

function main() {
  ensureDataDir();
  const db = new Db(dbPath());
  render(<App db={db} />);
}

main();

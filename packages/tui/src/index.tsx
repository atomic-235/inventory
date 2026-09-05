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

function cleanInput(input: string, key: { ctrl?: boolean; meta?: boolean }): string {
  if (input === '' || key.ctrl || key.meta) return '';
  return input
    .replace(/\u001b\[[0-9;?]*[a-zA-Z~]/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, '');
}

function fuzzyBest(query: string, options: string[]): { option: string; prefix: boolean } | null {
  if (!query) return null;
  const q = query.toLowerCase();
  let best: string | null = null;
  let bestScore = -1;
  let bestPrefix = false;
  for (const o of options) {
    const ol = o.toLowerCase();
    if (ol === q) continue;
    let score = -1;
    let prefix = false;
    if (ol.startsWith(q)) {
      score = 10000 - ol.length;
      prefix = true;
    } else if (ol.includes(q)) {
      score = 5000 - ol.length;
    } else {
      let qi = 0;
      for (let i = 0; i < ol.length && qi < q.length; i++) if (ol[i] === q[qi]) qi++;
      if (qi === q.length) score = 1000 - ol.length;
    }
    if (score > bestScore) {
      bestScore = score;
      best = o;
      bestPrefix = prefix;
    }
  }
  return best ? { option: best, prefix: bestPrefix } : null;
}

function Prompt(props: {
  label: string;
  initial: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(props.initial);
  const [cursor, setCursor] = useState(props.initial.length);
  useInput((input, key) => {
    if (key.escape) props.onCancel();
    else if (key.return) props.onSubmit(value);
    else if (key.leftArrow) setCursor((c) => Math.max(0, c - 1));
    else if (key.rightArrow) setCursor((c) => Math.min(value.length, c + 1));
    else if (key.backspace || key.delete) {
      if (cursor > 0) {
        setValue((v) => v.slice(0, cursor - 1) + v.slice(cursor));
        setCursor((c) => c - 1);
      }
    } else {
      const ch = cleanInput(input, key);
      if (ch) {
        setValue((v) => v.slice(0, cursor) + ch + v.slice(cursor));
        setCursor((c) => c + ch.length);
      }
    }
  });
  return (
    <Box flexDirection="column">
      <Text>
        {props.label}:{' '}
        <Text color="cyan">
          {value.slice(0, cursor)}
          <Text inverse>{value[cursor] ?? ' '}</Text>
          {value.slice(cursor + 1)}
        </Text>
      </Text>
      <Text color="gray">Enter=confirm  Esc=cancel</Text>
    </Box>
  );
}

const LOOKUP_FIELD: Record<number, LookupTable> = {
  1: 'categories',
  3: 'units',
  6: 'conditions',
};
const SUGGEST_KEYS = new Set([0, 1, 3, 6]);

function ItemForm(props: {
  initial: Partial<Item>;
  items: Item[];
  options: { categories: string[]; units: string[]; conditions: string[] };
  onAddLookup: (table: LookupTable, name: string) => void;
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
  const [cursor, setCursor] = useState(0);
  const [creating, setCreating] = useState<null | { field: number; prev: string }>(null);

  const containers = [
    { id: '', label: '(none)' },
    ...props.items
      .filter((i) => i.id !== init.id)
      .map((i) => ({ id: i.id, label: itemPath(i.id, props.items) })),
  ];
  const containerLabels = containers.map((c) => c.label);
  const [container, setContainer] = useState(() => {
    const idx = containers.findIndex((c) => c.id === (init.parent_id ?? ''));
    return containers[idx >= 0 ? idx : 0].label;
  });

  const moveFocus = (f: number) => {
    setFocus(f);
    setCursor(f < values.length ? values[f].length : container.length);
  };

  const suggestOptions = (f: number): string[] => {
    if (f === 0) return [...new Set(props.items.map((i) => i.name))].sort();
    if (f === 1) return props.options.categories;
    if (f === 3) return props.options.units;
    if (f === 6) return props.options.conditions;
    return [];
  };

  const completionFor = (f: number): { option: string; prefix: boolean } | null =>
    fuzzyBest(values[f], suggestOptions(f));

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
      parent_id: containers.find((c) => c.label === container.trim())?.id || null,
    });
  };

  useInput((input, key) => {
    if (creating && creating.field === focus) {
      if (key.escape) {
        setValues((v) => setAt(v, creating.field, creating.prev));
        setCreating(null);
        return;
      }
      if (key.return) {
        const name = values[creating.field].trim();
        if (name) props.onAddLookup(LOOKUP_FIELD[creating.field], name);
        setValues((v) => setAt(v, creating.field, name));
        setCreating(null);
        return;
      }
      if (key.leftArrow) setCursor((c) => Math.max(0, c - 1));
      else if (key.rightArrow) setCursor((c) => Math.min(values[focus].length, c + 1));
      else if (key.backspace || key.delete) {
        if (cursor > 0) {
          setValues((v) => setAt(v, focus, v[focus].slice(0, cursor - 1) + v[focus].slice(cursor)));
          setCursor((c) => c - 1);
        }
      } else {
        const ch = cleanInput(input, key);
        if (ch) {
          setValues((v) => setAt(v, focus, v[focus].slice(0, cursor) + ch + v[focus].slice(cursor)));
          setCursor((c) => c + ch.length);
        }
      }
      return;
    }

    if (key.escape) {
      props.onCancel();
      return;
    }
    if (key.return) {
      if (focus === 8) submit();
      else moveFocus(focus + 1);
      return;
    }
    if (focus === 8) {
      if (key.leftArrow) setCursor((c) => Math.max(0, c - 1));
      else if (key.rightArrow) setCursor((c) => Math.min(container.length, c + 1));
      else if (key.backspace || key.delete) {
        if (cursor > 0) {
          setContainer((v) => v.slice(0, cursor - 1) + v.slice(cursor));
          setCursor((c) => c - 1);
        }
      } else if (key.tab) {
        const c = fuzzyBest(container, containerLabels);
        if (c) {
          setContainer(c.option);
          setCursor(c.option.length);
        } else {
          moveFocus(0);
        }
      } else if (key.upArrow) moveFocus(7);
      else if (key.downArrow) moveFocus(0);
      else {
        const ch = cleanInput(input, key);
        if (ch) {
          setContainer((v) => v.slice(0, cursor) + ch + v.slice(cursor));
          setCursor((c) => c + ch.length);
        }
      }
      return;
    }
    if (input === '+' && LOOKUP_FIELD[focus]) {
      setCreating({ field: focus, prev: values[focus] });
      setValues((v) => setAt(v, focus, ''));
      setCursor(0);
      return;
    }
    if (key.tab) {
      const c = completionFor(focus);
      if (c) {
        setValues((v) => setAt(v, focus, c.option));
        setCursor(c.option.length);
      } else {
        moveFocus((focus + 1) % 9);
      }
      return;
    }
    if (key.downArrow) moveFocus((focus + 1) % 9);
    else if (key.upArrow) moveFocus((focus + 8) % 9);
    else if (key.leftArrow) setCursor((c) => Math.max(0, c - 1));
    else if (key.rightArrow) setCursor((c) => Math.min(values[focus].length, c + 1));
    else if (key.backspace || key.delete) {
      if (cursor > 0) {
        setValues((v) => setAt(v, focus, v[focus].slice(0, cursor - 1) + v[focus].slice(cursor)));
        setCursor((c) => c - 1);
      }
    } else {
      const ch = cleanInput(input, key);
      if (ch) {
        setValues((v) => setAt(v, focus, v[focus].slice(0, cursor) + ch + v[focus].slice(cursor)));
        setCursor((c) => c + ch.length);
      }
    }
  });

  const fieldBody = (i: number, val: string): React.ReactNode => {
    const isF = focus === i;
    const creatingHere = creating != null && creating.field === i;
    if (creatingHere) {
      return (
        <Text color="yellow">
          {val.slice(0, cursor)}
          <Text inverse>{val[cursor] ?? ' '}</Text>
          {val.slice(cursor + 1)}
        </Text>
      );
    }
    if (isF && SUGGEST_KEYS.has(i) && cursor === val.length) {
      const c = completionFor(i);
      if (c && c.prefix) {
        return (
          <Text color="cyan">
            {val}
            <Text color="gray">{c.option.slice(val.length)}</Text>
          </Text>
        );
      }
      if (c) {
        return (
          <Text color="cyan">
            {val}
            <Text color="gray">  → {c.option}</Text>
          </Text>
        );
      }
      return (
        <Text color="cyan">
          {val}
          <Text inverse> </Text>
        </Text>
      );
    }
    if (isF) {
      return (
        <Text color="cyan">
          {val.slice(0, cursor)}
          <Text inverse>{val[cursor] ?? ' '}</Text>
          {val.slice(cursor + 1)}
        </Text>
      );
    }
    return <Text>{val || '—'}</Text>;
  };

  return (
    <Box flexDirection="column">
      <Text bold>
        {props.submitLabel} item{' '}
        <Text color="gray">(Enter=next/save · Esc=cancel · ↑/↓ move · Tab=autocomplete · + new)</Text>
      </Text>
      {FIELD_LABELS.map((label, i) => {
        const isF = focus === i;
        const hint =
          isF && LOOKUP_FIELD[i] ? (
            <Text color="gray">  (+ new)</Text>
          ) : null;
        return (
          <Text key={label}>
            {isF ? <Text color="cyan">›</Text> : ' '} {label}: {fieldBody(i, values[i])}
            {hint}
          </Text>
        );
      })}
      <Text>
        {focus === 8 ? <Text color="cyan">›</Text> : ' '} Container:{' '}
        {focus === 8 ? (
          <Text color="cyan">
            {(() => {
              const c = fuzzyBest(container, containerLabels);
              if (c && c.prefix) {
                return (
                  <>
                    {container}
                    <Text color="gray">{c.option.slice(container.length)}</Text>
                  </>
                );
              }
              if (c) {
                return (
                  <>
                    {container}
                    <Text color="gray">  → {c.option}</Text>
                  </>
                );
              }
              return (
                <>
                  {container.slice(0, cursor)}
                  <Text inverse>{container[cursor] ?? ' '}</Text>
                  {container.slice(cursor + 1)}
                </>
              );
            })()}
          </Text>
        ) : (
          <Text>{container || '—'}</Text>
        )}
        {focus === 8 ? <Text color="gray">  (Tab autocomplete)</Text> : null}
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
      } else {
        const ch = cleanInput(input, key);
        if (ch) setQuery((q) => q + ch);
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
    if (input === 'c') {
      db.setSetting('sync', JSON.stringify(loadConfig()));
      const cfg = loadConfig();
      setStatus(`config saved to db (bucket=${cfg.bucket || '—'})`);
      return;
    }
    if (input === 'R') {
      refresh();
      if (view === 'manage') setLookups(db.listLookups(table));
      setStatus('refreshed');
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
        options={{
          categories: db.listLookups('categories').map((l) => l.name),
          units: db.listLookups('units').map((l) => l.name),
          conditions: db.listLookups('conditions').map((l) => l.name),
        }}
        onAddLookup={(table, name) => db.addLookup(table, name)}
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
            {e.item.code ? <Text color="gray">[{e.item.code}] </Text> : null}
            {e.item.name}
            {e.item.category ? ` — ${e.item.category}` : ''}
            {e.item.quantity > 1 ? ` ×${e.item.quantity}` : ''}
          </Text>
        ))
      )}
      <Text color="gray">↑/↓ nav · Enter edit · a add · d delete · t tree · / search · m manage · s sync · r restore · c save config · R refresh · q quit</Text>
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

import { useState, useRef } from 'preact/hooks';
import type { JSX } from 'preact';
import { useItems, items } from '../../useItems';
import { db } from '../../../db';
import { useMeta, meta } from '../../useMeta';
import { captureFrame } from '../../../data/camera';
import { extractItem } from '../../../data/vision';
import { itemsToCsv } from '../../../domain/csv';
import { buildAutocomplete, findLastBy } from '../../../domain/autocomplete';
import type { Autocomplete } from '../../../domain/autocomplete';
import { ItemTreeView } from './tree';
import { ItemFieldsSchema } from '../../../domain/item';
import type { Item, ItemFields } from '../../../domain/item';
import { ZodError } from 'zod';

type FormState = {
  name: string;
  category: string;
  quantity: string;
  unit: string;
  location: string;
  purchase_date: string;
  purchase_price: string;
  condition: string;
  notes: string;
  containerId: string;
};

function toFormState(fields: Partial<ItemFields>): FormState {
  return {
    name: fields.name ?? '',
    category: fields.category ?? '',
    quantity: fields.quantity?.toString() ?? '1',
    unit: fields.unit ?? '',
    location: fields.location ?? '',
    purchase_date: fields.purchase_date ?? '',
    purchase_price: fields.purchase_price?.toString() ?? '',
    condition: fields.condition ?? '',
    notes: fields.notes ?? '',
    containerId: fields.parent_id ?? '',
  };
}

function formToFields(form: FormState): ItemFields {
  return ItemFieldsSchema.parse({
    name: form.name,
    category: form.category,
    quantity: form.quantity === '' ? 1 : form.quantity,
    unit: form.unit,
    location: form.location,
    purchase_date: form.purchase_date,
    purchase_price: form.purchase_price === '' ? null : form.purchase_price,
    condition: form.condition,
    notes: form.notes,
    parent_id: form.containerId === '' ? null : form.containerId,
  });
}

function friendlyError(err: unknown): string {
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    const key = issue ? String(issue.path[0] ?? '') : '';
    if (key === 'name') return 'Name is required.';
    if (key === 'quantity') return 'Quantity must be a positive whole number.';
    if (key === 'purchase_price') return 'Purchase price cannot be negative.';
    return 'Please check the highlighted fields.';
  }
  return String(err);
}

function applyDefaults(prev: FormState, src: Item): FormState {
  const next = { ...prev };
  if (!next.category) next.category = src.category;
  if (!next.unit) next.unit = src.unit;
  if (!next.location) next.location = src.location;
  if (!next.condition) next.condition = src.condition;
  if (next.purchase_price === '') next.purchase_price = src.purchase_price?.toString() ?? '';
  if (next.quantity === '1') next.quantity = String(src.quantity);
  return next;
}

function TextInput(props: {
  label: string;
  id: string;
  value: string;
  type?: string;
  placeholder?: string;
  list?: string[];
  onInput: (value: string) => void;
  onBlur?: () => void;
}) {
  const listId = props.list && props.list.length ? `${props.id}-list` : undefined;
  return (
    <div>
      <label htmlFor={props.id}>{props.label}</label>
      <input
        id={props.id}
        type={props.type ?? 'text'}
        value={props.value}
        placeholder={props.placeholder}
        list={listId}
        onInput={(e) => props.onInput(e.currentTarget.value)}
        onBlur={props.onBlur}
      />
      {listId ? (
        <datalist id={listId}>
          {props.list!.map((option) => (
            <option value={option} />
          ))}
        </datalist>
      ) : null}
    </div>
  );
}

function ComboboxField(props: {
  label: string;
  id: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const { label, id, value, options, onChange } = props;

  if (creating) {
    return (
      <div>
        <label htmlFor={id}>{label}</label>
        <div class="inline-create">
          <input
            id={id}
            value={value}
            placeholder={`New ${label.toLowerCase()}`}
            onInput={(e) => onChange(e.currentTarget.value)}
          />
          <button type="button" onClick={() => setCreating(false)}>
            Done
          </button>
        </div>
      </div>
    );
  }

  const opts = value && !options.includes(value) ? [value, ...options] : options;

  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <div class="combobox">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
        >
          <option value="">—</option>
          {opts.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <button type="button" aria-label={`Add ${label}`} onClick={() => setCreating(true)}>
          +
        </button>
      </div>
    </div>
  );
}

function ItemForm(props: {
  form: FormState;
  onChange: (key: keyof FormState, value: string) => void;
  onNameBlur: () => void;
  submitLabel: string;
  suggestions: Autocomplete;
  containers: { id: string; name: string }[];
  onSubmit: (e: Event) => void;
  onCancel?: () => void;
}) {
  const { form, suggestions, onChange } = props;

  return (
    <form onSubmit={props.onSubmit} aria-label="item-form">
      <TextInput
        label="Name"
        id="item-name"
        value={form.name}
        placeholder="e.g. Sony TV"
        list={suggestions.names}
        onInput={(v) => onChange('name', v)}
        onBlur={props.onNameBlur}
      />
      <div>
        <label htmlFor="item-container">Container</label>
        <select
          id="item-container"
          value={form.containerId}
          onChange={(e) => onChange('containerId', e.currentTarget.value)}
        >
          <option value="">—</option>
          {props.containers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <ComboboxField
        label="Category"
        id="item-category"
        value={form.category}
        options={suggestions.categories}
        onChange={(v) => onChange('category', v)}
      />
      <TextInput
        label="Quantity"
        id="item-quantity"
        type="number"
        value={form.quantity}
        placeholder="1"
        onInput={(v) => onChange('quantity', v)}
      />
      <ComboboxField
        label="Unit"
        id="item-unit"
        value={form.unit}
        options={suggestions.units}
        onChange={(v) => onChange('unit', v)}
      />
      <ComboboxField
        label="Location"
        id="item-location"
        value={form.location}
        options={suggestions.locations}
        onChange={(v) => onChange('location', v)}
      />
      <TextInput
        label="Purchase date"
        id="item-purchase-date"
        type="date"
        value={form.purchase_date}
        onInput={(v) => onChange('purchase_date', v)}
      />
      <TextInput
        label="Purchase price"
        id="item-purchase-price"
        type="number"
        value={form.purchase_price}
        placeholder="0.00"
        onInput={(v) => onChange('purchase_price', v)}
      />
      <ComboboxField
        label="Condition"
        id="item-condition"
        value={form.condition}
        options={suggestions.conditions}
        onChange={(v) => onChange('condition', v)}
      />
      <TextInput
        label="Notes"
        id="item-notes"
        value={form.notes}
        placeholder="any extra details"
        onInput={(v) => onChange('notes', v)}
      />
      <button type="submit">{props.submitLabel}</button>
      {props.onCancel ? (
        <button type="button" onClick={props.onCancel}>
          Cancel
        </button>
      ) : null}
    </form>
  );
}

function matches(item: Item, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return [item.name, item.category, item.location, item.notes]
    .some((v) => v.toLowerCase().includes(q));
}

export default function InventoryView() {
  const { items: list, loading, error } = useItems();
  const metaData = useMeta();
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<FormState>(toFormState({}));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [stage, setStage] = useState<'idle' | 'capturing' | 'extracting'>('idle');
  const [flowError, setFlowError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'tree'>('list');
  const fileRef = useRef<HTMLInputElement>(null);

  const containers = list
    .filter((i) => i.id !== editingId)
    .map((i) => ({ id: i.id, name: i.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const filtered = list.filter((i) => matches(i, query));
  const suggestions = buildAutocomplete(list, {
    categories: metaData.categories.map((c) => c.name),
    locations: metaData.locations.map((l) => l.name),
    units: metaData.units.map((u) => u.name),
    conditions: metaData.conditions.map((c) => c.name),
  });

  function changeField(key: keyof FormState, value: string) {
    setFormError(null);
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onNameBlur() {
    setForm((prev) => {
      const known = findLastBy(list, 'name', prev.name);
      return known ? applyDefaults(prev, known) : prev;
    });
  }

  async function onAddByPhoto() {
    setFlowError(null);
    setStage('capturing');
    try {
      const base64 = await captureFrame();
      setStage('extracting');
      const fields = await extractItem(base64);
      setForm(toFormState(fields));
      setEditingId(null);
    } catch (err) {
      setFlowError(err instanceof Error ? err.message : String(err));
    } finally {
      setStage('idle');
    }
  }

  function onSubmit(e: Event) {
    e.preventDefault();
    setFormError(null);
    let fields: ItemFields;
    try {
      fields = formToFields(form);
    } catch (err) {
      setFormError(friendlyError(err));
      return;
    }
    if (editingId) {
      const existing = list.find((i) => i.id === editingId);
      if (existing) items.update({ ...existing, ...fields });
    } else {
      items.add(fields);
    }
    setForm(toFormState({}));
    setEditingId(null);
    setNotice(editingId ? 'Updated' : 'Saved');
    window.setTimeout(() => setNotice(null), 2000);
  }

  function onEdit(item: Item) {
    setForm(toFormState(item));
    setEditingId(item.id);
  }

  function onCancel() {
    setForm(toFormState({}));
    setEditingId(null);
  }

  function onExport() {
    const csv = itemsToCsv(items.get().items);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inventory.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onExportDb() {
    const bytes = await db.exportDatabase();
    const blob = new Blob([bytes], { type: 'application/x-sqlite3' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inventory.sqlite';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onImportFile(e: JSX.TargetedEvent<HTMLInputElement, Event>) {
    setImportError(null);
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await db.importDatabase(bytes);
      await items.refresh();
      await meta.refresh();
      setNotice('Imported');
      window.setTimeout(() => setNotice(null), 2000);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      e.currentTarget.value = '';
    }
  }

  async function onReparent(id: string, parentId: string | null) {
    const item = list.find((i) => i.id === id);
    if (!item || item.parent_id === parentId) return;
    try {
      await items.update({ ...item, parent_id: parentId });
      setTreeError(null);
    } catch (err) {
      setTreeError(err instanceof Error ? err.message : String(err));
    }
  }

  function onAddChild(parentId: string) {
    setForm(toFormState({ parent_id: parentId }));
    setEditingId(null);
  }

  return (
    <section id="inventory">
      <h2>Items</h2>

      <div class="inventory-toolbar">
        <input
          type="search"
          placeholder="Search"
          aria-label="Search"
          value={query}
          onInput={(e) => setQuery(e.currentTarget.value)}
        />

        <button onClick={onAddByPhoto} disabled={stage !== 'idle'}>
          {stage === 'capturing'
            ? 'Capturing...'
            : stage === 'extracting'
              ? 'Extracting...'
              : 'Add by photo'}
        </button>

        <button onClick={onExport} disabled={list.length === 0}>
          Export CSV
        </button>

        <button onClick={onExportDb} disabled={list.length === 0}>
          Export SQLite
        </button>

        <button onClick={() => fileRef.current?.click()}>
          Import SQLite
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".sqlite,.sqlite3,.db"
          style="display:none"
          onChange={onImportFile}
        />

        <div class="view-toggle">
          <button
            class={view === 'list' ? 'active' : ''}
            onClick={() => setView('list')}
            aria-pressed={view === 'list'}
          >
            List
          </button>
          <button
            class={view === 'tree' ? 'active' : ''}
            onClick={() => setView('tree')}
            aria-pressed={view === 'tree'}
          >
            Tree
          </button>
        </div>
      </div>

      {importError ? <p role="alert">{importError}</p> : null}

      {treeError ? <p role="alert">{treeError}</p> : null}

      {flowError ? <p role="alert">{flowError}</p> : null}

      {error ? <p role="alert">{error}</p> : null}

      {formError ? <p role="alert">{formError}</p> : null}

      {notice ? <p role="status">{notice}</p> : null}

      <ItemForm
        form={form}
        onChange={changeField}
        onNameBlur={onNameBlur}
        submitLabel={editingId ? 'Update' : 'Add'}
        suggestions={suggestions}
        containers={containers}
        onSubmit={onSubmit}
        onCancel={editingId ? onCancel : undefined}
      />

      {loading ? (
        <p>Loading...</p>
      ) : view === 'tree' ? (
        <ItemTreeView
          items={list}
          onEdit={onEdit}
          onDelete={(id) => items.remove(id)}
          onAddChild={onAddChild}
          onReparent={onReparent}
        />
      ) : (
        <ul data-testid="item-list">
          {filtered.map((item) => (
            <li key={item.id}>
              <span>
                {item.name}
                {item.category ? ` — ${item.category}` : ''}
                {item.location ? ` @ ${item.location}` : ''}
                {item.quantity > 1 ? ` (x${item.quantity})` : ''}
              </span>
              <button onClick={() => onEdit(item)}>Edit</button>
              <button onClick={() => items.remove(item.id)}>Delete</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
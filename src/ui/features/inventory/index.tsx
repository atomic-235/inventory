import { useState } from 'preact/hooks';
import { useItems, items } from '../../useItems';
import { useMeta } from '../../useMeta';
import { captureFrame } from '../../../data/camera';
import { extractItem } from '../../../data/vision';
import { itemsToCsv } from '../../../domain/csv';
import { buildAutocomplete, findLastBy } from '../../../domain/autocomplete';
import type { Autocomplete } from '../../../domain/autocomplete';
import { ItemFieldsSchema } from '../../../domain/item';
import type { Item, ItemFields } from '../../../domain/item';

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
  };
}

function formToFields(form: FormState): ItemFields {
  return ItemFieldsSchema.parse({
    ...form,
    quantity: form.quantity === '' ? 1 : form.quantity,
    purchase_price: form.purchase_price === '' ? null : form.purchase_price,
  });
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

type FieldDef = {
  label: string;
  id: string;
  key: keyof FormState;
  type?: string;
  placeholder?: string;
  options?: string[];
};

function Field(props: {
  def: FieldDef;
  value: string;
  onInput: (value: string) => void;
}) {
  const { def, value } = props;
  const listId = def.options && def.options.length ? `${def.id}-options` : undefined;

  return (
    <div>
      <label htmlFor={def.id}>{def.label}</label>
      <input
        id={def.id}
        type={def.type ?? 'text'}
        value={value}
        placeholder={def.placeholder}
        list={listId}
        onInput={(e) => props.onInput(e.currentTarget.value)}
      />
      {listId ? (
        <datalist id={listId}>
          {def.options!.map((option) => (
            <option value={option} />
          ))}
        </datalist>
      ) : null}
    </div>
  );
}

function ItemForm(props: {
  form: FormState;
  onChange: (key: keyof FormState, value: string) => void;
  submitLabel: string;
  suggestions: Autocomplete;
  onSubmit: (e: Event) => void;
  onCancel?: () => void;
}) {
  const fields: FieldDef[] = [
    { label: 'Name', id: 'item-name', key: 'name', placeholder: 'e.g. Sony TV', options: props.suggestions.names },
    { label: 'Category', id: 'item-category', key: 'category', placeholder: 'e.g. Electronics', options: props.suggestions.categories },
    { label: 'Quantity', id: 'item-quantity', key: 'quantity', type: 'number', placeholder: '1' },
    { label: 'Unit', id: 'item-unit', key: 'unit', placeholder: 'e.g. pc, set, kg', options: props.suggestions.unitsFor(props.form.category) },
    { label: 'Location', id: 'item-location', key: 'location', placeholder: 'e.g. Living Room', options: props.suggestions.locationsFor(props.form.category) },
    { label: 'Purchase date', id: 'item-purchase-date', key: 'purchase_date', placeholder: 'YYYY-MM-DD' },
    { label: 'Purchase price', id: 'item-purchase-price', key: 'purchase_price', type: 'number', placeholder: '0.00' },
    { label: 'Condition', id: 'item-condition', key: 'condition', placeholder: 'e.g. new, good, used', options: props.suggestions.conditions },
    { label: 'Notes', id: 'item-notes', key: 'notes', placeholder: 'any extra details' },
  ];

  return (
    <form onSubmit={props.onSubmit} aria-label="item-form">
      {fields.map((def) => (
        <Field
          def={def}
          value={props.form[def.key]}
          onInput={(value) => props.onChange(def.key, value)}
        />
      ))}
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

  const filtered = list.filter((i) => matches(i, query));
  const suggestions = buildAutocomplete(list, {
    categories: metaData.categories.map((c) => c.name),
    locations: metaData.locations.map((l) => l.name),
    units: metaData.units.map((u) => u.name),
    conditions: metaData.conditions.map((c) => c.name),
  });

  function changeField(key: keyof FormState, value: string) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'name') {
        const known = findLastBy(list, 'name', value);
        if (known) return applyDefaults(next, known);
      } else if (key === 'category') {
        const known = findLastBy(list, 'category', value);
        if (known) return applyDefaults(next, known);
      }
      return next;
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
    const fields = formToFields(form);
    if (editingId) {
      const existing = list.find((i) => i.id === editingId);
      if (existing) items.update({ ...existing, ...fields });
    } else {
      items.add(fields);
    }
    setForm(toFormState({}));
    setEditingId(null);
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
      </div>

      {flowError ? <p role="alert">{flowError}</p> : null}

      {error ? <p role="alert">{error}</p> : null}

      <ItemForm
        form={form}
        onChange={changeField}
        submitLabel={editingId ? 'Update' : 'Add'}
        suggestions={suggestions}
        onSubmit={onSubmit}
        onCancel={editingId ? onCancel : undefined}
      />

      {loading ? (
        <p>Loading...</p>
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
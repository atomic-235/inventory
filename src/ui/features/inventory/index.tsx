import { useState } from 'preact/hooks';
import { useItems, items } from '../../useItems';
import { captureFrame } from '../../../data/camera';
import { extractItem } from '../../../data/vision';
import { itemsToCsv } from '../../../domain/csv';
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

function Field(props: {
  label: string;
  id: string;
  value: string;
  onInput: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label htmlFor={props.id}>{props.label}</label>
      <input
        id={props.id}
        type={props.type ?? 'text'}
        value={props.value}
        onInput={(e) => props.onInput(e.currentTarget.value)}
      />
    </div>
  );
}

function ItemForm(props: {
  initial: Partial<ItemFields>;
  submitLabel: string;
  onSubmit: (fields: ItemFields) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<FormState>(toFormState(props.initial));
  const set = (key: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = (e: Event) => {
    e.preventDefault();
    props.onSubmit(formToFields(form));
  };

  return (
    <form onSubmit={submit} aria-label="item-form">
      <Field label="Name" id="item-name" value={form.name} onInput={set('name')} />
      <Field label="Category" id="item-category" value={form.category} onInput={set('category')} />
      <Field label="Quantity" id="item-quantity" value={form.quantity} onInput={set('quantity')} type="number" />
      <Field label="Unit" id="item-unit" value={form.unit} onInput={set('unit')} />
      <Field label="Location" id="item-location" value={form.location} onInput={set('location')} />
      <Field label="Purchase date" id="item-purchase-date" value={form.purchase_date} onInput={set('purchase_date')} />
      <Field label="Purchase price" id="item-purchase-price" value={form.purchase_price} onInput={set('purchase_price')} type="number" />
      <Field label="Condition" id="item-condition" value={form.condition} onInput={set('condition')} />
      <Field label="Notes" id="item-notes" value={form.notes} onInput={set('notes')} />
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
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<ItemFields | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  const [stage, setStage] = useState<'idle' | 'capturing' | 'extracting'>('idle');
  const [flowError, setFlowError] = useState<string | null>(null);

  const filtered = list.filter((i) => matches(i, query));

  async function onAddByPhoto() {
    setFlowError(null);
    setStage('capturing');
    try {
      const base64 = await captureFrame();
      setStage('extracting');
      const fields = await extractItem(base64);
      setDraft(fields);
    } catch (err) {
      setFlowError(err instanceof Error ? err.message : String(err));
    } finally {
      setStage('idle');
    }
  }

  function onSaveNew(fields: ItemFields) {
    items.add(fields);
    setDraft(null);
  }

  function onSaveEdit(fields: ItemFields) {
    if (editing) items.update({ ...editing, ...fields });
    setEditing(null);
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

      {flowError ? <p role="alert">{flowError}</p> : null}

      {error ? <p role="alert">{error}</p> : null}

      {draft ? (
        <ItemForm
          initial={draft}
          submitLabel="Save"
          onSubmit={onSaveNew}
          onCancel={() => setDraft(null)}
        />
      ) : null}

      {editing ? (
        <ItemForm
          initial={editing}
          submitLabel="Update"
          onSubmit={onSaveEdit}
          onCancel={() => setEditing(null)}
        />
      ) : null}

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
              <button onClick={() => setEditing(item)}>Edit</button>
              <button onClick={() => items.remove(item.id)}>Delete</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
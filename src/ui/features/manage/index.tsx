import { useState } from 'preact/hooks';
import { useMeta, meta } from '../../useMeta';
import type { Lookup, LookupTable } from '../../../domain/lookup';

function LookupSection(props: {
  title: string;
  table: LookupTable;
  items: Lookup[];
}) {
  const [adding, setAdding] = useState('');
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);

  async function onAdd() {
    const name = adding.trim();
    if (!name) return;
    await meta.add(props.table, name);
    setAdding('');
  }

  async function onSaveEdit() {
    if (editing && editing.name.trim()) {
      await meta.rename(props.table, editing.id, editing.name.trim());
      setEditing(null);
    }
  }

  return (
    <section class="lookup-section" data-testid={`lookup-section-${props.table}`}>
      <h3>{props.title}</h3>
      <div class="lookup-add">
        <input
          value={adding}
          placeholder={`Add ${props.title.toLowerCase()}`}
          onInput={(e) => setAdding(e.currentTarget.value)}
        />
        <button onClick={onAdd}>Add</button>
      </div>
      <ul data-testid={`lookup-${props.table}`}>
        {props.items.map((item) =>
          editing && editing.id === item.id ? (
            <li key={item.id}>
              <input
                value={editing.name}
                onInput={(e) => setEditing({ id: editing.id, name: e.currentTarget.value })}
              />
              <button onClick={onSaveEdit}>Save</button>
              <button onClick={() => setEditing(null)}>Cancel</button>
            </li>
          ) : (
            <li key={item.id}>
              <span>{item.name}</span>
              <button onClick={() => setEditing({ id: item.id, name: item.name })}>Rename</button>
              <button onClick={() => meta.remove(props.table, item.id)}>Delete</button>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

export default function ManageView() {
  const m = useMeta();

  return (
    <div>
      <h2>Manage</h2>
      <LookupSection title="Categories" table="categories" items={m.categories} />
      <LookupSection title="Locations" table="locations" items={m.locations} />
      <LookupSection title="Units" table="units" items={m.units} />
      <LookupSection title="Conditions" table="conditions" items={m.conditions} />
    </div>
  );
}
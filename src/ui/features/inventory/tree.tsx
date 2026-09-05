import { useState } from 'preact/hooks';
import { buildTree } from '../../../domain/tree';
import type { Item } from '../../../domain/item';

export function ItemTreeView(props: {
  items: Item[];
  onEdit: (item: Item) => void;
  onDelete: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onReparent: (id: string, parentId: string | null) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [over, setOver] = useState<string | null>(null);
  const tree = buildTree(props.items);

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderNode(item: Item, depth: number) {
    const kids = tree.childrenOf(item.id);
    const isCollapsed = collapsed.has(item.id);
    return (
      <div key={item.id}>
        <div
          class={over === item.id ? 'tree-row tree-row--over' : 'tree-row'}
          data-item-id={item.id}
          style={{ paddingLeft: `${depth * 16}px` }}
          draggable
          onDragStart={(e) => e.dataTransfer?.setData('text/plain', item.id)}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(item.id);
          }}
          onDragLeave={() => setOver((o) => (o === item.id ? null : o))}
          onDrop={(e) => {
            e.preventDefault();
            setOver(null);
            const id = e.dataTransfer?.getData('text/plain');
            if (id && id !== item.id) props.onReparent(id, item.id);
          }}
        >
          {kids.length ? (
            <button class="twisty" onClick={() => toggle(item.id)} aria-label="Toggle">
              {isCollapsed ? '▶' : '▼'}
            </button>
          ) : (
            <span class="twisty twisty--leaf" />
          )}
          <span class="tree-name">
            {item.code ? <span class="tree-code">[{item.code}]</span> : null} {item.name}
          </span>
          <span class="tree-meta">
            {item.category ? `${item.category}` : ''}
            {item.quantity > 1 ? ` ×${item.quantity}` : ''}
          </span>
          <span class="tree-actions">
            <button onClick={() => props.onAddChild(item.id)}>+ Child</button>
            <button onClick={() => props.onEdit(item)}>Edit</button>
            <button onClick={() => props.onDelete(item.id)}>Delete</button>
          </span>
        </div>
        {!isCollapsed ? <>{kids.map((k) => renderNode(k, depth + 1))}</> : null}
      </div>
    );
  }

  return (
    <div class="tree">
      <div
        class={over === '__root__' ? 'tree-root tree-row--over' : 'tree-root'}
        onDragOver={(e) => {
          e.preventDefault();
          setOver('__root__');
        }}
        onDragLeave={() => setOver((o) => (o === '__root__' ? null : o))}
        onDrop={(e) => {
          e.preventDefault();
          setOver(null);
          const id = e.dataTransfer?.getData('text/plain');
          if (id) props.onReparent(id, null);
        }}
        data-testid="tree-root"
      >
        <em>Loose items (drop here to un-nest)</em>
      </div>
      <ul class="tree-list" data-testid="item-tree">
        {tree.roots.map((item) => renderNode(item, 0))}
      </ul>
    </div>
  );
}
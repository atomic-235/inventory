import { useHashRoute, navigate } from './router';
import InventoryView from './ui/features/inventory';
import Settings from './ui/features/settings';

export default function App() {
  const route = useHashRoute();

  return (
    <div>
      <h1>Inventory</h1>
      <nav>
        <a href="#/" onClick={() => navigate('#/')}>
          Items
        </a>
        {' | '}
        <a href="#/settings" onClick={() => navigate('#/settings')}>
          Settings
        </a>
      </nav>

      {route === '#/settings' ? <Settings /> : <InventoryView />}
    </div>
  );
}
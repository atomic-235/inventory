import { useHashRoute } from './router';
import Settings from './ui/features/settings';

export default function App() {
  const route = useHashRoute();

  return (
    <div>
      <h1>Inventory</h1>
      {route === '#/settings' ? <Settings /> : <p>Inventory list coming soon.</p>}
    </div>
  );
}
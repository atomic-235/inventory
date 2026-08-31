import { useEffect, useState } from 'preact/hooks';

export function useHashRoute(): string {
  const [route, setRoute] = useState(() => window.location.hash || '#/');

  useEffect(() => {
    const onChange = () => setRoute(window.location.hash || '#/');
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}

export function navigate(path: string): void {
  window.location.hash = path;
}
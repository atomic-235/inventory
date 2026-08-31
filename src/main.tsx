import { render } from 'preact';
import App from './app';
import { db } from './db';

declare global {
  interface Window {
    __db: typeof db;
  }
}

window.__db = db;

render(<App />, document.getElementById('app')!);
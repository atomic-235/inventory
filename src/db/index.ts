import { DbFacade } from './facade';
import type { Transport } from './facade';
import type { Request } from './protocol';

const worker = new Worker(new URL('../db-worker/index.ts', import.meta.url), {
  type: 'module',
});

const transport: Transport = {
  postMessage(message: Request): void {
    worker.postMessage(message);
  },
  onMessage(handler: (message: unknown) => void): void {
    worker.addEventListener('message', (event: MessageEvent) => handler(event.data));
  },
};

export const db = new DbFacade(transport);
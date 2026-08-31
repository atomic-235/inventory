declare module 'wa-sqlite/dist/wa-sqlite-async.mjs' {
  export interface SQLiteModule {
    [key: string]: unknown;
  }
  export default function SQLiteESMFactory(): Promise<SQLiteModule>;
}

declare module 'wa-sqlite' {
  export class SQLiteError extends Error {
    code?: number;
  }

  export interface SQLiteAPI {
    vfs_register(vfs: unknown, makeDefault: boolean): number;
    open_v2(name: string, flags?: number, vfs?: string): Promise<number>;
    close(db: number): Promise<number>;
    exec(
      db: number,
      sql: string,
      callback?: (row: unknown[], columns: string[]) => void,
    ): Promise<number>;
    run(db: number, sql: string, params?: unknown[]): Promise<number>;
    execWithParams(
      db: number,
      sql: string,
      params?: unknown[],
    ): Promise<{ rows: unknown[][]; columns: string[] }>;
    changes(db: number): number;
  }

  export function Factory(module: unknown): SQLiteAPI;
}

declare module 'wa-sqlite/src/VFS.js' {
  export class Base {
    name: string;
  }
  export const FILE_TYPE_MASK: unknown;
}

declare module 'wa-sqlite/src/examples/OriginPrivateFileSystemVFS.js' {
  import { Base } from 'wa-sqlite/src/VFS.js';
  export class OriginPrivateFileSystemVFS extends Base {}
}

declare module 'wa-sqlite/src/examples/WebLocks.js' {
  export class WebLocksExclusive {}
  export class WebLocksShared {}
}
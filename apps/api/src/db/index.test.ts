import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pragmaCalls: string[] = [];
const openedPaths: string[] = [];
let walCheckpointError: Error | null = null;

vi.mock('better-sqlite3', () => ({
  default: class Database {
    constructor(path: string) {
      openedPaths.push(path);
    }

    pragma(value: string, options?: { simple?: boolean }) {
      pragmaCalls.push(value);

      if (value === 'wal_checkpoint(TRUNCATE)' && walCheckpointError) {
        throw walCheckpointError;
      }

      if (value === 'foreign_keys' && options?.simple) {
        return 1;
      }

      return value;
    }

    close() {
      return undefined;
    }
  },
}));

vi.mock('drizzle-orm/better-sqlite3', () => ({
  drizzle: vi.fn(() => ({ mocked: true })),
}));

const importDbModule = async () => import('./index.js');

describe('db bootstrap', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalCwd = process.cwd();

  beforeEach(() => {
    pragmaCalls.length = 0;
    openedPaths.length = 0;
    walCheckpointError = null;
  });

  afterEach(async () => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    process.chdir(originalCwd);
    vi.resetModules();
  });

  it('enables foreign key enforcement on the sqlite connection', async () => {
    process.env.DATABASE_URL = ':memory:';
    vi.resetModules();

    const module = await importDbModule();

    try {
      expect(module.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(pragmaCalls).toEqual([
        'journal_mode = WAL',
        'foreign_keys = ON',
        'foreign_keys',
      ]);
    } finally {
      module.sqlite.close();
    }
  });

  it('creates the parent directory for relative file URIs', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'pulse-db-'));

    process.chdir(tempRoot);
    process.env.DATABASE_URL = 'file:./data/pulse.db';
    vi.resetModules();

    const module = await importDbModule();

    try {
      expect(openedPaths).toEqual(['file:./data/pulse.db']);
      expect(existsSync(join(tempRoot, 'data'))).toBe(true);
    } finally {
      module.sqlite.close();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('logs periodic WAL checkpoint failures for file-backed databases', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'pulse-db-'));
    const checkpointError = new Error('checkpoint failed');
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');

    process.chdir(tempRoot);
    process.env.DATABASE_URL = './data/pulse.db';
    walCheckpointError = checkpointError;
    vi.resetModules();

    const module = await importDbModule();

    try {
      const checkpointCallback = setIntervalSpy.mock.calls.at(-1)?.[0] as (() => void) | undefined;

      expect(checkpointCallback).toBeTypeOf('function');

      checkpointCallback?.();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Periodic WAL checkpoint failed:',
        checkpointError,
      );
    } finally {
      module.sqlite.close();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

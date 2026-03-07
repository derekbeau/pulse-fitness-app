import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pragmaCalls: string[] = [];
const openedPaths: string[] = [];

vi.mock('better-sqlite3', () => ({
  default: class Database {
    constructor(path: string) {
      openedPaths.push(path);
    }

    pragma(value: string, options?: { simple?: boolean }) {
      pragmaCalls.push(value);

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
});

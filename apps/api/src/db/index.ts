import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import * as schema from './schema/index.js';

const DEFAULT_DATABASE_URL = './data/pulse.db';

const isInMemoryDatabase = (databaseUrl: string) =>
  databaseUrl === ':memory:' || databaseUrl.startsWith('file::memory:');

const getFileUriPath = (databaseUrl: string) =>
  databaseUrl.slice('file:'.length).split(/[?#]/u, 1)[0];

const resolveDatabasePath = (databaseUrl: string) => {
  if (databaseUrl === ':memory:' || databaseUrl.startsWith('file:')) {
    return databaseUrl;
  }

  return isAbsolute(databaseUrl) ? databaseUrl : resolve(process.cwd(), databaseUrl);
};

const resolveFilesystemDatabasePath = (databaseUrl: string) => {
  if (isInMemoryDatabase(databaseUrl)) {
    return null;
  }

  if (databaseUrl.startsWith('file:')) {
    const fileUriPath = getFileUriPath(databaseUrl);
    return isAbsolute(fileUriPath) ? fileUriPath : resolve(process.cwd(), fileUriPath);
  }

  return isAbsolute(databaseUrl) ? databaseUrl : resolve(process.cwd(), databaseUrl);
};

const ensureDatabaseDirectory = (databaseUrl: string) => {
  const filesystemPath = resolveFilesystemDatabasePath(databaseUrl);

  if (!filesystemPath) {
    return;
  }

  mkdirSync(dirname(filesystemPath), { recursive: true });
};

const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
const databasePath = resolveDatabasePath(databaseUrl);

ensureDatabaseDirectory(databaseUrl);

export const sqlite = new Database(databasePath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// Periodically checkpoint the WAL into the main DB to prevent unbounded WAL
// growth and reduce corruption risk from unclean container shutdowns.
if (!isInMemoryDatabase(databaseUrl)) {
  const WAL_CHECKPOINT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  setInterval(() => {
    try {
      sqlite.pragma('wal_checkpoint(TRUNCATE)');
    } catch {
      // DB may be closed during shutdown — ignore
    }
  }, WAL_CHECKPOINT_INTERVAL_MS).unref();
}

export const db = drizzle(sqlite, { schema });

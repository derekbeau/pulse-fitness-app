import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import * as schema from './schema/index.js';

const DEFAULT_DATABASE_URL = './data/pulse.db';

const resolveDatabasePath = (databaseUrl: string) => {
  if (databaseUrl === ':memory:' || databaseUrl.startsWith('file:')) {
    return databaseUrl;
  }

  return isAbsolute(databaseUrl) ? databaseUrl : resolve(process.cwd(), databaseUrl);
};

const ensureDatabaseDirectory = (databasePath: string) => {
  if (databasePath === ':memory:' || databasePath.startsWith('file:')) {
    return;
  }

  mkdirSync(dirname(databasePath), { recursive: true });
};

const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
const databasePath = resolveDatabasePath(databaseUrl);

ensureDatabaseDirectory(databasePath);

export const sqlite = new Database(databasePath);
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });

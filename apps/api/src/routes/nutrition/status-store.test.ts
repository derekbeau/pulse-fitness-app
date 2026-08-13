import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { nutritionLogs, users } from '../../db/schema/index.js';

const originalDatabaseUrl = process.env.DATABASE_URL;
let tempDir = '';
let dbModule: typeof import('../../db/index.js');

describe('nutrition status store', () => {
  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'pulse-nutrition-status-'));
    process.env.DATABASE_URL = join(tempDir, 'status.db');
    vi.resetModules();
    dbModule = await import('../../db/index.js');
    migrate(dbModule.db, {
      migrationsFolder: fileURLToPath(new URL('../../../drizzle', import.meta.url)),
    });

    dbModule.db
      .insert(users)
      .values([
        {
          id: 'user-1',
          username: 'user-1',
          passwordHash: 'hash',
          preferences: { timeZone: 'America/Detroit' },
        },
        {
          id: 'user-2',
          username: 'user-2',
          passwordHash: 'hash',
        },
      ])
      .run();
    dbModule.db
      .insert(nutritionLogs)
      .values([
        { id: 'log-today', userId: 'user-1', date: '2026-03-09' },
        { id: 'log-future', userId: 'user-1', date: '2026-03-10' },
      ])
      .run();
  });

  afterEach(() => {
    dbModule.sqlite.close();
    process.env.DATABASE_URL = originalDatabaseUrl;
    rmSync(tempDir, { recursive: true, force: true });
    vi.resetModules();
  });

  it('writes every explicit status with an audit timestamp in user scope', async () => {
    const { updateNutritionLogStatus } = await import('./status-store.js');
    const now = new Date('2026-03-10T03:30:00.000Z');

    const complete = await updateNutritionLogStatus('user-1', '2026-03-09', 'complete', now);
    expect(complete).toMatchObject({
      id: 'log-today',
      status: 'complete',
      statusUpdatedAt: now.getTime(),
      updatedAt: now.getTime(),
    });

    const unknown = await updateNutritionLogStatus('user-1', '2026-03-09', 'unknown', now);
    expect(unknown.status).toBe('unknown');
    const partial = await updateNutritionLogStatus('user-1', '2026-03-09', 'partial', now);
    expect(partial.status).toBe('partial');
  });

  it('rejects future completion in the user local date while allowing exclusion statuses', async () => {
    const { FutureNutritionDateError, updateNutritionLogStatus } =
      await import('./status-store.js');
    const now = new Date('2026-03-10T03:30:00.000Z');

    await expect(
      updateNutritionLogStatus('user-1', '2026-03-10', 'complete', now),
    ).rejects.toBeInstanceOf(FutureNutritionDateError);
    await expect(
      updateNutritionLogStatus('user-1', '2026-03-10', 'partial', now),
    ).resolves.toMatchObject({ status: 'partial' });
  });

  it('requires an owned nutrition log for any status mutation', async () => {
    const { NutritionLogRequiredError, updateNutritionLogStatus } =
      await import('./status-store.js');
    const now = new Date('2026-03-10T03:30:00.000Z');

    await expect(
      updateNutritionLogStatus('user-2', '2026-03-09', 'partial', now),
    ).rejects.toBeInstanceOf(NutritionLogRequiredError);
    await expect(
      updateNutritionLogStatus('user-1', '2026-03-08', 'unknown', now),
    ).rejects.toBeInstanceOf(NutritionLogRequiredError);
  });
});

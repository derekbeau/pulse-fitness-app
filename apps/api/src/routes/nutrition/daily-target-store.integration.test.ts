import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResolvedDailyNutritionTarget } from '@pulse/shared';

import * as schema from '../../db/schema/index.js';
import {
  adaptiveNutritionCheckIns,
  dailyNutritionTargetOverrides,
  nutritionTargetEvents,
  nutritionTargets,
  users,
} from '../../db/schema/index.js';
import { createDailyTargetOverrideStore } from './daily-target-store.js';

let tempDir = '';
let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;
const migrationsFolder = fileURLToPath(new URL('../../../drizzle', import.meta.url));

const resolved = (userId: string, date: string): ResolvedDailyNutritionTarget => ({
  date,
  timeZone: 'America/Detroit',
  baseline: null,
  override: null,
  effective: null,
  adjusted: false,
  overriddenFields: [],
});

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'pulse-daily-target-'));
  sqlite = new Database(join(tempDir, 'test.db'));
  sqlite.pragma('foreign_keys = ON');
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
});

afterAll(() => {
  sqlite.close();
  rmSync(tempDir, { recursive: true, force: true });
});

beforeEach(() => {
  sqlite.exec('DELETE FROM daily_nutrition_target_overrides; DELETE FROM users;');
  db.insert(users)
    .values([
      { id: 'user-1', username: 'one', passwordHash: 'hash' },
      { id: 'user-2', username: 'two', passwordHash: 'hash' },
    ])
    .run();
});

describe('daily target override store', () => {
  it('preserves omitted fields, clears null fields, and deletes an empty override', async () => {
    const resolve = vi.fn(async (userId: string, date: string) => resolved(userId, date));
    const store = createDailyTargetOverrideStore({ db, resolve });
    const adaptiveLedgersBefore = {
      checkIns: db.select().from(adaptiveNutritionCheckIns).all(),
      events: db.select().from(nutritionTargetEvents).all(),
      targets: db.select().from(nutritionTargets).all(),
    };

    await store.patch('user-1', '2026-08-17', {
      calories: 2_600,
      reason: 'Planned event',
    });
    await store.patch('user-1', '2026-08-17', { protein: 200 });

    expect(
      db
        .select()
        .from(dailyNutritionTargetOverrides)
        .where(eq(dailyNutritionTargetOverrides.userId, 'user-1'))
        .get(),
    ).toMatchObject({
      date: '2026-08-17',
      calories: 2_600,
      protein: 200,
      carbs: null,
      fat: null,
      reason: 'Planned event',
    });

    await store.patch('user-1', '2026-08-17', { calories: null });
    expect(
      db
        .select()
        .from(dailyNutritionTargetOverrides)
        .where(eq(dailyNutritionTargetOverrides.userId, 'user-1'))
        .get(),
    ).toMatchObject({ calories: null, protein: 200, reason: 'Planned event' });

    await store.patch('user-1', '2026-08-17', { protein: null });
    expect(db.select().from(dailyNutritionTargetOverrides).all()).toEqual([]);
    expect(resolve).toHaveBeenCalledTimes(8);
    expect({
      checkIns: db.select().from(adaptiveNutritionCheckIns).all(),
      events: db.select().from(nutritionTargetEvents).all(),
      targets: db.select().from(nutritionTargets).all(),
    }).toEqual(adaptiveLedgersBefore);
  });

  it('keeps delete idempotent and strictly owner/date scoped', async () => {
    db.insert(dailyNutritionTargetOverrides)
      .values([
        { id: 'one-a', userId: 'user-1', date: '2026-08-17', calories: 2_500 },
        { id: 'one-b', userId: 'user-1', date: '2026-08-18', calories: 2_600 },
        { id: 'two-a', userId: 'user-2', date: '2026-08-17', calories: 2_700 },
      ])
      .run();
    const store = createDailyTargetOverrideStore({
      db,
      resolve: async (userId, date) => resolved(userId, date),
    });

    await store.delete('user-1', '2026-08-17');
    await store.delete('user-1', '2026-08-17');

    expect(db.select().from(dailyNutritionTargetOverrides).all()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'one-b' }),
        expect.objectContaining({ id: 'two-a' }),
      ]),
    );
    expect(
      db
        .select()
        .from(dailyNutritionTargetOverrides)
        .where(
          and(
            eq(dailyNutritionTargetOverrides.userId, 'user-1'),
            eq(dailyNutritionTargetOverrides.date, '2026-08-17'),
          ),
        )
        .get(),
    ).toBeUndefined();
  });
});

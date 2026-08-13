import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { and, eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  adaptiveNutritionCheckIns,
  adaptiveNutritionPrograms,
  nutritionTargets,
  users,
} from '../../db/schema/index.js';

type DatabaseModule = typeof import('../../db/index.js');

let dbModule: DatabaseModule;
let tempDir = '';

const manualTarget = {
  id: 'target-manual',
  calories: 2200,
  protein: 180,
  carbs: 250,
  fat: 70,
  source: 'manual' as const,
  adaptiveCheckInId: null,
  macroCalories: 2350,
  effectiveDate: '2026-03-09',
  createdAt: 100,
  updatedAt: 100,
};

const seedProgramAndCheckIn = (currentTargets: typeof manualTarget | null) => {
  dbModule.db
    .insert(adaptiveNutritionPrograms)
    .values({
      id: 'program-1',
      userId: 'user-1',
      timeZone: 'America/Detroit',
      rmrEquation: 'manual_tdee',
      baselineTdeeKcal: 2500,
      goalType: 'maintain',
      goalRatePctPerWeek: 0,
      proteinGrams: 180,
      fatAllocationPct: 30,
      systemCalorieFloorKcal: 1500,
      userCalorieFloorKcal: 1500,
      algorithmVersion: 'adaptive-tdee-v1',
    })
    .run();
  dbModule.db
    .insert(adaptiveNutritionCheckIns)
    .values({
      id: 'check-in-1',
      userId: 'user-1',
      programId: 'program-1',
      kind: 'manual',
      status: 'pending',
      calculationState: 'baseline',
      localDate: '2026-03-09',
      includeToday: false,
      algorithmVersion: 'adaptive-tdee-v1',
      dataFingerprint: 'a'.repeat(64),
      inputSnapshot: { version: 1 },
      calculationSnapshot: { version: 1 },
      reasonCodes: [],
      currentTargets,
    })
    .run();
};

describe('nutrition target provenance store', () => {
  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'pulse-target-provenance-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    vi.resetModules();
    dbModule = await import('../../db/index.js');
    migrate(dbModule.db, {
      migrationsFolder: fileURLToPath(new URL('../../../drizzle', import.meta.url)),
    });
  });

  afterAll(() => {
    dbModule.sqlite.close();
    rmSync(tempDir, { recursive: true, force: true });
    delete process.env.DATABASE_URL;
    vi.resetModules();
  });

  beforeEach(() => {
    dbModule.db.delete(nutritionTargets).run();
    dbModule.db.delete(adaptiveNutritionCheckIns).run();
    dbModule.db.delete(adaptiveNutritionPrograms).run();
    dbModule.db.delete(users).run();
    dbModule.db
      .insert(users)
      .values([
        { id: 'user-1', username: 'user-1', passwordHash: 'hash' },
        { id: 'user-2', username: 'user-2', passwordHash: 'hash' },
      ])
      .run();
  });

  it('stores manual provenance and server-derived macro calories', async () => {
    const { upsertNutritionTarget } = await import('./store.js');
    const target = await upsertNutritionTarget('user-1', {
      calories: 2200,
      protein: 180,
      carbs: 250,
      fat: 70,
      effectiveDate: '2026-03-09',
    });

    expect(target).toMatchObject({
      source: 'manual',
      adaptiveCheckInId: null,
      macroCalories: 2350,
    });
  });

  it('requires an owned check-in and exact immutable same-date replacement snapshot', async () => {
    const {
      AdaptiveCheckInNotFoundError,
      ReplacedTargetSnapshotMismatchError,
      SameDateNutritionTargetExistsError,
      persistAdaptiveNutritionTarget,
    } = await import('./store.js');

    dbModule.db
      .insert(nutritionTargets)
      .values({ userId: 'user-1', ...manualTarget })
      .run();
    seedProgramAndCheckIn(manualTarget);

    await expect(
      persistAdaptiveNutritionTarget(
        'user-1',
        'check-in-1',
        {
          calories: 2300,
          protein: 185,
          carbs: 260,
          fat: 75,
          effectiveDate: '2026-03-09',
        },
        false,
      ),
    ).rejects.toBeInstanceOf(SameDateNutritionTargetExistsError);

    const adaptive = await persistAdaptiveNutritionTarget(
      'user-1',
      'check-in-1',
      {
        calories: 2300,
        protein: 185,
        carbs: 260,
        fat: 75,
        effectiveDate: '2026-03-09',
      },
      true,
    );
    expect(adaptive).toMatchObject({
      id: 'target-manual',
      source: 'adaptive',
      adaptiveCheckInId: 'check-in-1',
      macroCalories: 2455,
    });
    expect(
      dbModule.db
        .select({ currentTargets: adaptiveNutritionCheckIns.currentTargets })
        .from(adaptiveNutritionCheckIns)
        .where(eq(adaptiveNutritionCheckIns.id, 'check-in-1'))
        .get(),
    ).toEqual({ currentTargets: manualTarget });

    await expect(
      persistAdaptiveNutritionTarget(
        'user-2',
        'check-in-1',
        {
          calories: 2300,
          protein: 185,
          carbs: 260,
          fat: 75,
          effectiveDate: '2026-03-09',
        },
        true,
      ),
    ).rejects.toBeInstanceOf(AdaptiveCheckInNotFoundError);

    dbModule.db.delete(nutritionTargets).run();
    dbModule.db.delete(adaptiveNutritionCheckIns).run();
    dbModule.db
      .insert(adaptiveNutritionCheckIns)
      .values({
        id: 'check-in-mismatch',
        userId: 'user-1',
        programId: 'program-1',
        kind: 'manual',
        status: 'pending',
        calculationState: 'baseline',
        localDate: '2026-03-09',
        includeToday: false,
        algorithmVersion: 'adaptive-tdee-v1',
        dataFingerprint: 'b'.repeat(64),
        inputSnapshot: { version: 1 },
        calculationSnapshot: { version: 1 },
        reasonCodes: [],
        currentTargets: null,
      })
      .run();
    dbModule.db
      .insert(nutritionTargets)
      .values({ userId: 'user-1', ...manualTarget })
      .run();
    await expect(
      persistAdaptiveNutritionTarget(
        'user-1',
        'check-in-mismatch',
        {
          calories: 2400,
          protein: 190,
          carbs: 270,
          fat: 80,
          effectiveDate: '2026-03-09',
        },
        true,
      ),
    ).rejects.toBeInstanceOf(ReplacedTargetSnapshotMismatchError);
  });

  it('allows a new adaptive date while retaining an earlier current-target snapshot', async () => {
    const { persistAdaptiveNutritionTarget } = await import('./store.js');
    dbModule.db
      .insert(nutritionTargets)
      .values({ userId: 'user-1', ...manualTarget })
      .run();
    seedProgramAndCheckIn(manualTarget);

    await expect(
      persistAdaptiveNutritionTarget(
        'user-1',
        'check-in-1',
        {
          calories: 2300,
          protein: 185,
          carbs: 260,
          fat: 75,
          effectiveDate: '2026-03-10',
        },
        false,
      ),
    ).resolves.toMatchObject({
      source: 'adaptive',
      adaptiveCheckInId: 'check-in-1',
      effectiveDate: '2026-03-10',
    });
  });

  it('allows account deletion only through target-first transaction ordering', async () => {
    const { deleteUserAccount } = await import('../auth/store.js');
    dbModule.db
      .insert(nutritionTargets)
      .values({ userId: 'user-1', ...manualTarget })
      .run();
    seedProgramAndCheckIn(manualTarget);
    dbModule.db
      .update(nutritionTargets)
      .set({ source: 'adaptive', adaptiveCheckInId: 'check-in-1' })
      .where(eq(nutritionTargets.id, 'target-manual'))
      .run();

    await expect(deleteUserAccount('user-1')).resolves.toBe(true);
    expect(
      dbModule.db.select({ id: users.id }).from(users).where(eq(users.id, 'user-1')).get(),
    ).toBeUndefined();
    expect(
      dbModule.db
        .select({ id: adaptiveNutritionCheckIns.id })
        .from(adaptiveNutritionCheckIns)
        .where(eq(adaptiveNutritionCheckIns.userId, 'user-1'))
        .all(),
    ).toEqual([]);
    expect(
      dbModule.db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, 'user-2'), eq(users.username, 'user-2')))
        .get(),
    ).toEqual({ id: 'user-2' });
  });
});

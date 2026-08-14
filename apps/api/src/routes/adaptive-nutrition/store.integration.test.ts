import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { AdaptiveProgramMutation } from '@pulse/shared';

import * as schema from '../../db/schema/index.js';
import {
  adaptiveNutritionCheckIns,
  bodyWeight,
  mealItems,
  meals,
  nutritionLogs,
  nutritionTargets,
  users,
} from '../../db/schema/index.js';

import {
  AdaptiveCheckInNotAcceptableError,
  AdaptiveCheckInNotFoundError,
  AdaptiveCheckInStaleError,
  AdaptiveCalorieFloorError,
  AdaptiveCurrentWeightRequiredError,
  AdaptiveGoalDirectionError,
  AdaptivePendingCheckInExistsError,
  AdaptiveSameDateTargetExistsError,
  createAdaptiveNutritionStore,
} from './store.js';

type TestDatabase = ReturnType<typeof drizzle<typeof schema>>;
type TestStore = ReturnType<typeof createAdaptiveNutritionStore>;

let tempDir = '';
let databasePath = '';
let sqliteA: Database.Database;
let sqliteB: Database.Database;
let dbA: TestDatabase;
let dbB: TestDatabase;
let nowMs = Date.parse('2026-06-01T16:00:00.000Z');
let storeA: TestStore;
let storeB: TestStore;

const migrationsFolder = fileURLToPath(new URL('../../../drizzle', import.meta.url));

const datePlus = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const poundsFromKg = (weightKg: number) => weightKg / 0.45359237;

const requireValue = <T>(value: T | null | undefined, message: string): T => {
  if (value == null) throw new Error(message);
  return value;
};

const programInput = (
  overrides: Partial<AdaptiveProgramMutation> = {},
): AdaptiveProgramMutation => ({
  status: 'active',
  timeZone: 'America/Detroit',
  heightCm: null,
  birthDate: null,
  rmrEquation: 'manual_tdee',
  activityLevel: null,
  manualBaselineTdeeKcal: 2500,
  goalType: 'maintain',
  targetWeightKg: null,
  goalRatePctPerWeek: 0,
  proteinGrams: 180,
  fatAllocationPct: 30,
  currentWeight: { weight: 82, unit: 'kg' },
  rebaseline: false,
  supersedePending: false,
  ...overrides,
});

const seedUsers = () => {
  dbA
    .insert(users)
    .values([
      { id: 'user-1', username: 'adaptive-1', passwordHash: 'hash', weightUnit: 'lbs' },
      { id: 'user-2', username: 'adaptive-2', passwordHash: 'hash', weightUnit: 'kg' },
      { id: 'user-3', username: 'adaptive-3', passwordHash: 'hash', weightUnit: 'lbs' },
      { id: 'user-4', username: 'adaptive-4', passwordHash: 'hash', weightUnit: 'lbs' },
    ])
    .run();
};

const seedWeight = (
  userId: string,
  date: string,
  weightKg: number,
  updatedAt = nowMs,
  id = `${userId}-weight-${date}`,
) => {
  dbA
    .insert(bodyWeight)
    .values({
      id,
      userId,
      date,
      weight: poundsFromKg(weightKg),
      weightKg,
      unitAtEntry: 'kg',
      updatedAt,
    })
    .onConflictDoUpdate({
      target: [bodyWeight.userId, bodyWeight.date],
      set: { weight: poundsFromKg(weightKg), weightKg, unitAtEntry: 'kg', updatedAt },
    })
    .run();
};

const seedEligibleHistory = (userId: string, start = '2026-06-01') => {
  for (let offset = 0; offset < 21; offset += 1) {
    const date = datePlus(start, offset);
    const logId = `${userId}-log-${date}`;
    const mealId = `${userId}-meal-${date}`;
    dbA
      .insert(nutritionLogs)
      .values({
        id: logId,
        userId,
        date,
        status: 'complete',
        statusUpdatedAt: nowMs + offset,
        updatedAt: nowMs + offset,
      })
      .run();
    dbA.insert(meals).values({ id: mealId, nutritionLogId: logId, name: 'Daily total' }).run();
    dbA
      .insert(mealItems)
      .values({
        id: `${userId}-item-${date}`,
        mealId,
        name: 'Food',
        amount: 1,
        unit: 'serving',
        calories: 2400,
        protein: 180,
        carbs: 250,
        fat: 75,
      })
      .run();
  }
  [
    ['2026-06-01', 82],
    ['2026-06-08', 81.95],
    ['2026-06-15', 81.9],
    ['2026-06-21', 81.85],
  ].forEach(([date, weightKg], index) =>
    seedWeight(userId, date as string, weightKg as number, nowMs + index),
  );
};

const acceptBaselineAndAdvance = (userId = 'user-1', store = storeA) => {
  const program = store.upsertProgram(userId, programInput());
  const baseline = store.getState(userId).pendingCheckIn;
  expect(baseline?.kind).toBe('baseline');
  store.acceptCheckIn(userId, requireValue(baseline, 'Expected baseline check-in').id, {
    replaceSameDateTarget: false,
  });
  nowMs = Date.parse('2026-06-22T16:00:00.000Z');
  return program;
};

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'pulse-adaptive-lifecycle-'));
  databasePath = join(tempDir, 'test.db');
  sqliteA = new Database(databasePath);
  sqliteA.pragma('foreign_keys = ON');
  sqliteA.pragma('journal_mode = WAL');
  sqliteA.pragma('busy_timeout = 2000');
  dbA = drizzle(sqliteA, { schema });
  migrate(dbA, { migrationsFolder });
  sqliteB = new Database(databasePath);
  sqliteB.pragma('foreign_keys = ON');
  sqliteB.pragma('journal_mode = WAL');
  sqliteB.pragma('busy_timeout = 2000');
  dbB = drizzle(sqliteB, { schema });
});

afterAll(() => {
  sqliteB.close();
  sqliteA.close();
  rmSync(tempDir, { recursive: true, force: true });
});

beforeEach(() => {
  sqliteA.exec(`
    INSERT OR IGNORE INTO adaptive_nutrition_account_deletion_scope (user_id)
    SELECT id FROM users;
    DELETE FROM nutrition_targets;
    DELETE FROM adaptive_nutrition_checkins;
    DELETE FROM adaptive_nutrition_programs;
    DELETE FROM users;
  `);
  seedUsers();
  nowMs = Date.parse('2026-06-01T16:00:00.000Z');
  storeA = createAdaptiveNutritionStore({ db: dbA, sqlite: sqliteA, now: () => new Date(nowMs) });
  storeB = createAdaptiveNutritionStore({ db: dbB, sqlite: sqliteB, now: () => new Date(nowMs) });
});

describe('adaptive nutrition lifecycle store', () => {
  it('creates one lifetime program with an entered canonical weight and accepts its baseline', () => {
    const program = storeA.upsertProgram('user-1', programInput());
    const state = storeA.getState('user-1');
    const persistedWeight = dbA
      .select()
      .from(bodyWeight)
      .where(and(eq(bodyWeight.userId, 'user-1'), eq(bodyWeight.date, '2026-06-01')))
      .get();

    expect(program.baselineTdeeKcal).toBe(2500);
    expect(persistedWeight).toMatchObject({ weightKg: 82, unitAtEntry: 'kg' });
    expect(persistedWeight?.weight).toBeCloseTo(poundsFromKg(82), 8);
    expect(state.state).toBe('pending_recommendation');
    expect(state.pendingCheckIn).toMatchObject({ kind: 'baseline', status: 'pending' });
    const pending = requireValue(state.pendingCheckIn, 'Expected pending baseline check-in');

    const accepted = storeA.acceptCheckIn('user-1', pending.id, {
      replaceSameDateTarget: false,
    });
    expect(accepted.target).toMatchObject({
      source: 'adaptive',
      adaptiveCheckInId: pending.id,
      effectiveDate: '2026-06-01',
    });
    expect(
      storeA.acceptCheckIn('user-1', pending.id, {
        replaceSameDateTarget: false,
      }),
    ).toEqual(accepted);
    expect(storeA.getState('user-1').state).toBe('learning');
  });

  it('uses a qualifying saved weight, rejects missing or old weight, and rolls back failed setup', () => {
    seedWeight('user-2', '2026-05-26', 75);
    const saved = storeA.upsertProgram(
      'user-2',
      programInput({ currentWeight: null, manualBaselineTdeeKcal: 2300 }),
    );
    expect(saved.baselineTdeeKcal).toBe(2300);

    expect(() => storeA.upsertProgram('user-3', programInput({ currentWeight: null }))).toThrow(
      AdaptiveCurrentWeightRequiredError,
    );
    seedWeight('user-4', '2026-05-24', 80);
    expect(() => storeA.upsertProgram('user-4', programInput({ currentWeight: null }))).toThrow(
      AdaptiveCurrentWeightRequiredError,
    );
    expect(storeA.getState('user-3').state).toBe('setup_required');
    expect(storeA.getState('user-4').state).toBe('setup_required');
  });

  it('rejects inconsistent goal direction and user floors below the derived system floor', () => {
    expect(() =>
      storeA.upsertProgram(
        'user-1',
        programInput({ goalType: 'lose', targetWeightKg: 83, goalRatePctPerWeek: -0.5 }),
      ),
    ).toThrow(AdaptiveGoalDirectionError);
    expect(() =>
      storeA.upsertProgram('user-1', programInput({ userCalorieFloorKcal: 1400 })),
    ).toThrow(AdaptiveCalorieFloorError);
    expect(storeA.getState('user-1').state).toBe('setup_required');
  });

  it('keeps baseline fields stable on ordinary updates and recalculates only on rebaseline', () => {
    storeA.upsertProgram('user-1', programInput());
    const baselineId = requireValue(
      storeA.getState('user-1').pendingCheckIn,
      'Expected baseline check-in',
    ).id;
    storeA.acceptCheckIn('user-1', baselineId, { replaceSameDateTarget: false });
    nowMs = Date.parse('2026-06-20T16:00:00.000Z');

    const stable = storeA.upsertProgram(
      'user-1',
      programInput({ manualBaselineTdeeKcal: 3000, currentWeight: null }),
    );
    expect(stable.baselineTdeeKcal).toBe(2500);
    expect(storeA.getState('user-1').pendingCheckIn).toBeNull();

    const rebaselined = storeA.upsertProgram(
      'user-1',
      programInput({ manualBaselineTdeeKcal: 3000, rebaseline: true }),
    );
    expect(rebaselined.baselineTdeeKcal).toBe(3000);
    expect(storeA.getState('user-1').pendingCheckIn?.kind).toBe('baseline');
  });

  it('reports a paused accepted program as holding without creating a check-in on reads', () => {
    acceptBaselineAndAdvance();
    storeA.upsertProgram('user-1', programInput({ status: 'paused', currentWeight: null }));
    const first = storeA.getState('user-1');
    const second = storeA.getState('user-1');
    expect(first.state).toBe('holding');
    expect(first.pendingCheckIn).toBeNull();
    expect(second).toEqual(first);
    expect(storeA.listCheckIns('user-1', {}).meta.total).toBe(1);
  });

  it('aggregates the pinned ranges, persists held reasons, and reuses a held weekly attempt', () => {
    acceptBaselineAndAdvance();
    seedWeight('user-1', '2026-06-21', 81.9);

    const held = storeA.previewCheckIn('user-1', { kind: 'weekly', includeToday: false });
    const repeated = storeA.previewCheckIn('user-1', { kind: 'weekly', includeToday: false });
    expect(held).toMatchObject({ status: 'held', calculationState: 'holding' });
    expect(held.reasonCodes).toContain('INSUFFICIENT_NUTRITION');
    expect(repeated.id).toBe(held.id);
    expect(held.inputSnapshot.boundaries).toMatchObject({
      analysisStart: '2026-06-01',
      analysisEnd: '2026-06-21',
      warmupStart: '2026-05-11',
    });

    const firstRead = storeA.getState('user-1');
    const secondRead = storeA.getState('user-1');
    expect(firstRead.checkInDue).toBe(false);
    expect(firstRead.nextCheckInDate).toBe('2026-06-29');
    expect(secondRead).toEqual(firstRead);
    expect(storeA.listCheckIns('user-1', {}).data).toHaveLength(2);
  });

  it('makes unchanged previews idempotent and supersedes changed pending inputs', () => {
    acceptBaselineAndAdvance();
    seedEligibleHistory('user-1');
    const original = storeA.previewCheckIn('user-1', { kind: 'weekly', includeToday: false });
    expect(original).toMatchObject({ status: 'pending', calculationState: 'updating' });
    expect(original.inputSnapshot.nutritionDays).toHaveLength(21);
    expect(storeA.previewCheckIn('user-1', { kind: 'weekly', includeToday: false }).id).toBe(
      original.id,
    );

    dbA
      .update(nutritionLogs)
      .set({ status: 'partial', updatedAt: nowMs + 100 })
      .where(eq(nutritionLogs.id, 'user-1-log-2026-06-10'))
      .run();
    const changed = storeA.previewCheckIn('user-1', { kind: 'weekly', includeToday: false });
    expect(changed.id).not.toBe(original.id);
    expect(storeA.findCheckInDetail('user-1', original.id)?.status).toBe('superseded');

    dbA
      .update(nutritionLogs)
      .set({ status: 'complete', updatedAt: nowMs + 200 })
      .where(eq(nutritionLogs.id, 'user-1-log-2026-06-10'))
      .run();
    const reverted = storeA.previewCheckIn('user-1', { kind: 'weekly', includeToday: false });
    expect(reverted.id).not.toBe(original.id);
    expect(reverted.id).not.toBe(changed.id);
    expect(reverted.status).toBe('pending');

    const declined = storeA.declineCheckIn('user-1', reverted.id);
    expect(storeA.declineCheckIn('user-1', reverted.id)).toEqual(declined);
    const afterDecline = storeA.previewCheckIn('user-1', { kind: 'weekly', includeToday: false });
    expect(afterDecline.id).not.toBe(reverted.id);
  });

  it('rejects a stale preview without writing a target and remains pinned across local midnight', () => {
    acceptBaselineAndAdvance();
    seedEligibleHistory('user-1');
    const stale = storeA.previewCheckIn('user-1', { kind: 'manual', includeToday: false });
    dbA
      .update(mealItems)
      .set({ calories: 2500 })
      .where(eq(mealItems.id, 'user-1-item-2026-06-12'))
      .run();
    expect(() =>
      storeA.acceptCheckIn('user-1', stale.id, { replaceSameDateTarget: false }),
    ).toThrow(AdaptiveCheckInStaleError);
    expect(
      dbA.select().from(nutritionTargets).where(eq(nutritionTargets.userId, 'user-1')).all(),
    ).toHaveLength(1);

    dbA
      .update(mealItems)
      .set({ calories: 2400 })
      .where(eq(mealItems.id, 'user-1-item-2026-06-12'))
      .run();
    const pinned = storeA.previewCheckIn('user-1', { kind: 'manual', includeToday: false });
    nowMs = Date.parse('2026-06-23T05:00:00.000Z');
    const accepted = storeA.acceptCheckIn('user-1', pinned.id, {
      replaceSameDateTarget: false,
    });
    expect(accepted.target.effectiveDate).toBe('2026-06-22');
    expect(accepted.checkIn.localDate).toBe('2026-06-22');
  });

  it('requires explicit same-date replacement and preserves target identity and provenance', () => {
    acceptBaselineAndAdvance();
    seedEligibleHistory('user-1');
    dbA
      .insert(nutritionTargets)
      .values({
        id: 'same-day-target',
        userId: 'user-1',
        calories: 2200,
        protein: 180,
        carbs: 230,
        fat: 62,
        source: 'manual',
        adaptiveCheckInId: null,
        macroCalories: 2198,
        effectiveDate: '2026-06-22',
        createdAt: nowMs - 500,
        updatedAt: nowMs - 500,
      })
      .run();
    const preview = storeA.previewCheckIn('user-1', { kind: 'manual', includeToday: false });
    expect(preview.reasonCodes).toContain('SAME_DATE_TARGET_EXISTS');
    expect(() =>
      storeA.acceptCheckIn('user-1', preview.id, { replaceSameDateTarget: false }),
    ).toThrow(AdaptiveSameDateTargetExistsError);
    const accepted = storeA.acceptCheckIn('user-1', preview.id, {
      replaceSameDateTarget: true,
    });
    expect(accepted.target).toMatchObject({
      id: 'same-day-target',
      source: 'adaptive',
      adaptiveCheckInId: preview.id,
    });
  });

  it('does not silently change a reached goal while accepting its target', () => {
    storeA.upsertProgram(
      'user-1',
      programInput({ goalType: 'lose', targetWeightKg: 81.7, goalRatePctPerWeek: -0.5 }),
    );
    const baseline = requireValue(
      storeA.getState('user-1').pendingCheckIn,
      'Expected baseline check-in',
    );
    storeA.acceptCheckIn('user-1', baseline.id, { replaceSameDateTarget: false });
    nowMs = Date.parse('2026-06-22T16:00:00.000Z');
    seedEligibleHistory('user-1');
    seedWeight('user-1', '2026-06-08', 81.8, nowMs + 498);
    seedWeight('user-1', '2026-06-15', 81.6, nowMs + 499);
    seedWeight('user-1', '2026-06-21', 81.4, nowMs + 500);
    const preview = storeA.previewCheckIn('user-1', { kind: 'manual', includeToday: false });
    expect(preview.calculationSnapshot.goal?.goalReached).toBe(true);
    storeA.acceptCheckIn('user-1', preview.id, { replaceSameDateTarget: false });
    expect(storeA.getState('user-1').program).toMatchObject({
      goalType: 'lose',
      goalRatePctPerWeek: -0.5,
      targetWeightKg: 81.7,
    });
  });

  it('scopes detail, history, preview, accept, and decline to the authenticated user', () => {
    acceptBaselineAndAdvance('user-1');
    const own = storeA.listCheckIns('user-1', { page: 1, limit: 1 });
    const ownCheckIn = requireValue(own.data[0], 'Expected owned check-in');
    expect(own.meta).toEqual({ page: 1, limit: 1, total: 1 });
    expect(storeA.listCheckIns('user-2', {}).data).toEqual([]);
    expect(storeA.findCheckInDetail('user-2', ownCheckIn.id)).toBeNull();
    expect(() =>
      storeA.acceptCheckIn('user-2', ownCheckIn.id, { replaceSameDateTarget: false }),
    ).toThrow(AdaptiveCheckInNotFoundError);
    expect(() => storeA.declineCheckIn('user-2', ownCheckIn.id)).toThrow(
      AdaptiveCheckInNotFoundError,
    );
    expect(() =>
      storeA.previewCheckIn('user-2', { kind: 'manual', includeToday: false }),
    ).toThrow();
  });

  it('converges previews and repeated accepts across two real SQLite connections', async () => {
    acceptBaselineAndAdvance();
    seedEligibleHistory('user-1');

    const [left, right] = await Promise.all([
      new Promise<ReturnType<TestStore['previewCheckIn']>>((resolve) =>
        setImmediate(() =>
          resolve(storeA.previewCheckIn('user-1', { kind: 'weekly', includeToday: false })),
        ),
      ),
      new Promise<ReturnType<TestStore['previewCheckIn']>>((resolve) =>
        setImmediate(() =>
          resolve(storeB.previewCheckIn('user-1', { kind: 'weekly', includeToday: false })),
        ),
      ),
    ]);
    expect(right.id).toBe(left.id);

    const [acceptedA, acceptedB] = await Promise.all([
      new Promise<ReturnType<TestStore['acceptCheckIn']>>((resolve) =>
        setImmediate(() =>
          resolve(storeA.acceptCheckIn('user-1', left.id, { replaceSameDateTarget: false })),
        ),
      ),
      new Promise<ReturnType<TestStore['acceptCheckIn']>>((resolve) =>
        setImmediate(() =>
          resolve(storeB.acceptCheckIn('user-1', right.id, { replaceSameDateTarget: false })),
        ),
      ),
    ]);
    expect(acceptedB).toEqual(acceptedA);
    expect(
      dbA
        .select()
        .from(adaptiveNutritionCheckIns)
        .where(
          and(
            eq(adaptiveNutritionCheckIns.userId, 'user-1'),
            eq(adaptiveNutritionCheckIns.status, 'pending'),
          ),
        )
        .all(),
    ).toHaveLength(0);
  });

  it('uses an immediate write lock that serializes a competing real SQLite connection', () => {
    acceptBaselineAndAdvance();
    seedEligibleHistory('user-1');
    sqliteB.pragma('busy_timeout = 0');
    try {
      sqliteA
        .transaction(() => {
          expect(() =>
            storeB.previewCheckIn('user-1', { kind: 'weekly', includeToday: false }),
          ).toThrow(/database is locked/u);
        })
        .immediate();
    } finally {
      sqliteB.pragma('busy_timeout = 2000');
    }
    expect(storeB.previewCheckIn('user-1', { kind: 'weekly', includeToday: false }).status).toBe(
      'pending',
    );
  });

  it('requires explicit pending supersession on calculation-affecting program updates', () => {
    storeA.upsertProgram('user-1', programInput());
    expect(() =>
      storeA.upsertProgram('user-1', programInput({ proteinGrams: 190, currentWeight: null })),
    ).toThrow(AdaptivePendingCheckInExistsError);
    const updated = storeA.upsertProgram(
      'user-1',
      programInput({ proteinGrams: 190, currentWeight: null, supersedePending: true }),
    );
    expect(updated.proteinGrams).toBe(190);
  });

  it('never accepts a held row', () => {
    acceptBaselineAndAdvance();
    const held = storeA.previewCheckIn('user-1', { kind: 'weekly', includeToday: false });
    expect(() => storeA.acceptCheckIn('user-1', held.id, { replaceSameDateTarget: false })).toThrow(
      AdaptiveCheckInNotAcceptableError,
    );
  });

  it('makes a held preview the current read state after changed data invalidates a pending recommendation', () => {
    acceptBaselineAndAdvance();
    seedEligibleHistory('user-1');
    const firstUpdate = storeA.previewCheckIn('user-1', { kind: 'weekly', includeToday: false });
    storeA.acceptCheckIn('user-1', firstUpdate.id, { replaceSameDateTarget: false });
    dbA
      .update(mealItems)
      .set({ calories: 2500 })
      .where(eq(mealItems.id, 'user-1-item-2026-06-12'))
      .run();
    const actionable = storeA.previewCheckIn('user-1', { kind: 'weekly', includeToday: false });
    expect(actionable.status).toBe('pending');

    for (let day = 1; day <= 10; day += 1) {
      const date = `2026-06-${String(day).padStart(2, '0')}`;
      dbA
        .update(nutritionLogs)
        .set({ status: 'partial', updatedAt: nowMs + 1000 + day })
        .where(eq(nutritionLogs.id, `user-1-log-${date}`))
        .run();
    }
    const held = storeA.previewCheckIn('user-1', { kind: 'weekly', includeToday: false });
    const repeated = storeA.previewCheckIn('user-1', { kind: 'weekly', includeToday: false });

    expect(held.status).toBe('held');
    expect(repeated.id).toBe(held.id);
    expect(storeA.findCheckInDetail('user-1', actionable.id)?.status).toBe('superseded');
    expect(storeA.getState('user-1').pendingCheckIn).toBeNull();
    expect(storeA.getState('user-1').state).toBe('holding');
    expect(storeA.listCheckIns('user-1', {}).meta.total).toBe(4);
  });
});

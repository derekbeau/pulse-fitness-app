import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { count, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { AdaptiveProgramMutation } from '@pulse/shared';

import * as schema from '../../db/schema/index.js';
import {
  adaptiveNutritionCheckIns,
  adaptiveNutritionProgramRevisions,
  adaptiveNutritionPrograms,
  mealItems,
  meals,
  nutritionLogs,
  nutritionTargetEvents,
  nutritionTargets,
  users,
} from '../../db/schema/index.js';
import { createAdaptiveNutritionStore } from '../adaptive-nutrition/store.js';
import { createDailyEnergyAdherenceStore } from './daily-energy-store.js';

type TestDatabase = ReturnType<typeof drizzle<typeof schema>>;

let tempDir = '';
let sqlite: Database.Database;
let db: TestDatabase;
let nowMs = Date.parse('2026-08-18T16:00:00.000Z');

const migrationsFolder = fileURLToPath(new URL('../../../drizzle', import.meta.url));

const programInput = (timeZone = 'America/Detroit'): AdaptiveProgramMutation => ({
  status: 'active',
  timeZone,
  heightCm: null,
  birthDate: null,
  rmrEquation: 'manual_tdee',
  activityLevel: null,
  manualBaselineTdeeKcal: 2_760,
  goalType: 'maintain',
  targetWeightKg: null,
  goalRatePctPerWeek: 0,
  proteinGrams: 180,
  fatAllocationPct: 30,
  currentWeight: { weight: 80, unit: 'kg' },
  rebaseline: false,
  supersedePending: false,
});

const seedNutrition = (
  date: string,
  status: 'complete' | 'partial' | 'unknown',
  calories: number,
) => {
  const logId = `log-${date}`;
  const mealId = `meal-${date}`;
  db.insert(nutritionLogs)
    .values({ id: logId, userId: 'user-1', date, status, updatedAt: nowMs })
    .run();
  db.insert(meals).values({ id: mealId, nutritionLogId: logId, name: 'Daily total' }).run();
  db.insert(mealItems)
    .values({
      id: `item-${date}`,
      mealId,
      name: 'Food',
      amount: 1,
      unit: 'serving',
      calories,
      protein: 180,
      carbs: 250,
      fat: 75,
    })
    .run();
};

const seedManualTargetEvent = (input: {
  id: string;
  effectiveDate: string;
  recordedAt: number;
  calories: number;
}) => {
  const targetId = `target-${input.id}`;
  db.insert(nutritionTargets)
    .values({
      id: targetId,
      userId: 'user-1',
      calories: input.calories,
      protein: 180,
      carbs: 210,
      fat: 80,
      macroCalories: 2_280,
      effectiveDate: input.effectiveDate,
      source: 'manual',
      createdAt: input.recordedAt,
      updatedAt: input.recordedAt,
    })
    .run();
  db.insert(nutritionTargetEvents)
    .values({
      id: input.id,
      targetId,
      userId: 'user-1',
      sequence: 1,
      effectiveDate: input.effectiveDate,
      calories: input.calories,
      protein: 180,
      carbs: 210,
      fat: 80,
      macroCalories: 2_280,
      source: 'manual',
      adaptiveCheckInId: null,
      eventType: 'manual_write',
      recordedAt: input.recordedAt,
      createdAt: input.recordedAt,
    })
    .run();
};

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'pulse-daily-energy-'));
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
  sqlite.exec(`
    INSERT OR IGNORE INTO adaptive_nutrition_account_deletion_scope (user_id)
    SELECT id FROM users;
    DELETE FROM nutrition_target_events;
    DELETE FROM nutrition_targets;
    DELETE FROM adaptive_nutrition_checkins;
    DELETE FROM adaptive_nutrition_programs;
    DELETE FROM nutrition_logs;
    DELETE FROM users;
  `);
  db.insert(users)
    .values({
      id: 'user-1',
      username: 'daily-energy',
      passwordHash: 'hash',
      preferences: { timeZone: 'America/Detroit' },
    })
    .run();
  nowMs = Date.parse('2026-08-18T16:00:00.000Z');
});

describe('daily energy adherence store', () => {
  it('uses deterministic program baseline expenditure before any recommendation is accepted', () => {
    nowMs = Date.parse('2026-08-01T16:00:00.000Z');
    createAdaptiveNutritionStore({ db, sqlite, now: () => new Date(nowMs) }).upsertProgram(
      'user-1',
      programInput(),
    );
    seedManualTargetEvent({
      id: 'target-event-1',
      effectiveDate: '2026-08-01',
      recordedAt: nowMs,
      calories: 2_400,
    });
    seedNutrition('2026-08-02', 'complete', 2_520);
    nowMs = Date.parse('2026-08-03T16:00:00.000Z');

    const result = createDailyEnergyAdherenceStore({
      db,
      now: () => new Date(nowMs),
    }).getDailyEnergyAdherence('user-1', '2026-08-02');

    expect(result).toMatchObject({
      dataState: 'gradeable',
      adherence: 'on_target',
      intakeMinusTargetKcal: 120,
      intakeMinusExpenditureKcal: -240,
      target: { targetEventId: 'target-event-1', caloriesKcal: 2_400 },
      expenditure: {
        caloriesKcal: 2_760,
        source: 'program_baseline',
        checkInId: null,
        inputFingerprint: null,
      },
    });
  });

  it('never activates a target event before it was recorded', () => {
    seedNutrition('2026-08-04', 'complete', 2_100);
    seedManualTargetEvent({
      id: 'late-event',
      effectiveDate: '2026-08-03',
      recordedAt: Date.parse('2026-08-10T12:00:00.000Z'),
      calories: 2_000,
    });
    nowMs = Date.parse('2026-08-18T16:00:00.000Z');
    const store = createDailyEnergyAdherenceStore({ db, now: () => new Date(nowMs) });

    expect(store.getDailyEnergyAdherence('user-1', '2026-08-04')).toMatchObject({
      dataState: 'unavailable',
      target: null,
      intakeMinusTargetKcal: null,
      reasonCodes: expect.arrayContaining(['NO_ACCEPTED_TARGET']),
    });

    seedNutrition('2026-08-11', 'complete', 2_100);
    expect(store.getDailyEnergyAdherence('user-1', '2026-08-11')).toMatchObject({
      dataState: 'gradeable',
      target: { targetEventId: 'late-event' },
      intakeMinusTargetKcal: 100,
    });
  });

  it.each([
    { date: '2026-08-17', status: 'partial' as const, state: 'partial' },
    { date: '2026-08-16', status: 'unknown' as const, state: 'unknown' },
  ])('withholds adherence for $state nutrition', ({ date, status, state }) => {
    seedManualTargetEvent({
      id: 'target-event-1',
      effectiveDate: '2026-08-01',
      recordedAt: Date.parse('2026-08-01T12:00:00.000Z'),
      calories: 2_400,
    });
    seedNutrition(date, status, 2_400);

    expect(
      createDailyEnergyAdherenceStore({ db, now: () => new Date(nowMs) }).getDailyEnergyAdherence(
        'user-1',
        date,
      ),
    ).toMatchObject({ dataState: state, adherence: null });
  });

  it('treats a complete current local day as pending cutoff', () => {
    seedManualTargetEvent({
      id: 'target-event-1',
      effectiveDate: '2026-08-01',
      recordedAt: Date.parse('2026-08-01T12:00:00.000Z'),
      calories: 2_400,
    });
    seedNutrition('2026-08-18', 'complete', 2_400);

    expect(
      createDailyEnergyAdherenceStore({ db, now: () => new Date(nowMs) }).getDailyEnergyAdherence(
        'user-1',
        '2026-08-18',
      ),
    ).toMatchObject({
      todayLocalDate: '2026-08-18',
      completedDayCutoff: '2026-08-17',
      dataState: 'pending_cutoff',
      adherence: null,
    });
  });

  it('does not expose a future-effective accepted target on a future day', () => {
    seedManualTargetEvent({
      id: 'future-event',
      effectiveDate: '2026-08-20',
      recordedAt: Date.parse('2026-08-18T12:00:00.000Z'),
      calories: 2_400,
    });

    expect(
      createDailyEnergyAdherenceStore({ db, now: () => new Date(nowMs) }).getDailyEnergyAdherence(
        'user-1',
        '2026-08-20',
      ),
    ).toMatchObject({
      dataState: 'future',
      target: null,
      adherence: null,
      reasonCodes: ['FUTURE_DATE_NOT_GRADED', 'NO_ACCEPTED_TARGET', 'NO_ACCEPTED_EXPENDITURE'],
    });
  });

  it('keeps historical facts byte-stable after a westward time-zone edit', () => {
    nowMs = Date.parse('2026-08-01T16:00:00.000Z');
    const lifecycle = createAdaptiveNutritionStore({ db, sqlite, now: () => new Date(nowMs) });
    lifecycle.upsertProgram('user-1', programInput('Asia/Tokyo'));
    seedManualTargetEvent({
      id: 'target-event-1',
      effectiveDate: '2026-08-01',
      recordedAt: nowMs,
      calories: 2_400,
    });
    seedNutrition('2026-08-02', 'complete', 2_400);
    nowMs = Date.parse('2026-08-18T00:59:00.000Z');
    const before = createDailyEnergyAdherenceStore({
      db,
      now: () => new Date(nowMs),
    }).getDailyEnergyAdherence('user-1', '2026-08-02');
    nowMs = Date.parse('2026-08-18T01:00:00.000Z');
    lifecycle.upsertProgram('user-1', {
      ...programInput('America/Los_Angeles'),
      supersedePending: true,
    });
    const after = createDailyEnergyAdherenceStore({
      db,
      now: () => new Date(nowMs),
    }).getDailyEnergyAdherence('user-1', '2026-08-02');

    expect(after).toEqual(before);
    expect(after.timeZone).toBe('Asia/Tokyo');
  });

  it('is read-only across nutrition and adaptive ledgers', () => {
    const before = {
      logs: db.select({ value: count() }).from(nutritionLogs).get()?.value,
      targets: db.select({ value: count() }).from(nutritionTargetEvents).get()?.value,
      programs: db.select({ value: count() }).from(adaptiveNutritionPrograms).get()?.value,
      revisions: db.select({ value: count() }).from(adaptiveNutritionProgramRevisions).get()?.value,
      checkIns: db.select({ value: count() }).from(adaptiveNutritionCheckIns).get()?.value,
    };

    createDailyEnergyAdherenceStore({ db, now: () => new Date(nowMs) }).getDailyEnergyAdherence(
      'user-1',
      '2026-08-17',
    );

    const after = {
      logs: db.select({ value: count() }).from(nutritionLogs).get()?.value,
      targets: db.select({ value: count() }).from(nutritionTargetEvents).get()?.value,
      programs: db.select({ value: count() }).from(adaptiveNutritionPrograms).get()?.value,
      revisions: db.select({ value: count() }).from(adaptiveNutritionProgramRevisions).get()?.value,
      checkIns: db.select({ value: count() }).from(adaptiveNutritionCheckIns).get()?.value,
    };
    expect(after).toEqual(before);
    expect(db.select().from(users).where(eq(users.id, 'user-1')).get()).toBeDefined();
  });
});

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

const programInputForGoal = (goalType: 'lose' | 'maintain' | 'gain'): AdaptiveProgramMutation => ({
  ...programInput(),
  goalType,
  targetWeightKg: goalType === 'maintain' ? null : goalType === 'lose' ? 75 : 85,
  goalRatePctPerWeek: goalType === 'maintain' ? 0 : goalType === 'lose' ? -0.5 : 0.5,
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

const seedCheckIn = (input: {
  id: string;
  status: 'pending' | 'accepted' | 'declined' | 'superseded' | 'held';
  localDate: string;
  effectiveDate: string;
  proposedTdeeKcal: number;
  resolvedAt: number | null;
  createdAt?: number;
}) => {
  const base = db.select().from(adaptiveNutritionCheckIns).limit(1).get();
  if (!base || !base.proposedTargets) throw new Error('Expected a program baseline check-in');
  db.insert(adaptiveNutritionCheckIns)
    .values({
      ...base,
      id: input.id,
      status: input.status,
      kind: 'manual',
      calculationState: input.status === 'held' ? 'holding' : 'updating',
      localDate: input.localDate,
      dataFingerprint: input.id.slice(0, 1).padEnd(64, 'a'),
      proposedTdeeKcal: input.proposedTdeeKcal,
      proposedTargets: { ...base.proposedTargets, effectiveDate: input.effectiveDate },
      acceptedNutritionTargetId: null,
      resolvedAt: input.resolvedAt,
      createdAt: input.createdAt ?? nowMs,
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
    const lifecycle = createAdaptiveNutritionStore({ db, sqlite, now: () => new Date(nowMs) });
    lifecycle.upsertProgram('user-1', programInput());
    const baseline = lifecycle.getState('user-1').pendingCheckIn;
    if (!baseline) throw new Error('Expected baseline check-in');
    lifecycle.declineCheckIn('user-1', baseline.id);
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
      sqlite,
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
    const store = createDailyEnergyAdherenceStore({ db, sqlite, now: () => new Date(nowMs) });

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

  it('switches accepted expenditure exactly on its effective date and ignores competing states', () => {
    nowMs = Date.parse('2026-08-01T16:00:00.000Z');
    const lifecycle = createAdaptiveNutritionStore({ db, sqlite, now: () => new Date(nowMs) });
    lifecycle.upsertProgram('user-1', programInput());
    const pendingBaseline = lifecycle.getState('user-1').pendingCheckIn;
    if (!pendingBaseline) throw new Error('Expected baseline check-in');
    lifecycle.declineCheckIn('user-1', pendingBaseline.id);
    seedManualTargetEvent({
      id: 'accepted-target',
      effectiveDate: '2026-08-01',
      recordedAt: nowMs,
      calories: 2_400,
    });
    seedCheckIn({
      id: 'b-accepted',
      status: 'accepted',
      localDate: '2026-08-09',
      effectiveDate: '2026-08-11',
      proposedTdeeKcal: 2_600,
      resolvedAt: Date.parse('2026-08-10T12:00:00.000Z'),
    });
    for (const [id, status, calories] of [
      ['c-pending', 'pending', 4_100],
      ['d-held', 'held', 4_200],
      ['e-declined', 'declined', 4_300],
      ['f-superseded', 'superseded', 4_400],
    ] as const) {
      seedCheckIn({
        id,
        status,
        localDate: '2026-08-10',
        effectiveDate: '2026-08-10',
        proposedTdeeKcal: calories,
        resolvedAt: status === 'pending' ? null : Date.parse('2026-08-10T13:00:00.000Z'),
      });
    }
    seedNutrition('2026-08-10', 'complete', 2_400);
    seedNutrition('2026-08-11', 'complete', 2_400);
    nowMs = Date.parse('2026-08-18T16:00:00.000Z');
    const store = createDailyEnergyAdherenceStore({ db, sqlite, now: () => new Date(nowMs) });

    expect(store.getDailyEnergyAdherence('user-1', '2026-08-10')).toMatchObject({
      target: { targetEventId: 'accepted-target', caloriesKcal: 2_400 },
      expenditure: { caloriesKcal: 2_760, source: 'program_baseline' },
    });
    expect(store.getDailyEnergyAdherence('user-1', '2026-08-11')).toMatchObject({
      target: { targetEventId: 'accepted-target', caloriesKcal: 2_400 },
      expenditure: {
        caloriesKcal: 2_600,
        source: 'accepted_check_in',
        checkInId: 'b-accepted',
      },
      intakeMinusExpenditureKcal: -200,
    });
  });

  it('keeps pre-program expenditure null instead of backfilling the baseline', () => {
    nowMs = Date.parse('2026-08-05T16:00:00.000Z');
    createAdaptiveNutritionStore({ db, sqlite, now: () => new Date(nowMs) }).upsertProgram(
      'user-1',
      programInput(),
    );
    seedManualTargetEvent({
      id: 'historical-target',
      effectiveDate: '2026-08-01',
      recordedAt: Date.parse('2026-08-01T12:00:00.000Z'),
      calories: 2_400,
    });
    seedNutrition('2026-08-04', 'complete', 2_400);
    nowMs = Date.parse('2026-08-18T16:00:00.000Z');

    expect(
      createDailyEnergyAdherenceStore({
        db,
        sqlite,
        now: () => new Date(nowMs),
      }).getDailyEnergyAdherence('user-1', '2026-08-04'),
    ).toMatchObject({
      expenditure: null,
      intakeMinusExpenditureKcal: null,
      reasonCodes: ['NO_ACCEPTED_EXPENDITURE'],
    });
  });

  it.each(['lose', 'maintain', 'gain'] as const)(
    'keeps symmetric grading goal-neutral for a %s program',
    (goalType) => {
      nowMs = Date.parse('2026-08-01T16:00:00.000Z');
      createAdaptiveNutritionStore({ db, sqlite, now: () => new Date(nowMs) }).upsertProgram(
        'user-1',
        programInputForGoal(goalType),
      );
      seedManualTargetEvent({
        id: `target-${goalType}`,
        effectiveDate: '2026-08-01',
        recordedAt: nowMs,
        calories: 2_000,
      });
      seedNutrition('2026-08-02', 'complete', 2_251);
      nowMs = Date.parse('2026-08-03T16:00:00.000Z');

      expect(
        createDailyEnergyAdherenceStore({
          db,
          sqlite,
          now: () => new Date(nowMs),
        }).getDailyEnergyAdherence('user-1', '2026-08-02'),
      ).toMatchObject({
        adherence: 'off_target',
        intakeMinusTargetKcal: 251,
        innerToleranceKcal: 100,
        outerToleranceKcal: 250,
      });
    },
  );

  it('selects historical target revisions without rewriting earlier accepted truth', () => {
    seedManualTargetEvent({
      id: 'target-old',
      effectiveDate: '2026-08-01',
      recordedAt: Date.parse('2026-08-01T12:00:00.000Z'),
      calories: 2_400,
    });
    seedManualTargetEvent({
      id: 'target-revised',
      effectiveDate: '2026-08-12',
      recordedAt: Date.parse('2026-08-11T12:00:00.000Z'),
      calories: 2_200,
    });
    seedNutrition('2026-08-10', 'complete', 2_400);
    seedNutrition('2026-08-12', 'complete', 2_400);
    const store = createDailyEnergyAdherenceStore({ db, sqlite, now: () => new Date(nowMs) });

    expect(store.getDailyEnergyAdherence('user-1', '2026-08-10').target).toMatchObject({
      targetEventId: 'target-old',
      caloriesKcal: 2_400,
    });
    expect(store.getDailyEnergyAdherence('user-1', '2026-08-12').target).toMatchObject({
      targetEventId: 'target-revised',
      caloriesKcal: 2_200,
    });
  });

  it('recomputes corrected meal snapshots without changing target or expenditure provenance', () => {
    nowMs = Date.parse('2026-08-01T16:00:00.000Z');
    createAdaptiveNutritionStore({ db, sqlite, now: () => new Date(nowMs) }).upsertProgram(
      'user-1',
      programInput(),
    );
    seedManualTargetEvent({
      id: 'fixed-target',
      effectiveDate: '2026-08-01',
      recordedAt: nowMs,
      calories: 2_400,
    });
    seedNutrition('2026-08-10', 'complete', 2_400);
    nowMs = Date.parse('2026-08-18T16:00:00.000Z');
    const store = createDailyEnergyAdherenceStore({ db, sqlite, now: () => new Date(nowMs) });
    const before = store.getDailyEnergyAdherence('user-1', '2026-08-10');

    db.update(mealItems).set({ calories: 2_650 }).where(eq(mealItems.id, 'item-2026-08-10')).run();
    const after = store.getDailyEnergyAdherence('user-1', '2026-08-10');

    expect(after.nutrition.intakeKcal).toBe(2_650);
    expect(after.intakeMinusTargetKcal).toBe(250);
    expect(after.target).toEqual(before.target);
    expect(after.expenditure).toEqual(before.expenditure);
  });

  it('retains only bounded authoritative rows from dense irrelevant history', () => {
    nowMs = Date.parse('2026-08-01T16:00:00.000Z');
    createAdaptiveNutritionStore({ db, sqlite, now: () => new Date(nowMs) }).upsertProgram(
      'user-1',
      programInput(),
    );
    const program = db.select().from(adaptiveNutritionPrograms).limit(1).get();
    const firstRevision = db.select().from(adaptiveNutritionProgramRevisions).limit(1).get();
    if (!program || !firstRevision) throw new Error('Expected seeded program history');
    sqlite
      .prepare(
        `insert into adaptive_nutrition_program_revisions
          (id, program_id, user_id, effective_at, sequence, snapshot, source, created_at)
         values (@id, @programId, @userId, @effectiveAt, @sequence, @snapshot, 'program_updated', @createdAt)`,
      )
      .run({
        id: 'irrelevant-invalid-revision',
        programId: program.id,
        userId: 'user-1',
        effectiveAt: Date.parse('2026-09-01T12:00:00.000Z'),
        sequence: 2,
        snapshot: JSON.stringify({ timeZone: 'America/Detroit' }),
        createdAt: Date.parse('2026-09-01T12:00:00.000Z'),
      });
    for (let sequence = 3; sequence <= 102; sequence += 1) {
      sqlite
        .prepare(
          `insert into adaptive_nutrition_program_revisions
            (id, program_id, user_id, effective_at, sequence, snapshot, source, created_at)
           values (@id, @programId, @userId, @effectiveAt, @sequence, @snapshot, 'program_updated', @createdAt)`,
        )
        .run({
          id: `irrelevant-revision-${sequence}`,
          programId: program.id,
          userId: 'user-1',
          effectiveAt: Date.parse('2026-09-01T12:00:00.000Z') + sequence,
          sequence,
          snapshot: JSON.stringify(firstRevision.snapshot),
          createdAt: Date.parse('2026-09-01T12:00:00.000Z') + sequence,
        });
    }
    const baselineCheckIn = db.select().from(adaptiveNutritionCheckIns).limit(1).get();
    if (!baselineCheckIn) throw new Error('Expected baseline check-in');
    db.insert(adaptiveNutritionCheckIns)
      .values({
        ...baselineCheckIn,
        id: 'irrelevant-invalid-check-in',
        status: 'accepted',
        kind: 'manual',
        calculationState: 'updating',
        localDate: '2026-08-10',
        dataFingerprint: 'f'.repeat(64),
        proposedTdeeKcal: 9_999,
        proposedTargets: { effectiveDate: '2026-09-02' } as typeof baselineCheckIn.proposedTargets,
        acceptedNutritionTargetId: null,
        resolvedAt: Date.parse('2026-08-10T12:00:00.000Z'),
        createdAt: Date.parse('2026-08-10T12:00:00.000Z'),
      })
      .run();
    seedManualTargetEvent({
      id: 'bounded-target',
      effectiveDate: '2026-08-01',
      recordedAt: nowMs,
      calories: 2_400,
    });
    seedNutrition('2026-08-02', 'complete', 2_400);
    nowMs = Date.parse('2026-08-18T16:00:00.000Z');

    const result = createDailyEnergyAdherenceStore({
      db,
      sqlite,
      now: () => new Date(nowMs),
    }).getDailyEnergyAdherence('user-1', '2026-08-02');

    expect(result).toMatchObject({
      localDate: '2026-08-02',
      timeZone: 'America/Detroit',
      target: { targetEventId: 'bounded-target' },
      expenditure: { caloriesKcal: 2_760, source: 'program_baseline' },
    });
    expect(
      sqlite
        .prepare(
          `select count(*) as count from adaptive_nutrition_program_revisions where program_id = ?`,
        )
        .get(program.id),
    ).toEqual({ count: 102 });
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
      createDailyEnergyAdherenceStore({
        db,
        sqlite,
        now: () => new Date(nowMs),
      }).getDailyEnergyAdherence('user-1', date),
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
      createDailyEnergyAdherenceStore({
        db,
        sqlite,
        now: () => new Date(nowMs),
      }).getDailyEnergyAdherence('user-1', '2026-08-18'),
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
      createDailyEnergyAdherenceStore({
        db,
        sqlite,
        now: () => new Date(nowMs),
      }).getDailyEnergyAdherence('user-1', '2026-08-20'),
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
      sqlite,
      now: () => new Date(nowMs),
    }).getDailyEnergyAdherence('user-1', '2026-08-02');
    nowMs = Date.parse('2026-08-18T01:00:00.000Z');
    lifecycle.upsertProgram('user-1', {
      ...programInput('America/Los_Angeles'),
      supersedePending: true,
    });
    const after = createDailyEnergyAdherenceStore({
      db,
      sqlite,
      now: () => new Date(nowMs),
    }).getDailyEnergyAdherence('user-1', '2026-08-02');

    expect(after).toEqual(before);
    expect(after.timeZone).toBe('Asia/Tokyo');
  });

  it('keeps historical facts byte-stable after an eastward time-zone edit', () => {
    nowMs = Date.parse('2026-08-01T16:00:00.000Z');
    const lifecycle = createAdaptiveNutritionStore({ db, sqlite, now: () => new Date(nowMs) });
    lifecycle.upsertProgram('user-1', programInput('America/Los_Angeles'));
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
      sqlite,
      now: () => new Date(nowMs),
    }).getDailyEnergyAdherence('user-1', '2026-08-02');
    nowMs = Date.parse('2026-08-18T01:00:00.000Z');
    lifecycle.upsertProgram('user-1', {
      ...programInput('Asia/Tokyo'),
      supersedePending: true,
    });
    const after = createDailyEnergyAdherenceStore({
      db,
      sqlite,
      now: () => new Date(nowMs),
    }).getDailyEnergyAdherence('user-1', '2026-08-02');

    expect(after).toEqual(before);
    expect(after.timeZone).toBe('America/Los_Angeles');
  });

  it.each([
    {
      name: 'Detroit before spring DST',
      timeZone: 'America/Detroit',
      instant: '2026-03-08T04:30:00.000Z',
      today: '2026-03-07',
      selected: '2026-03-07',
      state: 'pending_cutoff',
    },
    {
      name: 'Detroit after spring DST',
      timeZone: 'America/Detroit',
      instant: '2026-03-08T07:30:00.000Z',
      today: '2026-03-08',
      selected: '2026-03-07',
      state: 'gradeable',
    },
    {
      name: 'UTC at the same pre-DST instant',
      timeZone: 'UTC',
      instant: '2026-03-08T04:30:00.000Z',
      today: '2026-03-08',
      selected: '2026-03-07',
      state: 'gradeable',
    },
  ])('uses the program calendar at $name', ({ instant, selected, state, timeZone, today }) => {
    nowMs = Date.parse('2026-03-01T16:00:00.000Z');
    createAdaptiveNutritionStore({ db, sqlite, now: () => new Date(nowMs) }).upsertProgram(
      'user-1',
      programInput(timeZone),
    );
    seedManualTargetEvent({
      id: 'dst-target',
      effectiveDate: '2026-03-01',
      recordedAt: nowMs,
      calories: 2_400,
    });
    seedNutrition(selected, 'complete', 2_400);
    nowMs = Date.parse(instant);

    expect(
      createDailyEnergyAdherenceStore({
        db,
        sqlite,
        now: () => new Date(nowMs),
      }).getDailyEnergyAdherence('user-1', selected),
    ).toMatchObject({ timeZone, todayLocalDate: today, dataState: state });
  });

  it('is read-only across nutrition and adaptive ledgers', () => {
    const before = {
      logs: db.select({ value: count() }).from(nutritionLogs).get()?.value,
      targets: db.select({ value: count() }).from(nutritionTargetEvents).get()?.value,
      programs: db.select({ value: count() }).from(adaptiveNutritionPrograms).get()?.value,
      revisions: db.select({ value: count() }).from(adaptiveNutritionProgramRevisions).get()?.value,
      checkIns: db.select({ value: count() }).from(adaptiveNutritionCheckIns).get()?.value,
    };

    createDailyEnergyAdherenceStore({
      db,
      sqlite,
      now: () => new Date(nowMs),
    }).getDailyEnergyAdherence('user-1', '2026-08-17');

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

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { dataQualityCalendarSchema, type AdaptiveProgramMutation } from '@pulse/shared';

import * as schema from '../../db/schema/index.js';
import {
  adaptiveNutritionReviewContexts,
  bodyWeight,
  mealItems,
  meals,
  nutritionLogs,
  scheduledWorkouts,
  users,
  workoutSessions,
} from '../../db/schema/index.js';
import { createAdaptiveNutritionStore } from '../adaptive-nutrition/store.js';
import { createDataQualityCalendarStore } from './store.js';

const migrationsFolder = fileURLToPath(new URL('../../../drizzle', import.meta.url));
const nowMs = Date.parse('2026-08-18T16:00:00.000Z');
const poundsFromKg = (weightKg: number) => weightKg / 0.45359237;

let tempDir = '';
let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

const programInput = (): AdaptiveProgramMutation => ({
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
  currentWeight: { weight: 80, unit: 'kg' },
  rebaseline: false,
  supersedePending: false,
});

const seedNutrition = (
  userId: string,
  date: string,
  status: 'unknown' | 'partial' | 'complete',
  calories: number,
) => {
  const logId = `${userId}-log-${date}`;
  const mealId = `${userId}-meal-${date}`;
  db.insert(nutritionLogs)
    .values({
      id: logId,
      userId,
      date,
      status,
      statusUpdatedAt: nowMs - 10,
      createdAt: nowMs - 20,
      updatedAt: nowMs - 10,
    })
    .run();
  db.insert(meals)
    .values({ id: mealId, nutritionLogId: logId, name: 'Daily total', createdAt: nowMs - 19 })
    .run();
  db.insert(mealItems)
    .values({
      id: `${userId}-item-${date}`,
      mealId,
      name: 'Recorded food',
      amount: 1,
      unit: 'serving',
      calories,
      protein: 160,
      carbs: 220,
      fat: 70,
      createdAt: nowMs - 18,
    })
    .run();
  return logId;
};

const seedWeight = (userId: string, date: string, weightKg: number, corrected = false) => {
  const createdAt = nowMs - 100;
  db.insert(bodyWeight)
    .values({
      id: `${userId}-weight-${date}`,
      userId,
      date,
      weight: poundsFromKg(weightKg),
      weightKg,
      unitAtEntry: 'kg',
      createdAt,
      updatedAt: corrected ? createdAt + 1 : createdAt,
    })
    .run();
};

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'pulse-data-quality-'));
  sqlite = new Database(join(tempDir, 'test.db'));
  sqlite.pragma('foreign_keys = ON');
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  db.insert(users)
    .values([
      {
        id: 'user-1',
        username: 'quality-one',
        passwordHash: 'hash',
        weightUnit: 'lbs',
        preferences: { timeZone: 'America/Detroit' },
      },
      {
        id: 'user-2',
        username: 'quality-two',
        passwordHash: 'hash',
        weightUnit: 'kg',
        preferences: { timeZone: 'Asia/Tokyo' },
      },
    ])
    .run();
});

afterEach(() => {
  sqlite.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe('Data Quality calendar store', () => {
  it('composes logged, pending, workout, algorithm, and bounded context truth without writes', () => {
    const nutritionLogId = seedNutrition('user-1', '2026-08-17', 'complete', 2400);
    seedWeight('user-1', '2026-08-17', 80.2, true);
    seedWeight('user-1', '2026-08-18', 80, false);
    seedNutrition('user-2', '2026-08-17', 'complete', 9999);
    seedWeight('user-2', '2026-08-17', 120, false);

    const adaptiveStore = createAdaptiveNutritionStore({
      db,
      sqlite,
      now: () => new Date(nowMs),
    });
    adaptiveStore.upsertProgram('user-1', programInput());
    const program = adaptiveStore.getState('user-1').program;
    expect(program).not.toBeNull();
    if (!program) throw new Error('Expected an Adaptive Nutrition program');

    db.insert(scheduledWorkouts)
      .values({
        id: 'schedule-1',
        userId: 'user-1',
        templateId: null,
        date: '2026-08-18',
        createdAt: nowMs - 1000,
        updatedAt: nowMs - 1000,
      })
      .run();
    db.insert(workoutSessions)
      .values({
        id: 'session-1',
        userId: 'user-1',
        scheduledWorkoutId: null,
        name: 'Upper body',
        date: '2026-08-17',
        status: 'completed',
        startedAt: nowMs - 10_000,
        completedAt: nowMs - 5_000,
        updatedAt: nowMs - 4_000,
      })
      .run();
    db.insert(adaptiveNutritionReviewContexts)
      .values({
        id: 'context-1',
        userId: 'user-1',
        programId: program.id,
        subjectType: 'nutrition_log',
        subject: { kind: 'nutrition_log', id: nutritionLogId },
        category: 'illness',
        note: 'Recovering from a cold',
        resolution: null,
        resolutionKind: null,
        createdBy: 'user',
        agentTokenId: null,
        actorLabel: 'You',
        revision: 1,
        createdAt: nowMs - 500,
        updatedAt: nowMs - 500,
      })
      .run();

    const sourceCountsBefore = {
      nutrition: sqlite.prepare('select count(*) as value from nutrition_logs').get(),
      weights: sqlite.prepare('select count(*) as value from body_weight').get(),
      checkIns: sqlite.prepare('select count(*) as value from adaptive_nutrition_checkins').get(),
      contexts: sqlite
        .prepare('select count(*) as value from adaptive_nutrition_review_contexts')
        .get(),
    };
    const calendar = createDataQualityCalendarStore({ db, now: () => new Date(nowMs) }).getCalendar(
      'user-1',
      { start: '2026-08-17', end: '2026-08-18' },
    );
    expect(dataQualityCalendarSchema.parse(calendar)).toEqual(calendar);
    expect(calendar.timeZone).toBe('America/Detroit');

    const august17 = calendar.days.find((day) => day.date === '2026-08-17');
    expect(august17).toBeDefined();
    if (!august17) throw new Error('Expected August 17 calendar day');
    expect(august17.nutrition).toMatchObject({
      qualityState: 'complete',
      logId: nutritionLogId,
      totals: { calories: 2400 },
    });
    expect(august17.weight).toMatchObject({
      entryId: 'user-1-weight-2026-08-17',
      corrected: true,
      unit: 'lbs',
    });
    expect(august17.weight.weight).toBeCloseTo(176.81, 1);
    expect(august17.workouts).toEqual([
      expect.objectContaining({ id: 'session-1', state: 'corrected' }),
    ]);
    expect(august17.contexts).toEqual([
      expect.objectContaining({
        id: 'context-1',
        category: 'illness',
        provenance: { type: 'user', agentTokenId: null, label: 'You' },
      }),
    ]);
    expect(august17.algorithm.state).toBe('pre_program');

    const august18 = calendar.days.find((day) => day.date === '2026-08-18');
    expect(august18).toBeDefined();
    if (!august18) throw new Error('Expected August 18 calendar day');
    expect(august18.isToday).toBe(true);
    expect(august18.algorithm.state).toBe('learning');
    expect(august18.weight).toMatchObject({
      evidenceState: 'pending_cutoff',
      weight: expect.any(Number),
    });
    expect(august18.workouts).toEqual([
      expect.objectContaining({ id: 'schedule-1', state: 'planned' }),
    ]);
    expect(calendar.summary).toMatchObject({
      nutrition: { complete: 1, missing: 1 },
      weight: { logged: 2, corrected: 2, pending: 1 },
      workout: { planned: 1, corrected: 1 },
      contextDays: 1,
    });

    expect({
      nutrition: sqlite.prepare('select count(*) as value from nutrition_logs').get(),
      weights: sqlite.prepare('select count(*) as value from body_weight').get(),
      checkIns: sqlite.prepare('select count(*) as value from adaptive_nutrition_checkins').get(),
      contexts: sqlite
        .prepare('select count(*) as value from adaptive_nutrition_review_contexts')
        .get(),
    }).toEqual(sourceCountsBefore);
    expect(calendar.days.map((day) => day.nutrition.logId).filter(Boolean)).not.toContain(
      'user-2-log-2026-08-17',
    );
    expect(calendar.days.map((day) => day.weight.entryId).filter(Boolean)).not.toContain(
      'user-2-weight-2026-08-17',
    );
  });

  it('returns honest no-program state and caller-zone today across a UTC/local boundary', () => {
    seedNutrition('user-2', '2026-08-19', 'partial', 900);
    seedWeight('user-2', '2026-08-19', 72, false);
    const calendar = createDataQualityCalendarStore({
      db,
      now: () => new Date('2026-08-18T16:00:00.000Z'),
    }).getCalendar('user-2', {
      start: '2026-08-18',
      end: '2026-08-19',
      timeZone: 'Asia/Tokyo',
    });

    expect(calendar.timeZone).toBe('Asia/Tokyo');
    expect(calendar.days.map((day) => [day.date, day.isToday])).toEqual([
      ['2026-08-18', false],
      ['2026-08-19', true],
    ]);
    expect(calendar.days[1]).toMatchObject({
      nutrition: { qualityState: 'partial', evidenceState: 'pending_cutoff' },
      weight: { evidenceState: 'pending_cutoff' },
      algorithm: {
        state: 'no_program',
        nutritionEvidenceState: 'not_applicable',
        weightEvidenceState: 'not_applicable',
      },
      contexts: [],
    });
  });

  it('uses a fixed number of selects for a dense 42-day range', () => {
    for (let offset = 0; offset < 42; offset += 1) {
      const date = new Date(Date.UTC(2026, 6, 8 + offset)).toISOString().slice(0, 10);
      seedNutrition('user-1', date, offset % 3 === 0 ? 'partial' : 'complete', 2000 + offset);
      seedWeight('user-1', date, 80 - offset * 0.02, false);
    }
    const queriedSources: string[] = [];
    createDataQualityCalendarStore({
      db,
      now: () => new Date(nowMs),
      onQuery: (source) => queriedSources.push(source),
    }).getCalendar('user-1', { start: '2026-07-08', end: '2026-08-18' });
    expect(queriedSources).toEqual([
      'user',
      'program',
      'nutrition',
      'weight',
      'scheduled-workouts',
      'workout-sessions',
    ]);
  });

  it('does not forecast future algorithm eligibility for an active program', () => {
    const adaptiveStore = createAdaptiveNutritionStore({
      db,
      sqlite,
      now: () => new Date(nowMs),
    });
    adaptiveStore.upsertProgram('user-1', programInput());
    const calendar = createDataQualityCalendarStore({
      db,
      now: () => new Date(nowMs),
    }).getCalendar('user-1', { start: '2026-08-18', end: '2026-08-19' });

    expect(calendar.days.find((day) => day.date === '2026-08-19')?.algorithm).toMatchObject({
      state: 'future',
      nutritionEvidenceState: 'not_applicable',
      weightEvidenceState: 'not_applicable',
      reasonCodes: ['FUTURE_DATE_NOT_EVALUATED'],
    });
  });
});

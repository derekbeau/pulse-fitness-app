import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { dataQualityCalendarSchema, type AdaptiveProgramMutation } from '@pulse/shared';

import * as schema from '../../db/schema/index.js';
import {
  adaptiveNutritionCheckIns,
  adaptiveNutritionReviewActions,
  adaptiveNutritionReviews,
  adaptiveNutritionReviewContexts,
  bodyWeight,
  mealItems,
  meals,
  nutritionLogs,
  scheduledWorkouts,
  users,
  workoutSessions,
} from '../../db/schema/index.js';
import { createAdaptiveWeeklyReviewStore } from '../adaptive-nutrition/review-store.js';
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

const addDate = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const seedEligibleReviewProgram = () => {
  const lifecycle = createAdaptiveNutritionStore({
    db,
    sqlite,
    now: () => new Date('2026-07-20T16:00:00.000Z'),
  });
  lifecycle.upsertProgram('user-1', programInput());
  const baseline = lifecycle.getState('user-1').pendingCheckIn;
  if (!baseline) throw new Error('Expected baseline check-in');
  lifecycle.acceptCheckIn('user-1', baseline.id, { replaceSameDateTarget: false });
  for (let offset = 0; offset < 21; offset += 1) {
    seedNutrition('user-1', addDate('2026-07-28', offset), 'complete', 2500);
  }
  for (const date of ['2026-07-28', '2026-08-04', '2026-08-11', '2026-08-17']) {
    seedWeight('user-1', date, 80, false);
  }
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
    const calendar = createDataQualityCalendarStore({
      db,
      sqlite,
      now: () => new Date(nowMs),
    }).getCalendar('user-1', { start: '2026-08-17', end: '2026-08-18' });
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
      correctionState: 'history_unavailable',
      unit: 'lbs',
    });
    expect(august17.weight.weight).toBeCloseTo(176.81, 1);
    expect(august17.workouts).toEqual([
      expect.objectContaining({
        id: 'session-1',
        state: 'completed',
        correctionState: 'history_unavailable',
      }),
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
      weight: { logged: 2, pending: 1 },
      workout: { planned: 1 },
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
      sqlite,
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

  it('labels and summarizes the complete adjacent-month bootstrap grid', () => {
    seedNutrition('user-2', '2026-08-19', 'complete', 2100);
    const calendar = createDataQualityCalendarStore({
      db,
      sqlite,
      now: () => new Date('2026-08-18T16:00:00.000Z'),
    }).getCalendar('user-2', {});

    expect(calendar).toMatchObject({
      today: '2026-08-19',
      timeZone: 'Asia/Tokyo',
      range: { startDate: '2026-07-27', endDate: '2026-09-06' },
      summary: {
        intervalLabel: 'Visible calendar grid',
        nutrition: { complete: 1, missing: 41 },
      },
    });
    expect(calendar.days).toHaveLength(42);
    expect(calendar.days[0]?.date).toBe('2026-07-27');
    expect(calendar.days.at(-1)?.date).toBe('2026-09-06');
  });

  it('does not reinterpret a notes-only weight edit as a measurement correction', () => {
    seedWeight('user-1', '2026-08-17', 80, false);
    db.update(bodyWeight)
      .set({ notes: 'Same measurement, clarified note.', updatedAt: nowMs + 1 })
      .where(eq(bodyWeight.id, 'user-1-weight-2026-08-17'))
      .run();
    const weight = createDataQualityCalendarStore({
      db,
      sqlite,
      now: () => new Date(nowMs),
    }).getCalendar('user-1', { start: '2026-08-17', end: '2026-08-17' }).days[0]?.weight;
    expect(weight).toMatchObject({
      weight: expect.any(Number),
      correctionState: 'history_unavailable',
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
      sqlite,
      now: () => new Date(nowMs),
      onQuery: (source) => queriedSources.push(source),
    }).getCalendar('user-1', { start: '2026-07-08', end: '2026-08-18' });
    expect(queriedSources).toEqual([
      'user',
      'program',
      'nutrition',
      'weight',
      'latest-weight',
      'scheduled-workouts',
      'workout-sessions',
      'workout-counts',
    ]);
  });

  it('does not call the fulfilled same-date plan outstanding after its linked session completes', () => {
    db.insert(scheduledWorkouts)
      .values({
        id: 'fulfilled-plan',
        userId: 'user-1',
        templateId: null,
        date: '2026-08-17',
        createdAt: nowMs - 10_000,
        updatedAt: nowMs - 10_000,
      })
      .run();
    db.insert(workoutSessions)
      .values({
        id: 'fulfilled-session',
        userId: 'user-1',
        scheduledWorkoutId: 'fulfilled-plan',
        name: 'Fulfilled workout',
        date: '2026-08-17',
        status: 'completed',
        startedAt: nowMs - 8_000,
        completedAt: nowMs - 4_000,
        createdAt: nowMs - 9_000,
        updatedAt: nowMs - 4_000,
      })
      .run();
    db.update(scheduledWorkouts)
      .set({ sessionId: 'fulfilled-session' })
      .where(eq(scheduledWorkouts.id, 'fulfilled-plan'))
      .run();

    const calendar = createDataQualityCalendarStore({
      db,
      sqlite,
      now: () => new Date(nowMs),
    }).getCalendar('user-1', { start: '2026-08-17', end: '2026-08-17' });

    expect(calendar.days[0]?.workouts).toEqual([
      expect.objectContaining({
        id: 'fulfilled-session',
        state: 'completed',
        relation: 'linked_same_date',
      }),
    ]);
    expect(calendar.summary.workout).toEqual({
      planned: 0,
      active: 0,
      completed: 1,
      cancelled: 0,
    });
  });

  it('projects every fulfilled same-date lifecycle without a duplicate plan', () => {
    const cases = [
      { date: '2026-08-14', status: 'scheduled' as const },
      { date: '2026-08-15', status: 'in-progress' as const },
      { date: '2026-08-16', status: 'paused' as const },
      { date: '2026-08-17', status: 'cancelled' as const },
    ];
    db.insert(scheduledWorkouts)
      .values(
        cases.map(({ date, status }, index) => ({
          id: `matrix-plan-${status}`,
          userId: 'user-1',
          templateId: null,
          date,
          createdAt: nowMs - 20_000 + index,
          updatedAt: nowMs - 20_000 + index,
        })),
      )
      .run();
    db.insert(workoutSessions)
      .values(
        cases.map(({ date, status }, index) => ({
          id: `matrix-session-${status}`,
          userId: 'user-1',
          scheduledWorkoutId: `matrix-plan-${status}`,
          name: `Matrix ${status}`,
          date,
          status,
          startedAt: nowMs - 10_000 + index,
          createdAt: nowMs - 10_000 + index,
          updatedAt: nowMs - 10_000 + index,
        })),
      )
      .run();
    for (const { status } of cases) {
      db.update(scheduledWorkouts)
        .set({ sessionId: `matrix-session-${status}` })
        .where(eq(scheduledWorkouts.id, `matrix-plan-${status}`))
        .run();
    }

    const calendar = createDataQualityCalendarStore({
      db,
      sqlite,
      now: () => new Date(nowMs),
    }).getCalendar('user-1', { start: '2026-08-14', end: '2026-08-17' });

    expect(calendar.days.flatMap((day) => day.workouts).map((item) => item.kind)).toEqual([
      'workout_session',
      'workout_session',
      'workout_session',
      'workout_session',
    ]);
    expect(calendar.days.flatMap((day) => day.workouts).map((item) => item.state)).toEqual([
      'scheduled',
      'in_progress',
      'paused',
      'cancelled',
    ]);
    expect(calendar.summary.workout).toEqual({
      planned: 1,
      active: 2,
      completed: 0,
      cancelled: 1,
    });
  });

  it('derives current staleness from the user latest weight, not the requested range endpoint', () => {
    seedWeight('user-1', '2026-08-01', 80, false);
    seedWeight('user-1', '2026-08-10', 79.8, false);
    seedWeight('user-1', '2026-08-17', 79.5, false);

    const historical = createDataQualityCalendarStore({
      db,
      sqlite,
      now: () => new Date(nowMs),
    }).getCalendar('user-1', { start: '2026-08-01', end: '2026-08-10' });

    expect(historical.days.find((day) => day.date === '2026-08-10')?.weight.stale).toBe(false);
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
      sqlite,
      now: () => new Date(nowMs),
    }).getCalendar('user-1', { start: '2026-08-18', end: '2026-08-19' });

    expect(calendar.days.find((day) => day.date === '2026-08-19')?.algorithm).toMatchObject({
      state: 'future',
      nutritionEvidenceState: 'not_applicable',
      weightEvidenceState: 'not_applicable',
      reasonCodes: ['FUTURE_DATE_NOT_EVALUATED'],
    });
  });

  it('follows accepted Adaptive state history instead of treating eligibility as an update', () => {
    seedEligibleReviewProgram();
    const lifecycle = createAdaptiveNutritionStore({
      db,
      sqlite,
      now: () => new Date(nowMs),
    });
    const calendarStore = () =>
      createDataQualityCalendarStore({ db, sqlite, now: () => new Date(nowMs) });

    const eligibleBeforeUpdate = calendarStore().getCalendar('user-1', {
      start: '2026-08-17',
      end: '2026-08-18',
    });
    expect(eligibleBeforeUpdate.days[0]?.algorithm.state).toBe('learning');

    const pendingUpdate = lifecycle.previewCheckIn('user-1', {
      kind: 'manual',
      includeToday: false,
    });
    expect(pendingUpdate.calculationState).toBe('updating');
    const whilePending = calendarStore().getCalendar('user-1', {
      start: '2026-08-18',
      end: '2026-08-18',
    });
    expect(whilePending.days[0]?.algorithm).toMatchObject({
      state: 'learning',
      events: [expect.objectContaining({ id: pendingUpdate.id, state: 'pending' })],
    });

    lifecycle.acceptCheckIn('user-1', pendingUpdate.id, { replaceSameDateTarget: false });
    expect(
      calendarStore().getCalendar('user-1', {
        start: '2026-08-18',
        end: '2026-08-18',
      }).days[0]?.algorithm,
    ).toMatchObject({
      state: 'updating',
      events: [expect.objectContaining({ id: pendingUpdate.id, state: 'accepted' })],
    });

    lifecycle.upsertProgram('user-1', {
      ...programInput(),
      status: 'paused',
      currentWeight: null,
    });
    expect(
      calendarStore().getCalendar('user-1', {
        start: '2026-08-18',
        end: '2026-08-18',
      }).days[0]?.algorithm.state,
    ).toBe('holding');
  });

  it('projects nutrition and weight corrections as stale through the authoritative review store', () => {
    seedEligibleReviewProgram();
    const reviewStore = createAdaptiveWeeklyReviewStore({
      db,
      sqlite,
      now: () => new Date(nowMs),
    });
    const original = reviewStore.preview('user-1', { kind: 'weekly' });
    const targetCountBefore = sqlite
      .prepare('select count(*) as value from nutrition_targets')
      .get();

    db.update(mealItems)
      .set({ calories: 2100 })
      .where(eq(mealItems.id, 'user-1-item-2026-08-10'))
      .run();
    const staleNutrition = createDataQualityCalendarStore({
      db,
      sqlite,
      now: () => new Date(nowMs),
    }).getCalendar('user-1', { start: '2026-08-01', end: '2026-08-18' });
    expect(
      staleNutrition.days
        .flatMap((day) => day.algorithm.events)
        .find((event) => event.id === original.id),
    ).toMatchObject({
      state: 'stale',
      actions: expect.arrayContaining([expect.objectContaining({ kind: 'refresh_review' })]),
    });

    const refreshedNutrition = reviewStore.refresh('user-1', original.id);
    db.update(bodyWeight)
      .set({ weightKg: 79.5, weight: poundsFromKg(79.5), updatedAt: nowMs + 1 })
      .where(eq(bodyWeight.id, 'user-1-weight-2026-08-17'))
      .run();
    const staleWeight = createDataQualityCalendarStore({
      db,
      sqlite,
      now: () => new Date(nowMs),
    }).getCalendar('user-1', { start: '2026-08-01', end: '2026-08-18' });
    expect(
      staleWeight.days
        .flatMap((day) => day.algorithm.events)
        .find((event) => event.id === refreshedNutrition.id),
    ).toMatchObject({ state: 'stale' });

    const regenerated = reviewStore.refresh('user-1', refreshedNutrition.id);
    const declined = reviewStore.act(
      'user-1',
      regenerated.id,
      {
        type: 'decline',
        expectedFingerprint: regenerated.sourceFingerprint,
        expectedActionSequence: regenerated.actionSequence,
        reason: 'Keep the current plan.',
      },
      { type: 'user', label: 'You' },
    );
    expect(declined.state).toBe('declined');
    expect(sqlite.prepare('select count(*) as value from nutrition_targets').get()).toEqual(
      targetCountBefore,
    );
    expect(db.select().from(adaptiveNutritionReviews).all()).toHaveLength(3);
    expect(db.select().from(adaptiveNutritionReviewActions).all()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reviewId: original.id, type: 'supersede' }),
        expect.objectContaining({ reviewId: refreshedNutrition.id, type: 'supersede' }),
        expect.objectContaining({ reviewId: regenerated.id, type: 'decline' }),
      ]),
    );
  });

  it('retains linked workout plan and session dates across range boundaries without inventing movement or correction history', () => {
    db.insert(scheduledWorkouts)
      .values({
        id: 'boundary-plan',
        userId: 'user-1',
        templateId: null,
        date: '2026-08-31',
        createdAt: nowMs - 10_000,
        updatedAt: nowMs - 10_000,
      })
      .run();
    db.insert(workoutSessions)
      .values({
        id: 'boundary-session',
        userId: 'user-1',
        scheduledWorkoutId: 'boundary-plan',
        name: 'Boundary workout',
        date: '2026-09-01',
        status: 'scheduled',
        startedAt: nowMs,
        createdAt: nowMs,
        updatedAt: nowMs,
      })
      .run();
    db.update(scheduledWorkouts)
      .set({ sessionId: 'boundary-session' })
      .where(eq(scheduledWorkouts.id, 'boundary-plan'))
      .run();

    const store = createDataQualityCalendarStore({ db, sqlite, now: () => new Date(nowMs) });
    const originalOnly = store.getCalendar('user-1', {
      start: '2026-08-31',
      end: '2026-08-31',
    });
    expect(originalOnly.days[0]?.workouts).toEqual([
      expect.objectContaining({
        id: 'boundary-plan',
        state: 'moved',
        plannedDate: '2026-08-31',
        sessionDate: '2026-09-01',
        relation: 'linked_different_date',
      }),
    ]);

    const destinationOnly = store.getCalendar('user-1', {
      start: '2026-09-01',
      end: '2026-09-01',
    });
    expect(destinationOnly.days[0]?.workouts).toEqual([
      expect.objectContaining({
        id: 'boundary-session',
        state: 'scheduled',
        plannedDate: '2026-08-31',
        sessionDate: '2026-09-01',
        relation: 'linked_different_date',
      }),
    ]);

    db.update(workoutSessions)
      .set({ status: 'cancelled', updatedAt: nowMs + 500 })
      .where(eq(workoutSessions.id, 'boundary-session'))
      .run();
    expect(
      store.getCalendar('user-1', {
        start: '2026-09-01',
        end: '2026-09-01',
      }).days[0]?.workouts,
    ).toEqual([expect.objectContaining({ id: 'boundary-session', state: 'cancelled' })]);

    db.update(workoutSessions)
      .set({ status: 'completed', completedAt: nowMs + 1_000, updatedAt: nowMs + 2_000 })
      .where(eq(workoutSessions.id, 'boundary-session'))
      .run();
    const bothDates = store.getCalendar('user-1', {
      start: '2026-08-31',
      end: '2026-09-01',
    });
    expect(bothDates.days.flatMap((day) => day.workouts)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'boundary-plan', state: 'moved' }),
        expect.objectContaining({
          id: 'boundary-session',
          state: 'completed',
          correctionState: 'history_unavailable',
        }),
      ]),
    );
  });

  it('places accepted check-ins on retained effective dates across month and year boundaries', () => {
    const lifecycle = createAdaptiveNutritionStore({
      db,
      sqlite,
      now: () => new Date('2026-08-31T16:00:00.000Z'),
    });
    lifecycle.upsertProgram('user-1', programInput());
    const baseline = lifecycle.getState('user-1').pendingCheckIn;
    if (!baseline) throw new Error('Expected baseline check-in');
    lifecycle.acceptCheckIn('user-1', baseline.id, { replaceSameDateTarget: false });
    const accepted = db
      .select()
      .from(adaptiveNutritionCheckIns)
      .where(eq(adaptiveNutritionCheckIns.id, baseline.id))
      .get();
    if (!accepted) throw new Error('Expected accepted check-in row');
    db.insert(adaptiveNutritionCheckIns)
      .values([
        {
          ...accepted,
          id: 'month-boundary-check-in',
          localDate: '2026-08-31',
          proposedTargets: { ...accepted.proposedTargets, effectiveDate: '2026-09-01' },
          acceptedNutritionTargetId: accepted.acceptedNutritionTargetId,
          createdAt: accepted.createdAt + 1,
        },
        {
          ...accepted,
          id: 'year-boundary-check-in',
          localDate: '2026-12-31',
          proposedTargets: { ...accepted.proposedTargets, effectiveDate: '2027-01-01' },
          acceptedNutritionTargetId: accepted.acceptedNutritionTargetId,
          createdAt: accepted.createdAt + 2,
        },
        {
          ...accepted,
          id: 'declined-check-in',
          localDate: '2026-09-02',
          status: 'declined',
          acceptedNutritionTargetId: null,
          proposedTargets: null,
          createdAt: accepted.createdAt + 3,
        },
        {
          ...accepted,
          id: 'held-check-in',
          localDate: '2026-09-03',
          status: 'held',
          calculationState: 'holding',
          acceptedNutritionTargetId: null,
          proposedTargets: null,
          createdAt: accepted.createdAt + 4,
        },
        {
          ...accepted,
          id: 'superseded-check-in',
          localDate: '2026-09-04',
          status: 'superseded',
          acceptedNutritionTargetId: null,
          proposedTargets: null,
          createdAt: accepted.createdAt + 5,
        },
      ])
      .run();

    const store = createDataQualityCalendarStore({
      db,
      sqlite,
      now: () => new Date('2027-01-02T16:00:00.000Z'),
    });
    const september = store.getCalendar('user-1', {
      start: '2026-09-01',
      end: '2026-09-04',
    });
    expect(september.days.flatMap((day) => day.algorithm.events)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'month-boundary-check-in',
          effectiveDate: '2026-09-01',
          state: 'accepted',
        }),
        expect.objectContaining({ id: 'declined-check-in', state: 'declined' }),
        expect.objectContaining({ id: 'held-check-in', state: 'held' }),
        expect.objectContaining({ id: 'superseded-check-in', state: 'superseded' }),
      ]),
    );
    expect(
      store.getCalendar('user-1', { start: '2027-01-01', end: '2027-01-01' }).days[0]?.algorithm
        .events,
    ).toEqual([
      expect.objectContaining({
        id: 'year-boundary-check-in',
        effectiveDate: '2027-01-01',
        state: 'accepted',
      }),
    ]);
  });

  it('keeps a deferred weekly review on its retained review date', () => {
    seedEligibleReviewProgram();
    const reviewStore = createAdaptiveWeeklyReviewStore({
      db,
      sqlite,
      now: () => new Date(nowMs),
    });
    const review = reviewStore.preview('user-1', { kind: 'weekly' });
    const deferred = reviewStore.act(
      'user-1',
      review.id,
      {
        type: 'defer',
        expectedFingerprint: review.sourceFingerprint,
        expectedActionSequence: review.actionSequence,
        condition: { kind: 'until_date', localDate: '2026-08-21' },
        reason: 'Wait for one more measurement.',
      },
      { type: 'user', label: 'You' },
    );
    expect(deferred.state).toBe('deferred');

    const event = createDataQualityCalendarStore({
      db,
      sqlite,
      now: () => new Date(nowMs),
    })
      .getCalendar('user-1', {
        start: review.snapshot.reviewLocalDate,
        end: review.snapshot.reviewLocalDate,
      })
      .days[0]?.algorithm.events.find((item) => item.id === review.id);
    expect(event).toMatchObject({
      effectiveDate: review.snapshot.reviewLocalDate,
      state: 'deferred',
    });
  });

  it('reduces large revision and action histories before Data Quality materialization', () => {
    seedEligibleReviewProgram();
    const reviewStore = createAdaptiveWeeklyReviewStore({
      db,
      sqlite,
      now: () => new Date(nowMs),
    });
    const review = reviewStore.preview('user-1', { kind: 'weekly' });
    reviewStore.act(
      'user-1',
      review.id,
      {
        type: 'ask_agent',
        expectedActionSequence: review.actionSequence,
        question: 'What evidence should be clarified?',
      },
      { type: 'user', label: 'You' },
    );

    const programRevision = sqlite
      .prepare(
        `select program_id as programId, user_id as userId, effective_at as effectiveAt,
                snapshot, source, created_at as createdAt
           from adaptive_nutrition_program_revisions
          where user_id = 'user-1'
          order by sequence desc limit 1`,
      )
      .get() as {
      programId: string;
      userId: string;
      effectiveAt: number;
      snapshot: string;
      source: string;
      createdAt: number;
    };
    const action = sqlite
      .prepare(
        `select user_id as userId, payload, actor_type as actorType,
                agent_token_id as agentTokenId, actor_label as actorLabel, created_at as createdAt
           from adaptive_nutrition_review_actions
          where review_id = ? order by sequence desc limit 1`,
      )
      .get(review.id) as {
      userId: string;
      payload: string;
      actorType: string;
      agentTokenId: string | null;
      actorLabel: string;
      createdAt: number;
    };
    const insertRevision = sqlite.prepare(
      `insert into adaptive_nutrition_program_revisions
        (id, program_id, user_id, sequence, effective_at, snapshot, source, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertAction = sqlite.prepare(
      `insert into adaptive_nutrition_review_actions
        (id, review_id, user_id, sequence, type, payload, actor_type, agent_token_id, actor_label, created_at)
       values (?, ?, ?, ?, 'ask_agent', ?, ?, ?, ?, ?)`,
    );
    sqlite.transaction(() => {
      for (let sequence = 2; sequence <= 5_001; sequence += 1) {
        insertRevision.run(
          `large-revision-${sequence}`,
          programRevision.programId,
          programRevision.userId,
          sequence,
          programRevision.effectiveAt + sequence,
          programRevision.snapshot,
          programRevision.source,
          programRevision.createdAt + sequence,
        );
        insertAction.run(
          `large-action-${sequence}`,
          review.id,
          action.userId,
          sequence,
          action.payload,
          action.actorType,
          action.agentTokenId,
          action.actorLabel,
          action.createdAt + sequence,
        );
      }
    })();

    const event = createDataQualityCalendarStore({
      db,
      sqlite,
      now: () => new Date(nowMs),
    })
      .getCalendar('user-1', {
        start: review.snapshot.reviewLocalDate,
        end: review.snapshot.reviewLocalDate,
      })
      .days[0]?.algorithm.events.find((item) => item.id === review.id);
    expect(event).toMatchObject({ state: 'awaiting_clarification' });
  });

  it('returns deterministic bounded truth instead of failing strict response caps on dense days', () => {
    const lifecycle = createAdaptiveNutritionStore({ db, sqlite, now: () => new Date(nowMs) });
    lifecycle.upsertProgram('user-1', programInput());
    const program = lifecycle.getState('user-1').program;
    const baseline = lifecycle.getState('user-1').pendingCheckIn;
    if (!program || !baseline) throw new Error('Expected program and baseline');
    lifecycle.acceptCheckIn('user-1', baseline.id, { replaceSameDateTarget: false });
    const source = db
      .select()
      .from(adaptiveNutritionCheckIns)
      .where(eq(adaptiveNutritionCheckIns.id, baseline.id))
      .get();
    if (!source) throw new Error('Expected accepted source check-in');

    db.insert(workoutSessions)
      .values(
        Array.from({ length: 55 }, (_, index) => ({
          id: `dense-session-${String(index).padStart(2, '0')}`,
          userId: 'user-1',
          name: `Dense session ${index}`,
          date: '2026-08-18',
          status: 'scheduled' as const,
          startedAt: nowMs + index,
          createdAt: nowMs + index,
          updatedAt: nowMs + index,
        })),
      )
      .run();
    db.insert(adaptiveNutritionReviewContexts)
      .values(
        Array.from({ length: 105 }, (_, index) => ({
          id: `dense-context-${String(index).padStart(3, '0')}`,
          userId: 'user-1',
          programId: program.id,
          subjectType: 'date' as const,
          subject: { kind: 'date' as const, localDate: '2026-08-18' },
          category: 'other' as const,
          note: `Dense context ${index}`,
          resolution: null,
          resolutionKind: null,
          createdBy: 'user' as const,
          agentTokenId: null,
          actorLabel: 'You',
          revision: 1,
          createdAt: nowMs + index,
          updatedAt: nowMs + index,
        })),
      )
      .run();
    db.insert(adaptiveNutritionCheckIns)
      .values(
        Array.from({ length: 55 }, (_, index) => ({
          ...source,
          id: `dense-check-in-${String(index).padStart(2, '0')}`,
          localDate: '2026-08-18',
          createdAt: source.createdAt + index + 1,
        })),
      )
      .run();

    const calendar = createDataQualityCalendarStore({
      db,
      sqlite,
      now: () => new Date(nowMs),
    }).getCalendar('user-1', { start: '2026-08-18', end: '2026-08-18' });
    const day = calendar.days[0];
    expect(day?.workouts).toHaveLength(50);
    expect(day?.omittedWorkoutCount).toBe(5);
    expect(day?.contexts).toHaveLength(100);
    expect(day?.omittedContextCount).toBe(5);
    expect(day?.algorithm.events).toHaveLength(50);
    expect(day?.algorithm.omittedEventCount).toBe(6);
    expect(day?.workouts.map((item) => item.id)).toEqual(
      [...(day?.workouts ?? [])].map((item) => item.id).sort(),
    );
    expect(dataQualityCalendarSchema.parse(calendar)).toEqual(calendar);
  });

  it('preserves every date cap and exact omission count across a fully dense 42-day range', () => {
    const start = '2026-07-08';
    db.insert(workoutSessions)
      .values(
        Array.from({ length: 42 }, (_, dayIndex) =>
          Array.from({ length: 51 }, (_, itemIndex) => ({
            id: `dense-range-${String(dayIndex).padStart(2, '0')}-${String(itemIndex).padStart(2, '0')}`,
            userId: 'user-1',
            name: `Dense range ${dayIndex}-${itemIndex}`,
            date: addDate(start, dayIndex),
            status: 'scheduled' as const,
            startedAt: nowMs + dayIndex * 100 + itemIndex,
            createdAt: nowMs + dayIndex * 100 + itemIndex,
            updatedAt: nowMs + dayIndex * 100 + itemIndex,
          })),
        ).flat(),
      )
      .run();

    const calendar = createDataQualityCalendarStore({
      db,
      sqlite,
      now: () => new Date(nowMs),
    }).getCalendar('user-1', { start, end: addDate(start, 41) });

    expect(calendar.days).toHaveLength(42);
    for (const day of calendar.days) {
      expect(day.workouts, day.date).toHaveLength(50);
      expect(day.omittedWorkoutCount, day.date).toBe(1);
    }
  });

  it('preserves per-date context and event caps across a fully dense 42-day range', () => {
    const start = '2026-06-01';
    const lifecycle = createAdaptiveNutritionStore({ db, sqlite, now: () => new Date(nowMs) });
    lifecycle.upsertProgram('user-1', programInput());
    const program = lifecycle.getState('user-1').program;
    const baseline = lifecycle.getState('user-1').pendingCheckIn;
    if (!program || !baseline) throw new Error('Expected program and baseline');
    lifecycle.acceptCheckIn('user-1', baseline.id, { replaceSameDateTarget: false });
    const source = db
      .select()
      .from(adaptiveNutritionCheckIns)
      .where(eq(adaptiveNutritionCheckIns.id, baseline.id))
      .get();
    if (!source) throw new Error('Expected accepted check-in source');

    for (let dayIndex = 0; dayIndex < 42; dayIndex += 1) {
      const date = addDate(start, dayIndex);
      db.insert(adaptiveNutritionReviewContexts)
        .values(
          Array.from({ length: 101 }, (_, itemIndex) => ({
            id: `dense-context-range-${String(dayIndex).padStart(2, '0')}-${String(itemIndex).padStart(3, '0')}`,
            userId: 'user-1',
            programId: program.id,
            subjectType: 'date' as const,
            subject: { kind: 'date' as const, localDate: date },
            category: 'other' as const,
            note: `Dense context ${dayIndex}-${itemIndex}`,
            resolution: null,
            resolutionKind: null,
            createdBy: 'user' as const,
            agentTokenId: null,
            actorLabel: 'You',
            revision: 1,
            createdAt: nowMs + dayIndex * 1_000 + itemIndex,
            updatedAt: nowMs + dayIndex * 1_000 + itemIndex,
          })),
        )
        .run();
      db.insert(adaptiveNutritionCheckIns)
        .values(
          Array.from({ length: 51 }, (_, itemIndex) => ({
            ...source,
            id: `dense-event-range-${String(dayIndex).padStart(2, '0')}-${String(itemIndex).padStart(2, '0')}`,
            localDate: date,
            status: 'declined' as const,
            acceptedNutritionTargetId: null,
            proposedTargets: null,
            resolvedAt: source.resolvedAt,
            createdAt: source.createdAt + dayIndex * 100 + itemIndex + 1,
          })),
        )
        .run();
    }

    const calendar = createDataQualityCalendarStore({
      db,
      sqlite,
      now: () => new Date(nowMs),
    }).getCalendar('user-1', { start, end: addDate(start, 41) });

    for (const day of calendar.days) {
      expect(day.contexts, day.date).toHaveLength(100);
      expect(day.omittedContextCount, day.date).toBe(1);
      expect(day.algorithm.events, day.date).toHaveLength(50);
      expect(day.algorithm.omittedEventCount, day.date).toBe(1);
    }
  });
});

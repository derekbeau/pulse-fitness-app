import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  calculateAdaptiveDateBoundaries,
  calculateCanonicalTrendWeightSeries,
  evaluateEligibility,
} from '@pulse/shared';

import * as schema from '../../db/schema/index.js';
import {
  adaptiveNutritionCheckIns,
  adaptiveNutritionGoalCompletions,
  adaptiveNutritionGoalRevisions,
  adaptiveNutritionGoals,
  adaptiveNutritionProgramRevisions,
  adaptiveNutritionPrograms,
  bodyWeight,
  nutritionTargetEvents,
  nutritionTargets,
  users,
} from '../../db/schema/index.js';
import {
  AdaptiveGoalTrajectoryFutureEndError,
  AdaptiveGoalTrajectoryPreGoalEndError,
  createAdaptiveGoalTrajectoryStore,
  endOfLocalDateExclusive,
} from './goal-trajectory-store.js';
import { AdaptiveGoalNotFoundError } from './goal-store.js';

const migrationsFolder = fileURLToPath(new URL('../../../drizzle', import.meta.url));
const now = new Date('2026-08-20T15:00:00Z');

const programSnapshot = {
  status: 'active' as const,
  timeZone: 'America/Detroit',
  rmrEquation: 'manual_tdee' as const,
  heightCm: null,
  birthDate: null,
  activityLevel: null,
  activityMultiplier: null,
  estimatedRmrKcal: null,
  calculatedBaselineTdeeKcal: null,
  manualBaselineTdeeKcal: 2500,
  baselineTdeeKcal: 2500,
  goalType: 'lose' as const,
  targetWeightKg: 90,
  goalRatePctPerWeek: -0.5,
  proteinGrams: 180,
  fatAllocationPct: 30,
  systemCalorieFloorKcal: 1500,
  userCalorieFloorKcal: 1500,
  algorithmVersion: 'adaptive-tdee-v1' as const,
};

const setup = (targetWeightKg = 90) => {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = OFF');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  sqlite.pragma('foreign_keys = ON');
  db.insert(users)
    .values([
      { id: 'user-1', username: 'trajectory-user', passwordHash: 'hash' },
      { id: 'user-2', username: 'other-user', passwordHash: 'hash' },
    ])
    .run();
  db.insert(adaptiveNutritionPrograms)
    .values({
      id: 'program-1',
      userId: 'user-1',
      timeZone: 'America/Detroit',
      rmrEquation: 'manual_tdee',
      manualBaselineTdeeKcal: 2500,
      baselineTdeeKcal: 2500,
      goalType: 'lose',
      targetWeightKg,
      goalRatePctPerWeek: -0.5,
      proteinGrams: 180,
      fatAllocationPct: 30,
      systemCalorieFloorKcal: 1500,
      userCalorieFloorKcal: 1500,
      algorithmVersion: 'adaptive-tdee-v1',
      createdAt: Date.parse('2026-07-01T12:00:00Z'),
      updatedAt: Date.parse('2026-07-01T12:00:00Z'),
    })
    .run();
  db.insert(adaptiveNutritionProgramRevisions)
    .values({
      id: 'program-revision-1',
      programId: 'program-1',
      userId: 'user-1',
      sequence: 1,
      effectiveAt: Date.parse('2026-07-01T12:00:00Z'),
      snapshot: { ...programSnapshot, targetWeightKg },
      source: 'program_created',
      createdAt: Date.parse('2026-07-01T12:00:00Z'),
    })
    .run();
  db.insert(adaptiveNutritionGoals)
    .values({
      id: 'goal-1',
      userId: 'user-1',
      programId: 'program-1',
      type: 'lose',
      status: 'active',
      startTrendWeightKg: 100,
      startScaleWeightKg: 100.2,
      finalTrendWeightKg: null,
      targetWeightKg,
      maintenanceCenterKg: null,
      goalRatePctPerWeek: -0.5,
      startedLocalDate: '2026-07-01',
      createdAt: Date.parse('2026-07-01T12:00:00Z'),
      updatedAt: Date.parse('2026-07-01T12:00:00Z'),
    })
    .run();
  db.insert(adaptiveNutritionGoalRevisions)
    .values({
      id: 'goal-revision-1',
      goalId: 'goal-1',
      userId: 'user-1',
      sequence: 1,
      targetWeightKg,
      maintenanceCenterKg: null,
      goalRatePctPerWeek: -0.5,
      previousTargetWeightKg: targetWeightKg,
      previousCenterKg: null,
      previousRatePctPerWeek: -0.5,
      reason: 'created',
      effectiveLocalDate: '2026-07-01',
      createdAt: Date.parse('2026-07-01T12:00:00Z'),
    })
    .run();
  const weights = Array.from({ length: 17 }, (_, index) => {
    const day = 1 + index * 3;
    const date = new Date(Date.UTC(2026, 6, day)).toISOString().slice(0, 10);
    const weightKg = 100 - index * 0.22;
    return {
      id: `weight-${index}`,
      userId: 'user-1',
      date,
      weight: weightKg / 0.45359237,
      weightKg,
      unitAtEntry: 'kg' as const,
      createdAt: Date.parse(`${date}T12:00:00Z`),
      updatedAt: Date.parse(`${date}T12:00:00Z`),
    };
  });
  db.insert(bodyWeight).values(weights).run();
  db.insert(adaptiveNutritionCheckIns)
    .values({
      id: 'check-in-1',
      userId: 'user-1',
      programId: 'program-1',
      goalId: 'goal-1',
      goalRevisionId: 'goal-revision-1',
      kind: 'weekly',
      status: 'accepted',
      calculationState: 'updating',
      localDate: '2026-07-15',
      analysisStart: '2026-06-24',
      analysisEnd: '2026-07-14',
      includeToday: false,
      algorithmVersion: 'adaptive-tdee-v1',
      dataFingerprint: 'a'.repeat(64),
      inputSnapshot: { version: 2 },
      calculationSnapshot: { latestTrendWeightKg: 98.8 },
      reasonCodes: [],
      priorTdeeKcal: 2500,
      observedTdeeKcal: 2450,
      proposedTdeeKcal: 2475,
      currentTargets: null,
      proposedTargets: {
        calories: 2100,
        protein: 180,
        carbs: 190,
        fat: 70,
        effectiveDate: '2026-07-15',
      },
      acceptedNutritionTargetId: 'target-1',
      resolvedAt: Date.parse('2026-07-15T12:00:00Z'),
      createdAt: Date.parse('2026-07-15T12:00:00Z'),
    })
    .run();
  db.insert(nutritionTargets)
    .values({
      id: 'target-1',
      userId: 'user-1',
      calories: 2100,
      protein: 180,
      carbs: 190,
      fat: 70,
      source: 'adaptive',
      adaptiveCheckInId: 'check-in-1',
      macroCalories: 180 * 4 + 190 * 4 + 70 * 9,
      effectiveDate: '2026-07-15',
      createdAt: Date.parse('2026-07-15T12:00:00Z'),
      updatedAt: Date.parse('2026-07-15T12:00:00Z'),
    })
    .run();
  db.insert(nutritionTargetEvents)
    .values({
      id: 'target-event-1',
      targetId: 'target-1',
      userId: 'user-1',
      sequence: 1,
      effectiveDate: '2026-07-15',
      calories: 2100,
      protein: 180,
      carbs: 190,
      fat: 70,
      macroCalories: 180 * 4 + 190 * 4 + 70 * 9,
      source: 'adaptive',
      adaptiveCheckInId: 'check-in-1',
      eventType: 'adaptive_accept',
      recordedAt: Date.parse('2026-07-15T12:00:00Z'),
      createdAt: Date.parse('2026-07-15T12:00:00Z'),
    })
    .run();
  const store = createAdaptiveGoalTrajectoryStore({ db, now: () => now });
  return { db, sqlite, store, weights };
};

describe('adaptive goal trajectory store', () => {
  it.each([
    ['2026-03-08', 'America/Detroit', '2026-03-09T04:00:00.000Z'],
    ['2026-11-01', 'America/Detroit', '2026-11-02T05:00:00.000Z'],
    ['2026-08-20', 'Pacific/Kiritimati', '2026-08-20T10:00:00.000Z'],
    ['2026-08-20', 'Etc/GMT+12', '2026-08-21T12:00:00.000Z'],
  ])('resolves %s in %s through the true local end of day', (date, timeZone, expected) => {
    expect(new Date(endOfLocalDateExclusive(date, timeZone)).toISOString()).toBe(expected);
  });

  it('returns one read-only goal-scoped Adaptive model trajectory with effective context', () => {
    const { db, sqlite, store, weights } = setup();
    try {
      const before = {
        programs: db.select().from(adaptiveNutritionPrograms).all(),
        programRevisions: db.select().from(adaptiveNutritionProgramRevisions).all(),
        goals: db.select().from(adaptiveNutritionGoals).all(),
        revisions: db.select().from(adaptiveNutritionGoalRevisions).all(),
        checkIns: db.select().from(adaptiveNutritionCheckIns).all(),
        targets: db.select().from(nutritionTargets).all(),
        targetEvents: db.select().from(nutritionTargetEvents).all(),
        completions: db.select().from(adaptiveNutritionGoalCompletions).all(),
        weights: db.select().from(bodyWeight).all(),
      };
      const trajectory = store.getTrajectory('user-1', 'goal-1', {
        range: 'all',
        lookbackDays: 21,
      });
      expect(trajectory).toMatchObject({
        algorithmVersion: 'adaptive-tdee-v1',
        trendSource: 'product_trend_weight_v1',
        strategyTrendSource: 'adaptive_model_trend',
        timeZone: 'America/Detroit',
        isHistorical: false,
        strategyAsOfDate: '2026-08-20',
        evidenceThroughDate: '2026-08-19',
        context: {
          calorieTargetKcal: 2100,
          calorieTargetEffectiveDate: '2026-07-15',
          adaptiveExpenditureKcal: 2475,
          expenditureSourceCheckInId: 'check-in-1',
          expenditureSourceInputFingerprint: 'a'.repeat(64),
        },
      });
      expect(trajectory.summary.kind).toBe('weight_change');
      expect(trajectory.annotations.map((annotation) => annotation.kind)).toEqual([
        'goal_started',
        'accepted_target_change',
      ]);
      const canonicalCurrent = evaluateEligibility({
        boundaries: calculateAdaptiveDateBoundaries('2026-08-20', false),
        nutritionDays: [],
        weightEntries: weights.map(({ id, date, weightKg, updatedAt }) => ({
          id,
          date,
          weightKg,
          updatedAt,
        })),
      }).trendPoints.at(-1);
      expect(trajectory.currentTrendDate).toBe(canonicalCurrent?.date);
      expect(trajectory.summary.currentTrendWeightKg).toBeCloseTo(
        canonicalCurrent?.trendWeightKg ?? 0,
        8,
      );
      expect(trajectory.trendPoints.length).toBeGreaterThan(1);
      const expectedProduct = calculateCanonicalTrendWeightSeries(
        weights,
        '2026-07-01',
        '2026-08-20',
      );
      expect(
        trajectory.trendPoints.map(({ date, trendWeightKg }) => ({ date, trendWeightKg })),
      ).toEqual(expectedProduct.map(({ date, trendWeightKg }) => ({ date, trendWeightKg })));
      expect(
        Math.abs(
          (trajectory.productTrend.currentTrendWeightKg ?? 0) -
            (trajectory.summary.currentTrendWeightKg ?? 0),
        ),
      ).toBeGreaterThan(0.1);
      expect(trajectory.trendPoints[0]).toMatchObject({
        date: '2026-07-01',
        scaleWeightKg: 100,
      });
      expect(trajectory.trendPoints.at(-1)).toMatchObject({
        date: trajectory.currentTrendDate,
        trendWeightKg: trajectory.productTrend.currentTrendWeightKg,
        section: 'current',
      });
      expect({
        programs: db.select().from(adaptiveNutritionPrograms).all(),
        programRevisions: db.select().from(adaptiveNutritionProgramRevisions).all(),
        goals: db.select().from(adaptiveNutritionGoals).all(),
        revisions: db.select().from(adaptiveNutritionGoalRevisions).all(),
        checkIns: db.select().from(adaptiveNutritionCheckIns).all(),
        targets: db.select().from(nutritionTargets).all(),
        targetEvents: db.select().from(nutritionTargetEvents).all(),
        completions: db.select().from(adaptiveNutritionGoalCompletions).all(),
        weights: db.select().from(bodyWeight).all(),
      }).toEqual(before);
    } finally {
      sqlite.close();
    }
  });

  it('keeps revisions effective by local date and display ranges forecast-invariant', () => {
    const { db, sqlite, store } = setup();
    try {
      db.insert(adaptiveNutritionGoalRevisions)
        .values({
          id: 'goal-revision-2',
          goalId: 'goal-1',
          userId: 'user-1',
          sequence: 2,
          targetWeightKg: 88,
          maintenanceCenterKg: null,
          goalRatePctPerWeek: -0.4,
          previousTargetWeightKg: 90,
          previousCenterKg: null,
          previousRatePctPerWeek: -0.5,
          reason: 'user_edit',
          effectiveLocalDate: '2026-08-01',
          createdAt: Date.parse('2026-08-01T12:00:00Z'),
        })
        .run();
      const july = store.getTrajectory('user-1', 'goal-1', {
        range: '1m',
        lookbackDays: 21,
        end: '2026-07-31',
      });
      const august = store.getTrajectory('user-1', 'goal-1', {
        range: '1m',
        lookbackDays: 21,
        end: '2026-08-19',
      });
      const all = store.getTrajectory('user-1', 'goal-1', {
        range: 'all',
        lookbackDays: 21,
        end: '2026-08-19',
      });
      expect(july.activeRevision.id).toBe('goal-revision-1');
      expect(august.activeRevision.id).toBe('goal-revision-2');
      expect(august.summary).toMatchObject({ targetWeightKg: 88, startTrendWeightKg: 100 });
      expect(august.forecast).toEqual(all.forecast);
      expect(august.actualRate).toEqual(all.actualRate);
      for (const point of august.trendPoints) {
        expect(all.trendPoints.find((candidate) => candidate.date === point.date)).toMatchObject({
          date: point.date,
          trendWeightKg: point.trendWeightKg,
        });
      }
      expect(
        august.trendPoints.find((point) => point.date === '2026-07-31')?.revisionSequence,
      ).toBe(1);
      expect(august.annotations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: 'goal_target_and_rate_revised', date: '2026-08-01' }),
        ]),
      );
      expect(august.trendPoints.find((point) => point.date === '2026-08-01')).toMatchObject({
        evidenceState: 'strategy_event',
        trendWeightKg: null,
        scaleWeightKg: null,
        targetWeightKg: 88,
        revisionSequence: 2,
      });
    } finally {
      sqlite.close();
    }
  });

  it('bounds a closed historical goal and never mixes later weights', () => {
    const { db, sqlite, store } = setup();
    try {
      db.update(adaptiveNutritionGoals)
        .set({
          status: 'completed',
          finalTrendWeightKg: 97,
          endedLocalDate: '2026-07-31',
          endedReason: 'completed',
          updatedAt: Date.parse('2026-07-31T12:00:00Z'),
        })
        .run();
      db.insert(adaptiveNutritionGoals)
        .values({
          id: 'goal-maintenance-after-completion',
          userId: 'user-1',
          programId: 'program-1',
          type: 'maintain',
          status: 'active',
          startTrendWeightKg: 97,
          startScaleWeightKg: 97,
          finalTrendWeightKg: null,
          targetWeightKg: null,
          maintenanceCenterKg: 97,
          goalRatePctPerWeek: 0,
          startedLocalDate: '2026-07-31',
          createdAt: Date.parse('2026-07-31T12:00:00Z'),
          updatedAt: Date.parse('2026-07-31T12:00:00Z'),
        })
        .run();
      db.insert(adaptiveNutritionGoalRevisions)
        .values({
          id: 'goal-maintenance-after-completion-revision-1',
          goalId: 'goal-maintenance-after-completion',
          userId: 'user-1',
          sequence: 1,
          targetWeightKg: null,
          maintenanceCenterKg: 97,
          goalRatePctPerWeek: 0,
          previousTargetWeightKg: null,
          previousCenterKg: 97,
          previousRatePctPerWeek: 0,
          reason: 'goal_completion',
          effectiveLocalDate: '2026-07-31',
          createdAt: Date.parse('2026-07-31T12:00:00Z'),
        })
        .run();
      db.insert(adaptiveNutritionGoalCompletions)
        .values({
          checkInId: 'check-in-1',
          userId: 'user-1',
          completedGoalId: 'goal-1',
          maintenanceGoalId: 'goal-maintenance-after-completion',
          createdAt: Date.parse('2026-07-31T12:00:00Z'),
        })
        .run();
      db.insert(bodyWeight)
        .values({
          id: 'later-goal-weight',
          userId: 'user-1',
          date: '2026-08-10',
          weight: 85 / 0.45359237,
          weightKg: 85,
          unitAtEntry: 'kg',
        })
        .run();
      db.insert(adaptiveNutritionProgramRevisions)
        .values({
          id: 'program-revision-2',
          programId: 'program-1',
          userId: 'user-1',
          sequence: 2,
          effectiveAt: Date.parse('2026-08-10T12:00:00Z'),
          snapshot: { ...programSnapshot, timeZone: 'Asia/Tokyo' },
          source: 'program_updated',
          createdAt: Date.parse('2026-08-10T12:00:00Z'),
        })
        .run();
      const trajectory = store.getTrajectory('user-1', 'goal-1', {
        range: 'all',
        lookbackDays: 21,
      });
      expect(trajectory.isHistorical).toBe(true);
      expect(trajectory.strategyAsOfDate).toBe('2026-07-31');
      expect(trajectory.range.endDate).toBe('2026-07-31');
      expect(trajectory.trendPoints.every((point) => point.date <= '2026-07-31')).toBe(true);
      expect(trajectory.forecast).toBeNull();
      expect(trajectory.timeZone).toBe('America/Detroit');
      expect(trajectory.summary.currentTrendWeightKg).toBe(97);
      expect(trajectory.currentTrendDate).toBe('2026-07-31');
      expect(trajectory.trendPoints.at(-1)).toMatchObject({
        date: '2026-07-31',
        section: 'current',
      });
      expect(trajectory.trendPoints.at(-1)?.trendWeightKg).not.toBe(97);
      expect(trajectory.completionReview).toMatchObject({
        completionReviewRequired: false,
        completionAllowed: false,
        reasonCode: 'GOAL_CLOSED',
      });

      const explicitAfterClosure = store.getTrajectory('user-1', 'goal-1', {
        range: 'all',
        lookbackDays: 21,
        end: '2026-08-19',
      });
      expect(explicitAfterClosure.timeZone).toBe('America/Detroit');
      expect(explicitAfterClosure.strategyAsOfDate).toBe('2026-07-31');

      const midGoal = store.getTrajectory('user-1', 'goal-1', {
        range: 'all',
        lookbackDays: 21,
        end: '2026-07-20',
      });
      expect(midGoal.goal).toMatchObject({
        status: 'active',
        finalTrendWeightKg: null,
        endedLocalDate: null,
        endedReason: null,
      });
      expect(midGoal.currentTrendDate).not.toBe('2026-07-31');
      expect(midGoal.currentTrendDate === null || midGoal.currentTrendDate <= '2026-07-20').toBe(
        true,
      );
      expect(midGoal.forecast).not.toBeNull();
      expect(midGoal.annotations.map((annotation) => annotation.kind)).not.toContain(
        'goal_completed',
      );
      expect(midGoal.completionReview.reasonCode).not.toBe('GOAL_CLOSED');
    } finally {
      sqlite.close();
    }
  });

  it('keeps pace and scale evidence inside a recent goal while preserving same-day endpoints', () => {
    const { db, sqlite, store } = setup();
    try {
      db.update(adaptiveNutritionGoals)
        .set({
          status: 'replaced',
          finalTrendWeightKg: 96.5,
          endedLocalDate: '2026-08-19',
          endedReason: 'direction_changed',
          updatedAt: Date.parse('2026-08-19T12:00:00Z'),
        })
        .run();
      db.insert(adaptiveNutritionGoals)
        .values({
          id: 'goal-recent',
          userId: 'user-1',
          programId: 'program-1',
          type: 'gain',
          status: 'active',
          startTrendWeightKg: 96,
          startScaleWeightKg: 96,
          finalTrendWeightKg: null,
          targetWeightKg: 102,
          maintenanceCenterKg: null,
          goalRatePctPerWeek: 0.25,
          startedLocalDate: '2026-08-20',
          createdAt: Date.parse('2026-08-20T12:00:00Z'),
          updatedAt: Date.parse('2026-08-20T12:00:00Z'),
        })
        .run();
      db.insert(adaptiveNutritionGoalRevisions)
        .values({
          id: 'goal-recent-revision-1',
          goalId: 'goal-recent',
          userId: 'user-1',
          sequence: 1,
          targetWeightKg: 102,
          maintenanceCenterKg: null,
          goalRatePctPerWeek: 0.25,
          previousTargetWeightKg: 102,
          previousCenterKg: null,
          previousRatePctPerWeek: 0.25,
          reason: 'created',
          effectiveLocalDate: '2026-08-20',
          createdAt: Date.parse('2026-08-20T12:00:00Z'),
        })
        .run();

      const active = store.getTrajectory('user-1', 'goal-recent', {
        range: 'all',
        lookbackDays: 21,
      });
      expect(active).toMatchObject({
        strategyAsOfDate: '2026-08-20',
        evidenceThroughDate: '2026-08-19',
        currentTrendDate: null,
        actualRate: {
          status: 'unavailable',
          unavailableReason: 'INSUFFICIENT_TREND',
          observedWeightCount: 0,
        },
      });
      expect(active.summary.latestScale).toBeNull();
      expect(active.summary.currentTrendWeightKg).toBeNull();
      expect(active.productTrend).toMatchObject({ state: 'no_data', currentTrendDate: null });
      expect(active.trendPoints).toEqual([
        expect.objectContaining({
          date: '2026-08-20',
          evidenceState: 'strategy_event',
          trendWeightKg: null,
          scaleWeightKg: null,
          targetWeightKg: 102,
        }),
      ]);
    } finally {
      sqlite.close();
    }
  });

  it('keeps a closed-today final endpoint visible beyond the completed-day cutoff', () => {
    const { db, sqlite, store } = setup();
    try {
      db.update(adaptiveNutritionGoals)
        .set({
          status: 'completed',
          finalTrendWeightKg: 96.2,
          endedLocalDate: '2026-08-20',
          endedReason: 'completed',
          updatedAt: Date.parse('2026-08-20T14:00:00Z'),
        })
        .run();
      const closed = store.getTrajectory('user-1', 'goal-1', {
        range: 'all',
        lookbackDays: 21,
      });
      expect(closed).toMatchObject({
        strategyAsOfDate: '2026-08-20',
        evidenceThroughDate: '2026-08-19',
        currentTrendDate: '2026-08-20',
        summary: { currentTrendWeightKg: 96.2 },
        completionReview: { reasonCode: 'GOAL_CLOSED' },
      });
      expect(closed.trendPoints.some((point) => point.date === '2026-08-20')).toBe(false);
    } finally {
      sqlite.close();
    }
  });

  it('uses the America/Detroit completed-day cutoff across local midnight', () => {
    const { db, sqlite } = setup();
    try {
      const beforeMidnight = createAdaptiveGoalTrajectoryStore({
        db,
        now: () => new Date('2026-08-21T03:59:59.000Z'),
      }).getTrajectory('user-1', 'goal-1', { range: '1m', lookbackDays: 21 });
      const afterMidnight = createAdaptiveGoalTrajectoryStore({
        db,
        now: () => new Date('2026-08-21T04:00:01.000Z'),
      }).getTrajectory('user-1', 'goal-1', { range: '1m', lookbackDays: 21 });
      expect(beforeMidnight).toMatchObject({
        timeZone: 'America/Detroit',
        strategyAsOfDate: '2026-08-20',
        evidenceThroughDate: '2026-08-19',
      });
      expect(afterMidnight).toMatchObject({
        timeZone: 'America/Detroit',
        strategyAsOfDate: '2026-08-21',
        evidenceThroughDate: '2026-08-20',
      });
      expect(beforeMidnight.currentTrendDate).toBe('2026-08-18');
      expect(afterMidnight.currentTrendDate).toBe(beforeMidnight.currentTrendDate);
    } finally {
      sqlite.close();
    }
  });

  it('allows completion only when the latest accepted active-revision check-in reached the goal', () => {
    const { db, sqlite, store } = setup(99);
    try {
      db.insert(adaptiveNutritionCheckIns)
        .values({
          id: 'check-in-older-reached',
          userId: 'user-1',
          programId: 'program-1',
          goalId: 'goal-1',
          goalRevisionId: 'goal-revision-1',
          kind: 'weekly',
          status: 'accepted',
          calculationState: 'updating',
          localDate: '2026-07-10',
          analysisStart: '2026-06-19',
          analysisEnd: '2026-07-09',
          includeToday: false,
          algorithmVersion: 'adaptive-tdee-v1',
          dataFingerprint: 'b'.repeat(64),
          inputSnapshot: { version: 2 },
          calculationSnapshot: { goal: { goalReached: true } },
          reasonCodes: [],
          priorTdeeKcal: 2500,
          observedTdeeKcal: 2500,
          proposedTdeeKcal: 2500,
          currentTargets: null,
          proposedTargets: null,
          acceptedNutritionTargetId: null,
          resolvedAt: Date.parse('2026-07-10T12:00:00Z'),
          createdAt: Date.parse('2026-07-10T12:00:00Z'),
        })
        .run();
      expect(
        store.getTrajectory('user-1', 'goal-1', { range: 'all', lookbackDays: 21 })
          .completionReview,
      ).toMatchObject({
        trendTargetStatus: 'reached',
        completionReviewRequired: true,
        completionAllowed: false,
      });
      db.insert(adaptiveNutritionCheckIns)
        .values({
          id: 'check-in-latest-reached',
          userId: 'user-1',
          programId: 'program-1',
          goalId: 'goal-1',
          goalRevisionId: 'goal-revision-1',
          kind: 'weekly',
          status: 'accepted',
          calculationState: 'updating',
          localDate: '2026-07-20',
          analysisStart: '2026-06-29',
          analysisEnd: '2026-07-19',
          includeToday: false,
          algorithmVersion: 'adaptive-tdee-v1',
          dataFingerprint: 'c'.repeat(64),
          inputSnapshot: { version: 2 },
          calculationSnapshot: { goal: { goalReached: true } },
          reasonCodes: [],
          priorTdeeKcal: 2500,
          observedTdeeKcal: 2500,
          proposedTdeeKcal: 2500,
          currentTargets: null,
          proposedTargets: null,
          acceptedNutritionTargetId: null,
          resolvedAt: Date.parse('2026-07-20T12:00:00Z'),
          createdAt: Date.parse('2026-07-20T12:00:00Z'),
        })
        .run();
      expect(
        store.getTrajectory('user-1', 'goal-1', { range: 'all', lookbackDays: 21 }).completionReview
          .completionAllowed,
      ).toBe(true);
    } finally {
      sqlite.close();
    }
  });

  it('does not label an active maintenance successor as already completed', () => {
    const { db, sqlite, store } = setup();
    try {
      db.update(adaptiveNutritionGoals)
        .set({
          status: 'completed',
          finalTrendWeightKg: 97,
          endedLocalDate: '2026-08-01',
          endedReason: 'completed',
        })
        .run();
      db.insert(adaptiveNutritionGoals)
        .values({
          id: 'goal-maintenance',
          userId: 'user-1',
          programId: 'program-1',
          type: 'maintain',
          status: 'active',
          startTrendWeightKg: 97,
          startScaleWeightKg: 97.1,
          finalTrendWeightKg: null,
          targetWeightKg: null,
          maintenanceCenterKg: 97,
          goalRatePctPerWeek: 0,
          startedLocalDate: '2026-08-01',
          createdAt: Date.parse('2026-08-01T12:00:00Z'),
          updatedAt: Date.parse('2026-08-01T12:00:00Z'),
        })
        .run();
      db.insert(adaptiveNutritionGoalRevisions)
        .values({
          id: 'goal-maintenance-revision-1',
          goalId: 'goal-maintenance',
          userId: 'user-1',
          sequence: 1,
          targetWeightKg: null,
          maintenanceCenterKg: 97,
          goalRatePctPerWeek: 0,
          previousTargetWeightKg: null,
          previousCenterKg: 97,
          previousRatePctPerWeek: 0,
          reason: 'goal_completion',
          effectiveLocalDate: '2026-08-01',
          createdAt: Date.parse('2026-08-01T12:00:00Z'),
        })
        .run();
      db.insert(adaptiveNutritionGoalCompletions)
        .values({
          checkInId: 'check-in-1',
          userId: 'user-1',
          completedGoalId: 'goal-1',
          maintenanceGoalId: 'goal-maintenance',
          createdAt: Date.parse('2026-08-01T12:00:00Z'),
        })
        .run();
      const trajectory = store.getTrajectory('user-1', 'goal-maintenance', {
        range: 'all',
        lookbackDays: 21,
      });
      expect(trajectory.summary.kind).toBe('maintenance');
      expect(trajectory.annotations.map((annotation) => annotation.kind)).not.toContain(
        'goal_completed',
      );
      expect(trajectory.annotations).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: 'goal_started' })]),
      );
    } finally {
      sqlite.close();
    }
  });

  it('labels accepted reviews from their actual target and expenditure relations', () => {
    const { db, sqlite, store } = setup();
    try {
      const acceptedAt = Date.parse('2026-08-01T12:00:00Z');
      const base = {
        userId: 'user-1',
        programId: 'program-1',
        goalId: 'goal-1',
        goalRevisionId: 'goal-revision-1',
        kind: 'weekly' as const,
        status: 'accepted' as const,
        calculationState: 'updating' as const,
        analysisStart: '2026-07-10',
        analysisEnd: '2026-07-30',
        includeToday: false,
        algorithmVersion: 'adaptive-tdee-v1',
        inputSnapshot: { version: 2 },
        calculationSnapshot: { goal: { goalReached: false } },
        reasonCodes: [] as string[],
        priorTdeeKcal: 2475,
        observedTdeeKcal: 2450,
        currentTargets: null,
        proposedTargets: null,
        acceptedNutritionTargetId: null,
        resolvedAt: acceptedAt,
        createdAt: acceptedAt,
      };
      db.insert(adaptiveNutritionCheckIns)
        .values([
          {
            ...base,
            id: 'expenditure-only-check-in',
            localDate: '2026-08-01',
            dataFingerprint: 'e'.repeat(64),
            proposedTdeeKcal: 2460,
          },
          {
            ...base,
            id: 'no-change-check-in',
            localDate: '2026-08-02',
            dataFingerprint: 'f'.repeat(64),
            proposedTdeeKcal: null,
          },
        ])
        .run();
      const annotations = store
        .getTrajectory('user-1', 'goal-1', { range: 'all', lookbackDays: 21 })
        .annotations.map(({ kind, label }) => ({ kind, label }));
      expect(annotations).toEqual(
        expect.arrayContaining([
          {
            kind: 'accepted_expenditure_update',
            label: 'Accepted expenditure update · targets unchanged',
          },
          { kind: 'accepted_no_target_change', label: 'Accepted review · targets unchanged' },
        ]),
      );
    } finally {
      sqlite.close();
    }
  });

  it('keeps an earlier historical response byte-stable after later backdated acceptance events', () => {
    const { db, sqlite, store } = setup();
    try {
      db.insert(adaptiveNutritionCheckIns)
        .values({
          id: 'late-check-in',
          userId: 'user-1',
          programId: 'program-1',
          goalId: 'goal-1',
          goalRevisionId: 'goal-revision-1',
          kind: 'weekly',
          status: 'pending',
          calculationState: 'updating',
          localDate: '2026-07-10',
          analysisStart: '2026-06-19',
          analysisEnd: '2026-07-09',
          includeToday: false,
          algorithmVersion: 'adaptive-tdee-v1',
          dataFingerprint: 'd'.repeat(64),
          inputSnapshot: { version: 2 },
          calculationSnapshot: { goal: { goalReached: true } },
          reasonCodes: [],
          priorTdeeKcal: 2500,
          observedTdeeKcal: 2400,
          proposedTdeeKcal: 2425,
          currentTargets: null,
          proposedTargets: {
            calories: 2050,
            protein: 180,
            carbs: 175,
            fat: 70,
            effectiveDate: '2026-07-10',
          },
          acceptedNutritionTargetId: null,
          resolvedAt: null,
          createdAt: Date.parse('2026-07-05T12:00:00Z'),
        })
        .run();
      const historicalQuery = {
        range: 'all' as const,
        lookbackDays: 21 as const,
        end: '2026-07-10',
      };
      const before = store.getTrajectory('user-1', 'goal-1', historicalQuery);

      const acceptedAt = Date.parse('2026-07-20T12:00:00Z');
      db.insert(nutritionTargets)
        .values({
          id: 'late-target',
          userId: 'user-1',
          calories: 2050,
          protein: 180,
          carbs: 175,
          fat: 70,
          source: 'adaptive',
          adaptiveCheckInId: 'late-check-in',
          effectiveDate: '2026-07-10',
          createdAt: acceptedAt,
          updatedAt: acceptedAt,
        })
        .run();
      db.update(adaptiveNutritionCheckIns)
        .set({
          status: 'accepted',
          acceptedNutritionTargetId: 'late-target',
          resolvedAt: acceptedAt,
        })
        .where(eq(adaptiveNutritionCheckIns.id, 'late-check-in'))
        .run();
      db.insert(nutritionTargetEvents)
        .values({
          id: 'late-target-event',
          targetId: 'late-target',
          userId: 'user-1',
          sequence: 1,
          effectiveDate: '2026-07-10',
          calories: 2050,
          protein: 180,
          carbs: 175,
          fat: 70,
          macroCalories: 180 * 4 + 175 * 4 + 70 * 9,
          source: 'adaptive',
          adaptiveCheckInId: 'late-check-in',
          eventType: 'adaptive_accept',
          recordedAt: acceptedAt,
          createdAt: acceptedAt,
        })
        .run();
      db.insert(adaptiveNutritionGoalRevisions)
        .values({
          id: 'late-goal-revision',
          goalId: 'goal-1',
          userId: 'user-1',
          sequence: 2,
          targetWeightKg: 88,
          maintenanceCenterKg: null,
          goalRatePctPerWeek: -0.4,
          previousTargetWeightKg: 90,
          previousCenterKg: null,
          previousRatePctPerWeek: -0.5,
          reason: 'user_edit',
          effectiveLocalDate: '2026-07-10',
          createdAt: acceptedAt,
        })
        .run();
      db.insert(adaptiveNutritionProgramRevisions)
        .values({
          id: 'late-program-revision',
          programId: 'program-1',
          userId: 'user-1',
          sequence: 2,
          effectiveAt: acceptedAt,
          snapshot: { ...programSnapshot, timeZone: 'Asia/Tokyo', targetWeightKg: 88 },
          source: 'program_updated',
          createdAt: acceptedAt,
        })
        .run();
      db.update(adaptiveNutritionGoals)
        .set({
          status: 'completed',
          finalTrendWeightKg: 99,
          endedLocalDate: '2026-07-10',
          endedReason: 'completed',
          updatedAt: acceptedAt,
        })
        .where(eq(adaptiveNutritionGoals.id, 'goal-1'))
        .run();
      db.insert(adaptiveNutritionGoals)
        .values({
          id: 'late-maintenance-goal',
          userId: 'user-1',
          programId: 'program-1',
          type: 'maintain',
          status: 'active',
          startTrendWeightKg: 99,
          startScaleWeightKg: 99,
          finalTrendWeightKg: null,
          targetWeightKg: null,
          maintenanceCenterKg: 99,
          goalRatePctPerWeek: 0,
          startedLocalDate: '2026-07-10',
          createdAt: acceptedAt,
          updatedAt: acceptedAt,
        })
        .run();
      db.insert(adaptiveNutritionGoalRevisions)
        .values({
          id: 'late-maintenance-revision',
          goalId: 'late-maintenance-goal',
          userId: 'user-1',
          sequence: 1,
          targetWeightKg: null,
          maintenanceCenterKg: 99,
          goalRatePctPerWeek: 0,
          previousTargetWeightKg: null,
          previousCenterKg: 99,
          previousRatePctPerWeek: 0,
          reason: 'goal_completion',
          effectiveLocalDate: '2026-07-10',
          createdAt: acceptedAt,
        })
        .run();
      db.insert(adaptiveNutritionGoalCompletions)
        .values({
          checkInId: 'late-check-in',
          userId: 'user-1',
          completedGoalId: 'goal-1',
          maintenanceGoalId: 'late-maintenance-goal',
          createdAt: acceptedAt,
        })
        .run();

      expect(store.getTrajectory('user-1', 'goal-1', historicalQuery)).toEqual(before);
      const live = store.getTrajectory('user-1', 'goal-1', {
        range: 'all',
        lookbackDays: 21,
      });
      expect(live).toMatchObject({
        goal: { status: 'completed' },
        activeRevision: { id: 'goal-revision-1' },
        context: { calorieTargetKcal: null },
      });
      expect(live.annotations.map((annotation) => annotation.kind)).toEqual(['goal_started']);
    } finally {
      sqlite.close();
    }
  });

  it('reconstructs same-date replacements from immutable events and orders equal-time accepts by sequence', () => {
    const { db, sqlite, store } = setup();
    try {
      const historicalQuery = {
        range: 'all' as const,
        lookbackDays: 21 as const,
        end: '2026-07-15',
      };
      const before = store.getTrajectory('user-1', 'goal-1', historicalQuery);
      expect(before.context).toMatchObject({
        calorieTargetKcal: 2100,
        calorieTargetEffectiveDate: '2026-07-15',
      });
      expect(before.annotations).toContainEqual(
        expect.objectContaining({
          checkInId: 'check-in-1',
          kind: 'accepted_target_change',
          label: 'Accepted target change · 2,100 kcal',
        }),
      );

      const acceptedAt = Date.parse('2026-07-20T12:00:00Z');
      const base = {
        userId: 'user-1',
        programId: 'program-1',
        goalId: 'goal-1',
        goalRevisionId: 'goal-revision-1',
        kind: 'weekly' as const,
        status: 'accepted' as const,
        calculationState: 'updating' as const,
        localDate: '2026-07-15',
        analysisStart: '2026-06-24',
        analysisEnd: '2026-07-14',
        includeToday: false,
        algorithmVersion: 'adaptive-tdee-v1',
        inputSnapshot: { version: 2 },
        calculationSnapshot: { goal: { goalReached: false } },
        reasonCodes: [] as string[],
        priorTdeeKcal: 2475,
        observedTdeeKcal: 2450,
        proposedTdeeKcal: 2460,
        currentTargets: null,
        acceptedNutritionTargetId: 'target-1',
        resolvedAt: acceptedAt,
        createdAt: acceptedAt,
      };
      db.insert(adaptiveNutritionCheckIns)
        .values([
          {
            ...base,
            id: 'same-date-check-in-b',
            dataFingerprint: 'b'.repeat(64),
            proposedTargets: {
              calories: 1950,
              protein: 180,
              carbs: 152.5,
              fat: 70,
              effectiveDate: '2026-07-15',
            },
          },
          {
            ...base,
            id: 'same-date-check-in-c',
            dataFingerprint: 'c'.repeat(64),
            proposedTargets: {
              calories: 1850,
              protein: 180,
              carbs: 127.5,
              fat: 70,
              effectiveDate: '2026-07-15',
            },
          },
        ])
        .run();
      db.update(nutritionTargets)
        .set({
          calories: 1850,
          protein: 180,
          carbs: 127.5,
          fat: 70,
          macroCalories: 1860,
          source: 'adaptive',
          adaptiveCheckInId: 'same-date-check-in-c',
          updatedAt: acceptedAt,
        })
        .where(eq(nutritionTargets.id, 'target-1'))
        .run();
      db.insert(nutritionTargetEvents)
        .values([
          {
            id: 'same-date-event-b',
            targetId: 'target-1',
            userId: 'user-1',
            sequence: 2,
            effectiveDate: '2026-07-15',
            calories: 1900,
            protein: 180,
            carbs: 140,
            fat: 70,
            macroCalories: 1910,
            source: 'adaptive',
            adaptiveCheckInId: 'same-date-check-in-b',
            eventType: 'adaptive_accept',
            recordedAt: acceptedAt,
            createdAt: acceptedAt,
          },
          {
            id: 'same-date-event-c',
            targetId: 'target-1',
            userId: 'user-1',
            sequence: 3,
            effectiveDate: '2026-07-15',
            calories: 1850,
            protein: 180,
            carbs: 127.5,
            fat: 70,
            macroCalories: 1860,
            source: 'adaptive',
            adaptiveCheckInId: 'same-date-check-in-c',
            eventType: 'adaptive_accept',
            recordedAt: acceptedAt,
            createdAt: acceptedAt,
          },
        ])
        .run();

      expect(store.getTrajectory('user-1', 'goal-1', historicalQuery)).toEqual(before);
      const live = store.getTrajectory('user-1', 'goal-1', {
        range: 'all',
        lookbackDays: 21,
      });
      expect(live.context).toMatchObject({
        calorieTargetKcal: 1850,
        calorieTargetEffectiveDate: '2026-07-15',
      });
      expect(live.annotations).toContainEqual(
        expect.objectContaining({
          checkInId: 'same-date-check-in-b',
          label: 'Accepted target change · 1,900 kcal',
        }),
      );
      expect(live.annotations).toContainEqual(
        expect.objectContaining({
          checkInId: 'same-date-check-in-c',
          label: 'Accepted target change · 1,850 kcal',
        }),
      );
    } finally {
      sqlite.close();
    }
  });

  it('rejects future, pre-goal, and cross-user reads', () => {
    const { sqlite, store } = setup();
    try {
      expect(() =>
        store.getTrajectory('user-1', 'goal-1', {
          range: '1m',
          lookbackDays: 21,
          end: '2026-08-21',
        }),
      ).toThrow(AdaptiveGoalTrajectoryFutureEndError);
      expect(() =>
        store.getTrajectory('user-1', 'goal-1', {
          range: '1m',
          lookbackDays: 21,
          end: '2026-06-30',
        }),
      ).toThrow(AdaptiveGoalTrajectoryPreGoalEndError);
      expect(() =>
        store.getTrajectory('user-2', 'goal-1', { range: '1m', lookbackDays: 21 }),
      ).toThrow(AdaptiveGoalNotFoundError);
    } finally {
      sqlite.close();
    }
  });
});

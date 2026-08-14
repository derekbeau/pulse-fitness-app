import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import * as schema from '../../db/schema/index.js';
import {
  adaptiveNutritionCheckIns,
  adaptiveNutritionGoalRevisions,
  adaptiveNutritionGoals,
  adaptiveNutritionPrograms,
  bodyWeight,
  users,
} from '../../db/schema/index.js';
import { AdaptiveGoalNotFoundError, createAdaptiveGoalReadStore } from './goal-store.js';

const migrationsFolder = fileURLToPath(new URL('../../../drizzle', import.meta.url));

const setup = () => {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = OFF');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  sqlite.pragma('foreign_keys = ON');
  db.insert(users)
    .values([
      { id: 'user-1', username: 'user-1', passwordHash: 'hash' },
      { id: 'user-2', username: 'user-2', passwordHash: 'hash' },
    ])
    .run();
  db.insert(bodyWeight)
    .values([
      {
        id: 'weight-1',
        userId: 'user-1',
        date: '2026-06-01',
        weight: 82 / 0.45359237,
        weightKg: 82,
        unitAtEntry: 'kg',
      },
      {
        id: 'weight-2',
        userId: 'user-1',
        date: '2026-06-08',
        weight: 81 / 0.45359237,
        weightKg: 81,
        unitAtEntry: 'kg',
      },
      {
        id: 'weight-3',
        userId: 'user-1',
        date: '2026-06-15',
        weight: 80 / 0.45359237,
        weightKg: 80,
        unitAtEntry: 'kg',
      },
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
      targetWeightKg: 75,
      goalRatePctPerWeek: -0.5,
      proteinGrams: 180,
      fatAllocationPct: 30,
      systemCalorieFloorKcal: 1500,
      userCalorieFloorKcal: 1500,
      algorithmVersion: 'adaptive-tdee-v1',
      createdAt: Date.parse('2026-06-01T00:00:00Z'),
      updatedAt: Date.parse('2026-06-01T00:00:00Z'),
    })
    .run();
  db.insert(adaptiveNutritionGoals)
    .values({
      id: 'goal-1',
      userId: 'user-1',
      programId: 'program-1',
      type: 'lose',
      status: 'active',
      startTrendWeightKg: 82,
      startScaleWeightKg: 82.2,
      finalTrendWeightKg: null,
      targetWeightKg: 75,
      maintenanceCenterKg: null,
      goalRatePctPerWeek: -0.5,
      startedLocalDate: '2026-06-01',
      createdAt: Date.parse('2026-06-01T00:00:00Z'),
      updatedAt: Date.parse('2026-06-01T00:00:00Z'),
    })
    .run();
  db.insert(adaptiveNutritionGoalRevisions)
    .values({
      id: 'revision-1',
      goalId: 'goal-1',
      userId: 'user-1',
      sequence: 1,
      targetWeightKg: 75,
      maintenanceCenterKg: null,
      goalRatePctPerWeek: -0.5,
      previousTargetWeightKg: 75,
      previousCenterKg: null,
      previousRatePctPerWeek: -0.5,
      reason: 'created',
      effectiveLocalDate: '2026-06-01',
      createdAt: Date.parse('2026-06-01T00:00:00Z'),
    })
    .run();
  db.insert(adaptiveNutritionCheckIns)
    .values({
      id: 'check-in-1',
      userId: 'user-1',
      programId: 'program-1',
      goalId: 'goal-1',
      goalRevisionId: 'revision-1',
      kind: 'weekly',
      status: 'accepted',
      calculationState: 'updating',
      localDate: '2026-06-15',
      analysisStart: '2026-05-25',
      analysisEnd: '2026-06-14',
      includeToday: false,
      algorithmVersion: 'adaptive-tdee-v1',
      dataFingerprint: 'a'.repeat(64),
      inputSnapshot: { version: 2 },
      calculationSnapshot: { latestTrendWeightKg: 80 },
      reasonCodes: [],
      priorTdeeKcal: 2500,
      observedTdeeKcal: 2450,
      proposedTdeeKcal: 2475,
      currentTargets: null,
      proposedTargets: null,
      acceptedNutritionTargetId: null,
      resolvedAt: Date.parse('2026-06-15T00:00:00Z'),
      createdAt: Date.parse('2026-06-15T00:00:00Z'),
    })
    .run();
  return { db, sqlite, store: createAdaptiveGoalReadStore({ db }) };
};

describe('adaptive goal read store', () => {
  it('returns current, paginated history, revision detail, and linked accepted check-ins', () => {
    const { sqlite, store } = setup();
    try {
      expect(store.getCurrent('user-1')).toMatchObject({
        goal: { id: 'goal-1', status: 'active' },
        latestRevision: { id: 'revision-1', sequence: 1 },
        progress: { kind: 'weight_change', provenance: 'scale_only' },
        pendingGoalChange: null,
      });
      expect(store.list('user-1', {})).toMatchObject({
        data: [
          {
            goal: { id: 'goal-1' },
            latestRevision: { id: 'revision-1' },
            finalTrendWeightKg: null,
            netChangeKg: null,
          },
        ],
        meta: { page: 1, limit: 20, total: 1 },
      });
      expect(store.getDetail('user-1', 'goal-1')).toMatchObject({
        revisions: [{ id: 'revision-1' }],
        acceptedCheckIns: [{ id: 'check-in-1', goalId: 'goal-1' }],
        trendPoints: [
          {
            kind: 'weight_change',
            date: '2026-06-01',
            trendWeightKg: 82,
            scaleWeightKg: 82.2,
            goalRevisionId: 'revision-1',
            targetWeightKg: 75,
          },
          { kind: 'weight_change', date: '2026-06-08', scaleWeightKg: 81 },
          { kind: 'weight_change', date: '2026-06-15', scaleWeightKg: 80 },
        ],
        completion: null,
      });
    } finally {
      sqlite.close();
    }
  });

  it('uses persisted canonical endpoints for closed-goal detail and net change', () => {
    const { db, sqlite, store } = setup();
    try {
      db.update(adaptiveNutritionGoals)
        .set({
          status: 'replaced',
          finalTrendWeightKg: 79.4,
          endedLocalDate: '2026-06-15',
          endedReason: 'direction_changed',
          updatedAt: Date.parse('2026-06-15T12:00:00Z'),
        })
        .run();

      const summary = store.list('user-1', {}).data[0];
      expect(summary?.finalTrendWeightKg).toBe(79.4);
      expect(summary?.netChangeKg).toBeCloseTo(-2.6, 10);
      const detail = store.getDetail('user-1', 'goal-1');
      expect(detail.trendPoints[0]).toMatchObject({
        date: '2026-06-01',
        trendWeightKg: 82,
        scaleWeightKg: 82.2,
      });
      expect(detail.trendPoints.at(-1)).toMatchObject({
        date: '2026-06-15',
        trendWeightKg: 79.4,
      });
    } finally {
      sqlite.close();
    }
  });

  it('keeps historical progress revision-effective and uses the canonical maintenance range', () => {
    const { db, sqlite, store } = setup();
    try {
      db.insert(adaptiveNutritionGoalRevisions)
        .values({
          id: 'revision-2',
          goalId: 'goal-1',
          userId: 'user-1',
          sequence: 2,
          targetWeightKg: 77,
          maintenanceCenterKg: null,
          goalRatePctPerWeek: -0.4,
          previousTargetWeightKg: 75,
          previousCenterKg: null,
          previousRatePctPerWeek: -0.5,
          reason: 'user_edit',
          effectiveLocalDate: '2026-06-10',
          createdAt: Date.parse('2026-06-10T00:00:00Z'),
        })
        .run();
      const weightChange = store.getDetail('user-1', 'goal-1');
      expect(weightChange.trendPoints.map((point) => point.goalRevisionId)).toEqual([
        'revision-1',
        'revision-1',
        'revision-2',
      ]);
      expect(weightChange.trendPoints.map((point) => point.revisionSequence)).toEqual([1, 1, 2]);
      expect(weightChange.trendPoints[0]).toMatchObject({
        kind: 'weight_change',
        targetWeightKg: 75,
        percentComplete: 0,
      });
      expect(weightChange.trendPoints[2]).toMatchObject({
        kind: 'weight_change',
        targetWeightKg: 77,
      });

      db.insert(adaptiveNutritionPrograms)
        .values({
          id: 'program-2',
          userId: 'user-2',
          timeZone: 'America/Detroit',
          rmrEquation: 'manual_tdee',
          manualBaselineTdeeKcal: 2000,
          baselineTdeeKcal: 2000,
          goalType: 'maintain',
          targetWeightKg: null,
          goalRatePctPerWeek: 0,
          proteinGrams: 140,
          fatAllocationPct: 30,
          systemCalorieFloorKcal: 1200,
          userCalorieFloorKcal: 1200,
          algorithmVersion: 'adaptive-tdee-v1',
        })
        .run();
      db.insert(bodyWeight)
        .values([
          {
            id: 'weight-maintain-1',
            userId: 'user-2',
            date: '2026-06-01',
            weight: 60 / 0.45359237,
            weightKg: 60,
            unitAtEntry: 'kg',
          },
          {
            id: 'weight-maintain-2',
            userId: 'user-2',
            date: '2026-06-08',
            weight: 60.67 / 0.45359237,
            weightKg: 60.67,
            unitAtEntry: 'kg',
          },
        ])
        .run();
      db.insert(adaptiveNutritionGoals)
        .values({
          id: 'goal-2',
          userId: 'user-2',
          programId: 'program-2',
          type: 'maintain',
          status: 'active',
          startTrendWeightKg: 60,
          startScaleWeightKg: 60,
          finalTrendWeightKg: null,
          targetWeightKg: null,
          maintenanceCenterKg: 60,
          goalRatePctPerWeek: 0,
          startedLocalDate: '2026-06-01',
        })
        .run();
      db.insert(adaptiveNutritionGoalRevisions)
        .values({
          id: 'maintenance-revision-1',
          goalId: 'goal-2',
          userId: 'user-2',
          sequence: 1,
          targetWeightKg: null,
          maintenanceCenterKg: 60,
          goalRatePctPerWeek: 0,
          previousTargetWeightKg: null,
          previousCenterKg: 60,
          previousRatePctPerWeek: 0,
          reason: 'created',
          effectiveLocalDate: '2026-06-01',
        })
        .run();
      const maintenance = store.getDetail('user-2', 'goal-2');
      expect(maintenance.trendPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'maintenance',
            rangeRadiusKg: 0.68,
            rangeLowerKg: 59.32,
            rangeUpperKg: 60.68,
          }),
        ]),
      );
    } finally {
      sqlite.close();
    }
  });

  it('fails cross-user and missing current reads closed', () => {
    const { sqlite, store } = setup();
    try {
      expect(() => store.getDetail('user-2', 'goal-1')).toThrow(AdaptiveGoalNotFoundError);
      expect(() => store.getCurrent('user-2')).toThrow(AdaptiveGoalNotFoundError);
      expect(store.list('user-2', {})).toEqual({
        data: [],
        meta: { page: 1, limit: 20, total: 0 },
      });
    } finally {
      sqlite.close();
    }
  });
});

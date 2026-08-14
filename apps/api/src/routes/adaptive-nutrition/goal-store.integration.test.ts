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
  return { sqlite, store: createAdaptiveGoalReadStore({ db }) };
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
            finalTrendWeightKg: 80,
            netChangeKg: -2,
          },
        ],
        meta: { page: 1, limit: 20, total: 1 },
      });
      expect(store.getDetail('user-1', 'goal-1')).toMatchObject({
        revisions: [{ id: 'revision-1' }],
        acceptedCheckIns: [{ id: 'check-in-1', goalId: 'goal-1' }],
      });
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

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { convertWeightToKg, trendWeightAnalyticsSchema } from '@pulse/shared';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  adaptiveNutritionGoalRevisions,
  adaptiveNutritionGoals,
  adaptiveNutritionProgramRevisions,
  adaptiveNutritionPrograms,
  bodyWeight,
  users,
} from '../../db/schema/index.js';

const originalDatabaseUrl = process.env.DATABASE_URL;
const migrationsFolder = fileURLToPath(new URL('../../../drizzle', import.meta.url));

let tempDir = '';
let dbModule: typeof import('../../db/index.js');

const addDays = (date: string, days: number) => {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
};

const seedWeight = (
  userId: string,
  date: string,
  weightLbs: number,
  overrides: { createdAt?: number; updatedAt?: number } = {},
) => {
  const createdAt = overrides.createdAt ?? Date.parse(`${date}T12:00:00.000Z`);
  dbModule.db
    .insert(bodyWeight)
    .values({
      id: `${userId}-${date}`,
      userId,
      date,
      weight: weightLbs,
      weightKg: convertWeightToKg(weightLbs, 'lbs'),
      unitAtEntry: 'lbs',
      createdAt,
      updatedAt: overrides.updatedAt ?? createdAt,
    })
    .run();
};

describe('Trend Weight analytics store', () => {
  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'pulse-trend-weight-'));
    process.env.DATABASE_URL = join(tempDir, 'trend-weight.db');
    vi.resetModules();
    dbModule = await import('../../db/index.js');
    migrate(dbModule.db, { migrationsFolder });
    dbModule.db
      .insert(users)
      .values([
        {
          id: 'user-1',
          username: 'trend-user-1',
          passwordHash: 'hash',
          weightUnit: 'lbs',
          preferences: { timeZone: 'America/Detroit' },
        },
        {
          id: 'user-2',
          username: 'trend-user-2',
          passwordHash: 'hash',
          weightUnit: 'kg',
        },
      ])
      .run();
  });

  afterEach(() => {
    dbModule.sqlite.close();
    process.env.DATABASE_URL = originalDatabaseUrl;
    rmSync(tempDir, { recursive: true, force: true });
    vi.resetModules();
  });

  const getStore = async () => {
    const { createTrendWeightStore } = await import('./trend-store.js');
    return createTrendWeightStore({
      db: dbModule.db,
      now: () => new Date('2026-08-20T16:00:00.000Z'),
    });
  };

  const seedGoalHistory = () => {
    dbModule.db
      .insert(adaptiveNutritionPrograms)
      .values({
        id: 'program-1',
        userId: 'user-1',
        timeZone: 'America/Detroit',
        rmrEquation: 'manual_tdee',
        manualBaselineTdeeKcal: 2500,
        baselineTdeeKcal: 2500,
        goalType: 'gain',
        targetWeightKg: 90,
        goalRatePctPerWeek: 0.25,
        proteinGrams: 180,
        fatAllocationPct: 30,
        systemCalorieFloorKcal: 1500,
        userCalorieFloorKcal: 1500,
        algorithmVersion: 'adaptive-tdee-v1',
        createdAt: Date.parse('2026-06-21T12:00:00.000Z'),
        updatedAt: Date.parse('2026-08-11T12:00:00.000Z'),
      })
      .run();
    dbModule.db
      .insert(adaptiveNutritionProgramRevisions)
      .values({
        id: 'program-revision-1',
        programId: 'program-1',
        userId: 'user-1',
        sequence: 1,
        effectiveAt: Date.parse('2026-06-21T12:00:00.000Z'),
        snapshot: {
          status: 'active',
          timeZone: 'America/Detroit',
          rmrEquation: 'manual_tdee',
          heightCm: null,
          birthDate: null,
          activityLevel: null,
          activityMultiplier: null,
          estimatedRmrKcal: null,
          calculatedBaselineTdeeKcal: null,
          manualBaselineTdeeKcal: 2500,
          baselineTdeeKcal: 2500,
          goalType: 'gain',
          targetWeightKg: 90,
          goalRatePctPerWeek: 0.25,
          proteinGrams: 180,
          fatAllocationPct: 30,
          systemCalorieFloorKcal: 1500,
          userCalorieFloorKcal: 1500,
          algorithmVersion: 'adaptive-tdee-v1',
        },
        source: 'program_created',
        createdAt: Date.parse('2026-06-21T12:00:00.000Z'),
      })
      .run();
    dbModule.db
      .insert(adaptiveNutritionGoals)
      .values({
        id: 'goal-loss',
        userId: 'user-1',
        programId: 'program-1',
        type: 'lose',
        status: 'active',
        startTrendWeightKg: 82,
        startScaleWeightKg: 82,
        finalTrendWeightKg: null,
        targetWeightKg: 75,
        maintenanceCenterKg: null,
        goalRatePctPerWeek: -0.5,
        startedLocalDate: '2026-06-21',
        endedLocalDate: null,
        endedReason: null,
      })
      .run();
    dbModule.db
      .insert(adaptiveNutritionGoalRevisions)
      .values({
        id: 'loss-revision-1',
        goalId: 'goal-loss',
        userId: 'user-1',
        sequence: 1,
        targetWeightKg: 75,
        maintenanceCenterKg: null,
        goalRatePctPerWeek: -0.5,
        previousTargetWeightKg: 75,
        previousCenterKg: null,
        previousRatePctPerWeek: -0.5,
        reason: 'created',
        effectiveLocalDate: '2026-06-21',
      })
      .run();
    dbModule.db
      .update(adaptiveNutritionGoals)
      .set({
        status: 'completed',
        finalTrendWeightKg: 80.8,
        endedLocalDate: '2026-07-20',
        endedReason: 'completed',
      })
      .where(eq(adaptiveNutritionGoals.id, 'goal-loss'))
      .run();

    dbModule.db
      .insert(adaptiveNutritionGoals)
      .values({
        id: 'goal-maintain',
        userId: 'user-1',
        programId: 'program-1',
        type: 'maintain',
        status: 'active',
        startTrendWeightKg: 80.8,
        startScaleWeightKg: 80.8,
        finalTrendWeightKg: null,
        targetWeightKg: null,
        maintenanceCenterKg: 70,
        goalRatePctPerWeek: 0,
        startedLocalDate: '2026-07-21',
        endedLocalDate: null,
        endedReason: null,
      })
      .run();
    dbModule.db
      .insert(adaptiveNutritionGoalRevisions)
      .values({
        id: 'maintain-revision-1',
        goalId: 'goal-maintain',
        userId: 'user-1',
        sequence: 1,
        targetWeightKg: null,
        maintenanceCenterKg: 70,
        goalRatePctPerWeek: 0,
        previousTargetWeightKg: null,
        previousCenterKg: 70,
        previousRatePctPerWeek: 0,
        reason: 'created',
        effectiveLocalDate: '2026-07-21',
      })
      .run();
    dbModule.db
      .update(adaptiveNutritionGoals)
      .set({
        status: 'replaced',
        finalTrendWeightKg: 80.5,
        endedLocalDate: '2026-08-10',
        endedReason: 'direction_changed',
      })
      .where(eq(adaptiveNutritionGoals.id, 'goal-maintain'))
      .run();

    dbModule.db
      .insert(adaptiveNutritionGoals)
      .values({
        id: 'goal-gain',
        userId: 'user-1',
        programId: 'program-1',
        type: 'gain',
        status: 'active',
        startTrendWeightKg: 80.5,
        startScaleWeightKg: 80.5,
        finalTrendWeightKg: null,
        targetWeightKg: 90,
        maintenanceCenterKg: null,
        goalRatePctPerWeek: 0.25,
        startedLocalDate: '2026-08-11',
        endedLocalDate: null,
        endedReason: null,
      })
      .run();
    dbModule.db
      .insert(adaptiveNutritionGoalRevisions)
      .values([
        {
          id: 'gain-revision-1',
          goalId: 'goal-gain',
          userId: 'user-1',
          sequence: 1,
          targetWeightKg: 90,
          maintenanceCenterKg: null,
          goalRatePctPerWeek: 0.25,
          previousTargetWeightKg: 90,
          previousCenterKg: null,
          previousRatePctPerWeek: 0.25,
          reason: 'created',
          effectiveLocalDate: '2026-08-11',
        },
        {
          id: 'gain-revision-2',
          goalId: 'goal-gain',
          userId: 'user-1',
          sequence: 2,
          targetWeightKg: 91,
          maintenanceCenterKg: null,
          goalRatePctPerWeek: 0.3,
          previousTargetWeightKg: 90,
          previousCenterKg: null,
          previousRatePctPerWeek: 0.25,
          reason: 'user_edit',
          effectiveLocalDate: '2026-08-15',
        },
      ])
      .run();
  };

  it('returns one range-invariant canonical series with a visible raw spike', async () => {
    const start = '2026-04-01';
    for (let index = 0; index < 141; index += 1) {
      const date = addDays(start, index);
      seedWeight('user-1', date, index === 140 ? 200 : 180 - index * 0.02);
    }
    seedWeight('user-2', '2026-08-19', 300);
    const store = await getStore();

    const oneMonth = store.getAnalytics('user-1', { range: '1m', end: '2026-08-19' });
    const all = store.getAnalytics('user-1', { range: 'all', end: '2026-08-19' });
    const allByDate = new Map(all.points.map((point) => [point.date, point]));

    expect(trendWeightAnalyticsSchema.parse(oneMonth)).toEqual(oneMonth);
    expect(oneMonth.current.latestScale?.weight).toBe(200);
    expect(oneMonth.current.trendWeight).toBeLessThan(185);
    expect(oneMonth.current.state).toBe('sufficient');
    for (const point of oneMonth.points) {
      expect(point.trendWeight).toBe(allByDate.get(point.date)?.trendWeight);
    }
    expect(oneMonth.points).toHaveLength(30);
  });

  it('keeps an explicit historical end deterministic and excludes future rows', async () => {
    seedWeight('user-1', '2025-01-01', 220);
    seedWeight('user-1', '2026-08-01', 180);
    seedWeight('user-1', '2026-08-10', 179);
    seedWeight('user-1', '2026-08-20', 250);
    seedGoalHistory();
    const store = await getStore();

    const first = store.getAnalytics('user-1', { range: '1m', end: '2026-08-10' });
    seedWeight('user-1', '2026-08-19', 240);
    dbModule.db
      .update(bodyWeight)
      .set({
        weight: 300,
        weightKg: convertWeightToKg(300, 'lbs'),
        updatedAt: Date.parse('2026-08-20T15:00:00.000Z'),
      })
      .where(eq(bodyWeight.id, 'user-1-2025-01-01'))
      .run();
    dbModule.db
      .insert(adaptiveNutritionGoals)
      .values({
        id: 'irrelevant-future-goal',
        userId: 'user-1',
        programId: 'program-1',
        type: 'gain',
        status: 'cancelled',
        startTrendWeightKg: 80,
        startScaleWeightKg: 80,
        finalTrendWeightKg: 80,
        targetWeightKg: 95,
        maintenanceCenterKg: null,
        goalRatePctPerWeek: 0.2,
        startedLocalDate: '2027-01-01',
        endedLocalDate: '2027-01-02',
        endedReason: 'cancelled',
      })
      .run();
    const second = store.getAnalytics('user-1', { range: '1m', end: '2026-08-10' });

    expect(second).toEqual(first);
    expect(second.isHistorical).toBe(true);
    expect(second.range.endDate).toBe('2026-08-10');
    expect(second.timeZone).toBe('America/Detroit');
  });

  it('recomputes edits and deletions without fabricating correction provenance', async () => {
    seedWeight('user-1', '2026-08-01', 180);
    seedWeight('user-1', '2026-08-10', 179);
    seedWeight('user-1', '2026-08-19', 178);
    const store = await getStore();
    const original = store.getAnalytics('user-1', { range: '1m', end: '2026-08-19' });

    dbModule.db
      .update(bodyWeight)
      .set({
        weight: 170,
        weightKg: convertWeightToKg(170, 'lbs'),
        updatedAt: Date.parse('2026-08-20T12:00:00.000Z'),
      })
      .where(eq(bodyWeight.id, 'user-1-2026-08-19'))
      .run();
    const corrected = store.getAnalytics('user-1', { range: '1m', end: '2026-08-19' });

    expect(corrected.current.trendWeight).not.toBe(original.current.trendWeight);
    expect(corrected.markers.filter((marker) => marker.kind === 'correction')).toEqual([]);
    expect(corrected.points.at(-1)).toMatchObject({ corrected: false, annotation: null });

    dbModule.db.delete(bodyWeight).where(eq(bodyWeight.id, 'user-1-2026-08-19')).run();
    const deleted = store.getAnalytics('user-1', { range: '1m', end: '2026-08-19' });
    expect(deleted.points.map((point) => point.date)).not.toContain('2026-08-19');
    expect(deleted.current.latestScale?.date).toBe('2026-08-10');
  });

  it('keeps a notes-only edit out of Trend Weight correction markers', async () => {
    seedWeight('user-1', '2026-08-10', 179);
    seedWeight('user-1', '2026-08-19', 178);
    const store = await getStore();
    const before = store.getAnalytics('user-1', { range: '1m', end: '2026-08-19' });
    dbModule.db
      .update(bodyWeight)
      .set({ notes: 'Clarified note only.', updatedAt: Date.parse('2026-08-20T12:00:00.000Z') })
      .where(eq(bodyWeight.id, 'user-1-2026-08-19'))
      .run();
    const after = store.getAnalytics('user-1', { range: '1m', end: '2026-08-19' });
    expect(after.current.trendWeight).toBe(before.current.trendWeight);
    expect(after.markers.filter((marker) => marker.kind === 'correction')).toEqual([]);
    expect(after.points.at(-1)).toMatchObject({ corrected: false, annotation: null });
  });

  it('returns explicit no-data and scale-only states without trend precision', async () => {
    const store = await getStore();
    const empty = store.getAnalytics('user-1', { range: '1m', end: '2026-08-19' });
    seedWeight('user-1', '2026-08-19', 180);
    const one = store.getAnalytics('user-1', { range: '1m', end: '2026-08-19' });

    expect(empty.current).toMatchObject({ state: 'no_data', trendWeight: null });
    expect(one.current).toMatchObject({ state: 'scale_only', trendWeight: null });
    expect(one.deltas.every((delta) => delta.status === 'unavailable')).toBe(true);
  });

  it('keeps expired stale evidence honest and permits older display points around scale-only current data', async () => {
    seedWeight('user-1', '2026-07-01', 181);
    seedWeight('user-1', '2026-08-19', 180);
    const store = await getStore();
    const scaleOnly = store.getAnalytics('user-1', { range: '3m', end: '2026-08-19' });

    expect(scaleOnly.current).toMatchObject({
      state: 'scale_only',
      trendWeight: null,
      evidence: { observationCount: 1, latestAgeDays: 0 },
    });
    expect(scaleOnly.points).toHaveLength(2);

    for (const age of [8, 29]) {
      dbModule.db.delete(bodyWeight).where(eq(bodyWeight.userId, 'user-1')).run();
      seedWeight('user-1', addDays('2026-08-19', -age), 181);
      const oneStale = store.getAnalytics('user-1', { range: '1m', end: '2026-08-19' });
      expect(oneStale.current).toMatchObject({
        state: 'stale',
        trendWeight: null,
        evidence: { observationCount: 1, spanDays: 0, latestAgeDays: age },
      });
    }

    dbModule.db.delete(bodyWeight).where(eq(bodyWeight.userId, 'user-1')).run();
    seedWeight('user-1', '2026-07-01', 181);
    seedWeight('user-1', '2026-07-02', 180.5);
    const expired = store.getAnalytics('user-1', { range: '1m', end: '2026-08-19' });

    expect(expired.current).toMatchObject({
      state: 'stale',
      trendWeight: null,
      trendDate: null,
      scaleTrendDifference: null,
      ratePerWeek: null,
      evidence: { observationCount: 0, spanDays: 0, latestAgeDays: 48 },
    });
    expect(expired.points).toEqual([]);
    expect(expired.deltas.every((delta) => delta.reasonCode === 'STALE_CURRENT_TREND')).toBe(true);
  });

  it('resolves historical loss, maintenance, and gain goals with distinct pace and position', async () => {
    for (let index = 0; index < 60; index += 1) {
      const date = addDays('2026-06-21', index);
      if (date !== '2026-08-15') seedWeight('user-1', date, 180);
    }
    seedGoalHistory();
    for (let index = 0; index < 14; index += 1) {
      const date = addDays('2026-07-23', index);
      const weight = 175 + index * 0.8;
      dbModule.db
        .update(bodyWeight)
        .set({ weight, weightKg: convertWeightToKg(weight, 'lbs') })
        .where(eq(bodyWeight.id, `user-1-${date}`))
        .run();
    }
    const store = await getStore();

    const loss = store.getAnalytics('user-1', { range: 'all', end: '2026-07-10' });
    const maintenance = store.getAnalytics('user-1', { range: 'all', end: '2026-08-05' });
    const gain = store.getAnalytics('user-1', { range: 'all', end: '2026-08-19' });

    expect(loss.goal).toMatchObject({
      id: 'goal-loss',
      type: 'lose',
      maintenanceBandState: 'not_applicable',
    });
    expect(loss.goal?.targetWeight).toBeCloseTo(75 / 0.45359237);
    expect(loss.goal?.desiredRatePerWeek).toBeLessThan(0);
    expect(maintenance.goal).toMatchObject({
      id: 'goal-maintain',
      type: 'maintain',
      desiredRatePerWeek: 0,
      paceState: 'outside_goal_band',
      maintenanceBandState: 'outside_maintenance_band',
    });
    expect(maintenance.goal?.explanation).toBe(
      'Recent pace is outside the stable range and Trend Weight is outside the maintenance band.',
    );
    expect(gain.goal).toMatchObject({
      id: 'goal-gain',
      type: 'gain',
      maintenanceBandState: 'not_applicable',
    });
    expect(gain.goal?.desiredRatePerWeek).toBeGreaterThan(0);
    expect(gain.markers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ date: '2026-08-15', kind: 'goal_revised' }),
        expect.objectContaining({ date: '2026-07-21', kind: 'goal_started' }),
        expect.objectContaining({ date: '2026-08-11', kind: 'goal_started' }),
      ]),
    );
    expect(gain.points.map((point) => point.date)).not.toContain('2026-08-15');
    expect(store.getAnalytics('user-1', { range: '1m', end: '2026-07-20' }).goal).toBeNull();
    expect(store.getAnalytics('user-1', { range: '1m', end: '2026-07-21' }).goal?.id).toBe(
      'goal-maintain',
    );
    expect(store.getAnalytics('user-1', { range: '1m', end: '2026-08-10' }).goal).toBeNull();
    expect(store.getAnalytics('user-1', { range: '1m', end: '2026-08-11' }).goal?.id).toBe(
      'goal-gain',
    );
  });

  it('uses the server-resolved IANA zone across Detroit midnight and DST', async () => {
    const { createTrendWeightStore } = await import('./trend-store.js');
    const beforeMidnight = createTrendWeightStore({
      db: dbModule.db,
      now: () => new Date('2026-08-20T03:59:59.000Z'),
    }).getAnalytics('user-1', { range: '1m' });
    const afterMidnight = createTrendWeightStore({
      db: dbModule.db,
      now: () => new Date('2026-08-20T04:00:01.000Z'),
    }).getAnalytics('user-1', { range: '1m' });
    const springBefore = createTrendWeightStore({
      db: dbModule.db,
      now: () => new Date('2026-03-08T06:59:59.000Z'),
    }).getAnalytics('user-1', { range: '1m' });
    const springAfter = createTrendWeightStore({
      db: dbModule.db,
      now: () => new Date('2026-03-08T07:00:01.000Z'),
    }).getAnalytics('user-1', { range: '1m' });
    const fallBefore = createTrendWeightStore({
      db: dbModule.db,
      now: () => new Date('2026-11-01T05:59:59.000Z'),
    }).getAnalytics('user-1', { range: '1m' });
    const fallAfter = createTrendWeightStore({
      db: dbModule.db,
      now: () => new Date('2026-11-01T06:00:01.000Z'),
    }).getAnalytics('user-1', { range: '1m' });

    expect(beforeMidnight.range).toMatchObject({ startDate: '2026-07-21', endDate: '2026-08-19' });
    expect(afterMidnight.range).toMatchObject({ startDate: '2026-07-22', endDate: '2026-08-20' });
    expect(beforeMidnight.isHistorical).toBe(false);
    expect(afterMidnight.isHistorical).toBe(false);
    expect(springBefore.range).toMatchObject({ startDate: '2026-02-07', endDate: '2026-03-08' });
    expect(springAfter.range).toEqual(springBefore.range);
    expect(fallBefore.range).toMatchObject({ startDate: '2026-10-03', endDate: '2026-11-01' });
    expect(fallAfter.range).toEqual(fallBefore.range);

    seedGoalHistory();
    expect(() =>
      createTrendWeightStore({
        db: dbModule.db,
        now: () => new Date('2026-08-20T04:30:00.000Z'),
      }).getAnalytics('user-1', { range: '1m', timeZone: 'America/Los_Angeles' }),
    ).toThrow('conflicts with the server-resolved authority');

    const detroitDashboard = createTrendWeightStore({
      db: dbModule.db,
      now: () => new Date('2026-08-20T04:30:00.000Z'),
    }).getAnalytics('user-1', {
      range: '1m',
      end: '2026-08-20',
    });
    expect(detroitDashboard.timeZone).toBe('America/Detroit');
    expect(detroitDashboard.isHistorical).toBe(false);
  });
});

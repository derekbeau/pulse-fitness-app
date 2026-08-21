import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { AdaptiveProgramMutation } from '@pulse/shared';

import * as schema from '../../db/schema/index.js';
import {
  adaptiveNutritionGoalRevisions,
  adaptiveNutritionGoals,
  bodyWeight,
  mealItems,
  meals,
  nutritionLogs,
  nutritionTargets,
  users,
} from '../../db/schema/index.js';
import { createAdaptiveNutritionStore } from './store.js';
import { createAdaptiveAnalyticsStore } from './analytics-store.js';

type TestDatabase = ReturnType<typeof drizzle<typeof schema>>;

let tempDir = '';
let sqlite: Database.Database;
let db: TestDatabase;
let nowMs = Date.parse('2026-08-18T16:00:00.000Z');

const migrationsFolder = fileURLToPath(new URL('../../../drizzle', import.meta.url));
const poundsFromKg = (weightKg: number) => weightKg / 0.45359237;
const datePlus = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const programInput = (): AdaptiveProgramMutation => ({
  status: 'active',
  timeZone: 'America/Detroit',
  heightCm: null,
  birthDate: null,
  rmrEquation: 'manual_tdee',
  activityLevel: null,
  manualBaselineTdeeKcal: 2760,
  goalType: 'maintain',
  targetWeightKg: null,
  goalRatePctPerWeek: 0,
  proteinGrams: 180,
  fatAllocationPct: 30,
  currentWeight: { weight: 80, unit: 'kg' },
  rebaseline: false,
  supersedePending: false,
});

const seedWeight = (userId: string, date: string, weightKg: number) =>
  db
    .insert(bodyWeight)
    .values({
      id: `${userId}-weight-${date}`,
      userId,
      date,
      weight: poundsFromKg(weightKg),
      weightKg,
      unitAtEntry: 'kg',
      updatedAt: nowMs,
    })
    .onConflictDoUpdate({
      target: [bodyWeight.userId, bodyWeight.date],
      set: { weight: poundsFromKg(weightKg), weightKg, updatedAt: nowMs },
    })
    .run();

const seedNutrition = (
  userId: string,
  date: string,
  status: 'complete' | 'partial' | 'unknown',
  calories: number,
) => {
  const logId = `${userId}-log-${date}`;
  const mealId = `${userId}-meal-${date}`;
  db.insert(nutritionLogs)
    .values({ id: logId, userId, date, status, updatedAt: nowMs })
    .onConflictDoUpdate({
      target: [nutritionLogs.userId, nutritionLogs.date],
      set: { status, updatedAt: nowMs },
    })
    .run();
  db.insert(meals).values({ id: mealId, nutritionLogId: logId, name: 'Daily total' }).run();
  db.insert(mealItems)
    .values({
      id: `${userId}-item-${date}`,
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

const acceptBaseline = (userId: string) => {
  nowMs = Date.parse('2026-08-01T16:00:00.000Z');
  const lifecycle = createAdaptiveNutritionStore({ db, sqlite, now: () => new Date(nowMs) });
  lifecycle.upsertProgram(userId, programInput());
  const pending = lifecycle.getState(userId).pendingCheckIn;
  if (!pending) throw new Error('Expected baseline recommendation');
  lifecycle.acceptCheckIn(userId, pending.id, { replaceSameDateTarget: false });
  nowMs = Date.parse('2026-08-18T16:00:00.000Z');
  return lifecycle;
};

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'pulse-energy-balance-'));
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
    DELETE FROM users;
  `);
  db.insert(users)
    .values([
      { id: 'user-1', username: 'energy-one', passwordHash: 'hash', weightUnit: 'lbs' },
      { id: 'user-2', username: 'energy-two', passwordHash: 'hash', weightUnit: 'kg' },
    ])
    .run();
  nowMs = Date.parse('2026-08-18T16:00:00.000Z');
});

describe('adaptive energy balance analytics store', () => {
  it('projects matched complete days with invariant target and expenditure signs', () => {
    acceptBaseline('user-1');
    db.insert(nutritionTargets)
      .values({
        id: 'target-2400',
        userId: 'user-1',
        calories: 2400,
        protein: 180,
        carbs: 210,
        fat: 80,
        effectiveDate: '2026-08-11',
      })
      .run();
    for (let offset = 0; offset < 7; offset += 1) {
      seedNutrition('user-1', datePlus('2026-08-11', offset), 'complete', 2520);
    }
    seedNutrition('user-1', '2026-08-18', 'partial', 900);
    seedWeight('user-1', '2026-07-20', 80.4);
    seedWeight('user-1', '2026-08-11', 80);
    seedWeight('user-1', '2026-08-17', 79.8);
    seedNutrition('user-2', '2026-08-17', 'complete', 7000);

    const analytics = createAdaptiveAnalyticsStore({ db, now: () => new Date(nowMs) }).getAnalytics(
      'user-1',
      { range: '1w', aggregation: 'daily' },
    );

    expect(analytics.range).toMatchObject({ startDate: '2026-08-12', endDate: '2026-08-18' });
    expect(analytics.summary.averageIntakeKcal).toBe(2520);
    expect(analytics.summary.averageIntakeMinusTargetKcal).toBe(120);
    expect(analytics.summary.averageIntakeMinusExpenditureKcal).toBe(-240);
    expect(analytics.summary.completeNutritionDays).toBe(6);
    expect(analytics.summary.excludedNutritionDays).toBe(1);
    expect(analytics.points.at(-1)).toMatchObject({
      nutritionStatus: 'partial',
      loggedIntakeKcal: 900,
      intakeKcal: null,
      includedInBalance: false,
    });
    expect(JSON.stringify(analytics)).not.toContain('7000');
  });

  it('keeps pre-program expenditure empty and parses mixed weekly evidence', () => {
    seedNutrition('user-1', '2026-07-27', 'complete', 2400);
    acceptBaseline('user-1');
    seedNutrition('user-1', '2026-08-11', 'complete', 2520);

    const store = createAdaptiveAnalyticsStore({ db, now: () => new Date(nowMs) });
    const daily = store.getAnalytics('user-1', { range: 'all', aggregation: 'daily' });
    const analytics = store.getAnalytics('user-1', { range: 'all', aggregation: 'weekly' });

    expect(daily.points[0]).toMatchObject({
      periodStart: '2026-07-27',
      expenditureKcal: null,
    });
    expect(analytics.points).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nutritionStatus: 'mixed',
          includedInBalance: true,
          completeNutritionDays: 1,
          missingNutritionDays: 6,
        }),
      ]),
    );
  });

  it('starts expenditure at the deterministic baseline without inventing accepted provenance', () => {
    seedNutrition('user-1', '2026-07-27', 'complete', 2400);
    nowMs = Date.parse('2026-08-01T16:00:00.000Z');
    const lifecycle = createAdaptiveNutritionStore({ db, sqlite, now: () => new Date(nowMs) });
    lifecycle.upsertProgram('user-1', programInput());
    nowMs = Date.parse('2026-08-18T16:00:00.000Z');

    const analytics = createAdaptiveAnalyticsStore({ db, now: () => new Date(nowMs) }).getAnalytics(
      'user-1',
      { range: 'all', aggregation: 'daily' },
    );
    const preProgram = analytics.points.find((point) => point.periodStart === '2026-07-27');
    const programStart = analytics.points.find((point) => point.periodStart === '2026-08-01');

    expect(preProgram).toMatchObject({ expenditureKcal: null });
    expect(programStart).toMatchObject({
      expenditureKcal: 2760,
      expenditureSourceCheckInId: null,
      expenditureSourceInputFingerprint: null,
    });
    expect(analytics.current).toMatchObject({
      adaptiveTdeeKcal: 2760,
      expenditureSourceCheckInId: null,
      expenditureSourceInputFingerprint: null,
    });
    expect(analytics.summary.averageExpenditureKcal).toBe(2760);
    expect(analytics.summary.reasonCodes).not.toContain('NO_EXPENDITURE_DATA');
  });

  it('changes baseline expenditure only for accepted recommendations on their effective date', () => {
    nowMs = Date.parse('2026-08-01T16:00:00.000Z');
    const lifecycle = createAdaptiveNutritionStore({ db, sqlite, now: () => new Date(nowMs) });
    lifecycle.upsertProgram('user-1', programInput());
    const pendingBaseline = lifecycle.getState('user-1').pendingCheckIn;
    if (!pendingBaseline?.proposedTargets) throw new Error('Expected a baseline recommendation');
    lifecycle.declineCheckIn('user-1', pendingBaseline.id);

    const baseRow = db
      .select()
      .from(schema.adaptiveNutritionCheckIns)
      .where(eq(schema.adaptiveNutritionCheckIns.id, pendingBaseline.id))
      .get();
    if (!baseRow) throw new Error('Expected declined baseline row');
    const event = (
      id: string,
      status: 'pending' | 'accepted' | 'declined' | 'superseded' | 'held',
      localDate: string,
      proposedTdeeKcal: number,
      effectiveDate: string,
      fingerprintCharacter: string,
    ) =>
      db
        .insert(schema.adaptiveNutritionCheckIns)
        .values({
          ...baseRow,
          id,
          status,
          kind: 'manual',
          calculationState: status === 'held' ? 'holding' : 'updating',
          localDate,
          dataFingerprint: fingerprintCharacter.repeat(64),
          proposedTdeeKcal,
          proposedTargets: { ...pendingBaseline.proposedTargets, effectiveDate },
          acceptedNutritionTargetId: null,
          resolvedAt: status === 'pending' ? null : nowMs,
          createdAt: nowMs + id.length,
        })
        .run();

    event('accepted-update', 'accepted', '2026-08-10', 2600, '2026-08-11', 'b');
    event('held-update', 'held', '2026-08-12', 5000, '2026-08-12', 'c');
    event('declined-update', 'declined', '2026-08-13', 5100, '2026-08-13', 'd');
    event('superseded-update', 'superseded', '2026-08-14', 5200, '2026-08-14', 'e');
    event('pending-update', 'pending', '2026-08-15', 5300, '2026-08-15', 'f');
    event('future-accepted-update', 'accepted', '2026-08-16', 5400, '2026-08-19', '1');
    nowMs = Date.parse('2026-08-18T16:00:00.000Z');

    const analytics = createAdaptiveAnalyticsStore({ db, now: () => new Date(nowMs) }).getAnalytics(
      'user-1',
      { range: '1m', aggregation: 'daily' },
    );
    expect(analytics.points.find((point) => point.periodStart === '2026-08-10')).toMatchObject({
      expenditureKcal: 2760,
      expenditureSourceCheckInId: null,
    });
    expect(analytics.points.find((point) => point.periodStart === '2026-08-11')).toMatchObject({
      expenditureKcal: 2600,
      expenditureSourceCheckInId: 'accepted-update',
      expenditureSourceInputFingerprint: 'b'.repeat(64),
    });
    expect(analytics.points.at(-1)).toMatchObject({
      expenditureKcal: 2600,
      expenditureSourceCheckInId: 'accepted-update',
    });
    expect(analytics.current.adaptiveTdeeKcal).toBe(2600);
  });

  it('keeps historical configuration and cutoff boundaries stable after later program edits', () => {
    acceptBaseline('user-1');
    seedNutrition('user-1', '2026-08-10', 'complete', 2520);
    seedWeight('user-1', '2026-08-10', 79.9);
    const historicalStore = createAdaptiveAnalyticsStore({ db, now: () => new Date(nowMs) });
    const before = historicalStore.getAnalytics('user-1', {
      range: '1m',
      end: '2026-08-10',
      aggregation: 'daily',
    });

    nowMs = Date.parse('2026-08-20T16:00:00.000Z');
    const lifecycle = createAdaptiveNutritionStore({ db, sqlite, now: () => new Date(nowMs) });
    lifecycle.upsertProgram('user-1', {
      ...programInput(),
      status: 'paused',
      timeZone: 'America/Los_Angeles',
      manualBaselineTdeeKcal: 3200,
      currentWeight: { weight: 79.8, unit: 'kg' },
      rebaseline: true,
      supersedePending: true,
    });
    nowMs = Date.parse('2026-08-21T16:00:00.000Z');
    lifecycle.upsertProgram('user-1', {
      ...programInput(),
      status: 'active',
      timeZone: 'Asia/Tokyo',
      manualBaselineTdeeKcal: 3200,
      currentWeight: { weight: 79.7, unit: 'kg' },
      supersedePending: true,
    });

    const after = createAdaptiveAnalyticsStore({ db, now: () => new Date(nowMs) }).getAnalytics(
      'user-1',
      { range: '1m', end: '2026-08-10', aggregation: 'daily' },
    );
    expect(after).toEqual(before);
    expect(after.timeZone).toBe('America/Detroit');
    expect(after.current.readiness.timeZone).toBe('America/Detroit');
    expect(after.points.at(-1)).toMatchObject({ nutritionStatus: 'complete', intakeKcal: 2520 });

    const current = createAdaptiveAnalyticsStore({ db, now: () => new Date(nowMs) }).getAnalytics(
      'user-1',
      { range: '1m', aggregation: 'daily' },
    );
    expect(current.timeZone).toBe('Asia/Tokyo');
    expect(current.current.adaptiveTdeeKcal).toBe(2760);
  });

  it('keeps current-day cutoff classification tied to the end-effective timezone', () => {
    nowMs = Date.parse('2026-08-18T03:30:00.000Z');
    const lifecycle = createAdaptiveNutritionStore({ db, sqlite, now: () => new Date(nowMs) });
    lifecycle.upsertProgram('user-1', programInput());
    const pending = lifecycle.getState('user-1').pendingCheckIn;
    if (!pending) throw new Error('Expected baseline recommendation');
    lifecycle.acceptCheckIn('user-1', pending.id, { replaceSameDateTarget: false });
    seedNutrition('user-1', '2026-08-17', 'complete', 2520);

    const before = createAdaptiveAnalyticsStore({ db, now: () => new Date(nowMs) }).getAnalytics(
      'user-1',
      { range: '1w', aggregation: 'daily' },
    );
    expect(before.points.at(-1)).toMatchObject({
      periodStart: '2026-08-17',
      nutritionStatus: 'excluded',
      reasonCodes: ['COMPLETE_NUTRITION_PENDING_COMPLETED_DAY_CUTOFF'],
    });

    lifecycle.upsertProgram('user-1', {
      ...programInput(),
      timeZone: 'Asia/Tokyo',
      currentWeight: null,
    });
    const after = createAdaptiveAnalyticsStore({ db, now: () => new Date(nowMs) }).getAnalytics(
      'user-1',
      { range: '1w', end: '2026-08-17', aggregation: 'daily' },
    );

    expect(after).toEqual(before);
    expect(after.timeZone).toBe('America/Detroit');
    expect(after.current.readiness.analysisEndDate).toBe(before.current.readiness.analysisEndDate);
  });

  it('keeps a Tokyo historical date byte-stable after an adversarial westward edit', () => {
    nowMs = Date.parse('2026-08-10T12:00:00.000Z');
    const lifecycle = createAdaptiveNutritionStore({ db, sqlite, now: () => new Date(nowMs) });
    lifecycle.upsertProgram('user-1', {
      ...programInput(),
      timeZone: 'Asia/Tokyo',
    });
    const pending = lifecycle.getState('user-1').pendingCheckIn;
    if (!pending) throw new Error('Expected baseline recommendation');
    lifecycle.acceptCheckIn('user-1', pending.id, { replaceSameDateTarget: false });

    nowMs = Date.parse('2026-08-18T00:59:00.000Z');
    const before = createAdaptiveAnalyticsStore({ db, now: () => new Date(nowMs) }).getAnalytics(
      'user-1',
      { range: '1m', end: '2026-08-17', aggregation: 'daily' },
    );
    expect(before).toMatchObject({ timeZone: 'Asia/Tokyo', isHistorical: true });

    nowMs = Date.parse('2026-08-18T01:00:00.000Z');
    lifecycle.upsertProgram('user-1', {
      ...programInput(),
      status: 'paused',
      timeZone: 'America/Los_Angeles',
      currentWeight: null,
    });

    const after = createAdaptiveAnalyticsStore({ db, now: () => new Date(nowMs) }).getAnalytics(
      'user-1',
      { range: '1m', end: '2026-08-17', aggregation: 'daily' },
    );
    expect(after).toEqual(before);

    const current = createAdaptiveAnalyticsStore({ db, now: () => new Date(nowMs) }).getAnalytics(
      'user-1',
      { range: '1m', aggregation: 'daily' },
    );
    expect(current).toMatchObject({
      timeZone: 'America/Los_Angeles',
      isHistorical: false,
      range: { endDate: '2026-08-17' },
      current: { state: 'holding' },
    });
    expect(current.points.at(-1)).toMatchObject({
      state: 'holding',
      calculationReasonCodes: expect.arrayContaining(['PROGRAM_PAUSED']),
    });
  });

  it('keeps the live westward date empty when it precedes the causal program start', () => {
    nowMs = Date.parse('2026-08-18T00:30:00.000Z');
    const lifecycle = createAdaptiveNutritionStore({ db, sqlite, now: () => new Date(nowMs) });
    lifecycle.upsertProgram('user-1', {
      ...programInput(),
      timeZone: 'Asia/Tokyo',
    });
    const pending = lifecycle.getState('user-1').pendingCheckIn;
    if (!pending) throw new Error('Expected baseline recommendation');
    lifecycle.acceptCheckIn('user-1', pending.id, { replaceSameDateTarget: false });

    nowMs = Date.parse('2026-08-18T01:00:00.000Z');
    lifecycle.upsertProgram('user-1', {
      ...programInput(),
      timeZone: 'America/Los_Angeles',
    });
    const analytics = createAdaptiveAnalyticsStore({ db, now: () => new Date(nowMs) }).getAnalytics(
      'user-1',
      { range: 'all', aggregation: 'daily' },
    );

    expect(analytics).toMatchObject({
      timeZone: 'America/Los_Angeles',
      isHistorical: false,
      range: { endDate: '2026-08-17' },
      current: {
        adaptiveTdeeKcal: 2760,
        expenditureSourceCheckInId: null,
        expenditureSourceInputFingerprint: null,
      },
    });
    expect(analytics.points.at(-1)).toMatchObject({
      periodStart: '2026-08-17',
      expenditureKcal: null,
      expenditureSourceCheckInId: null,
      expenditureSourceInputFingerprint: null,
    });
  });

  it('keeps inverse and repeated cross-zone revisions on a nondecreasing causal date', () => {
    nowMs = Date.parse('2026-08-10T12:00:00.000Z');
    const lifecycle = createAdaptiveNutritionStore({ db, sqlite, now: () => new Date(nowMs) });
    lifecycle.upsertProgram('user-1', {
      ...programInput(),
      timeZone: 'America/Los_Angeles',
    });
    const pending = lifecycle.getState('user-1').pendingCheckIn;
    if (!pending) throw new Error('Expected baseline recommendation');
    lifecycle.acceptCheckIn('user-1', pending.id, { replaceSameDateTarget: false });

    nowMs = Date.parse('2026-08-18T00:59:00.000Z');
    const storeBefore = createAdaptiveAnalyticsStore({ db, now: () => new Date(nowMs) });
    const august16 = storeBefore.getAnalytics('user-1', {
      range: '1m',
      end: '2026-08-16',
      aggregation: 'daily',
    });
    const august17 = storeBefore.getAnalytics('user-1', {
      range: '1m',
      end: '2026-08-17',
      aggregation: 'daily',
    });

    nowMs = Date.parse('2026-08-18T01:00:00.000Z');
    lifecycle.upsertProgram('user-1', {
      ...programInput(),
      timeZone: 'Asia/Tokyo',
      currentWeight: null,
    });
    nowMs = Date.parse('2026-08-18T02:00:00.000Z');
    lifecycle.upsertProgram('user-1', {
      ...programInput(),
      timeZone: 'America/Los_Angeles',
      currentWeight: null,
    });
    nowMs = Date.parse('2026-08-18T03:00:00.000Z');
    lifecycle.upsertProgram('user-1', {
      ...programInput(),
      timeZone: 'Asia/Tokyo',
      currentWeight: null,
    });

    const after = createAdaptiveAnalyticsStore({ db, now: () => new Date(nowMs) });
    expect(
      after.getAnalytics('user-1', {
        range: '1m',
        end: '2026-08-16',
        aggregation: 'daily',
      }),
    ).toEqual(august16);
    expect(
      after.getAnalytics('user-1', {
        range: '1m',
        end: '2026-08-17',
        aggregation: 'daily',
      }),
    ).toEqual(august17);
    expect(after.getAnalytics('user-1', { range: '1m', aggregation: 'daily' })).toMatchObject({
      timeZone: 'Asia/Tokyo',
      isHistorical: false,
      range: { endDate: '2026-08-18' },
    });
  });

  it.each([
    {
      userId: 'user-1',
      createdAt: '2026-03-01T12:00:00.000Z',
      initialAt: '2026-03-08T06:59:59.000Z',
      updatedAt: '2026-03-08T07:00:00.000Z',
      historicalDate: '2026-03-07',
      expectedDate: '2026-03-08',
    },
    {
      userId: 'user-2',
      createdAt: '2026-10-25T12:00:00.000Z',
      initialAt: '2026-11-01T05:59:59.000Z',
      updatedAt: '2026-11-01T06:00:00.000Z',
      historicalDate: '2026-10-31',
      expectedDate: '2026-11-01',
    },
  ])(
    'resolves same-date revisions deterministically across DST boundaries for $userId',
    ({ userId, createdAt, initialAt, updatedAt, historicalDate, expectedDate }) => {
      nowMs = Date.parse(createdAt);
      const lifecycle = createAdaptiveNutritionStore({ db, sqlite, now: () => new Date(nowMs) });
      lifecycle.upsertProgram(userId, {
        ...programInput(),
        timeZone: 'America/New_York',
      });
      const pending = lifecycle.getState(userId).pendingCheckIn;
      if (!pending) throw new Error('Expected baseline recommendation');
      lifecycle.acceptCheckIn(userId, pending.id, { replaceSameDateTarget: false });

      nowMs = Date.parse(initialAt);
      const historicalBefore = createAdaptiveAnalyticsStore({
        db,
        now: () => new Date(nowMs),
      }).getAnalytics(userId, {
        range: '1w',
        end: historicalDate,
        aggregation: 'daily',
      });

      nowMs = Date.parse(updatedAt);
      lifecycle.upsertProgram(userId, {
        ...programInput(),
        status: 'paused',
        timeZone: 'America/New_York',
        currentWeight: null,
      });

      const store = createAdaptiveAnalyticsStore({ db, now: () => new Date(nowMs) });
      expect(
        store.getAnalytics(userId, {
          range: '1w',
          end: historicalDate,
          aggregation: 'daily',
        }),
      ).toEqual(historicalBefore);
      expect(
        store.getAnalytics(userId, {
          range: '1w',
          end: expectedDate,
          aggregation: 'daily',
        }),
      ).toMatchObject({
        timeZone: 'America/New_York',
        current: { state: 'holding' },
      });

      const analytics = store.getAnalytics(userId, { range: '1w', aggregation: 'daily' });
      expect(analytics).toMatchObject({
        timeZone: 'America/New_York',
        isHistorical: false,
        range: { endDate: expectedDate },
        current: { state: 'holding' },
      });
    },
  );

  it('keeps authoritative Trend Weight identical across ranges and aggregations', () => {
    acceptBaseline('user-1');
    for (let offset = 0; offset <= 78; offset += 3) {
      seedWeight(
        'user-1',
        datePlus('2026-06-01', offset),
        82 - offset * 0.018 + (offset % 9) * 0.025,
      );
    }
    const store = createAdaptiveAnalyticsStore({ db, now: () => new Date(nowMs) });
    const oneMonth = store.getAnalytics('user-1', { range: '1m', aggregation: 'daily' });
    const oneYear = store.getAnalytics('user-1', { range: '1y', aggregation: 'daily' });
    const all = store.getAnalytics('user-1', { range: 'all', aggregation: 'daily' });
    const oneYearByDate = new Map(oneYear.points.map((point) => [point.periodStart, point]));
    const allByDate = new Map(all.points.map((point) => [point.periodStart, point]));
    for (const point of oneMonth.points) {
      expect(point.trendWeightKg).toBe(oneYearByDate.get(point.periodStart)?.trendWeightKg);
      expect(point.trendWeightKg).toBe(allByDate.get(point.periodStart)?.trendWeightKg);
    }

    const weekly = store.getAnalytics('user-1', { range: '1m', aggregation: 'weekly' });
    for (const period of weekly.points) {
      const expected = oneMonth.points
        .filter(
          (point) => point.periodStart >= period.periodStart && point.periodEnd <= period.periodEnd,
        )
        .reverse()
        .find((point) => point.trendWeightKg !== null)?.trendWeightKg;
      expect(period.trendWeightKg).toBe(expected ?? null);
    }
    expect(weekly.summary).toEqual(oneMonth.summary);
  });

  it('shows current complete nutrition but excludes it until Detroit midnight', () => {
    acceptBaseline('user-1');
    seedNutrition('user-1', '2026-08-18', 'complete', 2520);
    const store = createAdaptiveAnalyticsStore({ db, now: () => new Date(nowMs) });

    const beforeMidnight = store.getAnalytics('user-1', { range: '1w', aggregation: 'daily' });
    expect(beforeMidnight.points.at(-1)).toMatchObject({
      sourceNutritionStatus: 'complete',
      nutritionStatus: 'excluded',
      loggedIntakeKcal: 2520,
      intakeKcal: null,
      reasonCodes: ['COMPLETE_NUTRITION_PENDING_COMPLETED_DAY_CUTOFF'],
    });

    nowMs = Date.parse('2026-08-19T04:01:00.000Z');
    const afterMidnight = createAdaptiveAnalyticsStore({
      db,
      now: () => new Date(nowMs),
    }).getAnalytics('user-1', { range: '1w', end: '2026-08-18', aggregation: 'daily' });
    expect(afterMidnight.points.at(-1)).toMatchObject({
      nutritionStatus: 'complete',
      intakeKcal: 2520,
      includedInBalance: true,
    });
  });

  it('keeps accepted history immutable while authoritative corrections get a new fingerprint', () => {
    const lifecycle = acceptBaseline('user-1');
    for (let offset = -14; offset <= -1; offset += 1) {
      seedNutrition('user-1', datePlus('2026-08-18', offset), 'complete', 2520);
    }
    seedWeight('user-1', '2026-08-03', 80.2);
    seedWeight('user-1', '2026-08-10', 80);
    seedWeight('user-1', '2026-08-17', 79.8);
    const update = lifecycle.previewCheckIn('user-1', { kind: 'manual', includeToday: false });
    expect(update.status).toBe('pending');
    const acceptedUpdate = lifecycle.acceptCheckIn('user-1', update.id, {
      replaceSameDateTarget: false,
    }).checkIn;

    const store = createAdaptiveAnalyticsStore({ db, now: () => new Date(nowMs) });
    const historicalBefore = store.getAnalytics('user-1', {
      range: '1w',
      end: '2026-08-17',
      aggregation: 'daily',
    });
    const acceptedBefore = db
      .select()
      .from(schema.adaptiveNutritionCheckIns)
      .where(eq(schema.adaptiveNutritionCheckIns.id, acceptedUpdate.id))
      .get();
    expect(acceptedBefore).toBeDefined();
    if (!acceptedBefore) throw new Error('Expected the accepted check-in to be persisted');
    db.update(mealItems)
      .set({ calories: 3000 })
      .where(eq(mealItems.id, 'user-1-item-2026-08-17'))
      .run();
    seedWeight('user-1', '2026-08-17', 79.2);
    nowMs += 1;
    const corrected = lifecycle.previewCheckIn('user-1', { kind: 'manual', includeToday: false });
    const correctedHistorical = store.getAnalytics('user-1', {
      range: '1w',
      end: '2026-08-17',
      aggregation: 'daily',
    });
    const acceptedAfter = db
      .select()
      .from(schema.adaptiveNutritionCheckIns)
      .where(eq(schema.adaptiveNutritionCheckIns.id, acceptedBefore.id))
      .get();
    expect(acceptedAfter).toBeDefined();
    if (!acceptedAfter) throw new Error('Expected the accepted check-in to remain persisted');

    expect(corrected.dataFingerprint).not.toBe(acceptedUpdate.dataFingerprint);
    expect(acceptedAfter).toEqual(acceptedBefore);
    expect(correctedHistorical.summary.averageIntakeKcal).not.toBe(
      historicalBefore.summary.averageIntakeKcal,
    );
    seedNutrition('user-1', '2026-08-18', 'complete', 6000);
    seedWeight('user-1', '2026-08-18', 90);
    const historicalAfter = store.getAnalytics('user-1', {
      range: '1w',
      end: '2026-08-17',
      aggregation: 'daily',
    });

    expect(historicalAfter).toEqual(correctedHistorical);
    const current = store.getAnalytics('user-1', { range: '1w', aggregation: 'daily' });
    expect(current.current).toMatchObject({
      state: 'review_needed',
      adaptiveTdeeKcal: acceptedUpdate.proposedTdeeKcal,
    });
    expect(current.current.expenditureSourceCheckInId).toBe(acceptedUpdate.id);
    expect(current.current.expenditureSourceInputFingerprint).toBe(acceptedBefore.dataFingerprint);
    expect(current.current.stateSourceCheckInId).toBe(corrected.id);
    expect(current.points.at(-1)).toMatchObject({
      state: 'review_needed',
      expenditureKcal: acceptedUpdate.proposedTdeeKcal,
      expenditureSourceCheckInId: acceptedUpdate.id,
      stateSourceCheckInId: corrected.id,
    });

    const acceptedRows = db
      .select()
      .from(schema.adaptiveNutritionCheckIns)
      .where(eq(schema.adaptiveNutritionCheckIns.status, 'accepted'))
      .all();
    expect(acceptedRows).toHaveLength(2);
  });

  it('resolves same-day goal transitions deterministically to the new goal revision', () => {
    acceptBaseline('user-1');
    const priorGoal = db
      .select()
      .from(adaptiveNutritionGoals)
      .where(eq(adaptiveNutritionGoals.userId, 'user-1'))
      .get();
    expect(priorGoal).toBeDefined();
    if (!priorGoal) throw new Error('Expected the baseline goal to exist');
    db.update(adaptiveNutritionGoals)
      .set({
        status: 'replaced',
        endedLocalDate: '2026-08-10',
        endedReason: 'direction_changed',
        finalTrendWeightKg: 80,
      })
      .where(eq(adaptiveNutritionGoals.id, priorGoal.id))
      .run();
    db.insert(adaptiveNutritionGoals)
      .values({
        id: 'goal-new',
        userId: 'user-1',
        programId: priorGoal.programId,
        type: 'gain',
        status: 'active',
        startTrendWeightKg: 80,
        startScaleWeightKg: 80,
        targetWeightKg: 84,
        maintenanceCenterKg: null,
        goalRatePctPerWeek: 0.25,
        startedLocalDate: '2026-08-10',
        createdAt: nowMs + 1,
        updatedAt: nowMs + 1,
      })
      .run();
    db.insert(adaptiveNutritionGoalRevisions)
      .values({
        id: 'revision-new',
        goalId: 'goal-new',
        userId: 'user-1',
        sequence: 1,
        targetWeightKg: 84,
        maintenanceCenterKg: null,
        goalRatePctPerWeek: 0.25,
        previousTargetWeightKg: 84,
        previousCenterKg: null,
        previousRatePctPerWeek: 0.25,
        reason: 'created',
        effectiveLocalDate: '2026-08-10',
        createdAt: nowMs + 1,
      })
      .run();
    db.insert(nutritionTargets)
      .values({
        id: 'target-new-goal',
        userId: 'user-1',
        calories: 2900,
        protein: 180,
        carbs: 300,
        fat: 80,
        effectiveDate: '2026-08-10',
      })
      .run();

    const analytics = createAdaptiveAnalyticsStore({ db, now: () => new Date(nowMs) }).getAnalytics(
      'user-1',
      { range: '1m', aggregation: 'daily' },
    );
    const transition = analytics.points.find((point) => point.periodStart === '2026-08-10');
    const beforeTransition = analytics.points.find((point) => point.periodStart === '2026-08-09');

    expect(beforeTransition).toMatchObject({
      goalType: 'maintain',
      targetKcal: 2760,
    });
    expect(transition).toMatchObject({
      goalType: 'gain',
      goalRevisionIds: ['revision-new'],
      targetKcal: 2900,
      targetIds: ['target-new-goal'],
    });
    expect(
      analytics.markers.filter((marker) => marker.date === '2026-08-10').map((marker) => marker.id),
    ).toEqual(['revision-new']);
  });

  it('rejects unbounded future ranges before generating dates', () => {
    acceptBaseline('user-1');
    const store = createAdaptiveAnalyticsStore({ db, now: () => new Date(nowMs) });

    expect(() =>
      store.getAnalytics('user-1', {
        range: 'all',
        end: '2026-08-19',
        aggregation: 'daily',
      }),
    ).toThrow('cannot be in the future');
    expect(() =>
      store.getAnalytics('user-1', {
        range: '1w',
        end: '2026-07-31',
        aggregation: 'daily',
      }),
    ).toThrow('cannot precede the adaptive program');
  });

  it('makes the final history point match paused and stale current holding states', () => {
    const lifecycle = acceptBaseline('user-1');
    for (let offset = -14; offset <= -1; offset += 1) {
      seedNutrition('user-1', datePlus('2026-08-18', offset), 'complete', 2520);
    }
    seedWeight('user-1', '2026-08-03', 80.2);
    seedWeight('user-1', '2026-08-10', 80);
    seedWeight('user-1', '2026-08-17', 79.8);
    const update = lifecycle.previewCheckIn('user-1', { kind: 'manual', includeToday: false });
    lifecycle.acceptCheckIn('user-1', update.id, { replaceSameDateTarget: false });

    const staleNow = Date.parse('2026-08-30T16:00:00.000Z');
    const stale = createAdaptiveAnalyticsStore({ db, now: () => new Date(staleNow) }).getAnalytics(
      'user-1',
      { range: '1m', aggregation: 'daily' },
    );
    expect(stale.current.state).toBe('holding');
    expect(stale.points.at(-1)?.state).toBe('holding');
    expect(stale.points.find((point) => point.periodStart === '2026-08-24')?.state).toBe(
      'updating',
    );
    expect(stale.points.find((point) => point.periodStart === '2026-08-25')?.state).toBe(
      'updating',
    );
    expect(stale.points.find((point) => point.periodStart === '2026-08-26')?.state).toBe('holding');

    seedWeight('user-1', '2026-08-24', 79.7);
    seedWeight('user-1', '2026-08-27', 79.6);
    seedWeight('user-1', '2026-08-29', 79.5);
    const nutritionBreak = createAdaptiveAnalyticsStore({
      db,
      now: () => new Date(staleNow),
    }).getAnalytics('user-1', { range: '1m', aggregation: 'daily' });
    expect(nutritionBreak.points.find((point) => point.periodStart === '2026-08-27')?.state).toBe(
      'updating',
    );
    expect(nutritionBreak.points.find((point) => point.periodStart === '2026-08-28')).toMatchObject(
      {
        state: 'holding',
        calculationState: 'holding',
        calculationReasonCodes: expect.arrayContaining(['INSUFFICIENT_NUTRITION']),
      },
    );

    nowMs = staleNow;
    lifecycle.upsertProgram('user-1', {
      ...programInput(),
      status: 'paused',
      currentWeight: null,
    });
    const paused = createAdaptiveAnalyticsStore({ db, now: () => new Date(staleNow) }).getAnalytics(
      'user-1',
      { range: '1m', aggregation: 'daily' },
    );
    expect(paused.current).toMatchObject({
      state: 'holding',
      reasonCodes: expect.arrayContaining(['PROGRAM_PAUSED']),
    });
    expect(paused.points.at(-1)).toMatchObject({
      state: 'holding',
      calculationReasonCodes: expect.arrayContaining(['PROGRAM_PAUSED']),
    });
  });
});

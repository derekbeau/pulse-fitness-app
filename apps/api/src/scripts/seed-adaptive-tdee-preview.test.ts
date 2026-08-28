import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { count, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, describe, expect, it } from 'vitest';

import * as schema from '../db/schema/index.js';
import { migratePulseDatabase } from '../db/migrate.js';
import {
  adaptiveNutritionGoalCompletions,
  adaptiveNutritionGoals,
  adaptiveNutritionPrograms,
  users,
} from '../db/schema/index.js';
import { createAdaptiveNutritionStore } from '../routes/adaptive-nutrition/store.js';
import { createAdaptiveAnalyticsStore } from '../routes/adaptive-nutrition/analytics-store.js';
import { createAdaptiveGoalTrajectoryStore } from '../routes/adaptive-nutrition/goal-trajectory-store.js';
import { createAdaptiveWeeklyReviewStore } from '../routes/adaptive-nutrition/review-store.js';
import { createAdaptiveGoalReadStore } from '../routes/adaptive-nutrition/goal-store.js';
import { createDataQualityCalendarStore } from '../routes/data-quality/store.js';
import { createDailyEnergyAdherenceStore } from '../routes/nutrition/daily-energy-store.js';
import { createFoodAnalyticsStore } from '../routes/foods/analytics-store.js';

import {
  ADAPTIVE_PREVIEW_USERNAME_PREFIX,
  resolveAdaptivePreviewSeedNow,
  seedAdaptiveTdeePreviewFixtures,
} from './seed-adaptive-tdee-preview.js';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
const fixtureContract = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, '../../../../scripts/adaptive-preview-fixture-contract.v1.json'),
    'utf8',
  ),
) as {
  anchorDate: string;
  seedNow: string;
  serverNow: string;
  readiness: { learning: Record<string, unknown>; updating: Record<string, unknown> };
  weeklyReview: Record<string, unknown> & { lowDay: Record<string, unknown> };
  dataQuality: {
    range: { startDate: string; endDate: string };
    contextDate: string;
    days: Array<Record<string, unknown> & { date: string }>;
  };
  energyBalance: Record<string, unknown> & { range: Record<string, unknown> };
  trajectory: Record<string, unknown> & { selectedPoint: Record<string, unknown> };
  workoutProgression: Record<string, unknown>;
};
const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('Adaptive TDEE preview fixtures', () => {
  it('never seeds a same-local-day revision in the future of the running preview', () => {
    const current = new Date('2026-08-19T05:30:00.000Z');
    expect(resolveAdaptivePreviewSeedNow('2026-08-19', current).toISOString()).toBe(
      '2026-08-19T05:29:00.000Z',
    );
    const midnight = new Date('2026-08-19T04:00:30.000Z');
    expect(resolveAdaptivePreviewSeedNow('2026-08-19', midnight)).toBe(midnight);
    expect(resolveAdaptivePreviewSeedNow('2026-08-18', current).toISOString()).toBe(
      '2026-08-18T16:00:00.000Z',
    );
  });

  it('rebuilds every Coach state and keeps goal completion explicit', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pulse-adaptive-preview-'));
    tempDirectories.push(directory);
    const sqlite = new Database(join(directory, 'preview.db'));
    sqlite.pragma('foreign_keys = ON');
    const db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder });
    const options = {
      anchorDate: '2026-08-13',
      db,
      now: new Date('2026-08-13T16:00:00.000Z'),
      passwordHash: 'fixture-password-hash',
      sqlite,
    };
    db.insert(users)
      .values({
        id: 'a6d0c0de-0000-4000-8000-000000000006',
        username: 'unrelated-existing-user',
        passwordHash: 'hash',
      })
      .run();

    const first = seedAdaptiveTdeePreviewFixtures(options);
    expect(
      db
        .select({ username: users.username })
        .from(users)
        .where(eq(users.id, 'a6d0c0de-0000-4000-8000-000000000006'))
        .get(),
    ).toEqual({ username: 'unrelated-existing-user' });
    const store = createAdaptiveNutritionStore({
      db,
      sqlite,
      now: () => new Date('2026-08-13T16:30:00.000Z'),
    });
    expect(
      Object.fromEntries(first.map((fixture) => [fixture.fixture, fixture.expectedState])),
    ).toEqual({
      setup: 'setup_required',
      baseline: 'baseline',
      learning: 'learning',
      updating: 'updating',
      holding: 'holding',
      pending: 'pending_recommendation',
      'goal-reached': 'pending_recommendation',
      'goal-loss': 'updating',
      'goal-maintenance': 'updating',
      'goal-edited': 'updating',
      'goal-history': 'updating',
      'goal-change-pending': 'pending_recommendation',
      'completion-required': 'updating',
      'analytics-pending': 'pending_recommendation',
      'analytics-goal-loss': 'updating',
      'daily-energy-adherence': 'updating',
      'daily-energy-loss': 'updating',
      'daily-energy-gain': 'updating',
      'daily-energy-manual': 'baseline',
      'daily-energy-revisions': 'pending_recommendation',
      'protein-floor': 'updating',
      'protein-floor-unavailable': 'setup_required',
      'review-clean-loss': 'pending_recommendation',
      'review-clean-gain': 'pending_recommendation',
      'review-clean-maintain': 'pending_recommendation',
      'review-low-day': 'pending_recommendation',
      'review-cutoff': 'pending_recommendation',
      'review-illness': 'pending_recommendation',
      'review-holding': 'learning',
      'review-stale': 'pending_recommendation',
      'review-decline': 'pending_recommendation',
      'review-defer': 'pending_recommendation',
      'review-maximal': 'learning',
      'review-adjust': 'pending_recommendation',
      'trajectory-loss': 'updating',
      'trajectory-maintenance': 'updating',
      'trajectory-edited': 'updating',
      'trajectory-reached': 'pending_recommendation',
      'trajectory-gain': 'updating',
      'trajectory-sparse': 'learning',
      'trajectory-maintenance-below': 'updating',
      'trajectory-maintenance-above': 'updating',
      'trajectory-scale-only': 'updating',
      'trajectory-historical': 'updating',
      'data-quality-calendar': 'updating',
      'progression-accept': 'setup_required',
      'progression-edit': 'setup_required',
      'progression-stale': 'setup_required',
      'progression-agent': 'setup_required',
      'muscle-analytics': 'setup_required',
      'food-analytics': 'setup_required',
    });
    for (const fixture of first) {
      expect(store.getState(fixture.userId).state).toBe(fixture.expectedState);
    }
    const dataQualityFixture = first.find((fixture) => fixture.fixture === 'data-quality-calendar');
    if (!dataQualityFixture) throw new Error('Missing Data Quality calendar fixture');
    const qualityCalendar = createDataQualityCalendarStore({
      db,
      sqlite,
      now: () => new Date('2026-08-13T16:30:00.000Z'),
    }).getCalendar(dataQualityFixture.userId, {
      start: '2026-08-09',
      end: '2026-08-13',
    });
    expect(qualityCalendar.days.map((day) => day.nutrition.qualityState)).toEqual([
      'partial',
      'unknown',
      'no_records',
      'complete',
      'complete',
    ]);
    expect(qualityCalendar.days.map((day) => day.nutrition.evidenceState)).toEqual([
      'excluded',
      'excluded',
      'missing',
      'usable',
      'pending_cutoff',
    ]);
    expect(qualityCalendar.days[0]?.contexts).toEqual([
      expect.objectContaining({
        category: 'illness',
        provenance: expect.objectContaining({ type: 'agent_token', label: 'Preview Coach' }),
      }),
    ]);
    expect(qualityCalendar.days[1]?.weight.correctionState).toBe('history_unavailable');
    expect(qualityCalendar.days[2]?.workouts).toEqual([
      expect.objectContaining({ state: 'planned' }),
    ]);
    expect(qualityCalendar.days[3]?.workouts).toEqual([
      expect.objectContaining({ state: 'completed', correctionState: 'history_unavailable' }),
    ]);
    expect(qualityCalendar.days[4]?.algorithm).toMatchObject({
      state: 'learning',
      nutritionEvidenceState: 'pending_cutoff',
      weightEvidenceState: 'pending_cutoff',
    });
    const reviewStore = createAdaptiveWeeklyReviewStore({
      db,
      sqlite,
      now: () => new Date('2026-08-13T16:30:00.000Z'),
    });
    const reviewFixture = (name: (typeof first)[number]['fixture']) => {
      const fixture = first.find((candidate) => candidate.fixture === name);
      if (!fixture) throw new Error(`Missing ${name} review fixture`);
      const review = reviewStore.getPending(fixture.userId);
      if (!review) throw new Error(`Missing ${name} pending review`);
      return review;
    };
    expect(
      reviewFixture('review-clean-loss').snapshot.modules.map((module) => module.kind),
    ).toEqual(['outcome', 'recommendation']);
    expect(reviewFixture('review-clean-loss').snapshot.modules[0]).toMatchObject({
      goalType: 'lose',
    });
    expect(reviewFixture('review-clean-gain').snapshot.modules[0]).toMatchObject({
      goalType: 'gain',
    });
    expect(reviewFixture('review-clean-maintain').snapshot.modules[0]).toMatchObject({
      goalType: 'maintain',
    });
    expect(reviewFixture('review-low-day').snapshot.modules[0]).toMatchObject({
      kind: 'data_quality',
      requiresClarification: true,
    });
    expect(reviewFixture('review-cutoff').snapshot.modules[0]).toMatchObject({
      kind: 'data_quality',
      evidence: expect.arrayContaining([
        expect.objectContaining({ state: 'pending_cutoff', localDate: '2026-08-13' }),
      ]),
    });
    expect(reviewFixture('review-illness').snapshot.modules.map((module) => module.kind)).toContain(
      'training_recovery',
    );
    expect(reviewFixture('review-maximal').snapshot.modules.map((module) => module.kind)).toEqual([
      'data_quality',
      'outcome',
      'energy',
      'training_recovery',
      'recommendation',
    ]);
    expect(reviewFixture('review-adjust').snapshot.modules.at(-1)).toMatchObject({
      kind: 'recommendation',
      outcome: 'adjust',
      proposedTarget: expect.any(Object),
    });
    const dailyEnergyFixture = first.find(
      (fixture) => fixture.fixture === 'daily-energy-adherence',
    );
    if (!dailyEnergyFixture) throw new Error('Daily Energy fixture missing');
    const dailyEnergyStore = createDailyEnergyAdherenceStore({
      db,
      sqlite,
      now: () => new Date('2026-08-13T16:30:00.000Z'),
    });
    expect(
      dailyEnergyStore.getDailyEnergyAdherence(dailyEnergyFixture.userId, '2026-08-12'),
    ).toMatchObject({
      dataState: 'gradeable',
      adherence: 'on_target',
      nutrition: { intakeKcal: 2_400, status: 'complete' },
      target: { caloriesKcal: 2_500 },
      expenditure: { caloriesKcal: 2_500, source: 'accepted_check_in' },
      intakeMinusTargetKcal: -100,
      intakeMinusExpenditureKcal: -100,
    });
    expect(
      dailyEnergyStore.getDailyEnergyAdherence(dailyEnergyFixture.userId, '2026-08-11').dataState,
    ).toBe('partial');
    expect(
      dailyEnergyStore.getDailyEnergyAdherence(dailyEnergyFixture.userId, '2026-08-10').dataState,
    ).toBe('unknown');
    expect(
      dailyEnergyStore.getDailyEnergyAdherence(dailyEnergyFixture.userId, '2026-08-09').dataState,
    ).toBe('missing');
    expect(
      dailyEnergyStore.getDailyEnergyAdherence(dailyEnergyFixture.userId, '2026-08-13').dataState,
    ).toBe('pending_cutoff');
    expect(
      dailyEnergyStore.getDailyEnergyAdherence(dailyEnergyFixture.userId, '2026-08-14').dataState,
    ).toBe('future');
    expect(
      [-5, -6, -7, -8, -9, -10, -11].map((offset) => {
        const fact = dailyEnergyStore.getDailyEnergyAdherence(
          dailyEnergyFixture.userId,
          new Date(Date.parse('2026-08-13T12:00:00.000Z') + offset * 86_400_000)
            .toISOString()
            .slice(0, 10),
        );
        return [fact.intakeMinusTargetKcal, fact.adherence];
      }),
    ).toEqual([
      [125, 'on_target'],
      [126, 'near_target'],
      [250, 'near_target'],
      [251, 'off_target'],
      [-125, 'on_target'],
      [-250, 'near_target'],
      [-251, 'off_target'],
    ]);
    for (const [fixtureName, goalType] of [
      ['daily-energy-loss', 'lose'],
      ['daily-energy-gain', 'gain'],
    ] as const) {
      const fixture = first.find((candidate) => candidate.fixture === fixtureName);
      if (!fixture) throw new Error(`Missing ${fixtureName}`);
      expect(store.getState(fixture.userId).program?.goalType).toBe(goalType);
      expect(dailyEnergyStore.getDailyEnergyAdherence(fixture.userId, '2026-08-12')).toMatchObject({
        adherence: 'near_target',
        intakeMinusTargetKcal: -200,
      });
    }
    const manualFixture = first.find((fixture) => fixture.fixture === 'daily-energy-manual');
    if (!manualFixture) throw new Error('Daily Energy manual fixture missing');
    expect(
      dailyEnergyStore.getDailyEnergyAdherence(manualFixture.userId, '2026-08-05'),
    ).toMatchObject({
      dataState: 'gradeable',
      adherence: 'on_target',
      target: { source: 'manual', caloriesKcal: 2_400 },
      expenditure: null,
    });
    const revisionsFixture = first.find((fixture) => fixture.fixture === 'daily-energy-revisions');
    if (!revisionsFixture) throw new Error('Daily Energy revisions fixture missing');
    const beforeRevision = dailyEnergyStore.getDailyEnergyAdherence(
      revisionsFixture.userId,
      '2026-08-05',
    );
    const acceptedRevision = dailyEnergyStore.getDailyEnergyAdherence(
      revisionsFixture.userId,
      '2026-08-07',
    );
    const pendingRevisionDate = dailyEnergyStore.getDailyEnergyAdherence(
      revisionsFixture.userId,
      '2026-08-10',
    );
    expect(beforeRevision.expenditure).toMatchObject({ source: 'accepted_check_in' });
    expect(acceptedRevision.expenditure).toMatchObject({ source: 'accepted_check_in' });
    expect(beforeRevision.expenditure?.checkInId).not.toBe(acceptedRevision.expenditure?.checkInId);
    expect(acceptedRevision.expenditure).toEqual(pendingRevisionDate.expenditure);
    expect(pendingRevisionDate.expenditure?.caloriesKcal).not.toBe(4_100);
    expect(beforeRevision.target?.targetEventId).not.toBe(acceptedRevision.target?.targetEventId);
    expect(acceptedRevision.target).toEqual(pendingRevisionDate.target);
    const learning = first.find((fixture) => fixture.fixture === 'learning');
    if (!learning) throw new Error('Learning fixture missing');
    const firstLearningEligibility = store.getState(learning.userId).eligibility;
    expect(firstLearningEligibility).toMatchObject({
      completeNutritionDaysLogged: 3,
      completeNutritionDaysUsable: 0,
      completeNutritionDaysBeforeWeightTrend: 2,
      completeNutritionDaysPendingCutoff: 1,
      weighInsLogged: 1,
      weighInsUsable: 0,
      weighInsPendingCutoff: 1,
      timeZone: 'America/Detroit',
      noteCodes: [
        'COMPLETE_NUTRITION_PENDING_COMPLETED_DAY_CUTOFF',
        'WEIGH_INS_PENDING_COMPLETED_DAY_CUTOFF',
        'COMPLETE_NUTRITION_BEFORE_WEIGHT_TREND',
      ],
    });
    const goal = first.find((fixture) => fixture.fixture === 'goal-reached');
    if (!goal) throw new Error('Goal fixture missing');
    const goalPending = store.getState(goal.userId).pendingCheckIn;
    expect(goalPending?.reasonCodes).toContain('GOAL_REACHED');
    store.acceptCheckIn(goal.userId, goalPending?.id ?? '', { replaceSameDateTarget: true });
    expect(
      db
        .select({ goalType: adaptiveNutritionPrograms.goalType })
        .from(adaptiveNutritionPrograms)
        .where(eq(adaptiveNutritionPrograms.userId, goal.userId))
        .get(),
    ).toEqual({ goalType: 'lose' });
    expect(
      db
        .select({ type: adaptiveNutritionGoals.type, status: adaptiveNutritionGoals.status })
        .from(adaptiveNutritionGoals)
        .where(eq(adaptiveNutritionGoals.userId, goal.userId))
        .get(),
    ).toEqual({ type: 'lose', status: 'active' });

    const loss = first.find((fixture) => fixture.fixture === 'goal-loss');
    const maintenance = first.find((fixture) => fixture.fixture === 'goal-maintenance');
    const edited = first.find((fixture) => fixture.fixture === 'goal-edited');
    const history = first.find((fixture) => fixture.fixture === 'goal-history');
    const goalChange = first.find((fixture) => fixture.fixture === 'goal-change-pending');
    const completion = first.find((fixture) => fixture.fixture === 'completion-required');
    if (!loss || !maintenance || !edited || !history || !goalChange || !completion) {
      throw new Error('Goal-strategy fixtures missing');
    }
    expect(store.getCurrentGoal(loss.userId).progress.kind).toBe('weight_change');
    expect(store.getCurrentGoal(maintenance.userId).progress.kind).toBe('maintenance');
    expect(store.getCurrentGoal(edited.userId).latestRevision.sequence).toBe(2);
    const goalReadStore = createAdaptiveGoalReadStore({ db });
    const lossGoal = store.getCurrentGoal(loss.userId).goal;
    const lossDetail = goalReadStore.getDetail(loss.userId, lossGoal.id);
    expect(lossDetail.trendPoints.length).toBeGreaterThanOrEqual(3);
    expect(lossDetail.trendPoints[0]?.date).toBe(lossGoal.startedLocalDate);
    expect(
      db
        .select({ total: count() })
        .from(adaptiveNutritionGoals)
        .where(eq(adaptiveNutritionGoals.userId, history.userId))
        .get(),
    ).toEqual({ total: 21 });
    expect(goalReadStore.list(history.userId, { page: 1, limit: 20 })).toMatchObject({
      data: expect.any(Array),
      meta: { page: 1, limit: 20, total: 21 },
    });
    expect(goalReadStore.list(history.userId, { page: 1, limit: 20 }).data).toHaveLength(20);
    expect(goalReadStore.list(history.userId, { page: 2, limit: 20 }).data).toHaveLength(1);
    expect(store.getCurrentGoal(goalChange.userId).pendingGoalChange?.kind).toBe('goal_change');
    expect(store.getState(completion.userId).goalActionRequired).toBe('complete_goal');

    const completionGoal = store.getCurrentGoal(completion.userId);
    const acceptedCompletion = store.getState(completion.userId).latestAcceptedCheckIn;
    if (!acceptedCompletion) throw new Error('Completion fixture accepted check-in missing');
    store.completeGoal(completion.userId, completionGoal.goal.id, {
      checkInId: acceptedCompletion.id,
      expectedRevisionId: completionGoal.latestRevision.id,
    });
    expect(
      db
        .select({ total: count() })
        .from(adaptiveNutritionGoalCompletions)
        .where(eq(adaptiveNutritionGoalCompletions.userId, completion.userId))
        .get(),
    ).toEqual({ total: 1 });

    const second = seedAdaptiveTdeePreviewFixtures(options);
    expect(second).toEqual(first);
    expect(second.every((fixture) => fixture.username.length <= 30)).toBe(true);
    expect(second.find((fixture) => fixture.fixture === 'goal-maintenance')?.username).toBe(
      'adaptive-preview-maintain',
    );
    expect(second.find((fixture) => fixture.fixture === 'food-analytics')?.username).toBe(
      'adaptive-preview-food',
    );
    const foodFixture = second.find((fixture) => fixture.fixture === 'food-analytics');
    if (!foodFixture) throw new Error('Missing food analytics fixture');
    const foodAnalytics = createFoodAnalyticsStore({
      sqlite,
      now: () => new Date('2026-08-13T16:30:00.000Z'),
    }).getAnalytics(foodFixture.userId, {
      range: '30d',
      end: '2026-08-13',
      timeZone: 'America/Detroit',
      sort: 'most_used',
      usage: 'any',
      verification: 'any',
      review: 'any',
      grams: 'any',
      page: 1,
      limit: 25,
    });
    expect(foodAnalytics.data.summary).toMatchObject({
      savedFoodsTotal: 7,
      savedFoodsUsed: 6,
      linkedUsageOccurrences: 9,
      distinctLoggedDays: 5,
      linkedFoodCalories: 1620,
      totalMealItemCalories: 1775,
      linkedCaloriesPercent: (1620 * 100) / 1775,
      unlinkedMealItemCount: 1,
      unlinkedMealItemCalories: 80,
      inactiveLinkedMealItemCount: 1,
      inactiveLinkedMealItemCalories: 75,
      definitionsNeedingReview: 4,
    });
    expect(foodAnalytics.data.items[0]).toMatchObject({
      name: 'Greek Yogurt',
      observed: {
        usageOccurrences: 4,
        totalCalories: 570,
        totalProtein: 57,
        portion: { state: 'mixed_units', evidenceCount: 4 },
      },
    });
    expect(second.find((fixture) => fixture.fixture === 'goal-change-pending')?.username).toBe(
      'adaptive-preview-goal-pending',
    );
    expect(second.find((fixture) => fixture.fixture === 'completion-required')?.username).toBe(
      'adaptive-preview-completion',
    );
    expect(second.find((fixture) => fixture.fixture === 'analytics-pending')?.username).toBe(
      'adaptive-preview-eb-pending',
    );
    expect(second.find((fixture) => fixture.fixture === 'analytics-goal-loss')?.username).toBe(
      'adaptive-preview-eb-loss',
    );
    expect(second.find((fixture) => fixture.fixture === 'progression-accept')?.username).toBe(
      'adaptive-preview-wp-accept',
    );
    const progressionFixture = second.find((fixture) => fixture.fixture === 'progression-accept');
    const muscleFixture = second.find((fixture) => fixture.fixture === 'muscle-analytics');
    if (!progressionFixture || !muscleFixture) {
      throw new Error('Workout progression preview fixtures missing');
    }
    expect(
      sqlite
        .prepare('SELECT count(*) AS total FROM scheduled_workouts WHERE user_id = ?')
        .get(progressionFixture.userId),
    ).toEqual({ total: 1 });
    expect(
      sqlite
        .prepare('SELECT count(*) AS total FROM workout_sessions WHERE user_id = ?')
        .get(progressionFixture.userId),
    ).toEqual({ total: 1 });
    expect(
      sqlite
        .prepare(
          'SELECT muscle, role, factor FROM exercise_muscle_contributions WHERE owner_user_id = ? ORDER BY factor DESC',
        )
        .all(muscleFixture.userId),
    ).toEqual([
      { factor: 1, muscle: 'Chest', role: 'primary' },
      { factor: 0.5, muscle: 'Triceps', role: 'secondary' },
    ]);
    expect(sqlite.pragma('foreign_key_check')).toEqual([]);
    expect(sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
    expect(
      db
        .select({ total: count() })
        .from(users)
        .where(eq(users.username, `${ADAPTIVE_PREVIEW_USERNAME_PREFIX}setup`))
        .get(),
    ).toEqual({ total: 1 });
    for (const fixture of second) {
      expect(store.getState(fixture.userId).state).toBe(fixture.expectedState);
    }
    expect(store.getState(learning.userId).eligibility).toEqual(firstLearningEligibility);
    expect(db.select({ total: count() }).from(adaptiveNutritionGoalCompletions).get()).toEqual({
      total: 0,
    });
    sqlite.close();
  });

  it('matches the independent 2026-08-23 fixture contract across all repaired domains', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pulse-adaptive-contract-'));
    tempDirectories.push(directory);
    const sqlite = new Database(join(directory, 'contract.db'));
    sqlite.pragma('foreign_keys = ON');
    const db = drizzle(sqlite, { schema });
    migratePulseDatabase(sqlite, { migrationsFolder });
    const records = seedAdaptiveTdeePreviewFixtures({
      anchorDate: fixtureContract.anchorDate,
      db,
      now: new Date(fixtureContract.seedNow),
      passwordHash: 'fixture-password-hash',
      sqlite,
    });
    const fixture = (name: string) => {
      const value = records.find((candidate) => candidate.fixture === name);
      if (!value) throw new Error(`Missing ${name} fixture`);
      return value;
    };
    const now = () => new Date(fixtureContract.serverNow);
    const adaptiveStore = createAdaptiveNutritionStore({ db, sqlite, now });
    expect(adaptiveStore.getState(fixture('learning').userId).eligibility).toMatchObject(
      fixtureContract.readiness.learning,
    );
    expect(adaptiveStore.getState(fixture('updating').userId).eligibility).toMatchObject(
      fixtureContract.readiness.updating,
    );

    const review = createAdaptiveWeeklyReviewStore({ db, sqlite, now }).getPending(
      fixture('review-low-day').userId,
    );
    expect(review?.snapshot).toMatchObject({
      reviewLocalDate: fixtureContract.weeklyReview.reviewLocalDate,
      analysisStart: fixtureContract.weeklyReview.analysisStart,
      analysisEnd: fixtureContract.weeklyReview.analysisEnd,
      headline: fixtureContract.weeklyReview.headline,
      contexts: [],
    });
    const qualityModule = review?.snapshot.modules.find((module) => module.kind === 'data_quality');
    expect(qualityModule).toMatchObject({
      requiresClarification: true,
      evidence: [
        expect.objectContaining({
          localDate: fixtureContract.weeklyReview.lowDay.localDate,
          state: fixtureContract.weeklyReview.lowDay.state,
          label: fixtureContract.weeklyReview.lowDay.label,
          reasonCodes: [fixtureContract.weeklyReview.lowDay.reasonCode],
        }),
      ],
    });

    const calendar = createDataQualityCalendarStore({ db, sqlite, now }).getCalendar(
      fixture('data-quality-calendar').userId,
      {
        start: fixtureContract.dataQuality.range.startDate,
        end: fixtureContract.dataQuality.range.endDate,
      },
    );
    expect(
      calendar.days.map((day) => ({
        date: day.date,
        nutritionQuality: day.nutrition.qualityState,
        nutritionEvidence: day.nutrition.evidenceState,
        weightEvidence: day.weight.evidenceState,
        ...(day.workouts[0] ? { workoutState: day.workouts[0].state } : {}),
      })),
    ).toEqual(fixtureContract.dataQuality.days);

    const energy = createAdaptiveAnalyticsStore({ db, now }).getAnalytics(
      fixture('analytics-goal-loss').userId,
      { range: '1w', aggregation: 'auto' },
    );
    expect(energy.range).toEqual(fixtureContract.energyBalance.range);
    expect(energy.summary).toMatchObject({
      predictedModeledDays: fixtureContract.energyBalance.predictedModeledDays,
      observedTrendStartDate: fixtureContract.energyBalance.observedTrendStartDate,
      observedTrendEndDate: fixtureContract.energyBalance.observedTrendEndDate,
      predictedWeightChangeKg: fixtureContract.energyBalance.predictedWeightChangeKg,
      observedTrendWeightChangeKg: fixtureContract.energyBalance.observedTrendWeightChangeKg,
      completeNutritionDays: fixtureContract.energyBalance.completeNutritionDays,
      excludedNutritionDays: fixtureContract.energyBalance.excludedNutritionDays,
    });

    const trajectoryUser = fixture('trajectory-loss').userId;
    const goal = adaptiveStore.getCurrentGoal(trajectoryUser).goal;
    const trajectory = createAdaptiveGoalTrajectoryStore({ db, now }).getTrajectory(
      trajectoryUser,
      goal.id,
      { range: '1m', lookbackDays: 28 },
    );
    expect(trajectory.summary).toMatchObject({
      currentTrendWeightKg: fixtureContract.trajectory.currentAdaptiveTrendWeightKg,
      currentTrendDate: fixtureContract.trajectory.currentDate,
      selectedRateKgPerWeek: fixtureContract.trajectory.selectedRateKgPerWeek,
      paceState: fixtureContract.trajectory.paceState,
    });
    expect(
      trajectory.trendPoints.find(
        (point) => point.date === fixtureContract.trajectory.selectedPoint.date,
      ),
    ).toMatchObject(fixtureContract.trajectory.selectedPoint);

    const progressionUser = fixture('progression-accept').userId;
    const progressionRows = sqlite
      .prepare(
        `select session.date, session_set.weight, session_set.reps, session_set.rpe
           from workout_sessions session
           join session_sets session_set on session_set.session_id = session.id
          where session.user_id = ?
          order by session_set.set_number`,
      )
      .all(progressionUser) as Array<{
      date: string;
      weight: number;
      reps: number;
      rpe: number;
    }>;
    expect(progressionRows.map((row) => row.date)).toEqual([
      fixtureContract.workoutProgression.historyDate,
      fixtureContract.workoutProgression.historyDate,
    ]);
    expect(progressionRows.map((row) => row.weight)).toEqual(
      fixtureContract.workoutProgression.completedWeights,
    );
    expect(progressionRows.map((row) => row.reps)).toEqual(
      fixtureContract.workoutProgression.completedReps,
    );
    expect(progressionRows.map((row) => row.rpe)).toEqual(
      fixtureContract.workoutProgression.completedRpe,
    );
    expect(sqlite.pragma('foreign_key_check')).toEqual([]);
    expect(sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
    sqlite.close();
  });
});

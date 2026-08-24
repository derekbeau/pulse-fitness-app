import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { count, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, describe, expect, it } from 'vitest';

import * as schema from '../db/schema/index.js';
import {
  adaptiveNutritionGoalCompletions,
  adaptiveNutritionGoals,
  adaptiveNutritionPrograms,
  users,
} from '../db/schema/index.js';
import { createAdaptiveNutritionStore } from '../routes/adaptive-nutrition/store.js';
import { createAdaptiveWeeklyReviewStore } from '../routes/adaptive-nutrition/review-store.js';
import { createAdaptiveGoalReadStore } from '../routes/adaptive-nutrition/goal-store.js';
import { createDataQualityCalendarStore } from '../routes/data-quality/store.js';
import { createDailyEnergyAdherenceStore } from '../routes/nutrition/daily-energy-store.js';

import {
  ADAPTIVE_PREVIEW_USERNAME_PREFIX,
  resolveAdaptivePreviewSeedNow,
  seedAdaptiveTdeePreviewFixtures,
} from './seed-adaptive-tdee-preview.js';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
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
});

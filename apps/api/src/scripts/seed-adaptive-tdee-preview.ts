import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

import bcrypt from 'bcryptjs';
import type Database from 'better-sqlite3';
import { and, eq, gte, like, lte, or } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import type { AdaptiveNutritionReadState, AdaptiveProgramMutation } from '@pulse/shared';

import * as schema from '../db/schema/index.js';
import {
  adaptiveNutritionAccountDeletionScope,
  adaptiveNutritionCheckIns,
  adaptiveNutritionGoalCompletions,
  adaptiveNutritionPrograms,
  adaptiveNutritionReviewActions,
  adaptiveNutritionReviewContexts,
  adaptiveNutritionReviews,
  bodyWeight,
  exerciseMuscleContributions,
  exercises,
  mealItems,
  meals,
  nutritionLogs,
  nutritionTargetEvents,
  nutritionTargets,
  scheduledWorkoutExercises,
  scheduledWorkoutExerciseSets,
  scheduledWorkouts,
  sessionSets,
  users,
  workoutProgressionAccountDeletionScope,
  workoutProgressionActions,
  workoutProgressionConfigurations,
  workoutProgressionRecommendations,
  workoutSessions,
} from '../db/schema/index.js';
import { createAdaptiveNutritionStore } from '../routes/adaptive-nutrition/store.js';
import { createAdaptiveWeeklyReviewStore } from '../routes/adaptive-nutrition/review-store.js';

export const ADAPTIVE_PREVIEW_USERNAME_PREFIX = 'adaptive-preview-';
export const ADAPTIVE_PREVIEW_USER_ID_PREFIX = 'f17e0000-0000-4000-8000-';
export const ADAPTIVE_PREVIEW_PASSWORD = 'adaptive-preview-only';

export type AdaptivePreviewFixtureName =
  | 'setup'
  | 'baseline'
  | 'learning'
  | 'updating'
  | 'holding'
  | 'pending'
  | 'goal-reached'
  | 'goal-loss'
  | 'goal-maintenance'
  | 'goal-edited'
  | 'goal-history'
  | 'goal-change-pending'
  | 'completion-required'
  | 'analytics-pending'
  | 'analytics-goal-loss'
  | 'review-clean-loss'
  | 'review-clean-gain'
  | 'review-clean-maintain'
  | 'review-low-day'
  | 'review-cutoff'
  | 'review-illness'
  | 'review-holding'
  | 'review-stale'
  | 'review-decline'
  | 'review-defer'
  | 'review-maximal'
  | 'review-adjust'
  | 'trajectory-loss'
  | 'trajectory-maintenance'
  | 'trajectory-edited'
  | 'trajectory-reached'
  | 'trajectory-gain'
  | 'trajectory-sparse'
  | 'trajectory-maintenance-below'
  | 'trajectory-maintenance-above'
  | 'trajectory-scale-only'
  | 'trajectory-historical'
  | 'data-quality-calendar'
  | 'progression-accept'
  | 'progression-edit'
  | 'progression-stale'
  | 'progression-agent'
  | 'muscle-analytics';

export type AdaptivePreviewFixtureRecord = {
  fixture: AdaptivePreviewFixtureName;
  name: string;
  username: string;
  userId: string;
  expectedState: AdaptiveNutritionReadState;
  note: string;
};

type AdaptiveDatabase = BetterSQLite3Database<typeof schema>;

const FIXTURES: Array<
  Omit<AdaptivePreviewFixtureRecord, 'username' | 'userId'> & {
    idSuffix: string;
    usernameSuffix?: string;
  }
> = [
  {
    fixture: 'setup',
    idSuffix: '0001',
    name: 'Adaptive Preview · Setup',
    expectedState: 'setup_required',
    note: 'No program exists; complete the guided setup.',
  },
  {
    fixture: 'baseline',
    idSuffix: '0002',
    name: 'Adaptive Preview · Baseline',
    expectedState: 'baseline',
    note: 'A baseline was declined, leaving the program ready for a fresh baseline.',
  },
  {
    fixture: 'learning',
    idSuffix: '0003',
    name: 'Adaptive Preview · Learning',
    expectedState: 'learning',
    note: "Two prior complete days plus today's complete nutrition and weigh-in are logged, while the completed-day coaching window still has zero usable records.",
  },
  {
    fixture: 'updating',
    idSuffix: '0004',
    name: 'Adaptive Preview · Updating',
    expectedState: 'updating',
    note: 'Eligible nutrition and weight history support a manual check-in.',
  },
  {
    fixture: 'holding',
    idSuffix: '0005',
    name: 'Adaptive Preview · Holding',
    expectedState: 'holding',
    note: 'A prior adaptive update exists, but recent weights are now stale.',
  },
  {
    fixture: 'pending',
    idSuffix: '0006',
    name: 'Adaptive Preview · Pending',
    expectedState: 'pending_recommendation',
    note: 'An eligible recommendation is pending after one prior decline.',
  },
  {
    fixture: 'goal-reached',
    idSuffix: '0007',
    name: 'Adaptive Preview · Goal Reached',
    expectedState: 'pending_recommendation',
    note: 'A pending loss recommendation is inside the goal tolerance and requires explicit completion after acceptance.',
  },
  {
    fixture: 'goal-loss',
    idSuffix: '0008',
    name: 'Adaptive Preview · Current Loss Goal',
    expectedState: 'updating',
    note: 'An active loss goal has deterministic trend-based progress and no pending recommendation.',
  },
  {
    fixture: 'goal-maintenance',
    usernameSuffix: 'maintain',
    idSuffix: '0009',
    name: 'Adaptive Preview · Maintenance Goal',
    expectedState: 'updating',
    note: 'An active maintenance goal exposes its deterministic center and display range.',
  },
  {
    fixture: 'goal-edited',
    idSuffix: '0010',
    name: 'Adaptive Preview · Edited Goal',
    expectedState: 'updating',
    note: 'A same-direction edit preserved the progress origin and has an accepted revision-two recommendation.',
  },
  {
    fixture: 'goal-history',
    idSuffix: '0011',
    name: 'Adaptive Preview · Prior Goal History',
    expectedState: 'updating',
    note: 'A prior loss goal was replaced by an accepted gain goal with a new progress period.',
  },
  {
    fixture: 'goal-change-pending',
    usernameSuffix: 'goal-pending',
    idSuffix: '0012',
    name: 'Adaptive Preview · Goal Change Pending',
    expectedState: 'pending_recommendation',
    note: 'A same-direction edit is active while its explicit target recommendation remains pending.',
  },
  {
    fixture: 'completion-required',
    usernameSuffix: 'completion',
    idSuffix: '0013',
    name: 'Adaptive Preview · Completion Required',
    expectedState: 'updating',
    note: 'A reached loss target has been accepted and still requires the explicit maintenance transition.',
  },
  {
    fixture: 'analytics-pending',
    usernameSuffix: 'eb-pending',
    idSuffix: '0014',
    name: 'Adaptive Preview · Energy Balance Pending',
    expectedState: 'pending_recommendation',
    note: 'A dedicated pending recommendation keeps Energy Balance browser tests isolated.',
  },
  {
    fixture: 'analytics-goal-loss',
    usernameSuffix: 'eb-loss',
    idSuffix: '0015',
    name: 'Adaptive Preview · Energy Balance Loss Goal',
    expectedState: 'updating',
    note: 'A dedicated loss goal keeps Energy Balance browser tests isolated.',
  },
  {
    fixture: 'review-clean-loss',
    usernameSuffix: 'wr-loss',
    idSuffix: '0016',
    name: 'Adaptive Review · Clean Loss',
    expectedState: 'pending_recommendation',
    note: 'A clean loss review with only Outcome and Recommendation.',
  },
  {
    fixture: 'review-clean-gain',
    usernameSuffix: 'wr-gain',
    idSuffix: '0017',
    name: 'Adaptive Review · Clean Gain',
    expectedState: 'pending_recommendation',
    note: 'A clean gain review with deterministic goal-direction copy.',
  },
  {
    fixture: 'review-clean-maintain',
    usernameSuffix: 'wr-maintain',
    idSuffix: '0018',
    name: 'Adaptive Review · Clean Maintenance',
    expectedState: 'pending_recommendation',
    note: 'A clean maintenance review with deterministic neutral copy.',
  },
  {
    fixture: 'review-low-day',
    usernameSuffix: 'wr-low',
    idSuffix: '0019',
    name: 'Adaptive Review · Low Complete Day',
    expectedState: 'pending_recommendation',
    note: 'One complete day is unusually low and requires clarification.',
  },
  {
    fixture: 'review-cutoff',
    usernameSuffix: 'wr-cutoff',
    idSuffix: '0020',
    name: 'Adaptive Review · Current-day Cutoff',
    expectedState: 'pending_recommendation',
    note: 'Current-day complete nutrition and weight are logged but pending cutoff.',
  },
  {
    fixture: 'review-illness',
    usernameSuffix: 'wr-illness',
    idSuffix: '0021',
    name: 'Adaptive Review · Illness Context',
    expectedState: 'pending_recommendation',
    note: 'Bounded illness context explains recovery without changing nutrition math.',
  },
  {
    fixture: 'review-holding',
    usernameSuffix: 'wr-hold',
    idSuffix: '0022',
    name: 'Adaptive Review · Logging Hold',
    expectedState: 'learning',
    note: 'A logging break keeps the plan unchanged and shows missing evidence.',
  },
  {
    fixture: 'review-stale',
    usernameSuffix: 'wr-stale',
    idSuffix: '0023',
    name: 'Adaptive Review · Stale Correction',
    expectedState: 'pending_recommendation',
    note: 'A dedicated review may be corrected and refreshed without cross-test mutation.',
  },
  {
    fixture: 'review-decline',
    usernameSuffix: 'wr-decline',
    idSuffix: '0024',
    name: 'Adaptive Review · Decline',
    expectedState: 'pending_recommendation',
    note: 'A dedicated review verifies decline audit and no-repeat behavior.',
  },
  {
    fixture: 'review-defer',
    usernameSuffix: 'wr-defer',
    idSuffix: '0025',
    name: 'Adaptive Review · Defer',
    expectedState: 'pending_recommendation',
    note: 'A dedicated review verifies defer conditions and no duplicate rows.',
  },
  {
    fixture: 'review-maximal',
    usernameSuffix: 'wr-full',
    idSuffix: '0026',
    name: 'Adaptive Review · Full Evidence',
    expectedState: 'learning',
    note: 'Cutoff, missing, energy, training, and recommendation evidence exercise the full layout.',
  },
  {
    fixture: 'review-adjust',
    usernameSuffix: 'wr-adjust',
    idSuffix: '0027',
    name: 'Adaptive Review · Editable Adjustment',
    expectedState: 'pending_recommendation',
    note: 'A dedicated bounded adjustment supports edit-then-accept browser consent coverage.',
  },
  {
    fixture: 'trajectory-loss',
    usernameSuffix: 'gt-loss',
    idSuffix: '0028',
    name: 'Goal Trajectory · Loss',
    expectedState: 'updating',
    note: 'A dedicated read-only loss trajectory keeps browser tests isolated.',
  },
  {
    fixture: 'trajectory-maintenance',
    usernameSuffix: 'gt-maintain',
    idSuffix: '0029',
    name: 'Goal Trajectory · Maintenance',
    expectedState: 'updating',
    note: 'A dedicated read-only maintenance trajectory keeps browser tests isolated.',
  },
  {
    fixture: 'trajectory-edited',
    usernameSuffix: 'gt-edited',
    idSuffix: '0030',
    name: 'Goal Trajectory · Revised',
    expectedState: 'updating',
    note: 'A dedicated read-only revision trajectory keeps browser tests isolated.',
  },
  {
    fixture: 'trajectory-reached',
    usernameSuffix: 'gt-reached',
    idSuffix: '0031',
    name: 'Goal Trajectory · Reached',
    expectedState: 'pending_recommendation',
    note: 'A dedicated read-only reached trajectory keeps browser tests isolated.',
  },
  {
    fixture: 'trajectory-gain',
    usernameSuffix: 'gt-gain',
    idSuffix: '0032',
    name: 'Goal Trajectory · Gain',
    expectedState: 'updating',
    note: 'A dedicated read-only gain trajectory keeps browser tests isolated.',
  },
  {
    fixture: 'trajectory-sparse',
    usernameSuffix: 'gt-sparse',
    idSuffix: '0033',
    name: 'Goal Trajectory · Sparse',
    expectedState: 'learning',
    note: 'A dedicated sparse trajectory proves confidence limits without a fabricated ETA.',
  },
  {
    fixture: 'trajectory-maintenance-below',
    usernameSuffix: 'gt-below',
    idSuffix: '0034',
    name: 'Goal Trajectory · Maintenance Below',
    expectedState: 'updating',
    note: 'A dedicated read-only maintenance trajectory sits below the tested Pulse band.',
  },
  {
    fixture: 'trajectory-maintenance-above',
    usernameSuffix: 'gt-above',
    idSuffix: '0035',
    name: 'Goal Trajectory · Maintenance Above',
    expectedState: 'updating',
    note: 'A dedicated read-only maintenance trajectory sits above the tested Pulse band.',
  },
  {
    fixture: 'trajectory-scale-only',
    usernameSuffix: 'gt-scale',
    idSuffix: '0036',
    name: 'Goal Trajectory · Scale Only',
    expectedState: 'updating',
    note: 'A current raw scale crossing stays distinct from the completed-day model trend.',
  },
  {
    fixture: 'trajectory-historical',
    usernameSuffix: 'gt-historical',
    idSuffix: '0037',
    name: 'Goal Trajectory · Historical',
    expectedState: 'updating',
    note: 'A dedicated replaced goal proves historical trajectory copy and immutable context.',
  },
  {
    fixture: 'data-quality-calendar',
    usernameSuffix: 'dq-calendar',
    idSuffix: '0038',
    name: 'Data Quality · Cross-domain Calendar',
    expectedState: 'updating',
    note: 'A dedicated read-only month combines complete, partial, unknown, missing, pending, corrected, workout, algorithm, and agent-context evidence.',
  },
  {
    fixture: 'progression-accept',
    usernameSuffix: 'wp-accept',
    idSuffix: '0039',
    name: 'Workout Progression · Accept',
    expectedState: 'setup_required',
    note: 'A dedicated scheduled workout supports explicit progression acceptance.',
  },
  {
    fixture: 'progression-edit',
    usernameSuffix: 'wp-edit',
    idSuffix: '0040',
    name: 'Workout Progression · Edit',
    expectedState: 'setup_required',
    note: 'A dedicated scheduled workout supports bounded target editing.',
  },
  {
    fixture: 'progression-stale',
    usernameSuffix: 'wp-stale',
    idSuffix: '0041',
    name: 'Workout Progression · Stale',
    expectedState: 'setup_required',
    note: 'A dedicated source session supports correction and stale-recompute coverage.',
  },
  {
    fixture: 'progression-agent',
    usernameSuffix: 'wp-agent',
    idSuffix: '0042',
    name: 'Workout Progression · Agent',
    expectedState: 'setup_required',
    note: 'A dedicated scheduled workout supports AgentToken idempotency coverage.',
  },
  {
    fixture: 'muscle-analytics',
    usernameSuffix: 'muscle',
    idSuffix: '0043',
    name: 'Workout Analytics · Muscle Coverage',
    expectedState: 'setup_required',
    note: 'Dedicated completed and planned work exposes primary and secondary muscle contributions.',
  },
];

const datePlus = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const DAY_MS = 86_400_000;

const poundsFromKg = (weightKg: number) => weightKg / 0.45359237;

const seedCompleteNutritionDay = (
  db: AdaptiveDatabase,
  userId: string,
  date: string,
  timestamp: number,
) => {
  const logId = `${userId}-log-${date}`;
  const mealId = `${userId}-meal-${date}`;
  db.insert(nutritionLogs)
    .values({
      id: logId,
      userId,
      date,
      status: 'complete',
      statusUpdatedAt: timestamp,
      updatedAt: timestamp,
    })
    .run();
  db.insert(meals)
    .values({ id: mealId, nutritionLogId: logId, name: 'Deterministic daily total' })
    .run();
  db.insert(mealItems)
    .values({
      id: `${userId}-item-${date}`,
      mealId,
      name: 'Fixture total',
      amount: 1,
      unit: 'day',
      calories: 2400,
      protein: 160,
      carbs: 260,
      fat: 80,
    })
    .run();
};

const seedWeightDay = (
  db: AdaptiveDatabase,
  userId: string,
  date: string,
  weightKg: number,
  timestamp: number,
) =>
  db
    .insert(bodyWeight)
    .values({
      id: `${userId}-weight-${date}`,
      userId,
      date,
      weight: poundsFromKg(weightKg),
      weightKg,
      unitAtEntry: 'kg',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: [bodyWeight.userId, bodyWeight.date],
      set: { weight: poundsFromKg(weightKg), weightKg, unitAtEntry: 'kg', updatedAt: timestamp },
    })
    .run();

const programInput = (
  overrides: Partial<AdaptiveProgramMutation> = {},
): AdaptiveProgramMutation => ({
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
  proteinGrams: 160,
  fatAllocationPct: 30,
  userCalorieFloorKcal: 1500,
  currentWeight: { weight: 82, unit: 'kg' },
  rebaseline: false,
  supersedePending: false,
  ...overrides,
});

const requirePendingId = (
  store: ReturnType<typeof createAdaptiveNutritionStore>,
  userId: string,
) => {
  const pending = store.getState(userId).pendingCheckIn;
  if (!pending) throw new Error(`Fixture ${userId} did not produce a pending check-in`);
  return pending.id;
};

const cleanupExistingFixtures = (db: AdaptiveDatabase) => {
  const fixtureUsers = db
    .select({ id: users.id })
    .from(users)
    .where(
      or(
        like(users.username, `${ADAPTIVE_PREVIEW_USERNAME_PREFIX}%`),
        like(users.id, `${ADAPTIVE_PREVIEW_USER_ID_PREFIX}%`),
      ),
    )
    .all();
  for (const fixtureUser of fixtureUsers) {
    db.transaction((tx) => {
      tx.insert(adaptiveNutritionAccountDeletionScope)
        .values({ userId: fixtureUser.id })
        .onConflictDoNothing()
        .run();
      tx.insert(workoutProgressionAccountDeletionScope)
        .values({ userId: fixtureUser.id })
        .onConflictDoNothing()
        .run();
      tx.delete(workoutProgressionActions)
        .where(eq(workoutProgressionActions.userId, fixtureUser.id))
        .run();
      tx.delete(workoutProgressionRecommendations)
        .where(eq(workoutProgressionRecommendations.userId, fixtureUser.id))
        .run();
      tx.delete(exerciseMuscleContributions)
        .where(eq(exerciseMuscleContributions.ownerUserId, fixtureUser.id))
        .run();
      tx.delete(adaptiveNutritionReviewActions)
        .where(eq(adaptiveNutritionReviewActions.userId, fixtureUser.id))
        .run();
      tx.delete(adaptiveNutritionReviews)
        .where(eq(adaptiveNutritionReviews.userId, fixtureUser.id))
        .run();
      tx.delete(adaptiveNutritionReviewContexts)
        .where(eq(adaptiveNutritionReviewContexts.userId, fixtureUser.id))
        .run();
      tx.delete(nutritionTargetEvents)
        .where(eq(nutritionTargetEvents.userId, fixtureUser.id))
        .run();
      tx.delete(nutritionTargets).where(eq(nutritionTargets.userId, fixtureUser.id)).run();
      tx.delete(adaptiveNutritionGoalCompletions)
        .where(eq(adaptiveNutritionGoalCompletions.userId, fixtureUser.id))
        .run();
      tx.delete(adaptiveNutritionCheckIns)
        .where(eq(adaptiveNutritionCheckIns.userId, fixtureUser.id))
        .run();
      tx.delete(adaptiveNutritionPrograms)
        .where(eq(adaptiveNutritionPrograms.userId, fixtureUser.id))
        .run();
      tx.delete(scheduledWorkouts).where(eq(scheduledWorkouts.userId, fixtureUser.id)).run();
      tx.delete(workoutSessions).where(eq(workoutSessions.userId, fixtureUser.id)).run();
      tx.delete(exercises).where(eq(exercises.userId, fixtureUser.id)).run();
      tx.delete(users).where(eq(users.id, fixtureUser.id)).run();
    });
  }
};

const seedEligibleHistory = (
  db: AdaptiveDatabase,
  userId: string,
  anchorDate: string,
  timestamp: number,
  goalWeight = false,
  weightSeries?: readonly number[],
) => {
  for (let offset = -21; offset <= -1; offset += 1) {
    const date = datePlus(anchorDate, offset);
    seedCompleteNutritionDay(db, userId, date, timestamp + offset);
  }
  const weights =
    weightSeries ??
    (goalWeight
      ? [81.25, 81.24, 81.23, 81.22, 81.21, 81.2, 81.2, 81.2]
      : [82, 81.95, 81.9, 81.85, 81.8, 81.75, 81.7, 81.65]);
  if (weights.length !== 8) throw new Error('Eligible history requires exactly eight weights');
  [-21, -18, -15, -12, -9, -6, -3, -1].forEach((offset, index) => {
    const date = datePlus(anchorDate, offset);
    const weightKg = weights[index];
    db.insert(bodyWeight)
      .values({
        id: `${userId}-weight-${date}`,
        userId,
        date,
        weight: poundsFromKg(weightKg),
        weightKg,
        unitAtEntry: 'kg',
        createdAt: timestamp + index,
        updatedAt: timestamp + index,
      })
      .onConflictDoUpdate({
        target: [bodyWeight.userId, bodyWeight.date],
        set: {
          weight: poundsFromKg(weightKg),
          weightKg,
          unitAtEntry: 'kg',
          updatedAt: timestamp + index,
        },
      })
      .run();
  });
};

export function seedAdaptiveTdeePreviewFixtures(options: {
  anchorDate: string;
  db: AdaptiveDatabase;
  now: Date;
  passwordHash: string;
  sqlite: Database.Database;
}): AdaptivePreviewFixtureRecord[] {
  const { anchorDate, db, passwordHash, sqlite } = options;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorDate)) {
    throw new Error('Preview fixture date must use YYYY-MM-DD');
  }
  cleanupExistingFixtures(db);
  let clock = options.now.getTime();
  const store = createAdaptiveNutritionStore({ db, sqlite, now: () => new Date(clock) });
  const reviewStore = createAdaptiveWeeklyReviewStore({ db, sqlite, now: () => new Date(clock) });
  const records = FIXTURES.map((fixture) => ({
    fixture: fixture.fixture,
    name: fixture.name,
    username: `${ADAPTIVE_PREVIEW_USERNAME_PREFIX}${fixture.usernameSuffix ?? fixture.fixture}`,
    userId: `${ADAPTIVE_PREVIEW_USER_ID_PREFIX}${fixture.idSuffix.padStart(12, '0')}`,
    expectedState: fixture.expectedState,
    note: fixture.note,
  }));
  db.insert(users)
    .values(
      records.map((record) => ({
        id: record.userId,
        username: record.username,
        name: record.name,
        passwordHash,
        weightUnit: 'lbs' as const,
        createdAt: clock,
        updatedAt: clock,
      })),
    )
    .run();

  const byName = new Map(records.map((record) => [record.fixture, record]));
  const record = (name: AdaptivePreviewFixtureName) => {
    const value = byName.get(name);
    if (!value) throw new Error(`Missing fixture definition: ${name}`);
    return value;
  };
  const createAndAcceptBaseline = (name: AdaptivePreviewFixtureName, input = programInput()) => {
    const fixture = record(name);
    store.upsertProgram(fixture.userId, input);
    clock += 1000;
    store.acceptCheckIn(fixture.userId, requirePendingId(store, fixture.userId), {
      replaceSameDateTarget: false,
    });
    clock += 1000;
    return fixture;
  };
  const createHistoricalBaseline = (name: AdaptivePreviewFixtureName, input = programInput()) => {
    const currentClock = clock;
    clock = currentClock - 21 * DAY_MS;
    const fixture = createAndAcceptBaseline(name, input);
    clock = currentClock + 1000;
    return fixture;
  };

  const seedProgressionWorkout = (name: AdaptivePreviewFixtureName, scheduledOffset = 1) => {
    const fixture = record(name);
    const exerciseId = `${fixture.userId}-incline-press`;
    const scheduledWorkoutId = `${fixture.userId}-scheduled`;
    const scheduledExerciseId = `${fixture.userId}-scheduled-exercise`;
    const sessionId = `${fixture.userId}-source-session`;
    db.insert(exercises)
      .values({
        id: exerciseId,
        userId: fixture.userId,
        name: 'Incline dumbbell press',
        muscleGroups: ['Chest', 'Triceps'],
        equipment: 'Dumbbells',
        category: 'compound',
        trackingType: 'weight_reps',
        tags: [],
        formCues: ['Keep shoulders set'],
        relatedExerciseIds: [],
        createdAt: clock,
        updatedAt: clock,
      })
      .run();
    db.insert(workoutSessions)
      .values({
        id: sessionId,
        userId: fixture.userId,
        scheduledWorkoutId: null,
        name: 'Upper body evidence',
        date: datePlus(anchorDate, -3),
        status: 'completed',
        startedAt: clock,
        completedAt: clock + 3_600_000,
        timeSegments: '[]',
        createdAt: clock,
        updatedAt: clock + 3_600_000,
      })
      .run();
    db.insert(sessionSets)
      .values(
        [1, 2].map((setNumber) => ({
          id: `${fixture.userId}-source-set-${setNumber}`,
          sessionId,
          exerciseId,
          orderIndex: setNumber - 1,
          setNumber,
          weight: 40,
          reps: 10,
          rpe: 8,
          targetWeight: 40,
          targetRepsMin: 8,
          targetRepsMax: 10,
          sourceScheduledSetId: `${fixture.userId}-planned-set-${setNumber}`,
          exerciseIdSnapshot: exerciseId,
          exerciseNameSnapshot: 'Incline dumbbell press',
          trackingTypeSnapshot: 'weight_reps' as const,
          completed: true,
          skipped: false,
          section: 'main' as const,
          createdAt: clock + setNumber,
        })),
      )
      .run();
    db.insert(scheduledWorkouts)
      .values({
        id: scheduledWorkoutId,
        userId: fixture.userId,
        templateId: null,
        date: datePlus(anchorDate, scheduledOffset),
        sessionId: null,
        createdAt: clock,
        updatedAt: clock,
      })
      .run();
    db.insert(scheduledWorkoutExercises)
      .values({
        id: scheduledExerciseId,
        scheduledWorkoutId,
        exerciseId,
        exerciseNameSnapshot: 'Incline dumbbell press',
        trackingTypeSnapshot: 'weight_reps',
        section: 'main',
        orderIndex: 0,
        programmingNotes: 'Use a controlled range of motion.',
        createdAt: clock,
        updatedAt: clock,
      })
      .run();
    db.insert(scheduledWorkoutExerciseSets)
      .values(
        [1, 2].map((setNumber) => ({
          id: `${fixture.userId}-planned-set-${setNumber}`,
          scheduledWorkoutExerciseId: scheduledExerciseId,
          setNumber,
          repsMin: 8,
          repsMax: 10,
          targetWeight: 40,
          createdAt: clock,
        })),
      )
      .run();
    const configurationId = `${fixture.userId}-progression-config`;
    db.insert(workoutProgressionConfigurations)
      .values({
        id: configurationId,
        userId: fixture.userId,
        scheduledWorkoutId,
        scheduledWorkoutExerciseId: scheduledExerciseId,
        revision: 1,
        snapshot: {
          id: configurationId,
          userId: fixture.userId,
          scheduledWorkoutId,
          scheduledWorkoutExerciseId: scheduledExerciseId,
          revision: 1,
          policy: {
            family: 'double_progression',
            version: 1,
            loadIncrement: 5,
            loadIncreasePercent: null,
            repRangeMin: 8,
            repRangeMax: 10,
            effortCeiling: 9,
            lowEffortThreshold: 6,
            secondsStep: null,
            distanceStep: null,
            zoneCeiling: null,
            allowReduction: true,
            contextRequired: true,
          },
          contextAvailability: 'available',
          contextFacts: [],
          priority: true,
          actorType: 'user',
          actorId: fixture.userId,
          actorLabel: 'Preview user',
          updatedAt: clock,
        },
        actorType: 'user',
        agentTokenId: null,
        actorLabel: 'Preview user',
        updatedAt: clock,
      })
      .run();
    clock += 1000;
    return { exerciseId, fixture, scheduledWorkoutId, sessionId };
  };

  const baseline = record('baseline');
  store.upsertProgram(baseline.userId, programInput());
  store.declineCheckIn(baseline.userId, requirePendingId(store, baseline.userId));
  clock += 1000;

  const learning = createAndAcceptBaseline('learning');
  [-2, -1, 0].forEach((offset) => {
    seedCompleteNutritionDay(db, learning.userId, datePlus(anchorDate, offset), clock + offset);
  });

  const updating = createAndAcceptBaseline('updating');
  seedEligibleHistory(db, updating.userId, anchorDate, clock);
  clock += 1000;

  const holding = createAndAcceptBaseline('holding');
  seedEligibleHistory(db, holding.userId, anchorDate, clock);
  const holdingPreview = store.previewCheckIn(holding.userId, {
    kind: 'manual',
    includeToday: false,
  });
  clock += 1000;
  store.acceptCheckIn(holding.userId, holdingPreview.id, { replaceSameDateTarget: true });
  db.delete(bodyWeight)
    .where(
      and(eq(bodyWeight.userId, holding.userId), gte(bodyWeight.date, datePlus(anchorDate, -8))),
    )
    .run();
  clock += 1000;

  const pending = createAndAcceptBaseline('pending');
  seedEligibleHistory(db, pending.userId, anchorDate, clock);
  const declined = store.previewCheckIn(pending.userId, { kind: 'manual', includeToday: false });
  store.declineCheckIn(pending.userId, declined.id);
  clock += 1000;
  store.previewCheckIn(pending.userId, { kind: 'manual', includeToday: false });
  clock += 1000;

  const goal = createHistoricalBaseline(
    'goal-reached',
    programInput({
      goalType: 'lose',
      targetWeightKg: 81.2,
      goalRatePctPerWeek: -0.5,
    }),
  );
  seedEligibleHistory(db, goal.userId, anchorDate, clock, true);
  store.previewCheckIn(goal.userId, { kind: 'manual', includeToday: false });

  const goalLoss = createHistoricalBaseline(
    'goal-loss',
    programInput({ goalType: 'lose', targetWeightKg: 75, goalRatePctPerWeek: -0.5 }),
  );
  seedEligibleHistory(db, goalLoss.userId, anchorDate, clock);
  clock += 1000;

  const analyticsPending = createAndAcceptBaseline('analytics-pending');
  seedEligibleHistory(db, analyticsPending.userId, anchorDate, clock);
  const analyticsDeclined = store.previewCheckIn(analyticsPending.userId, {
    kind: 'manual',
    includeToday: false,
  });
  store.declineCheckIn(analyticsPending.userId, analyticsDeclined.id);
  clock += 1000;
  store.previewCheckIn(analyticsPending.userId, { kind: 'manual', includeToday: false });
  clock += 1000;

  const analyticsGoalLoss = createHistoricalBaseline(
    'analytics-goal-loss',
    programInput({ goalType: 'lose', targetWeightKg: 75, goalRatePctPerWeek: -0.5 }),
  );
  seedEligibleHistory(db, analyticsGoalLoss.userId, anchorDate, clock);
  clock += 1000;

  const maintenance = createHistoricalBaseline('goal-maintenance');
  seedEligibleHistory(db, maintenance.userId, anchorDate, clock);
  clock += 1000;

  const edited = createHistoricalBaseline(
    'goal-edited',
    programInput({ goalType: 'lose', targetWeightKg: 75, goalRatePctPerWeek: -0.5 }),
  );
  seedEligibleHistory(db, edited.userId, anchorDate, clock);
  const editedCurrent = store.getCurrentGoal(edited.userId);
  const editedResult = store.editGoal(edited.userId, editedCurrent.goal.id, {
    type: 'lose',
    targetWeightKg: 76,
    maintenanceCenterKg: null,
    goalRatePctPerWeek: -0.4,
    expectedRevisionId: editedCurrent.latestRevision.id,
    supersedePendingRecommendation: false,
  });
  store.acceptCheckIn(edited.userId, editedResult.pendingGoalChange?.id ?? '', {
    replaceSameDateTarget: true,
  });
  clock += 1000;

  const trajectoryLoss = createHistoricalBaseline(
    'trajectory-loss',
    programInput({ goalType: 'lose', targetWeightKg: 75, goalRatePctPerWeek: -0.5 }),
  );
  seedEligibleHistory(db, trajectoryLoss.userId, anchorDate, clock);
  clock += 1000;

  const trajectoryMaintenance = createHistoricalBaseline('trajectory-maintenance');
  seedEligibleHistory(db, trajectoryMaintenance.userId, anchorDate, clock);
  clock += 1000;

  const trajectoryEdited = createHistoricalBaseline(
    'trajectory-edited',
    programInput({ goalType: 'lose', targetWeightKg: 75, goalRatePctPerWeek: -0.5 }),
  );
  seedEligibleHistory(db, trajectoryEdited.userId, anchorDate, clock);
  const trajectoryEditedCurrent = store.getCurrentGoal(trajectoryEdited.userId);
  const trajectoryEditedResult = store.editGoal(
    trajectoryEdited.userId,
    trajectoryEditedCurrent.goal.id,
    {
      type: 'lose',
      targetWeightKg: 76,
      maintenanceCenterKg: null,
      goalRatePctPerWeek: -0.4,
      expectedRevisionId: trajectoryEditedCurrent.latestRevision.id,
      supersedePendingRecommendation: false,
    },
  );
  store.acceptCheckIn(trajectoryEdited.userId, trajectoryEditedResult.pendingGoalChange?.id ?? '', {
    replaceSameDateTarget: true,
  });
  clock += 1000;

  const trajectoryReached = createHistoricalBaseline(
    'trajectory-reached',
    programInput({ goalType: 'lose', targetWeightKg: 81.2, goalRatePctPerWeek: -0.5 }),
  );
  seedEligibleHistory(db, trajectoryReached.userId, anchorDate, clock, true);
  store.previewCheckIn(trajectoryReached.userId, { kind: 'manual', includeToday: false });
  seedWeightDay(db, trajectoryReached.userId, anchorDate, 85, clock);
  clock += 1000;

  const trajectoryGain = createHistoricalBaseline(
    'trajectory-gain',
    programInput({ goalType: 'gain', targetWeightKg: 88, goalRatePctPerWeek: 0.25 }),
  );
  seedEligibleHistory(
    db,
    trajectoryGain.userId,
    anchorDate,
    clock,
    false,
    [82, 82.2, 82.4, 82.6, 82.8, 83, 83.2, 83.4],
  );
  clock += 1000;

  const trajectorySparse = createHistoricalBaseline(
    'trajectory-sparse',
    programInput({ goalType: 'lose', targetWeightKg: 75, goalRatePctPerWeek: -0.5 }),
  );
  db.delete(bodyWeight).where(eq(bodyWeight.userId, trajectorySparse.userId)).run();
  seedWeightDay(db, trajectorySparse.userId, datePlus(anchorDate, -7), 82, clock);
  seedWeightDay(db, trajectorySparse.userId, datePlus(anchorDate, -1), 81.8, clock + 1);
  clock += 1000;

  const shiftWeights = (userId: string, deltaKg: number) => {
    const entries = db.select().from(bodyWeight).where(eq(bodyWeight.userId, userId)).all();
    for (const entry of entries) {
      const weightKg = Number(entry.weightKg) + deltaKg;
      db.update(bodyWeight)
        .set({ weightKg, weight: poundsFromKg(weightKg) })
        .where(eq(bodyWeight.id, entry.id))
        .run();
    }
  };
  const trajectoryBelow = createHistoricalBaseline('trajectory-maintenance-below');
  seedEligibleHistory(db, trajectoryBelow.userId, anchorDate, clock);
  shiftWeights(trajectoryBelow.userId, -3);
  clock += 1000;

  const trajectoryAbove = createHistoricalBaseline('trajectory-maintenance-above');
  seedEligibleHistory(db, trajectoryAbove.userId, anchorDate, clock);
  shiftWeights(trajectoryAbove.userId, 3);
  clock += 1000;

  const trajectoryScaleOnly = createHistoricalBaseline(
    'trajectory-scale-only',
    programInput({ goalType: 'lose', targetWeightKg: 81.2, goalRatePctPerWeek: -0.5 }),
  );
  seedEligibleHistory(db, trajectoryScaleOnly.userId, anchorDate, clock);
  seedWeightDay(db, trajectoryScaleOnly.userId, anchorDate, 80, clock + 1);
  clock += 1000;

  const trajectoryHistorical = createHistoricalBaseline(
    'trajectory-historical',
    programInput({ goalType: 'lose', targetWeightKg: 75, goalRatePctPerWeek: -0.5 }),
  );
  seedEligibleHistory(db, trajectoryHistorical.userId, anchorDate, clock);
  const historicalReplacement = store.startGoal(trajectoryHistorical.userId, {
    type: 'gain',
    targetWeightKg: 88,
    maintenanceCenterKg: null,
    goalRatePctPerWeek: 0.25,
    supersedePendingRecommendation: false,
  });
  store.acceptCheckIn(
    trajectoryHistorical.userId,
    historicalReplacement.pendingGoalChange?.id ?? '',
    { replaceSameDateTarget: true },
  );
  clock += 1000;

  const history = createHistoricalBaseline(
    'goal-history',
    programInput({ goalType: 'lose', targetWeightKg: 75, goalRatePctPerWeek: -0.5 }),
  );
  seedEligibleHistory(db, history.userId, anchorDate, clock);
  const historyResult = store.startGoal(history.userId, {
    type: 'gain',
    targetWeightKg: 88,
    maintenanceCenterKg: null,
    goalRatePctPerWeek: 0.25,
    supersedePendingRecommendation: false,
  });
  store.acceptCheckIn(history.userId, historyResult.pendingGoalChange?.id ?? '', {
    replaceSameDateTarget: true,
  });
  for (let replacement = 0; replacement < 19; replacement += 1) {
    const nextIsLoss = replacement % 2 === 0;
    const next = store.startGoal(history.userId, {
      type: nextIsLoss ? 'lose' : 'gain',
      targetWeightKg: nextIsLoss ? 75 : 88,
      maintenanceCenterKg: null,
      goalRatePctPerWeek: nextIsLoss ? -0.5 : 0.25,
      supersedePendingRecommendation: false,
    });
    store.acceptCheckIn(history.userId, next.pendingGoalChange?.id ?? '', {
      replaceSameDateTarget: true,
    });
    clock += 1;
  }
  clock += 1000;

  const goalChange = createHistoricalBaseline(
    'goal-change-pending',
    programInput({ goalType: 'lose', targetWeightKg: 75, goalRatePctPerWeek: -0.5 }),
  );
  seedEligibleHistory(db, goalChange.userId, anchorDate, clock);
  const goalChangeCurrent = store.getCurrentGoal(goalChange.userId);
  store.editGoal(goalChange.userId, goalChangeCurrent.goal.id, {
    type: 'lose',
    targetWeightKg: 76,
    maintenanceCenterKg: null,
    goalRatePctPerWeek: -0.4,
    expectedRevisionId: goalChangeCurrent.latestRevision.id,
    supersedePendingRecommendation: false,
  });
  clock += 1000;

  const completion = createHistoricalBaseline(
    'completion-required',
    programInput({ goalType: 'lose', targetWeightKg: 81.2, goalRatePctPerWeek: -0.5 }),
  );
  seedEligibleHistory(db, completion.userId, anchorDate, clock, true);
  const completionPreview = store.previewCheckIn(completion.userId, {
    kind: 'manual',
    includeToday: false,
  });
  store.acceptCheckIn(completion.userId, completionPreview.id, { replaceSameDateTarget: true });

  const seedReviewReady = (
    name: AdaptivePreviewFixtureName,
    input: AdaptiveProgramMutation = programInput(),
  ) => {
    const fixture = createHistoricalBaseline(name, input);
    seedEligibleHistory(db, fixture.userId, anchorDate, clock);
    clock += 1000;
    return fixture;
  };

  const cleanLoss = seedReviewReady(
    'review-clean-loss',
    programInput({ goalType: 'lose', targetWeightKg: 75, goalRatePctPerWeek: -0.5 }),
  );
  reviewStore.preview(cleanLoss.userId, { kind: 'weekly' });

  const cleanGain = seedReviewReady(
    'review-clean-gain',
    programInput({ goalType: 'gain', targetWeightKg: 88, goalRatePctPerWeek: 0.25 }),
  );
  reviewStore.preview(cleanGain.userId, { kind: 'weekly' });

  const cleanMaintain = seedReviewReady('review-clean-maintain');
  reviewStore.preview(cleanMaintain.userId, { kind: 'weekly' });

  const lowDay = seedReviewReady('review-low-day');
  db.update(mealItems)
    .set({ calories: 550 })
    .where(eq(mealItems.id, `${lowDay.userId}-item-${datePlus(anchorDate, -3)}`))
    .run();
  reviewStore.preview(lowDay.userId, { kind: 'weekly' });

  const cutoff = seedReviewReady('review-cutoff');
  seedCompleteNutritionDay(db, cutoff.userId, anchorDate, clock);
  seedWeightDay(db, cutoff.userId, anchorDate, 81.6, clock);
  reviewStore.preview(cutoff.userId, { kind: 'weekly' });

  const illness = seedReviewReady('review-illness');
  reviewStore.createContext(
    illness.userId,
    {
      subject: { kind: 'date', localDate: datePlus(anchorDate, -2) },
      category: 'illness',
      note: 'Flu symptoms; intentionally rested and reduced training.',
      resolution: 'Context recorded; no redundant clarification needed.',
    },
    { type: 'agent_token', agentTokenId: 'preview-agent', label: 'Preview Coach' },
  );
  reviewStore.preview(illness.userId, { kind: 'weekly' });

  const loggingHold = seedReviewReady('review-holding');
  db.delete(nutritionLogs)
    .where(
      and(
        eq(nutritionLogs.userId, loggingHold.userId),
        gte(nutritionLogs.date, datePlus(anchorDate, -21)),
        lte(nutritionLogs.date, datePlus(anchorDate, -12)),
      ),
    )
    .run();
  reviewStore.preview(loggingHold.userId, { kind: 'weekly' });

  const stale = seedReviewReady('review-stale');
  reviewStore.preview(stale.userId, { kind: 'weekly' });

  const declineReview = seedReviewReady('review-decline');
  reviewStore.preview(declineReview.userId, { kind: 'weekly' });

  const deferReview = seedReviewReady('review-defer');
  reviewStore.preview(deferReview.userId, { kind: 'weekly' });

  const maximal = seedReviewReady('review-maximal');
  db.delete(nutritionLogs)
    .where(
      and(
        eq(nutritionLogs.userId, maximal.userId),
        gte(nutritionLogs.date, datePlus(anchorDate, -21)),
        lte(nutritionLogs.date, datePlus(anchorDate, -12)),
      ),
    )
    .run();
  seedCompleteNutritionDay(db, maximal.userId, anchorDate, clock);
  seedWeightDay(db, maximal.userId, anchorDate, 81.6, clock);
  reviewStore.createContext(
    maximal.userId,
    {
      subject: { kind: 'date_range', startDate: datePlus(anchorDate, -3), endDate: anchorDate },
      category: 'recovery',
      note: 'Recovery was intentionally reduced during an illness window.',
      resolution: 'Use as context only; quantitative records remain authoritative.',
    },
    { type: 'agent_token', agentTokenId: 'preview-agent', label: 'Preview Coach' },
  );
  reviewStore.preview(maximal.userId, { kind: 'weekly' });

  const adjustReview = seedReviewReady('review-adjust');
  db.update(mealItems)
    .set({ calories: 3000 })
    .where(like(mealItems.id, `${adjustReview.userId}-item-%`))
    .run();
  reviewStore.preview(adjustReview.userId, { kind: 'weekly' });

  const dataQuality = createHistoricalBaseline('data-quality-calendar');
  seedEligibleHistory(db, dataQuality.userId, anchorDate, clock);
  db.update(nutritionLogs)
    .set({ status: 'partial', statusUpdatedAt: clock + 1, updatedAt: clock + 1 })
    .where(
      and(
        eq(nutritionLogs.userId, dataQuality.userId),
        eq(nutritionLogs.date, datePlus(anchorDate, -4)),
      ),
    )
    .run();
  db.update(nutritionLogs)
    .set({ status: 'unknown', statusUpdatedAt: clock + 2, updatedAt: clock + 2 })
    .where(
      and(
        eq(nutritionLogs.userId, dataQuality.userId),
        eq(nutritionLogs.date, datePlus(anchorDate, -3)),
      ),
    )
    .run();
  db.delete(nutritionLogs)
    .where(
      and(
        eq(nutritionLogs.userId, dataQuality.userId),
        eq(nutritionLogs.date, datePlus(anchorDate, -2)),
      ),
    )
    .run();
  seedCompleteNutritionDay(db, dataQuality.userId, anchorDate, clock + 3);
  seedWeightDay(db, dataQuality.userId, anchorDate, 81.55, clock + 4);
  db.update(bodyWeight)
    .set({ weightKg: 81.5, weight: poundsFromKg(81.5), updatedAt: clock + 50 })
    .where(
      and(eq(bodyWeight.userId, dataQuality.userId), eq(bodyWeight.date, datePlus(anchorDate, -3))),
    )
    .run();
  db.insert(scheduledWorkouts)
    .values({
      id: `${dataQuality.userId}-schedule-${datePlus(anchorDate, -2)}`,
      userId: dataQuality.userId,
      templateId: null,
      date: datePlus(anchorDate, -2),
      createdAt: clock + 6,
      updatedAt: clock + 6,
    })
    .run();
  db.insert(workoutSessions)
    .values({
      id: `${dataQuality.userId}-session-${datePlus(anchorDate, -1)}`,
      userId: dataQuality.userId,
      scheduledWorkoutId: null,
      name: 'Cross-domain strength session',
      date: datePlus(anchorDate, -1),
      status: 'completed',
      startedAt: clock + 7,
      completedAt: clock + 8,
      updatedAt: clock + 9,
    })
    .run();
  reviewStore.createContext(
    dataQuality.userId,
    {
      subject: { kind: 'date', localDate: datePlus(anchorDate, -4) },
      category: 'illness',
      note: 'Migraine reduced appetite and changed the planned training day.',
      resolution: null,
    },
    { type: 'agent_token', agentTokenId: 'preview-agent', label: 'Preview Coach' },
  );
  clock += 1000;

  for (const name of [
    'progression-accept',
    'progression-edit',
    'progression-stale',
    'progression-agent',
  ] as const) {
    seedProgressionWorkout(name);
  }

  const muscle = seedProgressionWorkout('muscle-analytics', 0);
  db.insert(exerciseMuscleContributions)
    .values([
      {
        id: `${muscle.fixture.userId}-chest-primary`,
        exerciseId: muscle.exerciseId,
        ownerUserId: muscle.fixture.userId,
        revision: 1,
        muscle: 'Chest',
        role: 'primary',
        factor: 1,
        version: 1,
        effectiveAt: clock - 60 * DAY_MS,
        createdAt: clock,
      },
      {
        id: `${muscle.fixture.userId}-triceps-secondary`,
        exerciseId: muscle.exerciseId,
        ownerUserId: muscle.fixture.userId,
        revision: 1,
        muscle: 'Triceps',
        role: 'secondary',
        factor: 0.5,
        version: 1,
        effectiveAt: clock - 60 * DAY_MS,
        createdAt: clock,
      },
    ])
    .run();
  const previousSessionId = `${muscle.fixture.userId}-previous-session`;
  db.insert(workoutSessions)
    .values({
      id: previousSessionId,
      userId: muscle.fixture.userId,
      scheduledWorkoutId: null,
      name: 'Earlier upper body evidence',
      date: datePlus(anchorDate, -35),
      status: 'completed',
      startedAt: clock - 35 * DAY_MS,
      completedAt: clock - 35 * DAY_MS + 3_600_000,
      timeSegments: '[]',
      createdAt: clock - 35 * DAY_MS,
      updatedAt: clock - 35 * DAY_MS + 3_600_000,
    })
    .run();
  db.insert(sessionSets)
    .values({
      id: `${muscle.fixture.userId}-previous-set-1`,
      sessionId: previousSessionId,
      exerciseId: muscle.exerciseId,
      orderIndex: 0,
      setNumber: 1,
      weight: 35,
      reps: 10,
      rpe: 8,
      completed: true,
      skipped: false,
      section: 'main',
      createdAt: clock - 35 * DAY_MS,
    })
    .run();
  clock += 1000;

  for (const fixture of records) {
    const state = store.getState(fixture.userId);
    if (state.state !== fixture.expectedState) {
      throw new Error(
        `${fixture.fixture} fixture expected ${fixture.expectedState}, received ${state.state}`,
      );
    }
  }
  const goalPending = store.getState(goal.userId).pendingCheckIn;
  if (!goalPending?.reasonCodes.includes('GOAL_REACHED')) {
    throw new Error('Goal-reached fixture did not produce the GOAL_REACHED reason');
  }
  return records;
}

const dateKeyInDetroit = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Detroit',
    year: 'numeric',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
};

export const resolveAdaptivePreviewSeedNow = (anchorDate: string, current: Date) => {
  if (anchorDate !== dateKeyInDetroit(current)) {
    return new Date(`${anchorDate}T16:00:00.000Z`);
  }
  const buffered = new Date(current.getTime() - 60_000);
  return dateKeyInDetroit(buffered) === anchorDate ? buffered : current;
};

const parseArguments = (args: string[]) => {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--') continue;
    if (!argument.startsWith('--')) throw new Error(`Unexpected argument: ${argument}`);
    const [key, inlineValue] = argument.split('=', 2);
    const value = inlineValue ?? args[++index];
    if (!value || value.startsWith('--')) throw new Error(`${key} requires a value`);
    values.set(key, value);
  }
  return {
    anchorDate: values.get('--date') ?? dateKeyInDetroit(new Date()),
    databasePath: values.get('--database'),
  };
};

const resolveFromInvocation = (path: string) =>
  isAbsolute(path) ? path : resolve(process.env.INIT_CWD ?? process.cwd(), path);

export async function runAdaptiveTdeePreviewSeedCli(args: string[]) {
  const repoRoot = resolve(import.meta.dirname, '../../../..');
  const expectedPath = resolve(repoRoot, 'apps/api/data/pulse-tdee-dev.db');
  const parsed = parseArguments(args);
  const databasePath = resolveFromInvocation(parsed.databasePath ?? expectedPath);
  if (databasePath !== expectedPath) {
    throw new Error('Preview seeding is restricted to apps/api/data/pulse-tdee-dev.db');
  }
  const stat = lstatSync(databasePath);
  if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(databasePath) !== expectedPath) {
    throw new Error('Preview database must be the regular, non-symlink Gate 0 database');
  }
  process.env.DATABASE_URL = expectedPath;
  const [{ db, sqlite }, passwordHash] = await Promise.all([
    import('../db/index.js'),
    bcrypt.hash(ADAPTIVE_PREVIEW_PASSWORD, 4),
  ]);
  const records = seedAdaptiveTdeePreviewFixtures({
    anchorDate: parsed.anchorDate,
    db,
    now: resolveAdaptivePreviewSeedNow(parsed.anchorDate, new Date()),
    passwordHash,
    sqlite,
  });
  console.log(
    JSON.stringify(
      {
        database: 'apps/api/data/pulse-tdee-dev.db',
        date: parsed.anchorDate,
        password: ADAPTIVE_PREVIEW_PASSWORD,
        users: records,
      },
      null,
      2,
    ),
  );
  sqlite.close();
  return records;
}

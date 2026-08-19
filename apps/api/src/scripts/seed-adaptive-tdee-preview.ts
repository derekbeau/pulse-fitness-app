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
  mealItems,
  meals,
  nutritionLogs,
  nutritionTargets,
  users,
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
  | 'review-adjust';

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
      tx.delete(adaptiveNutritionReviewActions)
        .where(eq(adaptiveNutritionReviewActions.userId, fixtureUser.id))
        .run();
      tx.delete(adaptiveNutritionReviews)
        .where(eq(adaptiveNutritionReviews.userId, fixtureUser.id))
        .run();
      tx.delete(adaptiveNutritionReviewContexts)
        .where(eq(adaptiveNutritionReviewContexts.userId, fixtureUser.id))
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
) => {
  for (let offset = -21; offset <= -1; offset += 1) {
    const date = datePlus(anchorDate, offset);
    seedCompleteNutritionDay(db, userId, date, timestamp + offset);
  }
  const weights = goalWeight
    ? [81.25, 81.24, 81.23, 81.22, 81.21, 81.2, 81.2, 81.2]
    : [82, 81.95, 81.9, 81.85, 81.8, 81.75, 81.7, 81.65];
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

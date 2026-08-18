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
import { createAdaptiveGoalReadStore } from '../routes/adaptive-nutrition/goal-store.js';

import {
  ADAPTIVE_PREVIEW_USERNAME_PREFIX,
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
    });
    for (const fixture of first) {
      expect(store.getState(fixture.userId).state).toBe(fixture.expectedState);
    }
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

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { count, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { AdaptiveProgramMutation, AdaptiveReviewContext } from '@pulse/shared';

import * as schema from '../../db/schema/index.js';
import {
  adaptiveNutritionReviewActions,
  adaptiveNutritionReviewContexts,
  adaptiveNutritionReviews,
  adaptiveNutritionCheckIns,
  bodyWeight,
  exercises,
  mealItems,
  meals,
  nutritionLogs,
  nutritionTargets,
  sessionSets,
  users,
  workoutSessions,
} from '../../db/schema/index.js';
import { createAdaptiveNutritionStore } from './store.js';
import {
  AdaptiveReviewContextNotFoundError,
  AdaptiveReviewProposalInvalidError,
  AdaptiveReviewRefreshNotAllowedError,
  AdaptiveReviewStaleError,
  createAdaptiveWeeklyReviewStore,
  matchLowDayResolutionContext,
  selectReviewLowDayCandidates,
} from './review-store.js';
import { AdaptiveSameDateTargetExistsError } from './store.js';

type TestDatabase = ReturnType<typeof drizzle<typeof schema>>;

let tempDir = '';
let sqlite: Database.Database;
let db: TestDatabase;
let nowMs = Date.parse('2026-08-19T16:00:00.000Z');

const migrationsFolder = fileURLToPath(new URL('../../../drizzle', import.meta.url));

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
  manualBaselineTdeeKcal: 2500,
  goalType: 'maintain',
  targetWeightKg: null,
  goalRatePctPerWeek: 0,
  proteinGrams: 180,
  fatAllocationPct: 30,
  currentWeight: { weight: 80, unit: 'kg' },
  rebaseline: false,
  supersedePending: false,
});

const seedNutrition = (
  userId: string,
  date: string,
  calories = 2500,
  status: 'complete' | 'partial' | 'unknown' = 'complete',
) => {
  const logId = `${userId}-log-${date}`;
  const mealId = `${userId}-meal-${date}`;
  db.insert(nutritionLogs)
    .values({ id: logId, userId, date, status, statusUpdatedAt: nowMs, updatedAt: nowMs })
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

const seedWeight = (userId: string, date: string, weightKg = 80) =>
  db
    .insert(bodyWeight)
    .values({
      id: `${userId}-weight-${date}`,
      userId,
      date,
      weight: weightKg / 0.45359237,
      weightKg,
      unitAtEntry: 'kg',
      updatedAt: nowMs,
    })
    .run();

const seedTrainingSession = (input: {
  id: string;
  date: string;
  exerciseId: string;
  volume: number;
  updatedAt: number;
  completedAt?: number;
  lowRecovery?: boolean;
}) => {
  const completedAt = input.completedAt ?? input.updatedAt;
  db.insert(exercises)
    .values({
      id: input.exerciseId,
      userId: 'user-1',
      name: input.exerciseId,
      muscleGroups: ['full_body'],
      equipment: 'barbell',
      category: 'compound',
      trackingType: 'weight_reps',
    })
    .onConflictDoNothing()
    .run();
  db.insert(workoutSessions)
    .values({
      id: input.id,
      userId: 'user-1',
      name: 'Training session',
      date: input.date,
      status: 'completed',
      startedAt: completedAt - 60_000,
      completedAt,
      feedback: input.lowRecovery ? JSON.stringify({ energy: 3, recovery: 2, technique: 4 }) : null,
      updatedAt: input.updatedAt,
    })
    .run();
  db.insert(sessionSets)
    .values({
      id: `${input.id}-set`,
      sessionId: input.id,
      exerciseId: input.exerciseId,
      setNumber: 1,
      weight: input.volume / 10,
      reps: 10,
      completed: true,
    })
    .run();
};

const seedEligibleProgram = (
  userId = 'user-1',
  overrides: Partial<AdaptiveProgramMutation> = {},
) => {
  nowMs = Date.parse('2026-07-20T16:00:00.000Z');
  const lifecycle = createAdaptiveNutritionStore({ db, sqlite, now: () => new Date(nowMs) });
  lifecycle.upsertProgram(userId, { ...programInput(), ...overrides });
  const baseline = lifecycle.getState(userId).pendingCheckIn;
  if (!baseline) throw new Error('Expected baseline check-in');
  lifecycle.acceptCheckIn(userId, baseline.id, { replaceSameDateTarget: false });
  nowMs = Date.parse('2026-08-19T16:00:00.000Z');
  for (let offset = 0; offset < 21; offset += 1) {
    seedNutrition(userId, datePlus('2026-07-29', offset));
  }
  for (const date of ['2026-07-29', '2026-08-05', '2026-08-12', '2026-08-18']) {
    seedWeight(userId, date);
  }
  return lifecycle;
};

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'pulse-weekly-review-'));
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
    DELETE FROM adaptive_nutrition_review_actions;
    DELETE FROM adaptive_nutrition_reviews;
    DELETE FROM adaptive_nutrition_review_contexts;
    DELETE FROM nutrition_targets;
    DELETE FROM adaptive_nutrition_checkins;
    DELETE FROM adaptive_nutrition_programs;
    DELETE FROM users;
  `);
  db.insert(users)
    .values([
      { id: 'user-1', username: 'review-one', passwordHash: 'hash', weightUnit: 'lbs' },
      { id: 'user-2', username: 'review-two', passwordHash: 'hash', weightUnit: 'kg' },
    ])
    .run();
  nowMs = Date.parse('2026-08-19T16:00:00.000Z');
});

describe('adaptive weekly review store', () => {
  it('creates an immutable clean review with only Outcome and Recommendation', () => {
    seedEligibleProgram();
    const store = createAdaptiveWeeklyReviewStore({ db, sqlite, now: () => new Date(nowMs) });

    const review = store.preview('user-1', { kind: 'weekly' });

    expect(review.snapshot.modules.map((module) => module.kind)).toEqual([
      'outcome',
      'recommendation',
    ]);
    expect(review.snapshot.modules.at(-1)).toMatchObject({ outcome: 'keep' });
    expect(review.availableActions).toEqual(['accept', 'defer', 'decline', 'ask_agent']);
    expect(store.preview('user-1', { kind: 'weekly' }).id).toBe(review.id);
    expect(db.select({ value: count() }).from(adaptiveNutritionReviews).get()?.value).toBe(1);
  });

  it('flags an unusually low complete day for clarification without changing eligibility', () => {
    seedEligibleProgram();
    db.update(mealItems)
      .set({ calories: 600 })
      .where(eq(mealItems.id, 'user-1-item-2026-08-15'))
      .run();
    const store = createAdaptiveWeeklyReviewStore({ db, sqlite, now: () => new Date(nowMs) });

    const review = store.preview('user-1', { kind: 'weekly' });
    const quality = review.snapshot.modules[0];

    expect(quality).toMatchObject({
      kind: 'data_quality',
      requiresClarification: true,
    });
    expect(quality.kind === 'data_quality' ? quality.evidence : []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          localDate: '2026-08-15',
          state: 'logged',
          reasonCodes: ['LIKELY_PARTIAL_NUTRITION'],
        }),
      ]),
    );
    const recommendation = review.snapshot.modules.at(-1);
    expect(recommendation).toMatchObject({ outcome: 'clarify' });
    expect(
      recommendation?.kind === 'recommendation'
        ? recommendation.causalBreakdown.includedNutritionDates
        : [],
    ).toContain('2026-08-15');
  });

  it.each([
    [
      'nutrition log',
      { kind: 'nutrition_log' as const, id: 'user-1-log-2026-08-15' },
      'nutrition_exception' as const,
    ],
    ['local date', { kind: 'date' as const, localDate: '2026-08-15' }, 'illness' as const],
    [
      'local date recovery',
      { kind: 'date' as const, localDate: '2026-08-15' },
      'recovery' as const,
    ],
    [
      'date range starting on the low day',
      { kind: 'date_range' as const, startDate: '2026-08-15', endDate: '2026-08-17' },
      'illness' as const,
    ],
    [
      'date range spanning the low day',
      { kind: 'date_range' as const, startDate: '2026-08-14', endDate: '2026-08-16' },
      'recovery' as const,
    ],
    [
      'date range ending on the low day',
      { kind: 'date_range' as const, startDate: '2026-08-13', endDate: '2026-08-15' },
      'nutrition_exception' as const,
    ],
  ])(
    'uses resolved %s context to avoid a redundant low-day clarification',
    (_, subject, category) => {
      seedEligibleProgram();
      db.update(mealItems)
        .set({ calories: 600 })
        .where(eq(mealItems.id, 'user-1-item-2026-08-15'))
        .run();
      const store = createAdaptiveWeeklyReviewStore({ db, sqlite, now: () => new Date(nowMs) });
      store.createContext(
        'user-1',
        {
          subject,
          category,
          note: 'Matching context is present, but completeness remains unresolved.',
          resolution: null,
        },
        { type: 'user', label: 'You' },
      );
      const context = store.createContext(
        'user-1',
        {
          subject,
          category,
          note: 'The low intake was intentional during recovery.',
          resolution: 'Low intake was intentional and the log is complete.',
          resolutionKind: 'nutrition_complete',
        },
        { type: 'agent_token', agentTokenId: 'agent-1', label: 'Coach' },
      );

      const review = store.preview('user-1', { kind: 'weekly' });
      const quality = review.snapshot.modules.find((module) => module.kind === 'data_quality');

      expect(quality).toMatchObject({ kind: 'data_quality', requiresClarification: false });
      expect(quality?.kind === 'data_quality' ? quality.evidence : []).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            localDate: '2026-08-15',
            reasonCodes: ['LIKELY_PARTIAL_NUTRITION'],
            resolution: 'Low intake was intentional and the log is complete.',
          }),
        ]),
      );
      expect(review.snapshot.modules.at(-1)).not.toMatchObject({ outcome: 'clarify' });
      expect(review.snapshot.contexts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: context.id,
            revision: 1,
            provenance: expect.objectContaining({ agentTokenId: 'agent-1', label: 'Coach' }),
          }),
        ]),
      );
    },
  );

  it('ranks competing low-day context deterministically', () => {
    const context = (
      id: string,
      subject: AdaptiveReviewContext['subject'],
      updatedAt: number,
      resolutionKind: AdaptiveReviewContext['resolutionKind'] = 'nutrition_complete',
    ): AdaptiveReviewContext => ({
      id,
      subject,
      category: 'illness',
      note: id,
      resolution: 'The nutrition log is complete.',
      resolutionKind,
      provenance: { type: 'user', agentTokenId: null, label: 'You' },
      revision: 1,
      createdAt: 1,
      updatedAt,
      deletedAt: null,
    });
    const day = { id: 'low-log', date: '2026-08-15' };
    const wide = context(
      'range-wide',
      { kind: 'date_range', startDate: '2026-08-10', endDate: '2026-08-20' },
      50,
    );
    const narrow = context(
      'range-narrow',
      { kind: 'date_range', startDate: '2026-08-14', endDate: '2026-08-16' },
      10,
    );
    const exactDate = context('date', { kind: 'date', localDate: day.date }, 5);
    const exactLog = context('log', { kind: 'nutrition_log', id: day.id }, 1);
    const unresolvedLog = context(
      'unresolved-log',
      { kind: 'nutrition_log', id: day.id },
      100,
      null,
    );

    expect(
      matchLowDayResolutionContext([unresolvedLog, wide, narrow, exactDate, exactLog], day)?.id,
    ).toBe('log');
    expect(matchLowDayResolutionContext([wide, narrow, exactDate], day)?.id).toBe('date');
    expect(matchLowDayResolutionContext([wide, narrow], day)?.id).toBe('range-narrow');

    const newer = context(
      'range-newer',
      { kind: 'date_range', startDate: '2026-08-14', endDate: '2026-08-16' },
      20,
    );
    expect(matchLowDayResolutionContext([narrow, newer], day)?.id).toBe('range-newer');
    const idA = context(
      'a-range',
      { kind: 'date_range', startDate: '2026-08-14', endDate: '2026-08-16' },
      20,
    );
    const idZ = context(
      'z-range',
      { kind: 'date_range', startDate: '2026-08-14', endDate: '2026-08-16' },
      20,
    );
    expect(matchLowDayResolutionContext([idZ, idA], day)?.id).toBe('a-range');
  });

  it('uses context only for clarification while preserving quantitative review truth', () => {
    seedEligibleProgram();
    db.update(mealItems)
      .set({ calories: 600 })
      .where(eq(mealItems.id, 'user-1-item-2026-08-15'))
      .run();
    const store = createAdaptiveWeeklyReviewStore({ db, sqlite, now: () => new Date(nowMs) });
    const lifecycle = createAdaptiveNutritionStore({ db, sqlite, now: () => new Date(nowMs) });
    const unresolved = store.preview('user-1', { kind: 'weekly' });
    const unresolvedRecommendation = unresolved.snapshot.modules.find(
      (module) => module.kind === 'recommendation',
    );
    const calculationBefore = lifecycle.findCheckInDetail(
      'user-1',
      unresolved.checkInId,
    )?.calculationSnapshot;
    const targetBefore = db.select().from(nutritionTargets).all();
    const nutritionBefore = db
      .select()
      .from(nutritionLogs)
      .where(eq(nutritionLogs.id, 'user-1-log-2026-08-15'))
      .get();

    store.createContext(
      'user-1',
      {
        subject: { kind: 'date', localDate: '2026-08-15' },
        category: 'illness',
        note: 'The low day was intentional while ill.',
        resolution: 'Low intake was intentional and the log is complete.',
        resolutionKind: 'nutrition_complete',
      },
      { type: 'user', label: 'You' },
    );
    expect(store.get('user-1', unresolved.id).state).toBe('stale');
    const resolved = store.refresh('user-1', unresolved.id);
    const resolvedRecommendation = resolved.snapshot.modules.find(
      (module) => module.kind === 'recommendation',
    );

    expect(resolved.checkInId).toBe(unresolved.checkInId);
    expect(
      resolvedRecommendation?.kind === 'recommendation'
        ? resolvedRecommendation.causalBreakdown
        : null,
    ).toEqual(
      unresolvedRecommendation?.kind === 'recommendation'
        ? unresolvedRecommendation.causalBreakdown
        : null,
    );
    expect(lifecycle.findCheckInDetail('user-1', resolved.checkInId)?.calculationSnapshot).toEqual(
      calculationBefore,
    );
    expect(db.select().from(nutritionTargets).all()).toEqual(targetBefore);
    expect(
      db.select().from(nutritionLogs).where(eq(nutritionLogs.id, 'user-1-log-2026-08-15')).get(),
    ).toEqual(nutritionBefore);
  });

  it('does not let unrelated, unresolved, or deleted context suppress a low-day clarification', () => {
    seedEligibleProgram();
    db.update(mealItems)
      .set({ calories: 600 })
      .where(eq(mealItems.id, 'user-1-item-2026-08-15'))
      .run();
    const store = createAdaptiveWeeklyReviewStore({ db, sqlite, now: () => new Date(nowMs) });
    const actor = { type: 'user' as const, label: 'You' };
    store.createContext(
      'user-1',
      {
        subject: { kind: 'date', localDate: '2026-08-14' },
        category: 'illness',
        note: 'Resolved illness on another day.',
        resolution: 'The other day is complete.',
      },
      actor,
    );
    store.createContext(
      'user-1',
      {
        subject: { kind: 'date_range', startDate: '2026-08-12', endDate: '2026-08-14' },
        category: 'recovery',
        note: 'Resolved recovery range that does not overlap.',
        resolution: 'Those dates are complete.',
      },
      actor,
    );
    for (const category of [
      'pain_injury',
      'travel',
      'training_change',
      'schedule_change',
      'clarification',
      'other',
    ] as const) {
      store.createContext(
        'user-1',
        {
          subject: { kind: 'date', localDate: '2026-08-15' },
          category,
          note: `Resolved ${category} context does not answer nutrition completeness.`,
          resolution: 'This unrelated context is resolved.',
          resolutionKind: 'nutrition_complete',
        },
        actor,
      );
    }
    store.createContext(
      'user-1',
      {
        subject: { kind: 'nutrition_log', id: 'user-1-log-2026-08-14' },
        category: 'nutrition_exception',
        note: 'A different owned nutrition log was confirmed.',
        resolution: 'The other nutrition log is complete.',
        resolutionKind: 'nutrition_complete',
      },
      actor,
    );
    store.createContext(
      'user-1',
      {
        subject: { kind: 'date', localDate: '2026-08-15' },
        category: 'illness',
        note: 'Illness is confirmed, but nutrition completeness remains unknown.',
        resolution: 'Illness confirmed; follow up about nutrition completeness.',
      },
      actor,
    );
    store.createContext(
      'user-1',
      {
        subject: { kind: 'date', localDate: '2026-08-15' },
        category: 'illness',
        note: 'Illness may explain the low intake, but completeness is unresolved.',
        resolution: null,
      },
      actor,
    );
    const deleted = store.createContext(
      'user-1',
      {
        subject: { kind: 'nutrition_log', id: 'user-1-log-2026-08-15' },
        category: 'nutrition_exception',
        note: 'This context will be deleted.',
        resolution: 'The log is complete.',
        resolutionKind: 'nutrition_complete',
      },
      actor,
    );
    store.deleteContext('user-1', deleted.id, deleted.revision, actor);

    const review = store.preview('user-1', { kind: 'weekly' });
    const quality = review.snapshot.modules.find((module) => module.kind === 'data_quality');

    expect(quality).toMatchObject({ kind: 'data_quality', requiresClarification: true });
    expect(quality?.kind === 'data_quality' ? quality.evidence : []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          localDate: '2026-08-15',
          reasonCodes: ['LIKELY_PARTIAL_NUTRITION'],
          resolution: null,
        }),
      ]),
    );
    expect(review.snapshot.modules.at(-1)).toMatchObject({ outcome: 'clarify' });
    expect(review.snapshot.contexts.map((context) => context.id)).not.toContain(deleted.id);
  });

  it('makes matched context edits and deletion stale, then refreshes deterministically', () => {
    seedEligibleProgram();
    db.update(mealItems)
      .set({ calories: 600 })
      .where(eq(mealItems.id, 'user-1-item-2026-08-15'))
      .run();
    const store = createAdaptiveWeeklyReviewStore({ db, sqlite, now: () => new Date(nowMs) });
    const actor = { type: 'user' as const, label: 'You' };
    const context = store.createContext(
      'user-1',
      {
        subject: { kind: 'date', localDate: '2026-08-15' },
        category: 'illness',
        note: 'Low intake during illness.',
        resolution: 'Low intake was intentional and the log is complete.',
        resolutionKind: 'nutrition_complete',
      },
      actor,
    );
    const resolved = store.preview('user-1', { kind: 'weekly' });
    expect(resolved.snapshot.modules.at(-1)).not.toMatchObject({ outcome: 'clarify' });

    const unrelated = store.updateContext(
      'user-1',
      context.id,
      { expectedRevision: 1, category: 'training_change' },
      actor,
    );
    expect(store.get('user-1', resolved.id).state).toBe('stale');
    const clarified = store.refresh('user-1', resolved.id);
    expect(clarified.snapshot.modules.at(-1)).toMatchObject({ outcome: 'clarify' });

    const relevant = store.updateContext(
      'user-1',
      context.id,
      { expectedRevision: unrelated.revision, category: 'recovery' },
      actor,
    );
    expect(store.get('user-1', clarified.id).state).toBe('stale');
    const resolvedAgain = store.refresh('user-1', clarified.id);
    expect(resolvedAgain.snapshot.modules.at(-1)).not.toMatchObject({ outcome: 'clarify' });

    store.deleteContext('user-1', context.id, relevant.revision, actor);
    expect(store.get('user-1', resolvedAgain.id).state).toBe('stale');
    const clarifiedAgain = store.refresh('user-1', resolvedAgain.id);
    expect(new Set([resolved.id, clarified.id, resolvedAgain.id, clarifiedAgain.id]).size).toBe(4);
    expect(clarifiedAgain.state).toBe('pending');
    expect(store.getPending('user-1')?.id).toBe(clarifiedAgain.id);
    expect(store.get('user-1', resolvedAgain.id).state).toBe('superseded');
    expect(clarifiedAgain.snapshot.modules.at(-1)).toMatchObject({ outcome: 'clarify' });
    expect(clarifiedAgain.snapshot.contexts.map((item) => item.id)).not.toContain(context.id);
  });

  it('bounds low-day anomaly detection to the declared review window', () => {
    seedEligibleProgram();
    seedNutrition('user-1', '2026-07-28', 300);
    const store = createAdaptiveWeeklyReviewStore({ db, sqlite, now: () => new Date(nowMs) });

    const outside = store.preview('user-1', { kind: 'weekly' });
    expect(outside.snapshot.analysisStart).toBe('2026-07-29');
    expect(outside.snapshot.modules.at(-1)).not.toMatchObject({ outcome: 'clarify' });
    expect(
      outside.snapshot.modules.flatMap((module) =>
        module.kind === 'data_quality' ? module.evidence : [],
      ),
    ).not.toEqual(expect.arrayContaining([expect.objectContaining({ localDate: '2026-07-28' })]));

    db.update(mealItems)
      .set({ calories: 300 })
      .where(eq(mealItems.id, 'user-1-item-2026-07-29'))
      .run();
    const staleOutside = store.get('user-1', outside.id);
    expect(staleOutside.state).toBe('stale');
    const boundary = store.refresh('user-1', outside.id);
    expect(boundary.snapshot.modules.at(-1)).toMatchObject({ outcome: 'clarify' });
    expect(
      boundary.snapshot.modules.flatMap((module) =>
        module.kind === 'data_quality' ? module.evidence : [],
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          localDate: boundary.snapshot.analysisStart,
          reasonCodes: ['LIKELY_PARTIAL_NUTRITION'],
        }),
      ]),
    );
  });

  it('selects low-day anomalies only from usable dates inside inclusive review bounds', () => {
    const day = (id: string, date: string, calories: number) => ({
      id,
      date,
      calories,
      itemCount: 1,
      status: 'complete',
    });
    const normalMiddle = day('middle', '2026-08-02', 2500);
    const normalEnd = day('end', '2026-08-03', 2500);
    const outsideLow = day('before', '2026-07-31', 300);
    const pendingLow = day('pending', '2026-08-04', 300);
    const usable = new Set(['before', 'start', 'middle', 'end', 'pending']);

    expect(
      selectReviewLowDayCandidates({
        days: [outsideLow, day('start', '2026-08-01', 2500), normalMiddle, normalEnd, pendingLow],
        analysisStart: '2026-08-01',
        analysisEnd: '2026-08-03',
        usableNutritionIds: usable,
      }),
    ).toEqual([]);
    expect(
      selectReviewLowDayCandidates({
        days: [day('start', '2026-08-01', 300), normalMiddle, normalEnd],
        analysisStart: '2026-08-01',
        analysisEnd: '2026-08-03',
        usableNutritionIds: usable,
      }).map((candidate) => candidate.id),
    ).toEqual(['start']);
    expect(
      selectReviewLowDayCandidates({
        days: [day('start', '2026-08-01', 2500), normalMiddle, day('end', '2026-08-03', 300)],
        analysisStart: '2026-08-01',
        analysisEnd: '2026-08-03',
        usableNutritionIds: usable,
      }).map((candidate) => candidate.id),
    ).toEqual(['end']);
    expect(
      selectReviewLowDayCandidates({
        days: [day('start', '2026-08-01', 300), normalMiddle, normalEnd],
        analysisStart: '2026-08-01',
        analysisEnd: '2026-08-03',
        usableNutritionIds: new Set(['middle', 'end']),
      }),
    ).toEqual([]);
  });

  it('limits low-day clarification to canonical Trend Weight overlap', () => {
    seedEligibleProgram();
    sqlite
      .prepare("DELETE FROM body_weight WHERE user_id = 'user-1' AND date < '2026-08-05'")
      .run();
    seedWeight('user-1', '2026-08-04');
    db.update(mealItems)
      .set({ calories: 300 })
      .where(eq(mealItems.id, 'user-1-item-2026-07-29'))
      .run();
    const store = createAdaptiveWeeklyReviewStore({ db, sqlite, now: () => new Date(nowMs) });

    const beforeTrend = store.preview('user-1', { kind: 'weekly' });
    expect(beforeTrend.snapshot.analysisStart).toBe('2026-07-29');
    expect(
      beforeTrend.snapshot.modules.flatMap((module) =>
        module.kind === 'data_quality' ? module.evidence : [],
      ),
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          localDate: '2026-07-29',
          reasonCodes: ['LIKELY_PARTIAL_NUTRITION'],
        }),
      ]),
    );

    db.update(mealItems)
      .set({ calories: 2500 })
      .where(eq(mealItems.id, 'user-1-item-2026-07-29'))
      .run();
    db.update(mealItems)
      .set({ calories: 300 })
      .where(eq(mealItems.id, 'user-1-item-2026-08-04'))
      .run();
    expect(store.get('user-1', beforeTrend.id).state).toBe('stale');
    const firstOverlap = store.refresh('user-1', beforeTrend.id);
    expect(firstOverlap.snapshot.modules.at(-1)).toMatchObject({ outcome: 'clarify' });
    expect(
      firstOverlap.snapshot.modules.flatMap((module) =>
        module.kind === 'data_quality' ? module.evidence : [],
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          localDate: '2026-08-04',
          reasonCodes: ['LIKELY_PARTIAL_NUTRITION'],
        }),
      ]),
    );
  });

  it('snapshots illness context and training facts without changing nutrition causality', () => {
    seedEligibleProgram();
    const store = createAdaptiveWeeklyReviewStore({ db, sqlite, now: () => new Date(nowMs) });
    const context = store.createContext(
      'user-1',
      {
        subject: { kind: 'date', localDate: '2026-08-16' },
        category: 'illness',
        note: 'Flu symptoms; intentionally rested.',
        resolution: 'No follow-up question needed.',
      },
      { type: 'agent_token', agentTokenId: 'agent-1', label: 'Coach' },
    );

    const review = store.preview('user-1', { kind: 'weekly' });
    const training = review.snapshot.modules.find((module) => module.kind === 'training_recovery');

    expect(review.snapshot.contexts).toEqual([
      expect.objectContaining({
        id: context.id,
        provenance: expect.objectContaining({ label: 'Coach' }),
      }),
    ]);
    expect(training).toMatchObject({
      painOrIllnessPresent: true,
      nutritionCausalRuleApplied: false,
    });
  });

  it('blocks a stale material decision atomically after source correction', () => {
    seedEligibleProgram();
    const store = createAdaptiveWeeklyReviewStore({ db, sqlite, now: () => new Date(nowMs) });
    const review = store.preview('user-1', { kind: 'weekly' });
    const targetsBefore = db.select({ value: count() }).from(nutritionTargets).get()?.value;
    db.update(nutritionLogs)
      .set({ updatedAt: nowMs + 1 })
      .where(eq(nutritionLogs.id, 'user-1-log-2026-08-15'))
      .run();

    expect(store.get('user-1', review.id)).toMatchObject({
      state: 'stale',
      availableActions: [],
    });

    expect(() =>
      store.act(
        'user-1',
        review.id,
        {
          type: 'accept',
          expectedFingerprint: review.sourceFingerprint,
          expectedActionSequence: 0,
        },
        { type: 'user', label: 'You' },
      ),
    ).toThrow(AdaptiveReviewStaleError);
    expect(db.select({ value: count() }).from(nutritionTargets).get()?.value).toBe(targetsBefore);
    expect(db.select({ value: count() }).from(adaptiveNutritionReviewActions).get()?.value).toBe(0);
  });

  it('invalidates when an older Energy input changes outside the 21-day review window', () => {
    seedEligibleProgram();
    const store = createAdaptiveWeeklyReviewStore({ db, sqlite, now: () => new Date(nowMs) });
    const review = store.preview('user-1', { kind: 'weekly' });
    db.update(mealItems)
      .set({ calories: 1800 })
      .where(eq(mealItems.id, 'user-1-item-2026-07-29'))
      .run();

    expect(store.get('user-1', review.id)).toMatchObject({ state: 'stale', availableActions: [] });
  });

  it('cannot record a decline after the underlying check-in was accepted elsewhere', () => {
    const lifecycle = seedEligibleProgram();
    const store = createAdaptiveWeeklyReviewStore({ db, sqlite, now: () => new Date(nowMs) });
    const review = store.preview('user-1', { kind: 'weekly' });
    const targetsBefore = db.select({ value: count() }).from(nutritionTargets).get()?.value ?? 0;
    lifecycle.acceptCheckIn('user-1', review.checkInId, { replaceSameDateTarget: false });

    expect(store.get('user-1', review.id).state).toBe('stale');
    expect(() =>
      store.act(
        'user-1',
        review.id,
        {
          type: 'decline',
          expectedFingerprint: review.sourceFingerprint,
          expectedActionSequence: 0,
        },
        { type: 'user', label: 'You' },
      ),
    ).toThrow(AdaptiveReviewStaleError);
    expect(db.select({ value: count() }).from(nutritionTargets).get()?.value).toBe(
      targetsBefore + 1,
    );
    expect(db.select({ value: count() }).from(adaptiveNutritionReviewActions).get()?.value).toBe(0);
  });

  it('declines without changing targets and does not recreate the same-cycle review', () => {
    seedEligibleProgram();
    const store = createAdaptiveWeeklyReviewStore({ db, sqlite, now: () => new Date(nowMs) });
    const review = store.preview('user-1', { kind: 'weekly' });
    const targetsBefore = db.select().from(nutritionTargets).all();

    const declined = store.act(
      'user-1',
      review.id,
      {
        type: 'decline',
        expectedFingerprint: review.sourceFingerprint,
        expectedActionSequence: 0,
        reason: 'Keep the current plan this week.',
      },
      { type: 'user', label: 'You' },
    );

    expect(declined.state).toBe('declined');
    expect(store.getPending('user-1')).toBeNull();
    expect(store.preview('user-1', { kind: 'weekly' }).id).toBe(review.id);
    expect(db.select().from(nutritionTargets).all()).toEqual(targetsBefore);
  });

  it.each([
    ['accept', 'accepted'],
    ['decline', 'declined'],
    ['defer', 'deferred'],
  ] as const)(
    'defers until a program-local date, then permits a %s decision without duplication',
    (decision, expectedState) => {
      seedEligibleProgram();
      const store = createAdaptiveWeeklyReviewStore({ db, sqlite, now: () => new Date(nowMs) });
      const review = store.preview('user-1', { kind: 'weekly' });
      const deferred = store.act(
        'user-1',
        review.id,
        {
          type: 'defer',
          expectedFingerprint: review.sourceFingerprint,
          expectedActionSequence: 0,
          condition: { kind: 'until_date', localDate: '2026-08-21' },
          reason: 'Wait for the planned weigh-in.',
        },
        { type: 'user', label: 'You' },
      );

      expect(deferred.state).toBe('deferred');
      expect(store.getPending('user-1')).toBeNull();
      nowMs = Date.parse('2026-08-21T16:00:00.000Z');
      expect(store.getPending('user-1')).toMatchObject({
        id: review.id,
        state: 'pending',
        availableActions: expect.arrayContaining(['accept', 'defer', 'decline']),
      });
      expect(db.select({ value: count() }).from(adaptiveNutritionReviews).get()?.value).toBe(1);
      const decided = store.act(
        'user-1',
        review.id,
        decision === 'defer'
          ? {
              type: 'defer',
              expectedFingerprint: review.sourceFingerprint,
              expectedActionSequence: 1,
              condition: { kind: 'until_date', localDate: '2026-08-23' },
              reason: 'Wait two more days.',
            }
          : {
              type: decision,
              expectedFingerprint: review.sourceFingerprint,
              expectedActionSequence: 1,
            },
        { type: 'user', label: 'You' },
      );
      expect(decided.state).toBe(expectedState);
      expect(decided.actions.map((action) => action.type)).toEqual(['defer', decision]);
    },
  );

  it.each(['maintain', 'gain'] as const)(
    'marks the loss-only deficit limit as not applicable for %s goals',
    (goalType) => {
      seedEligibleProgram('user-1', {
        goalType,
        targetWeightKg: goalType === 'gain' ? 90 : null,
        goalRatePctPerWeek: goalType === 'gain' ? 0.25 : 0,
      });
      db.update(mealItems).set({ calories: 2800 }).run();
      const store = createAdaptiveWeeklyReviewStore({ db, sqlite, now: () => new Date(nowMs) });
      const recommendation = store
        .preview('user-1', { kind: 'weekly' })
        .snapshot.modules.find((module) => module.kind === 'recommendation');
      expect(
        recommendation?.kind === 'recommendation' ? recommendation.causalBreakdown : null,
      ).toMatchObject({ deficitLimitKcal: null });
    },
  );

  it('shows complete current-day nutrition and weight as pending cutoff while excluding partial intake', () => {
    seedEligibleProgram();
    seedNutrition('user-1', '2026-08-19', 2400);
    seedWeight('user-1', '2026-08-19', 79.8);
    const store = createAdaptiveWeeklyReviewStore({ db, sqlite, now: () => new Date(nowMs) });

    const completeReview = store.preview('user-1', { kind: 'weekly' });
    const completeQuality = completeReview.snapshot.modules.find(
      (module) => module.kind === 'data_quality',
    );
    expect(completeQuality?.kind === 'data_quality' ? completeQuality.evidence : []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'nutrition',
          localDate: '2026-08-19',
          state: 'pending_cutoff',
        }),
        expect.objectContaining({
          kind: 'weigh_in',
          localDate: '2026-08-19',
          state: 'pending_cutoff',
        }),
      ]),
    );

    db.update(nutritionLogs)
      .set({ status: 'partial', updatedAt: nowMs + 1 })
      .where(eq(nutritionLogs.id, 'user-1-log-2026-08-19'))
      .run();
    const partialReview = store.refresh('user-1', completeReview.id);
    const partialQuality = partialReview.snapshot.modules.find(
      (module) => module.kind === 'data_quality',
    );
    expect(partialQuality?.kind === 'data_quality' ? partialQuality.evidence : []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'nutrition',
          localDate: '2026-08-19',
          state: 'excluded',
          reasonCodes: ['PARTIAL_NUTRITION_EXCLUDED'],
        }),
      ]),
    );
  });

  it('holds through a logging break, names missing dates, and offers no apply action', () => {
    seedEligibleProgram();
    sqlite
      .prepare("DELETE FROM nutrition_logs WHERE user_id = 'user-1' AND date <= '2026-08-09'")
      .run();
    const store = createAdaptiveWeeklyReviewStore({ db, sqlite, now: () => new Date(nowMs) });
    const lifecycle = createAdaptiveNutritionStore({ db, sqlite, now: () => new Date(nowMs) });

    const review = store.preview('user-1', { kind: 'weekly' });
    const quality = review.snapshot.modules.find((module) => module.kind === 'data_quality');
    expect(lifecycle.findCheckInDetail('user-1', review.checkInId)?.status).toBe('held');
    expect(review.state).toBe('pending');
    expect(review.availableActions).toEqual(['ask_agent']);
    expect(store.getPending('user-1')).toMatchObject({ id: review.id, state: 'pending' });
    expect(() => store.refresh('user-1', review.id)).toThrow(AdaptiveReviewRefreshNotAllowedError);
    expect(review.snapshot.modules.at(-1)).toMatchObject({
      outcome: 'defer',
      proposedTarget: null,
    });
    expect(review.availableActions).not.toEqual(expect.arrayContaining(['accept', 'edit']));
    expect(quality?.kind === 'data_quality' ? quality.evidence : []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          localDate: '2026-08-01',
          state: 'missing',
          reasonCodes: ['MISSING_NUTRITION_RECORD'],
        }),
      ]),
    );
    const asked = store.act(
      'user-1',
      review.id,
      {
        type: 'ask_agent',
        expectedActionSequence: 0,
        question: 'What evidence should I complete before the next review?',
      },
      { type: 'user', label: 'You' },
    );
    expect(asked).toMatchObject({
      state: 'awaiting_clarification',
      availableActions: ['answer'],
    });
    expect(asked.actions.map((action) => action.type)).toEqual(['ask_agent']);

    db.update(nutritionLogs)
      .set({ updatedAt: nowMs + 1 })
      .where(eq(nutritionLogs.id, 'user-1-log-2026-08-15'))
      .run();
    expect(store.get('user-1', review.id)).toMatchObject({ state: 'stale', availableActions: [] });
    expect(store.getPending('user-1')).toBeNull();
    expect(() => store.refresh('user-1', review.id)).toThrow(AdaptiveReviewRefreshNotAllowedError);
  });

  it('uses canonical trend overlap and guardrail math in the causal breakdown', () => {
    seedEligibleProgram('user-1', {
      goalType: 'lose',
      targetWeightKg: 70,
      goalRatePctPerWeek: -0.5,
    });
    db.update(mealItems).set({ calories: 3000 }).run();
    const store = createAdaptiveWeeklyReviewStore({ db, sqlite, now: () => new Date(nowMs) });
    const review = store.preview('user-1', { kind: 'weekly' });
    const checkIn = createAdaptiveNutritionStore({
      db,
      sqlite,
      now: () => new Date(nowMs),
    }).findCheckInDetail('user-1', review.checkInId);
    const recommendation = review.snapshot.modules.find(
      (module) => module.kind === 'recommendation',
    );
    if (!checkIn || recommendation?.kind !== 'recommendation') {
      throw new Error('Expected review calculation');
    }
    const calculation = checkIn.calculationSnapshot;
    expect(recommendation.causalBreakdown.observedTrendContributionKcal).toBeCloseTo(
      -(calculation.weightTrendKgPerDay ?? 0) *
        checkIn.inputSnapshot.constants.energyDensityKcalPerKg,
      10,
    );
    expect(recommendation.causalBreakdown.safetyFloorKcal).toBe(
      Math.max(
        checkIn.inputSnapshot.constants.absoluteCalorieFloorKcal,
        checkIn.inputSnapshot.program.systemCalorieFloorKcal,
        checkIn.inputSnapshot.program.userCalorieFloorKcal,
      ),
    );
    expect(
      calculation.priorTdeeKcal + (recommendation.causalBreakdown.appliedAdjustmentKcal ?? 0),
    ).toBe(calculation.adaptiveUpdate?.proposedTdeeKcal);
    expect(
      (calculation.adaptiveUpdate?.observedTdeeKcal ?? 0) +
        (recommendation.causalBreakdown.smoothingOrCapKcal ?? 0),
    ).toBeCloseTo(calculation.adaptiveUpdate?.proposedTdeeKcal ?? 0, 10);
    const expenditure = calculation.adaptiveUpdate?.proposedTdeeKcal;
    const expectedDeficit =
      expenditure === undefined
        ? null
        : expenditure -
          Math.max(
            checkIn.inputSnapshot.constants.absoluteCalorieFloorKcal,
            checkIn.inputSnapshot.program.systemCalorieFloorKcal,
            checkIn.inputSnapshot.program.userCalorieFloorKcal,
            expenditure * checkIn.inputSnapshot.constants.minimumLossCaloriesFraction,
          );
    expect(recommendation.causalBreakdown.deficitLimitKcal).toBeCloseTo(expectedDeficit ?? 0, 10);
    expect(recommendation.causalBreakdown.includedNutritionDates).toHaveLength(
      calculation.completeNutritionDays,
    );
  });

  it.each([
    [2510, false, 0],
    [2700, false, null],
    [4000, true, null],
  ] as const)(
    'keeps the causal adjustment identities coherent for %i kcal evidence',
    (calories, limited, expectedApplied) => {
      seedEligibleProgram();
      db.update(mealItems).set({ calories }).run();
      const store = createAdaptiveWeeklyReviewStore({ db, sqlite, now: () => new Date(nowMs) });
      const review = store.preview('user-1', { kind: 'weekly' });
      const checkIn = createAdaptiveNutritionStore({
        db,
        sqlite,
        now: () => new Date(nowMs),
      }).findCheckInDetail('user-1', review.checkInId);
      const recommendation = review.snapshot.modules.find(
        (module) => module.kind === 'recommendation',
      );
      if (!checkIn || recommendation?.kind !== 'recommendation') {
        throw new Error('Expected a recommendation');
      }
      const update = checkIn.calculationSnapshot.adaptiveUpdate;
      if (!update) throw new Error('Expected an adaptive update');
      expect(update.limited).toBe(limited);
      expect(recommendation.causalBreakdown.appliedAdjustmentKcal).toBe(
        update.proposedTdeeKcal - update.priorTdeeKcal,
      );
      expect(recommendation.causalBreakdown.smoothingOrCapKcal).toBeCloseTo(
        update.proposedTdeeKcal - update.observedTdeeKcal,
        10,
      );
      if (expectedApplied !== null) {
        expect(recommendation.causalBreakdown.appliedAdjustmentKcal).toBe(expectedApplied);
      }
    },
  );

  it('accepts a keep decision without writing a target and is idempotent on retry', () => {
    seedEligibleProgram();
    const store = createAdaptiveWeeklyReviewStore({ db, sqlite, now: () => new Date(nowMs) });
    const review = store.preview('user-1', { kind: 'weekly' });
    const targetsBefore = db.select().from(nutritionTargets).all();
    const input = {
      type: 'accept' as const,
      expectedFingerprint: review.sourceFingerprint,
      expectedActionSequence: 0,
    };

    const accepted = store.act('user-1', review.id, input, { type: 'user', label: 'You' });
    const retried = store.act('user-1', review.id, input, { type: 'user', label: 'You' });

    expect(accepted.state).toBe('accepted');
    expect(retried).toEqual(accepted);
    expect(db.select().from(nutritionTargets).all()).toEqual(targetsBefore);
    expect(
      db
        .select({ status: adaptiveNutritionCheckIns.status })
        .from(adaptiveNutritionCheckIns)
        .where(eq(adaptiveNutritionCheckIns.id, review.checkInId))
        .get()?.status,
    ).toBe('declined');
    expect(db.select({ value: count() }).from(adaptiveNutritionReviewActions).get()?.value).toBe(1);
  });

  it('keeps an edited adjustment review-only until a later explicit accept', () => {
    seedEligibleProgram();
    db.update(mealItems).set({ calories: 3000 }).run();
    const store = createAdaptiveWeeklyReviewStore({ db, sqlite, now: () => new Date(nowMs) });
    const review = store.preview('user-1', { kind: 'weekly' });
    expect(review.snapshot.modules.at(-1)).toMatchObject({ outcome: 'adjust' });
    if (!review.effectiveProposal) throw new Error('Expected an adjustment proposal');
    const editedProposal = {
      ...review.effectiveProposal,
      calories: review.effectiveProposal.calories + 500,
      carbs: review.effectiveProposal.carbs + 125,
    };
    const targetsBefore = db.select().from(nutritionTargets).all();

    const edited = store.act(
      'user-1',
      review.id,
      {
        type: 'edit',
        expectedFingerprint: review.sourceFingerprint,
        expectedActionSequence: 0,
        proposal: editedProposal,
        reason: 'Prefer the upper edge of the bounded adjustment.',
      },
      { type: 'user', label: 'You' },
    );
    expect(edited.state).toBe('pending');
    expect(edited.effectiveProposal).toEqual(editedProposal);
    expect(db.select().from(nutritionTargets).all()).toEqual(targetsBefore);

    expect(() =>
      store.act(
        'user-1',
        review.id,
        {
          type: 'edit',
          expectedFingerprint: review.sourceFingerprint,
          expectedActionSequence: 1,
          proposal: {
            ...editedProposal,
            calories: editedProposal.calories + 500,
            carbs: editedProposal.carbs + 125,
          },
          reason: 'Attempt to ladder beyond the immutable review bound.',
        },
        { type: 'user', label: 'You' },
      ),
    ).toThrow(AdaptiveReviewProposalInvalidError);

    const accepted = store.act(
      'user-1',
      review.id,
      {
        type: 'accept',
        expectedFingerprint: review.sourceFingerprint,
        expectedActionSequence: 1,
      },
      { type: 'user', label: 'You' },
    );
    expect(accepted.state).toBe('accepted');
    expect(
      db
        .select({ calories: nutritionTargets.calories, carbs: nutritionTargets.carbs })
        .from(nutritionTargets)
        .where(eq(nutritionTargets.adaptiveCheckInId, review.checkInId))
        .get(),
    ).toEqual({ calories: editedProposal.calories, carbs: editedProposal.carbs });
    expect(accepted.actions.map((action) => action.type)).toEqual(['edit', 'accept']);
    expect(accepted.actions.at(-1)?.payload).toMatchObject({ appliedProposal: editedProposal });
  });

  it('requires explicit replacement when a same-date target already exists', () => {
    seedEligibleProgram();
    db.update(mealItems).set({ calories: 3000 }).run();
    db.insert(nutritionTargets)
      .values({
        id: 'manual-same-date',
        userId: 'user-1',
        calories: 2500,
        protein: 180,
        carbs: 265,
        fat: 80,
        source: 'manual',
        adaptiveCheckInId: null,
        macroCalories: 2500,
        effectiveDate: '2026-08-19',
        createdAt: nowMs,
        updatedAt: nowMs,
      })
      .run();
    const store = createAdaptiveWeeklyReviewStore({ db, sqlite, now: () => new Date(nowMs) });
    const review = store.preview('user-1', { kind: 'weekly' });
    const initialTarget = db
      .select()
      .from(nutritionTargets)
      .where(eq(nutritionTargets.id, 'manual-same-date'))
      .get();
    const input = {
      type: 'accept' as const,
      expectedFingerprint: review.sourceFingerprint,
      expectedActionSequence: 0,
    };

    expect(() => store.act('user-1', review.id, input, { type: 'user', label: 'You' })).toThrow(
      AdaptiveSameDateTargetExistsError,
    );
    expect(
      db.select().from(nutritionTargets).where(eq(nutritionTargets.id, 'manual-same-date')).get(),
    ).toEqual(initialTarget);
    expect(db.select({ value: count() }).from(adaptiveNutritionReviewActions).get()?.value).toBe(0);

    const accepted = store.act(
      'user-1',
      review.id,
      { ...input, replaceSameDateTarget: true },
      { type: 'user', label: 'You' },
    );
    expect(accepted.state).toBe('accepted');
    expect(
      db.select().from(nutritionTargets).where(eq(nutritionTargets.id, 'manual-same-date')).get(),
    ).toMatchObject({ source: 'adaptive', adaptiveCheckInId: review.checkInId });
  });

  it('refreshes corrected source data into a new immutable review and supersedes the old one', () => {
    seedEligibleProgram();
    const store = createAdaptiveWeeklyReviewStore({ db, sqlite, now: () => new Date(nowMs) });
    const original = store.preview('user-1', { kind: 'weekly' });
    db.update(nutritionLogs)
      .set({ updatedAt: nowMs + 1 })
      .where(eq(nutritionLogs.id, 'user-1-log-2026-08-15'))
      .run();

    const refreshed = store.refresh('user-1', original.id);

    expect(refreshed.id).not.toBe(original.id);
    expect(refreshed.sourceFingerprint).not.toBe(original.sourceFingerprint);
    expect(store.get('user-1', original.id).state).toBe('superseded');
    expect(store.getPending('user-1')?.id).toBe(refreshed.id);
  });

  it.each(['accepted', 'declined'] as const)(
    'never revives a terminal %s review through refresh',
    (terminalState) => {
      seedEligibleProgram();
      const store = createAdaptiveWeeklyReviewStore({ db, sqlite, now: () => new Date(nowMs) });
      const review = store.preview('user-1', { kind: 'weekly' });
      const terminal = store.act(
        'user-1',
        review.id,
        terminalState === 'accepted'
          ? {
              type: 'accept',
              expectedFingerprint: review.sourceFingerprint,
              expectedActionSequence: 0,
            }
          : {
              type: 'decline',
              expectedFingerprint: review.sourceFingerprint,
              expectedActionSequence: 0,
              reason: 'Keep this decision terminal.',
            },
        { type: 'user', label: 'You' },
      );

      expect(terminal.state).toBe(terminalState);
      expect(store.getPending('user-1')).toBeNull();
      expect(() => store.refresh('user-1', review.id)).toThrow(
        AdaptiveReviewRefreshNotAllowedError,
      );
      expect(store.get('user-1', review.id).state).toBe(terminalState);
      expect(store.getPending('user-1')).toBeNull();
      expect(store.preview('user-1', { kind: 'weekly' }).id).toBe(review.id);
      expect(db.select({ value: count() }).from(adaptiveNutritionReviews).get()?.value).toBe(1);
    },
  );

  it('rejects refresh for fresh pending and deferred reviews', () => {
    seedEligibleProgram();
    const store = createAdaptiveWeeklyReviewStore({ db, sqlite, now: () => new Date(nowMs) });
    const review = store.preview('user-1', { kind: 'weekly' });

    expect(() => store.refresh('user-1', review.id)).toThrow(AdaptiveReviewRefreshNotAllowedError);
    const deferred = store.act(
      'user-1',
      review.id,
      {
        type: 'defer',
        expectedFingerprint: review.sourceFingerprint,
        expectedActionSequence: 0,
        condition: { kind: 'until_date', localDate: '2026-08-21' },
        reason: 'Wait for the scheduled review date.',
      },
      { type: 'user', label: 'You' },
    );
    expect(deferred.state).toBe('deferred');
    expect(() => store.refresh('user-1', review.id)).toThrow(AdaptiveReviewRefreshNotAllowedError);

    nowMs = Date.parse('2026-08-21T16:00:00.000Z');
    expect(store.get('user-1', review.id).state).toBe('pending');
    expect(() => store.refresh('user-1', review.id)).toThrow(AdaptiveReviewRefreshNotAllowedError);
    expect(db.select({ value: count() }).from(adaptiveNutritionReviews).get()?.value).toBe(1);
  });

  it('rejects refresh while a fresh review is awaiting clarification', () => {
    seedEligibleProgram();
    const store = createAdaptiveWeeklyReviewStore({ db, sqlite, now: () => new Date(nowMs) });
    const review = store.preview('user-1', { kind: 'weekly' });
    const awaiting = store.act(
      'user-1',
      review.id,
      {
        type: 'ask_agent',
        expectedActionSequence: 0,
        question: 'Please confirm whether the logged day is complete.',
      },
      { type: 'user', label: 'You' },
    );

    expect(awaiting.state).toBe('awaiting_clarification');
    expect(() => store.refresh('user-1', review.id)).toThrow(AdaptiveReviewRefreshNotAllowedError);
    expect(db.select({ value: count() }).from(adaptiveNutritionReviews).get()?.value).toBe(1);
  });

  it('atomically allows one stale refresh and rejects a concurrent retry', async () => {
    seedEligibleProgram();
    const store = createAdaptiveWeeklyReviewStore({ db, sqlite, now: () => new Date(nowMs) });
    const original = store.preview('user-1', { kind: 'weekly' });
    const originalSnapshot = structuredClone(original.snapshot);
    const checkInsBefore = db
      .select({ value: count() })
      .from(adaptiveNutritionCheckIns)
      .get()?.value;
    db.update(nutritionLogs)
      .set({ updatedAt: nowMs + 1 })
      .where(eq(nutritionLogs.id, 'user-1-log-2026-08-15'))
      .run();

    expect(store.get('user-1', original.id).state).toBe('stale');
    const attempts = await Promise.allSettled([
      Promise.resolve().then(() => store.refresh('user-1', original.id)),
      Promise.resolve().then(() => store.refresh('user-1', original.id)),
    ]);
    const fulfilled = attempts.filter(
      (attempt): attempt is PromiseFulfilledResult<ReturnType<typeof store.refresh>> =>
        attempt.status === 'fulfilled',
    );
    const rejected = attempts.filter(
      (attempt): attempt is PromiseRejectedResult => attempt.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(AdaptiveReviewRefreshNotAllowedError);
    const replacement = fulfilled[0]?.value;
    if (!replacement) throw new Error('Expected one refresh replacement');
    expect(store.get('user-1', original.id).state).toBe('superseded');
    expect(store.get('user-1', original.id).snapshot).toEqual(originalSnapshot);
    expect(store.getPending('user-1')?.id).toBe(replacement.id);
    expect(db.select({ value: count() }).from(adaptiveNutritionReviews).get()?.value).toBe(2);
    expect(db.select({ value: count() }).from(adaptiveNutritionReviewActions).get()?.value).toBe(1);
    expect(db.select({ value: count() }).from(adaptiveNutritionCheckIns).get()?.value).toBe(
      (checkInsBefore ?? 0) + 1,
    );
    expect(
      db
        .select({ value: count() })
        .from(adaptiveNutritionCheckIns)
        .where(eq(adaptiveNutritionCheckIns.status, 'pending'))
        .get()?.value,
    ).toBe(1);
  });

  it.each(['accepted', 'declined'] as const)(
    'does not nag or refresh a review whose check-in was independently %s',
    (terminalState) => {
      const lifecycle = seedEligibleProgram();
      const store = createAdaptiveWeeklyReviewStore({ db, sqlite, now: () => new Date(nowMs) });
      const review = store.preview('user-1', { kind: 'weekly' });
      if (terminalState === 'accepted') {
        lifecycle.acceptCheckIn('user-1', review.checkInId, { replaceSameDateTarget: false });
      } else {
        lifecycle.declineCheckIn('user-1', review.checkInId);
      }
      const reviewCount = db.select({ value: count() }).from(adaptiveNutritionReviews).get()?.value;
      const targetCount = db.select({ value: count() }).from(nutritionTargets).get()?.value;

      expect(store.get('user-1', review.id).state).toBe('stale');
      expect(store.getPending('user-1')).toBeNull();
      expect(() => store.refresh('user-1', review.id)).toThrow(
        AdaptiveReviewRefreshNotAllowedError,
      );
      expect(db.select({ value: count() }).from(adaptiveNutritionReviews).get()?.value).toBe(
        reviewCount,
      );
      expect(db.select({ value: count() }).from(adaptiveNutritionReviewActions).get()?.value).toBe(
        0,
      );
      expect(db.select({ value: count() }).from(nutritionTargets).get()?.value).toBe(targetCount);
      expect(store.list('user-1', { page: 1, limit: 20 }).data).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: review.id, state: 'stale' })]),
      );
    },
  );

  it('resurfaces an evidence-deferred review exactly when the next weigh-in exists', () => {
    seedEligibleProgram();
    const store = createAdaptiveWeeklyReviewStore({ db, sqlite, now: () => new Date(nowMs) });
    const review = store.preview('user-1', { kind: 'weekly' });
    store.act(
      'user-1',
      review.id,
      {
        type: 'defer',
        expectedFingerprint: review.sourceFingerprint,
        expectedActionSequence: 0,
        condition: {
          kind: 'until_evidence',
          evidence: 'next_weigh_in',
          baselineFingerprint: review.sourceFingerprint,
        },
        reason: 'Wait for the next weigh-in.',
      },
      { type: 'user', label: 'You' },
    );
    expect(store.getPending('user-1')).toBeNull();
    expect(() => store.refresh('user-1', review.id)).toThrow(AdaptiveReviewRefreshNotAllowedError);

    nowMs = Date.parse('2026-08-20T16:00:00.000Z');
    seedWeight('user-1', '2026-08-20', 79.7);
    expect(store.getPending('user-1')).toBeNull();
    nowMs = Date.parse('2026-08-21T16:00:00.000Z');
    expect(store.getPending('user-1')).toMatchObject({
      id: review.id,
      state: 'stale',
      availableActions: [],
    });
    expect(db.select({ value: count() }).from(adaptiveNutritionReviews).get()?.value).toBe(1);
    const refreshed = store.refresh('user-1', review.id);
    expect(refreshed.id).not.toBe(review.id);
    expect(store.get('user-1', review.id).state).toBe('superseded');
  });

  it('waits through the completed-day cutoff before refreshing deferred nutrition evidence', () => {
    seedEligibleProgram();
    const store = createAdaptiveWeeklyReviewStore({ db, sqlite, now: () => new Date(nowMs) });
    const review = store.preview('user-1', { kind: 'weekly' });
    store.act(
      'user-1',
      review.id,
      {
        type: 'defer',
        expectedFingerprint: review.sourceFingerprint,
        expectedActionSequence: 0,
        condition: {
          kind: 'until_evidence',
          evidence: 'next_complete_nutrition_day',
          baselineFingerprint: review.sourceFingerprint,
        },
        reason: 'Wait for another complete local day.',
      },
      { type: 'user', label: 'You' },
    );
    seedNutrition('user-1', '2026-08-19', 2500);
    seedWeight('user-1', '2026-08-19', 79.9);
    expect(store.getPending('user-1')).toBeNull();

    nowMs = Date.parse('2026-08-20T16:00:00.000Z');
    expect(store.getPending('user-1')).toMatchObject({
      id: review.id,
      state: 'stale',
      availableActions: [],
    });
    const refreshed = store.refresh('user-1', review.id);
    const recommendation = refreshed.snapshot.modules.find(
      (module) => module.kind === 'recommendation',
    );
    expect(
      recommendation?.kind === 'recommendation'
        ? recommendation.causalBreakdown.includedNutritionDates
        : [],
    ).toContain('2026-08-19');
    expect(store.get('user-1', review.id).state).toBe('superseded');
  });

  it('keeps same-day training sessions chronological and isolates exercise trends', () => {
    seedEligibleProgram();
    seedTrainingSession({
      id: 'z-early-session',
      date: '2026-08-15',
      exerciseId: 'exercise-a',
      volume: 1000,
      completedAt: nowMs - 20_000,
      updatedAt: nowMs - 5_000,
      lowRecovery: true,
    });
    seedTrainingSession({
      id: 'a-late-session',
      date: '2026-08-15',
      exerciseId: 'exercise-a',
      volume: 1200,
      completedAt: nowMs - 10_000,
      updatedAt: nowMs - 10_000,
    });
    const store = createAdaptiveWeeklyReviewStore({ db, sqlite, now: () => new Date(nowMs) });

    const improving = store.preview('user-1', { kind: 'weekly' });
    expect(
      improving.snapshot.modules.find((module) => module.kind === 'training_recovery'),
    ).toMatchObject({ performanceTrend: 'improving' });

    seedTrainingSession({
      id: 'exercise-b-early',
      date: '2026-08-14',
      exerciseId: 'exercise-b',
      volume: 1200,
      updatedAt: nowMs - 30_000,
    });
    seedTrainingSession({
      id: 'exercise-b-late',
      date: '2026-08-16',
      exerciseId: 'exercise-b',
      volume: 900,
      updatedAt: nowMs - 5_000,
    });
    const mixed = store.refresh('user-1', improving.id);
    expect(
      mixed.snapshot.modules.find((module) => module.kind === 'training_recovery'),
    ).toMatchObject({ performanceTrend: 'unavailable' });
  });

  it('does not fabricate a performance trend from one exercise session', () => {
    seedEligibleProgram();
    seedTrainingSession({
      id: 'only-session',
      date: '2026-08-15',
      exerciseId: 'exercise-a',
      volume: 1000,
      updatedAt: nowMs - 10_000,
      lowRecovery: true,
    });
    const store = createAdaptiveWeeklyReviewStore({ db, sqlite, now: () => new Date(nowMs) });
    expect(
      store
        .preview('user-1', { kind: 'weekly' })
        .snapshot.modules.find((module) => module.kind === 'training_recovery'),
    ).toMatchObject({ performanceTrend: 'unavailable' });
  });

  it('anchors upcoming check-in context to exactly the next generated review cycle', () => {
    seedEligibleProgram();
    const store = createAdaptiveWeeklyReviewStore({ db, sqlite, now: () => new Date(nowMs) });
    const context = store.createContext(
      'user-1',
      {
        subject: { kind: 'upcoming_check_in' },
        category: 'travel',
        note: 'Travel will affect the next review week.',
      },
      { type: 'user', label: 'You' },
    );
    expect(context.subject).toEqual({
      kind: 'upcoming_check_in',
      targetReviewLocalDate: '2026-08-19',
    });

    nowMs = Date.parse('2026-08-21T16:00:00.000Z');
    const next = store.preview('user-1', { kind: 'weekly' });
    expect(next.snapshot.reviewLocalDate).toBe('2026-08-21');
    expect(next.snapshot.contexts.map((item) => item.id)).toContain(context.id);
    nowMs = Date.parse('2026-08-28T16:00:00.000Z');
    const later = store.preview('user-1', {
      kind: 'weekly',
      supersedePendingRecommendation: true,
    });
    expect(later.snapshot.contexts.map((item) => item.id)).not.toContain(context.id);
  });

  it('enforces annotation ownership, optimistic revisions, and agent-token edit scope', () => {
    seedEligibleProgram();
    seedEligibleProgram('user-2');
    const store = createAdaptiveWeeklyReviewStore({ db, sqlite, now: () => new Date(nowMs) });
    const context = store.createContext(
      'user-1',
      {
        subject: { kind: 'weigh_in', id: 'user-1-weight-2026-08-18' },
        category: 'clarification',
        note: 'Travel scale was used.',
      },
      { type: 'agent_token', agentTokenId: 'agent-1', label: 'Coach' },
    );
    expect(() =>
      store.createContext(
        'user-1',
        {
          subject: { kind: 'weigh_in', id: 'user-2-weight-2026-08-18' },
          category: 'clarification',
          note: 'Foreign record.',
        },
        { type: 'agent_token', agentTokenId: 'agent-1', label: 'Coach' },
      ),
    ).toThrow(AdaptiveReviewContextNotFoundError);
    expect(() =>
      store.updateContext(
        'user-1',
        context.id,
        { expectedRevision: 1, note: 'Other token edit.' },
        { type: 'agent_token', agentTokenId: 'agent-2', label: 'Other' },
      ),
    ).toThrow(AdaptiveReviewContextNotFoundError);

    const updated = store.updateContext(
      'user-1',
      context.id,
      { expectedRevision: 1, note: 'Travel scale was calibrated.' },
      { type: 'agent_token', agentTokenId: 'agent-1', label: 'Coach' },
    );
    expect(updated).toMatchObject({ revision: 2, note: 'Travel scale was calibrated.' });
    const deleted = store.deleteContext('user-1', context.id, 2, {
      type: 'agent_token',
      agentTokenId: 'agent-1',
      label: 'Coach',
    });
    expect(deleted).toMatchObject({ revision: 3, deletedAt: expect.any(Number) });
    expect(db.select({ value: count() }).from(adaptiveNutritionReviewContexts).get()?.value).toBe(
      1,
    );
  });

  it('keeps review and action rows immutable outside account deletion scope', () => {
    seedEligibleProgram();
    const store = createAdaptiveWeeklyReviewStore({ db, sqlite, now: () => new Date(nowMs) });
    const review = store.preview('user-1', { kind: 'weekly' });
    store.act(
      'user-1',
      review.id,
      {
        type: 'ask_agent',
        expectedActionSequence: 0,
        question: 'What changed in the trend calculation?',
      },
      { type: 'user', label: 'You' },
    );
    sqlite.exec("DELETE FROM adaptive_nutrition_account_deletion_scope WHERE user_id = 'user-1'");
    expect(() =>
      sqlite
        .prepare('UPDATE adaptive_nutrition_reviews SET review_version = 2 WHERE id = ?')
        .run(review.id),
    ).toThrow(/immutable/u);
    expect(() =>
      sqlite
        .prepare('DELETE FROM adaptive_nutrition_review_actions WHERE review_id = ?')
        .run(review.id),
    ).toThrow(/account deletion scope/u);
    expect(() =>
      sqlite.prepare('DELETE FROM adaptive_nutrition_reviews WHERE id = ?').run(review.id),
    ).toThrow(/account deletion scope/u);
  });
});

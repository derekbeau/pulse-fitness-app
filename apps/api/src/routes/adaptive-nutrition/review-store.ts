import { createHash, randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';
import { and, asc, count, desc, eq, gte, isNull, lt, lte, or, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import {
  adaptiveReviewActionInputSchema,
  adaptiveReviewContextCreateInputSchema,
  adaptiveReviewContextSchema,
  adaptiveReviewContextSubjectSchema,
  adaptiveReviewContextUpdateInputSchema,
  adaptiveReviewTargetProposalSchema,
  adaptiveWeeklyReviewListQuerySchema,
  adaptiveWeeklyReviewPreviewInputSchema,
  adaptiveWeeklyReviewSchema,
  adaptiveWeeklyReviewSnapshotSchema,
  addCalendarDays,
  calendarDaysBetween,
  evaluateEligibility,
  summarizeAdaptiveReadinessEvidence,
  type AdaptiveCheckInDetail,
  type AdaptiveReviewAction,
  type AdaptiveReviewActionInput,
  type AdaptiveReviewContext,
  type AdaptiveReviewContextCreateInput,
  type AdaptiveReviewContextSubject,
  type AdaptiveReviewContextUpdateInput,
  type AdaptiveReviewTargetProposal,
  type AdaptiveWeeklyReview,
  type AdaptiveWeeklyReviewPreviewInput,
} from '@pulse/shared';

import * as schema from '../../db/schema/index.js';
import {
  adaptiveNutritionCheckIns,
  adaptiveNutritionGoalRevisions,
  adaptiveNutritionProgramRevisions,
  adaptiveNutritionPrograms,
  adaptiveNutritionReviewActions,
  adaptiveNutritionReviewContexts,
  adaptiveNutritionReviews,
  bodyWeight,
  mealItems,
  meals,
  nutritionLogs,
  nutritionTargets,
  scheduledWorkouts,
  sessionSets,
  workoutSessions,
  users,
} from '../../db/schema/index.js';
import { parseWorkoutSessionFeedback } from '../../db/schema/workout-session-feedback.js';
import { createAdaptiveAnalyticsStore } from './analytics-store.js';
import {
  AdaptiveCheckInNotAcceptableError,
  AdaptiveProgramNotFoundError,
  createAdaptiveNutritionStore,
} from './store.js';

type AdaptiveDatabase = BetterSQLite3Database<typeof schema>;

export type AdaptiveReviewActor =
  | { type: 'user'; label: string }
  | { type: 'agent_token'; agentTokenId: string; label: string }
  | { type: 'system'; label: string };

export class AdaptiveReviewNotFoundError extends Error {
  constructor() {
    super('Adaptive weekly review not found');
    this.name = 'AdaptiveReviewNotFoundError';
  }
}

export class AdaptiveReviewContextNotFoundError extends Error {
  constructor() {
    super('Adaptive weekly review context not found');
    this.name = 'AdaptiveReviewContextNotFoundError';
  }
}

export class AdaptiveReviewContextConflictError extends Error {
  constructor() {
    super('Adaptive weekly review context changed before this edit');
    this.name = 'AdaptiveReviewContextConflictError';
  }
}

export class AdaptiveReviewStaleError extends Error {
  constructor() {
    super('Weekly review sources changed after the review was prepared');
    this.name = 'AdaptiveReviewStaleError';
  }
}

export class AdaptiveReviewRefreshNotAllowedError extends Error {
  constructor() {
    super('Only a stale, nonterminal weekly review can be refreshed');
    this.name = 'AdaptiveReviewRefreshNotAllowedError';
  }
}

export class AdaptiveReviewActionConflictError extends Error {
  constructor(message = 'Weekly review action sequence changed before this decision') {
    super(message);
    this.name = 'AdaptiveReviewActionConflictError';
  }
}

export class AdaptiveReviewActionNotAllowedError extends Error {
  constructor(message = 'This action is not allowed for the current weekly review') {
    super(message);
    this.name = 'AdaptiveReviewActionNotAllowedError';
  }
}

export class AdaptiveReviewProposalInvalidError extends Error {
  constructor(message = 'Edited targets are outside the allowed review bounds') {
    super(message);
    this.name = 'AdaptiveReviewProposalInvalidError';
  }
}

const dateKeyInTimeZone = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
};

const fingerprint = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');

export const matchLowDayResolutionContext = (
  contexts: AdaptiveReviewContext[],
  day: { id: string; date: string },
) => {
  const relevantCategories = new Set(['illness', 'recovery', 'nutrition_exception']);
  const candidates = contexts.flatMap((context) => {
    if (
      context.deletedAt !== null ||
      context.resolution === null ||
      context.resolutionKind !== 'nutrition_complete' ||
      !relevantCategories.has(context.category)
    ) {
      return [];
    }
    const subject = context.subject;
    const specificity =
      subject.kind === 'nutrition_log' && subject.id === day.id
        ? 3
        : subject.kind === 'date' && subject.localDate === day.date
          ? 2
          : subject.kind === 'date_range' &&
              subject.startDate <= day.date &&
              subject.endDate >= day.date
            ? 1
            : 0;
    if (specificity === 0) return [];
    return [
      {
        context,
        specificity,
        rangeDays:
          subject.kind === 'date_range'
            ? calendarDaysBetween(subject.startDate, subject.endDate)
            : 0,
      },
    ];
  });
  candidates.sort(
    (left, right) =>
      right.specificity - left.specificity ||
      left.rangeDays - right.rangeDays ||
      right.context.updatedAt - left.context.updatedAt ||
      right.context.revision - left.context.revision ||
      left.context.id.localeCompare(right.context.id),
  );
  return candidates.at(0)?.context ?? null;
};

const actorColumns = (actor: AdaptiveReviewActor) => ({
  actorType: actor.type,
  agentTokenId: actor.type === 'agent_token' ? actor.agentTokenId : null,
  actorLabel: actor.label,
});

const median = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return null;
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? null)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

export const selectReviewLowDayCandidates = <
  T extends {
    id: string;
    date: string;
    status: string;
    itemCount: number;
    calories: number;
  },
>(input: {
  days: readonly T[];
  analysisStart: string | null;
  analysisEnd: string | null;
  usableNutritionIds: ReadonlySet<string>;
}) => {
  const completeDays = input.days.filter(
    (day) =>
      input.analysisStart !== null &&
      input.analysisEnd !== null &&
      day.status === 'complete' &&
      day.itemCount > 0 &&
      day.date >= input.analysisStart &&
      day.date <= input.analysisEnd &&
      input.usableNutritionIds.has(day.id),
  );
  const typicalCalories = median(completeDays.map((day) => day.calories));
  const threshold = typicalCalories === null ? null : Math.max(800, typicalCalories * 0.6);
  return completeDays.length >= 3 && threshold !== null
    ? completeDays.filter((day) => day.calories < threshold)
    : [];
};

const contextSelection = {
  id: adaptiveNutritionReviewContexts.id,
  subject: adaptiveNutritionReviewContexts.subject,
  category: adaptiveNutritionReviewContexts.category,
  note: adaptiveNutritionReviewContexts.note,
  resolution: adaptiveNutritionReviewContexts.resolution,
  resolutionKind: adaptiveNutritionReviewContexts.resolutionKind,
  createdBy: adaptiveNutritionReviewContexts.createdBy,
  agentTokenId: adaptiveNutritionReviewContexts.agentTokenId,
  actorLabel: adaptiveNutritionReviewContexts.actorLabel,
  revision: adaptiveNutritionReviewContexts.revision,
  createdAt: adaptiveNutritionReviewContexts.createdAt,
  updatedAt: adaptiveNutritionReviewContexts.updatedAt,
  deletedAt: adaptiveNutritionReviewContexts.deletedAt,
};

type ContextRow = typeof adaptiveNutritionReviewContexts.$inferSelect;

const parseContext = (row: Omit<ContextRow, 'userId' | 'programId' | 'subjectType'>) =>
  adaptiveReviewContextSchema.parse({
    id: row.id,
    subject: adaptiveReviewContextSubjectSchema.parse(row.subject),
    category: row.category,
    note: row.note,
    resolution: row.resolution,
    resolutionKind: row.resolutionKind,
    provenance: {
      type: row.createdBy === 'agent_token' ? 'agent_token' : 'user',
      agentTokenId: row.agentTokenId,
      label: row.actorLabel,
    },
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  });

const reviewRowSelection = {
  id: adaptiveNutritionReviews.id,
  userId: adaptiveNutritionReviews.userId,
  programId: adaptiveNutritionReviews.programId,
  checkInId: adaptiveNutritionReviews.checkInId,
  kind: adaptiveNutritionReviews.kind,
  sourceFingerprint: adaptiveNutritionReviews.sourceFingerprint,
  snapshot: adaptiveNutritionReviews.snapshot,
  createdAt: adaptiveNutritionReviews.createdAt,
};

type ReviewRow = {
  id: string;
  userId: string;
  programId: string;
  checkInId: string;
  kind: 'weekly' | 'manual';
  sourceFingerprint: string;
  snapshot: unknown;
  createdAt: number;
};

const actionSelection = {
  id: adaptiveNutritionReviewActions.id,
  sequence: adaptiveNutritionReviewActions.sequence,
  type: adaptiveNutritionReviewActions.type,
  payload: adaptiveNutritionReviewActions.payload,
  actorType: adaptiveNutritionReviewActions.actorType,
  agentTokenId: adaptiveNutritionReviewActions.agentTokenId,
  actorLabel: adaptiveNutritionReviewActions.actorLabel,
  createdAt: adaptiveNutritionReviewActions.createdAt,
};

type ActionRow = {
  id: string;
  sequence: number;
  type: 'accept' | 'edit' | 'defer' | 'decline' | 'ask_agent' | 'answer' | 'supersede';
  payload: unknown;
  actorType: 'user' | 'agent_token' | 'system';
  agentTokenId: string | null;
  actorLabel: string;
  createdAt: number;
};

const parseAction = (row: ActionRow): AdaptiveReviewAction => ({
  id: row.id,
  sequence: row.sequence,
  type: row.type,
  payload: row.payload as Record<string, unknown>,
  actor: {
    type: row.actorType,
    agentTokenId: row.agentTokenId,
    label: row.actorLabel,
  },
  createdAt: row.createdAt,
});

const terminalTypes = new Set(['accept', 'decline', 'supersede']);

const stateFromActions = (actions: AdaptiveReviewAction[]): AdaptiveWeeklyReview['state'] => {
  const latest = actions.at(-1);
  const terminal = [...actions].reverse().find((action) => terminalTypes.has(action.type));
  if (terminal?.type === 'accept') return 'accepted';
  if (terminal?.type === 'decline') return 'declined';
  if (terminal?.type === 'supersede') return 'superseded';
  if (latest?.type === 'ask_agent') return 'awaiting_clarification';
  if (latest?.type === 'defer') return 'deferred';
  return 'pending';
};

const proposalFromReview = (
  snapshot: ReturnType<typeof adaptiveWeeklyReviewSnapshotSchema.parse>,
  actions: AdaptiveReviewAction[],
) => {
  const edited = [...actions].reverse().find((action) => action.type === 'edit');
  if (edited) {
    return adaptiveReviewTargetProposalSchema.parse(edited.payload.proposal);
  }
  const recommendation = snapshot.modules.find((module) => module.kind === 'recommendation');
  return recommendation?.kind === 'recommendation' ? recommendation.proposedTarget : null;
};

const deferFromActions = (actions: AdaptiveReviewAction[]) => {
  const deferred = [...actions].reverse().find((action) => action.type === 'defer');
  if (!deferred) return null;
  const payload = adaptiveReviewActionInputSchema.parse(deferred.payload);
  return payload.type === 'defer' ? payload.condition : null;
};

const availableActionsFor = (
  state: AdaptiveWeeklyReview['state'],
  outcome: 'keep' | 'adjust' | 'defer' | 'clarify' | 'goal_review' | 'training_review',
): AdaptiveWeeklyReview['availableActions'] =>
  state === 'pending'
    ? outcome === 'adjust'
      ? ['accept', 'edit', 'defer', 'decline', 'ask_agent']
      : outcome === 'keep'
        ? ['accept', 'defer', 'decline', 'ask_agent']
        : ['defer', 'decline', 'ask_agent']
    : state === 'awaiting_clarification'
      ? ['answer', 'defer', 'decline']
      : state === 'deferred'
        ? ['ask_agent']
        : [];

export const createAdaptiveWeeklyReviewStore = (options: {
  db: AdaptiveDatabase;
  sqlite: Database.Database;
  now?: () => Date;
}) => {
  const { db, sqlite } = options;
  const now = options.now ?? (() => new Date());
  const immediate = <T>(operation: () => T) => sqlite.transaction(operation).immediate();
  const adaptiveStore = createAdaptiveNutritionStore({
    db,
    sqlite,
    now,
    runInTransaction: (operation) => operation(),
  });
  const analyticsStore = createAdaptiveAnalyticsStore({ db, now });

  const findProgram = (userId: string) =>
    db
      .select()
      .from(adaptiveNutritionPrograms)
      .where(eq(adaptiveNutritionPrograms.userId, userId))
      .limit(1)
      .get();

  const loadActions = (reviewId: string, userId: string): AdaptiveReviewAction[] =>
    (
      db
        .select(actionSelection)
        .from(adaptiveNutritionReviewActions)
        .where(
          and(
            eq(adaptiveNutritionReviewActions.reviewId, reviewId),
            eq(adaptiveNutritionReviewActions.userId, userId),
          ),
        )
        .orderBy(asc(adaptiveNutritionReviewActions.sequence))
        .all() as ActionRow[]
    ).map(parseAction);

  const loadProjectionActions = (reviewId: string, userId: string): AdaptiveReviewAction[] =>
    (
      db
        .select(actionSelection)
        .from(adaptiveNutritionReviewActions)
        .where(
          and(
            eq(adaptiveNutritionReviewActions.reviewId, reviewId),
            eq(adaptiveNutritionReviewActions.userId, userId),
            sql`${adaptiveNutritionReviewActions.sequence} in (
              coalesce((select max(a.sequence) from adaptive_nutrition_review_actions a where a.review_id = ${reviewId} and a.user_id = ${userId}), -1),
              coalesce((select max(a.sequence) from adaptive_nutrition_review_actions a where a.review_id = ${reviewId} and a.user_id = ${userId} and a.type in ('accept', 'decline', 'supersede')), -1),
              coalesce((select max(a.sequence) from adaptive_nutrition_review_actions a where a.review_id = ${reviewId} and a.user_id = ${userId} and a.type = 'edit'), -1),
              coalesce((select max(a.sequence) from adaptive_nutrition_review_actions a where a.review_id = ${reviewId} and a.user_id = ${userId} and a.type = 'defer'), -1)
            )`,
          ),
        )
        .orderBy(asc(adaptiveNutritionReviewActions.sequence))
        .all() as ActionRow[]
    ).map(parseAction);

  const hydrateReview = (
    row: ReviewRow,
    actions: AdaptiveReviewAction[] = loadActions(row.id, row.userId),
  ): AdaptiveWeeklyReview => {
    const snapshot = adaptiveWeeklyReviewSnapshotSchema.parse(row.snapshot);
    const state = stateFromActions(actions);
    const recommendation = snapshot.modules.find((module) => module.kind === 'recommendation');
    const outcome = recommendation?.kind === 'recommendation' ? recommendation.outcome : 'defer';
    const availableActions = availableActionsFor(state, outcome);
    return adaptiveWeeklyReviewSchema.parse({
      id: row.id,
      checkInId: row.checkInId,
      sourceFingerprint: row.sourceFingerprint,
      snapshot,
      state,
      actionSequence: actions.at(-1)?.sequence ?? 0,
      actions,
      effectiveProposal: proposalFromReview(snapshot, actions),
      deferCondition: deferFromActions(actions),
      availableActions,
      createdAt: row.createdAt,
    });
  };

  const findReviewRow = (userId: string, reviewId: string): ReviewRow | null =>
    (db
      .select(reviewRowSelection)
      .from(adaptiveNutritionReviews)
      .where(
        and(eq(adaptiveNutritionReviews.id, reviewId), eq(adaptiveNutritionReviews.userId, userId)),
      )
      .limit(1)
      .get() as ReviewRow | undefined) ?? null;

  const loadActiveContexts = (
    userId: string,
    programId: string,
    startDate: string,
    endDate: string,
  ) => {
    const consumedUpcomingContextIds = new Set(
      db
        .select({ snapshot: adaptiveNutritionReviews.snapshot })
        .from(adaptiveNutritionReviews)
        .where(
          and(
            eq(adaptiveNutritionReviews.userId, userId),
            eq(adaptiveNutritionReviews.programId, programId),
            lt(adaptiveNutritionReviews.reviewLocalDate, endDate),
          ),
        )
        .all()
        .flatMap((row) =>
          adaptiveWeeklyReviewSnapshotSchema
            .parse(row.snapshot)
            .contexts.filter((context) => context.subject.kind === 'upcoming_check_in')
            .map((context) => context.id),
        ),
    );
    const relevantContexts = (
      db
        .select(contextSelection)
        .from(adaptiveNutritionReviewContexts)
        .where(
          and(
            eq(adaptiveNutritionReviewContexts.userId, userId),
            eq(adaptiveNutritionReviewContexts.programId, programId),
          ),
        )
        .orderBy(
          asc(adaptiveNutritionReviewContexts.createdAt),
          asc(adaptiveNutritionReviewContexts.id),
        )
        .all() as Array<Omit<ContextRow, 'userId' | 'programId' | 'subjectType'>>
    )
      .map(parseContext)
      .filter((context) => {
        const subject = context.subject;
        if (subject.kind === 'date')
          return subject.localDate >= startDate && subject.localDate <= endDate;
        if (subject.kind === 'date_range') {
          return subject.startDate <= endDate && subject.endDate >= startDate;
        }
        const subjectDate =
          subject.kind === 'nutrition_log'
            ? db
                .select({ date: nutritionLogs.date })
                .from(nutritionLogs)
                .where(and(eq(nutritionLogs.id, subject.id), eq(nutritionLogs.userId, userId)))
                .limit(1)
                .get()?.date
            : subject.kind === 'weigh_in'
              ? db
                  .select({ date: bodyWeight.date })
                  .from(bodyWeight)
                  .where(and(eq(bodyWeight.id, subject.id), eq(bodyWeight.userId, userId)))
                  .limit(1)
                  .get()?.date
              : subject.kind === 'scheduled_workout'
                ? db
                    .select({ date: scheduledWorkouts.date })
                    .from(scheduledWorkouts)
                    .where(
                      and(
                        eq(scheduledWorkouts.id, subject.id),
                        eq(scheduledWorkouts.userId, userId),
                      ),
                    )
                    .limit(1)
                    .get()?.date
                : subject.kind === 'workout_session'
                  ? db
                      .select({ date: workoutSessions.date })
                      .from(workoutSessions)
                      .where(
                        and(eq(workoutSessions.id, subject.id), eq(workoutSessions.userId, userId)),
                      )
                      .limit(1)
                      .get()?.date
                  : subject.kind === 'check_in'
                    ? db
                        .select({ date: adaptiveNutritionCheckIns.localDate })
                        .from(adaptiveNutritionCheckIns)
                        .where(
                          and(
                            eq(adaptiveNutritionCheckIns.id, subject.id),
                            eq(adaptiveNutritionCheckIns.userId, userId),
                            eq(adaptiveNutritionCheckIns.programId, programId),
                          ),
                        )
                        .limit(1)
                        .get()?.date
                    : subject.targetReviewLocalDate;
        if (subject.kind === 'upcoming_check_in') {
          return (
            subject.targetReviewLocalDate <= endDate && !consumedUpcomingContextIds.has(context.id)
          );
        }
        return subjectDate !== undefined && subjectDate >= startDate && subjectDate <= endDate;
      });
    return {
      active: relevantContexts.filter((context) => context.deletedAt === null),
      revisions: relevantContexts.map((context) => ({
        id: context.id,
        revision: context.revision,
        deletedAt: context.deletedAt,
      })),
    };
  };

  const loadSourceFacts = (userId: string, programId: string, checkIn: AdaptiveCheckInDetail) => {
    const startDate = checkIn.analysisStart ?? checkIn.localDate;
    const endDate = checkIn.localDate;
    const nutrition = db
      .select({
        id: nutritionLogs.id,
        date: nutritionLogs.date,
        status: nutritionLogs.status,
        updatedAt: nutritionLogs.updatedAt,
        calories: sql<number>`coalesce(sum(${mealItems.calories}), 0)`,
        itemCount: sql<number>`count(${mealItems.id})`,
      })
      .from(nutritionLogs)
      .leftJoin(meals, eq(meals.nutritionLogId, nutritionLogs.id))
      .leftJoin(mealItems, eq(mealItems.mealId, meals.id))
      .where(
        and(
          eq(nutritionLogs.userId, userId),
          gte(nutritionLogs.date, startDate),
          lte(nutritionLogs.date, endDate),
        ),
      )
      .groupBy(nutritionLogs.id)
      .orderBy(asc(nutritionLogs.date), asc(nutritionLogs.id))
      .all();
    const weights = db
      .select({
        id: bodyWeight.id,
        date: bodyWeight.date,
        weightKg: bodyWeight.weightKg,
        updatedAt: bodyWeight.updatedAt,
      })
      .from(bodyWeight)
      .where(
        and(
          eq(bodyWeight.userId, userId),
          gte(bodyWeight.date, checkIn.inputSnapshot.boundaries.warmupStart),
          lte(bodyWeight.date, endDate),
        ),
      )
      .orderBy(asc(bodyWeight.date), asc(bodyWeight.id))
      .all();
    const scheduled = db
      .select({
        id: scheduledWorkouts.id,
        date: scheduledWorkouts.date,
        sessionId: scheduledWorkouts.sessionId,
        updatedAt: scheduledWorkouts.updatedAt,
      })
      .from(scheduledWorkouts)
      .where(
        and(
          eq(scheduledWorkouts.userId, userId),
          gte(scheduledWorkouts.date, startDate),
          lte(scheduledWorkouts.date, checkIn.analysisEnd ?? endDate),
        ),
      )
      .orderBy(asc(scheduledWorkouts.date), asc(scheduledWorkouts.id))
      .all();
    const sessions = db
      .select({
        id: workoutSessions.id,
        scheduledWorkoutId: workoutSessions.scheduledWorkoutId,
        date: workoutSessions.date,
        status: workoutSessions.status,
        startedAt: workoutSessions.startedAt,
        completedAt: workoutSessions.completedAt,
        feedback: workoutSessions.feedback,
        notes: workoutSessions.notes,
        updatedAt: workoutSessions.updatedAt,
      })
      .from(workoutSessions)
      .where(
        and(
          eq(workoutSessions.userId, userId),
          gte(workoutSessions.date, startDate),
          lte(workoutSessions.date, checkIn.analysisEnd ?? endDate),
          isNull(workoutSessions.deletedAt),
        ),
      )
      .orderBy(asc(workoutSessions.date), asc(workoutSessions.id))
      .all();
    const sessionIds = sessions.map((session) => session.id);
    const sets = sessionIds.length
      ? db
          .select({
            id: sessionSets.id,
            sessionId: sessionSets.sessionId,
            exerciseId: sessionSets.exerciseId,
            orderIndex: sessionSets.orderIndex,
            weight: sessionSets.weight,
            reps: sessionSets.reps,
            rpe: sessionSets.rpe,
            completed: sessionSets.completed,
            skipped: sessionSets.skipped,
          })
          .from(sessionSets)
          .where(or(...sessionIds.map((id) => eq(sessionSets.sessionId, id))))
          .orderBy(asc(sessionSets.sessionId), asc(sessionSets.orderIndex), asc(sessionSets.id))
          .all()
      : [];
    const contextFacts = loadActiveContexts(userId, programId, startDate, endDate);
    const currentTarget = db
      .select()
      .from(nutritionTargets)
      .where(and(eq(nutritionTargets.userId, userId), lte(nutritionTargets.effectiveDate, endDate)))
      .orderBy(desc(nutritionTargets.effectiveDate), desc(nutritionTargets.createdAt))
      .limit(1)
      .get();
    const weightUnit =
      db.select({ value: users.weightUnit }).from(users).where(eq(users.id, userId)).limit(1).get()
        ?.value ?? 'lbs';
    const programRevision = db
      .select({
        id: adaptiveNutritionProgramRevisions.id,
        sequence: adaptiveNutritionProgramRevisions.sequence,
        effectiveAt: adaptiveNutritionProgramRevisions.effectiveAt,
        snapshot: adaptiveNutritionProgramRevisions.snapshot,
      })
      .from(adaptiveNutritionProgramRevisions)
      .where(
        and(
          eq(adaptiveNutritionProgramRevisions.userId, userId),
          eq(adaptiveNutritionProgramRevisions.programId, programId),
        ),
      )
      .orderBy(desc(adaptiveNutritionProgramRevisions.sequence))
      .limit(1)
      .get();
    const goalRevision = checkIn.goalId
      ? db
          .select({
            id: adaptiveNutritionGoalRevisions.id,
            sequence: adaptiveNutritionGoalRevisions.sequence,
          })
          .from(adaptiveNutritionGoalRevisions)
          .where(
            and(
              eq(adaptiveNutritionGoalRevisions.userId, userId),
              eq(adaptiveNutritionGoalRevisions.goalId, checkIn.goalId),
            ),
          )
          .orderBy(desc(adaptiveNutritionGoalRevisions.sequence))
          .limit(1)
          .get()
      : null;
    const analytics = analyticsStore.getAnalytics(userId, {
      aggregation: 'daily',
      end: checkIn.localDate,
      range: '1m',
    });
    const currentGoal = adaptiveStore.getCurrentGoal(userId);
    return {
      nutrition,
      weights,
      scheduled,
      sessions,
      sets,
      contexts: contextFacts.active,
      contextRevisions: contextFacts.revisions,
      currentTarget,
      weightUnit,
      programRevision,
      goalRevision,
      analytics,
      currentGoal,
    };
  };

  const sourceFingerprint = (
    checkIn: AdaptiveCheckInDetail,
    sources: ReturnType<typeof loadSourceFacts>,
  ) =>
    fingerprint({
      version: 1,
      checkInId: checkIn.id,
      checkInFingerprint: checkIn.dataFingerprint,
      algorithmVersion: checkIn.algorithmVersion,
      goalId: checkIn.goalId,
      goalRevisionId: checkIn.goalRevisionId,
      currentGoalRevision: sources.goalRevision,
      currentProgramRevision: sources.programRevision,
      analysisStart: checkIn.analysisStart,
      analysisEnd: checkIn.analysisEnd,
      nutrition: sources.nutrition,
      weights: sources.weights,
      scheduled: sources.scheduled,
      sessions: sources.sessions,
      sets: sources.sets,
      contexts: sources.contextRevisions,
      currentTarget: sources.currentTarget
        ? {
            id: sources.currentTarget.id,
            effectiveDate: sources.currentTarget.effectiveDate,
            updatedAt: sources.currentTarget.updatedAt,
          }
        : null,
      weightUnit: sources.weightUnit,
      energyProjection: {
        state: sources.analytics.current.state,
        summary: sources.analytics.summary,
        explanation: sources.analytics.explanation,
        markers: sources.analytics.markers,
      },
    });

  const proposalFromTarget = (target: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    effectiveDate: string;
  }): AdaptiveReviewTargetProposal =>
    adaptiveReviewTargetProposalSchema.parse({
      calories: Math.round(target.calories),
      protein: Math.round(target.protein),
      carbs: Math.round(target.carbs),
      fat: Math.round(target.fat),
      effectiveDate: target.effectiveDate,
    });

  const buildSnapshot = (
    userId: string,
    programId: string,
    checkIn: AdaptiveCheckInDetail,
    sources: ReturnType<typeof loadSourceFacts>,
    sourceHash: string,
  ) => {
    const calculation = checkIn.calculationSnapshot;
    const currentGoal = sources.currentGoal;
    const progress = currentGoal.progress;
    const analytics = sources.analytics;
    const currentTarget = checkIn.currentTargets
      ? proposalFromTarget(checkIn.currentTargets)
      : sources.currentTarget
        ? proposalFromTarget(sources.currentTarget)
        : null;
    const proposedTarget = checkIn.proposedTargets
      ? proposalFromTarget(checkIn.proposedTargets)
      : null;
    const eligibility = evaluateEligibility({
      boundaries: checkIn.inputSnapshot.boundaries,
      nutritionDays: sources.nutrition,
      weightEntries: sources.weights,
      constants: checkIn.inputSnapshot.constants,
    });
    const readiness = summarizeAdaptiveReadinessEvidence({
      boundaries: checkIn.inputSnapshot.boundaries,
      nutritionDays: sources.nutrition,
      weightEntries: sources.weights,
      eligibility,
    });
    const usableNutritionIds = new Set(eligibility.usableNutritionDays.map((day) => day.id));
    const suspectWeightIds = new Set(eligibility.suspectWeightEntryIds);
    const firstTrendDate = eligibility.trendPoints.at(0)?.date ?? null;
    const lastTrendDate = eligibility.trendPoints.at(-1)?.date ?? null;
    const unusuallyLowDays = selectReviewLowDayCandidates({
      days: sources.nutrition,
      analysisStart: checkIn.analysisStart,
      analysisEnd: checkIn.analysisEnd,
      usableNutritionIds,
    });
    const dataEvidence: Array<{
      kind: 'nutrition' | 'weigh_in';
      id: string | null;
      localDate: string;
      state: 'logged' | 'usable' | 'excluded' | 'pending_cutoff' | 'missing';
      label: string;
      detail: string;
      reasonCodes: string[];
      resolution: string | null;
    }> = [];
    for (const day of sources.nutrition) {
      if (
        day.date > (checkIn.analysisEnd ?? checkIn.localDate) &&
        day.status === 'complete' &&
        day.itemCount > 0
      ) {
        dataEvidence.push({
          kind: 'nutrition',
          id: day.id,
          localDate: day.date,
          state: 'pending_cutoff',
          label: 'Complete nutrition logged after the completed-day cutoff',
          detail: `${Math.round(day.calories)} kcal is logged and will become eligible only after the local day ends.`,
          reasonCodes: ['COMPLETE_NUTRITION_PENDING_COMPLETED_DAY_CUTOFF'],
          resolution: null,
        });
      } else if (day.status !== 'complete' || day.itemCount === 0) {
        dataEvidence.push({
          kind: 'nutrition',
          id: day.id,
          localDate: day.date,
          state: 'excluded',
          label: `${day.status === 'complete' ? 'Empty complete' : day.status} nutrition day`,
          detail: 'This logged day is visible but excluded from Adaptive TDEE calculations.',
          reasonCodes: [
            day.status === 'partial'
              ? 'PARTIAL_NUTRITION_EXCLUDED'
              : day.status === 'unknown'
                ? 'UNKNOWN_NUTRITION_EXCLUDED'
                : 'INVALID_COMPLETE_NUTRITION_EXCLUDED',
          ],
          resolution: null,
        });
      } else if (!usableNutritionIds.has(day.id) && day.date <= (checkIn.analysisEnd ?? '')) {
        const beforeTrend = firstTrendDate !== null && day.date < firstTrendDate;
        dataEvidence.push({
          kind: 'nutrition',
          id: day.id,
          localDate: day.date,
          state: 'logged',
          label: beforeTrend
            ? 'Complete nutrition before Trend Weight overlap'
            : 'Complete nutrition awaiting usable Trend Weight overlap',
          detail: `${Math.round(day.calories)} kcal is logged, but this date is outside the canonical overlapping Trend Weight interval and was not used.`,
          reasonCodes: [
            beforeTrend
              ? 'COMPLETE_NUTRITION_BEFORE_WEIGHT_TREND'
              : 'COMPLETE_NUTRITION_AWAITING_WEIGHT_TREND',
          ],
          resolution: null,
        });
      }
    }
    for (
      let date = checkIn.analysisStart;
      date !== null &&
      date <= (checkIn.analysisEnd ?? checkIn.localDate) &&
      date <= checkIn.localDate;
      date = addCalendarDays(date, 1)
    ) {
      if (!sources.nutrition.some((day) => day.date === date)) {
        dataEvidence.push({
          kind: 'nutrition',
          id: null,
          localDate: date,
          state: 'missing',
          label: 'No nutrition log',
          detail:
            'No nutrition record was logged for this local date; Pulse did not treat it as zero intake.',
          reasonCodes: ['MISSING_NUTRITION_RECORD'],
          resolution: null,
        });
      }
    }
    for (const day of unusuallyLowDays) {
      const matchedContext = matchLowDayResolutionContext(sources.contexts, day);
      dataEvidence.push({
        kind: 'nutrition',
        id: day.id,
        localDate: day.date,
        state: 'logged',
        label: matchedContext
          ? 'Complete low day explained by context'
          : 'Complete day needs confirmation',
        detail: `${Math.round(day.calories)} kcal is unusually low relative to this review period. Pulse has not changed its eligibility status.`,
        reasonCodes: ['LIKELY_PARTIAL_NUTRITION'],
        resolution: matchedContext?.resolution ?? null,
      });
    }
    const pendingWeights = sources.weights.filter(
      (weight) => weight.date > (checkIn.analysisEnd ?? checkIn.localDate),
    );
    for (const pendingWeight of pendingWeights) {
      dataEvidence.push({
        kind: 'weigh_in',
        id: pendingWeight.id,
        localDate: pendingWeight.date,
        state: 'pending_cutoff',
        label: 'Weigh-in logged after the completed-day cutoff',
        detail:
          'This weigh-in is visible but will not enter the calculation until the local day ends.',
        reasonCodes: readiness.noteCodes.filter(
          (code) => code === 'WEIGH_INS_PENDING_COMPLETED_DAY_CUTOFF',
        ),
        resolution: null,
      });
    }
    for (const suspectWeight of eligibility.suspectWeightEntries) {
      dataEvidence.push({
        kind: 'weigh_in',
        id: suspectWeight.id,
        localDate: suspectWeight.date,
        state: 'excluded',
        label: 'Suspect weigh-in excluded',
        detail:
          'The canonical Adaptive TDEE quality check flagged this weigh-in, so it did not support a plan decision.',
        reasonCodes: ['SUSPECT_WEIGHT_DATA'],
        resolution: null,
      });
    }
    const latestUsableWeight = eligibility.actualWeights
      .filter((weight) => !suspectWeightIds.has(weight.id))
      .at(-1);
    if (calculation.reasonCodes.includes('STALE_WEIGHT') && latestUsableWeight) {
      dataEvidence.push({
        kind: 'weigh_in',
        id: latestUsableWeight.id,
        localDate: latestUsableWeight.date,
        state: 'logged',
        label: 'Latest weigh-in is stale for a new decision',
        detail:
          'This weigh-in remains logged, but it is older than the canonical recency threshold.',
        reasonCodes: ['STALE_WEIGHT'],
        resolution: null,
      });
    }
    if (
      !latestUsableWeight ||
      calculation.reasonCodes.some((reason) =>
        ['INSUFFICIENT_WEIGHT', 'INSUFFICIENT_WEIGHT_SPAN', 'INSUFFICIENT_TREND_POINTS'].includes(
          reason,
        ),
      )
    ) {
      dataEvidence.push({
        kind: 'weigh_in',
        id: null,
        localDate: checkIn.analysisEnd ?? checkIn.localDate,
        state: 'missing',
        label: 'More usable weigh-ins are required',
        detail: `${readiness.weighInsUsable} usable weigh-ins currently cover ${eligibility.actualWeightSpanDays} days; Pulse preserved the current plan.`,
        reasonCodes: calculation.reasonCodes.filter((reason) =>
          ['INSUFFICIENT_WEIGHT', 'INSUFFICIENT_WEIGHT_SPAN', 'INSUFFICIENT_TREND_POINTS'].includes(
            reason,
          ),
        ),
        resolution: null,
      });
    }
    const hasUnresolvedLowDay = dataEvidence.some(
      (item) => item.reasonCodes.includes('LIKELY_PARTIAL_NUTRITION') && item.resolution === null,
    );
    const sessionFeedback = sources.sessions
      .map((session) => ({ session, feedback: parseWorkoutSessionFeedback(session.feedback) }))
      .filter((entry) => entry.feedback !== null);
    const average = (values: number[]) =>
      values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    const completedSets = sources.sets.filter((set) => set.completed);
    const rpes = completedSets.flatMap((set) => (set.rpe === null ? [] : [set.rpe]));
    const sessionById = new Map(sources.sessions.map((session) => [session.id, session]));
    const exerciseSessionVolumes = new Map<
      string,
      Map<string, { date: string; startedAt: number; completedAt: number | null; volume: number }>
    >();
    for (const set of completedSets) {
      if (set.exerciseId === null || set.weight === null || set.reps === null) continue;
      const session = sessionById.get(set.sessionId);
      if (!session) continue;
      const sessionsForExercise = exerciseSessionVolumes.get(set.exerciseId) ?? new Map();
      const existing = sessionsForExercise.get(session.id);
      sessionsForExercise.set(session.id, {
        date: session.date,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        volume: (existing?.volume ?? 0) + set.weight * set.reps,
      });
      exerciseSessionVolumes.set(set.exerciseId, sessionsForExercise);
    }
    const exerciseDirections = [...exerciseSessionVolumes.values()].flatMap((bySession) => {
      const values = [...bySession.entries()].sort(
        ([leftId, left], [rightId, right]) =>
          left.date.localeCompare(right.date) ||
          (left.completedAt ?? left.startedAt) - (right.completedAt ?? right.startedAt) ||
          left.startedAt - right.startedAt ||
          leftId.localeCompare(rightId),
      );
      if (values.length < 2) return [];
      const first = values.at(0)?.[1].volume ?? 0;
      const last = values.at(-1)?.[1].volume ?? 0;
      return [
        last > first * 1.05 ? 'improving' : last < first * 0.95 ? 'declining' : 'steady',
      ] as const;
    });
    const performanceTrend =
      exerciseDirections.length === 0 || new Set(exerciseDirections).size !== 1
        ? 'unavailable'
        : exerciseDirections[0];
    const painOrIllnessPresent =
      sources.contexts.some((context) =>
        ['illness', 'pain_injury', 'recovery'].includes(context.category),
      ) ||
      sessionFeedback.some(({ session, feedback }) =>
        [
          session.notes,
          feedback?.notes,
          ...(feedback?.responses?.flatMap((response) => [response.label, response.notes]) ?? []),
        ]
          .filter(Boolean)
          .some((text) => /pain|injur|ill|sick|flare/iu.test(text ?? '')),
      );
    const completedSessions = sources.sessions.filter((session) => session.status === 'completed');
    const cancelledSessions = sources.sessions.filter((session) => session.status === 'cancelled');
    const missedSchedules = sources.scheduled.filter(
      (scheduled) =>
        scheduled.date <= (checkIn.analysisEnd ?? checkIn.localDate) &&
        !completedSessions.some((session) => session.scheduledWorkoutId === scheduled.id),
    );
    const movedContexts = sources.contexts.filter(
      (context) => context.category === 'schedule_change' || context.category === 'training_change',
    );
    const trainingRelevant =
      painOrIllnessPresent ||
      cancelledSessions.length > 0 ||
      missedSchedules.length > 0 ||
      movedContexts.length > 0 ||
      performanceTrend === 'declining' ||
      sessionFeedback.some(({ feedback }) => (feedback?.recovery ?? 5) <= 2);
    const calorieDelta =
      currentTarget && proposedTarget ? proposedTarget.calories - currentTarget.calories : 0;
    const recommendationOutcome = hasUnresolvedLowDay
      ? 'clarify'
      : calculation.reasonCodes.includes('GOAL_REACHED')
        ? 'goal_review'
        : calculation.state === 'holding' || calculation.state === 'learning'
          ? 'defer'
          : proposedTarget && Math.abs(calorieDelta) >= 25
            ? 'adjust'
            : trainingRelevant && !proposedTarget
              ? 'training_review'
              : 'keep';
    const modules: Array<Record<string, unknown>> = [];
    if (dataEvidence.length > 0) {
      modules.push({
        kind: 'data_quality',
        title: 'Data quality',
        summary: hasUnresolvedLowDay
          ? 'Pulse needs one logging clarification before a plan decision.'
          : 'Logged records that are pending or excluded remain visible and did not count as zero.',
        evidence: dataEvidence,
        requiresClarification: hasUnresolvedLowDay,
        resolutionOptions: hasUnresolvedLowDay
          ? ['confirm_complete', 'mark_partial', 'add_context']
          : ['add_context'],
      });
    }
    const eta = progress?.kind === 'weight_change' ? progress.actualProjection : null;
    modules.push({
      kind: 'outcome',
      title: 'Outcome',
      goalType: currentGoal.goal.type,
      scaleWeightKg: progress?.latestScaleWeightKg ?? sources.weights.at(-1)?.weightKg ?? null,
      trendWeightKg: progress?.currentTrendWeightKg ?? calculation.latestTrendWeightKg,
      trendChangeKg: analytics.summary.observedTrendWeightChangeKg,
      actualRateKgPerWeek: progress?.actualRateKgPerWeek ?? null,
      desiredRateKgPerWeek: progress?.kind === 'weight_change' ? progress.desiredRateKgPerWeek : 0,
      etaStartDate: eta?.projectedStartDate ?? null,
      etaEndDate: eta?.projectedEndDate ?? null,
      summary:
        progress?.actualRateKgPerWeek === null
          ? 'Trend Weight does not yet cover enough time for a reliable weekly rate.'
          : 'Pulse compared your server-owned Trend Weight rate with the selected goal rate.',
      scaleNoiseExplanation:
        'Daily scale weight includes water, glycogen, food, and digestion noise; Trend Weight is the smoothed signal used for this review.',
    });
    if (recommendationOutcome === 'adjust' || recommendationOutcome === 'defer') {
      modules.push({
        kind: 'energy',
        title: 'Energy',
        state: analytics.current.state,
        averageIntakeKcal: analytics.summary.averageIntakeKcal,
        averageTargetKcal: analytics.summary.averageTargetKcal,
        averageExpenditureKcal: analytics.summary.averageExpenditureKcal,
        intakeMinusTargetKcal: analytics.summary.averageIntakeMinusTargetKcal,
        intakeMinusExpenditureKcal: analytics.summary.averageIntakeMinusExpenditureKcal,
        completeDays: analytics.summary.completeNutritionDays,
        summary: analytics.explanation.detail,
        sourceCheckInIds: analytics.markers.flatMap((marker) =>
          marker.checkInId === null ? [] : [marker.checkInId],
        ),
      });
    }
    if (trainingRelevant) {
      modules.push({
        kind: 'training_recovery',
        title: 'Training and recovery',
        scheduledCount: sources.scheduled.length,
        completedCount: completedSessions.length,
        movedCount: movedContexts.length,
        skippedCount: new Set([
          ...cancelledSessions.map((session) => session.id),
          ...missedSchedules.map((scheduled) => scheduled.id),
        ]).size,
        averageRpe: average(rpes),
        averageEnergy: average(
          sessionFeedback.flatMap(({ feedback }) => (feedback ? [feedback.energy] : [])),
        ),
        averageRecovery: average(
          sessionFeedback.flatMap(({ feedback }) => (feedback ? [feedback.recovery] : [])),
        ),
        performanceTrend,
        painOrIllnessPresent,
        summary:
          'Training and recovery facts are shown for review. They did not alter the nutrition calculation.',
        evidence: [
          ...movedContexts.map((context) => ({
            kind: 'annotation' as const,
            id: context.id,
            localDate:
              context.subject.kind === 'date' ? context.subject.localDate : checkIn.localDate,
            state: 'logged' as const,
            label: context.category.replaceAll('_', ' '),
            detail: context.note,
            reasonCodes: ['CONTEXT_RECORDED'],
            resolution: context.resolution,
          })),
          ...cancelledSessions.map((session) => ({
            kind: 'workout_session' as const,
            id: session.id,
            localDate: session.date,
            state: 'logged' as const,
            label: 'Cancelled workout session',
            detail: session.notes ?? 'No cancellation reason was recorded.',
            reasonCodes: ['WORKOUT_CANCELLED'],
            resolution: null,
          })),
        ],
        nutritionCausalRuleApplied: false,
      });
    }
    const update = calculation.adaptiveUpdate;
    const goal = calculation.goal;
    modules.push({
      kind: 'recommendation',
      title: 'Recommendation',
      outcome: recommendationOutcome,
      headline:
        recommendationOutcome === 'adjust'
          ? `Adjust the daily target by ${calorieDelta > 0 ? '+' : ''}${Math.round(calorieDelta)} kcal`
          : recommendationOutcome === 'keep'
            ? 'Keep the current targets'
            : recommendationOutcome === 'clarify'
              ? 'Clarify one logged day before deciding'
              : recommendationOutcome === 'goal_review'
                ? 'Review the completed goal before changing targets'
                : recommendationOutcome === 'training_review'
                  ? 'Review training and recovery; keep nutrition separate'
                  : 'Defer a target decision while evidence is weak',
      explanation:
        recommendationOutcome === 'adjust'
          ? 'The deterministic Adaptive TDEE calculation supports a bounded target change. Nothing changes until you accept.'
          : recommendationOutcome === 'keep'
            ? 'The available evidence does not support a material target change this week.'
            : 'Pulse will preserve the current plan until the stated question or evidence condition is resolved.',
      currentTarget,
      proposedTarget: recommendationOutcome === 'adjust' ? proposedTarget : null,
      causalBreakdown: {
        priorExpenditureKcal: calculation.priorTdeeKcal,
        observedExpenditureKcal: calculation.observedTdeeKcal,
        proposedExpenditureKcal:
          update?.proposedTdeeKcal ??
          (calculation.state === 'baseline' ? calculation.priorTdeeKcal : null),
        observedTrendContributionKcal:
          calculation.weightTrendKgPerDay === null
            ? null
            : -calculation.weightTrendKgPerDay *
              checkIn.inputSnapshot.constants.energyDensityKcalPerKg,
        goalRateContributionKcal: goal?.requestedCalorieAdjustment ?? null,
        requestedAdjustmentKcal: update?.requestedChangeKcal ?? null,
        appliedAdjustmentKcal: update ? update.proposedTdeeKcal - calculation.priorTdeeKcal : null,
        smoothingOrCapKcal: update ? update.proposedTdeeKcal - calculation.observedTdeeKcal : null,
        safetyFloorKcal: Math.max(
          checkIn.inputSnapshot.constants.absoluteCalorieFloorKcal,
          checkIn.inputSnapshot.program.systemCalorieFloorKcal,
          checkIn.inputSnapshot.program.userCalorieFloorKcal,
        ),
        deficitLimitKcal:
          update && currentGoal.goal.type === 'lose' && !goal?.goalReached
            ? Math.max(
                0,
                update.proposedTdeeKcal -
                  Math.max(
                    checkIn.inputSnapshot.constants.absoluteCalorieFloorKcal,
                    checkIn.inputSnapshot.program.systemCalorieFloorKcal,
                    checkIn.inputSnapshot.program.userCalorieFloorKcal,
                    update.proposedTdeeKcal *
                      checkIn.inputSnapshot.constants.minimumLossCaloriesFraction,
                  ),
              )
            : null,
        includedNutritionDates: eligibility.usableNutritionDays.map((day) => day.date),
        excludedNutrition: sources.nutrition
          .filter((day) => !usableNutritionIds.has(day.id))
          .map((day) => ({
            localDate: day.date,
            reasonCodes: [
              day.status === 'partial'
                ? 'PARTIAL_NUTRITION_EXCLUDED'
                : day.status === 'unknown'
                  ? 'UNKNOWN_NUTRITION_EXCLUDED'
                  : day.itemCount === 0
                    ? 'INVALID_COMPLETE_NUTRITION_EXCLUDED'
                    : day.date > (checkIn.analysisEnd ?? checkIn.localDate)
                      ? 'COMPLETE_NUTRITION_PENDING_COMPLETED_DAY_CUTOFF'
                      : firstTrendDate !== null && day.date < firstTrendDate
                        ? 'COMPLETE_NUTRITION_BEFORE_WEIGHT_TREND'
                        : lastTrendDate !== null && day.date > lastTrendDate
                          ? 'COMPLETE_NUTRITION_AWAITING_WEIGHT_TREND'
                          : 'NO_OVERLAPPING_DATA',
            ],
          })),
        includedWeightDates: eligibility.actualWeights
          .filter((weight) => !suspectWeightIds.has(weight.id))
          .map((weight) => weight.date),
        excludedWeight: calculation.suspectWeightEntries.map((weight) => ({
          localDate: weight.date,
          reasonCodes: ['SUSPECT_WEIGHT_EXCLUDED'],
        })),
        confidenceLabel: calculation.confidence?.label ?? null,
        confidenceScore: calculation.confidence?.score ?? null,
        readinessReasonCodes: calculation.reasonCodes,
      },
    });
    return adaptiveWeeklyReviewSnapshotSchema.parse({
      version: 1,
      reviewLocalDate: checkIn.localDate,
      analysisStart: checkIn.analysisStart ?? checkIn.localDate,
      analysisEnd: checkIn.analysisEnd ?? checkIn.localDate,
      timeZone: checkIn.inputSnapshot.program.timeZone,
      weightUnit: sources.weightUnit,
      programId,
      checkInId: checkIn.id,
      goalId: checkIn.goalId,
      goalRevisionId: checkIn.goalRevisionId,
      algorithmVersion: checkIn.algorithmVersion,
      sourceFingerprint: sourceHash,
      headline:
        modules.at(-1)?.kind === 'recommendation'
          ? String(modules.at(-1)?.headline)
          : 'Weekly decision review',
      summary: `${calculation.completeNutritionDays} complete nutrition days and ${calculation.actualWeightCount} weigh-ins informed this review.`,
      confidenceLabel: calculation.confidence?.label ?? null,
      confidenceScore: calculation.confidence?.score ?? null,
      modules,
      contexts: sources.contexts,
    });
  };

  const previewWithinTransaction = (
    userId: string,
    input: AdaptiveWeeklyReviewPreviewInput,
    forceRefresh = false,
    validatedRefreshReviewId?: string,
  ): AdaptiveWeeklyReview => {
    const program = findProgram(userId);
    if (!program) throw new AdaptiveProgramNotFoundError();
    const localDate = dateKeyInTimeZone(now(), program.timeZone);
    const sameCycle = db
      .select(reviewRowSelection)
      .from(adaptiveNutritionReviews)
      .where(
        and(
          eq(adaptiveNutritionReviews.userId, userId),
          eq(adaptiveNutritionReviews.programId, program.id),
          eq(adaptiveNutritionReviews.kind, input.kind),
          eq(adaptiveNutritionReviews.reviewLocalDate, localDate),
        ),
      )
      .orderBy(desc(adaptiveNutritionReviews.createdAt))
      .limit(1)
      .get() as ReviewRow | undefined;
    if (sameCycle && !forceRefresh) return projectCurrentReview(sameCycle);

    const checkIn = adaptiveStore.previewCheckIn(userId, {
      kind: input.kind,
      includeToday: false,
    });
    const sources = loadSourceFacts(userId, program.id, checkIn);
    const sourceHash = sourceFingerprint(checkIn, sources);
    const existing = db
      .select(reviewRowSelection)
      .from(adaptiveNutritionReviews)
      .where(
        and(
          eq(adaptiveNutritionReviews.userId, userId),
          eq(adaptiveNutritionReviews.programId, program.id),
          eq(adaptiveNutritionReviews.kind, input.kind),
          eq(adaptiveNutritionReviews.analysisEnd, checkIn.analysisEnd ?? checkIn.localDate),
          eq(adaptiveNutritionReviews.sourceFingerprint, sourceHash),
        ),
      )
      .limit(1)
      .get() as ReviewRow | undefined;
    if (existing) return projectCurrentReview(existing);

    const activeRows = db
      .select(reviewRowSelection)
      .from(adaptiveNutritionReviews)
      .where(
        and(
          eq(adaptiveNutritionReviews.userId, userId),
          eq(adaptiveNutritionReviews.programId, program.id),
        ),
      )
      .all() as ReviewRow[];
    for (const row of activeRows) {
      const current = projectCurrentReview(row);
      const sourceStatus = adaptiveStore.findCheckInDetail(row.userId, row.checkInId)?.status;
      if (
        row.id !== validatedRefreshReviewId &&
        current.state === 'stale' &&
        sourceStatus !== undefined &&
        ['accepted', 'declined', 'held', 'superseded'].includes(sourceStatus)
      ) {
        continue;
      }
      if (['pending', 'awaiting_clarification', 'deferred', 'stale'].includes(current.state)) {
        const sequence = current.actionSequence + 1;
        db.insert(adaptiveNutritionReviewActions)
          .values({
            id: randomUUID(),
            reviewId: row.id,
            userId,
            sequence,
            type: 'supersede',
            payload: { type: 'supersede', replacementCheckInId: checkIn.id },
            ...actorColumns({ type: 'system', label: 'Pulse' }),
            createdAt: now().getTime(),
          })
          .run();
      }
    }
    const snapshot = buildSnapshot(userId, program.id, checkIn, sources, sourceHash);
    const row = db
      .insert(adaptiveNutritionReviews)
      .values({
        id: randomUUID(),
        userId,
        programId: program.id,
        checkInId: checkIn.id,
        kind: input.kind,
        reviewVersion: 1,
        sourceFingerprint: sourceHash,
        reviewLocalDate: checkIn.localDate,
        analysisStart: snapshot.analysisStart,
        analysisEnd: snapshot.analysisEnd,
        timeZone: snapshot.timeZone,
        snapshot,
        createdAt: now().getTime(),
      })
      .returning(reviewRowSelection)
      .get() as ReviewRow | undefined;
    if (!row) throw new Error('Failed to persist adaptive weekly review');
    return projectCurrentReview(row);
  };

  const preview = (
    userId: string,
    rawInput: AdaptiveWeeklyReviewPreviewInput,
  ): AdaptiveWeeklyReview => {
    const input = adaptiveWeeklyReviewPreviewInputSchema.parse(rawInput);
    return immediate(() => previewWithinTransaction(userId, input, false));
  };

  const isDeferredReady = (review: AdaptiveWeeklyReview) => {
    if (review.state !== 'deferred' || !review.deferCondition) return review.state !== 'deferred';
    if (review.deferCondition.kind === 'until_date') {
      return dateKeyInTimeZone(now(), review.snapshot.timeZone) >= review.deferCondition.localDate;
    }
    const row = findReviewRowById(review.id);
    if (!row) return false;
    const today = dateKeyInTimeZone(now(), review.snapshot.timeZone);
    if (review.deferCondition.evidence === 'next_complete_nutrition_day') {
      const completedDayCutoff = addCalendarDays(today, -1);
      return Boolean(
        db
          .select({ id: nutritionLogs.id })
          .from(nutritionLogs)
          .innerJoin(meals, eq(meals.nutritionLogId, nutritionLogs.id))
          .innerJoin(mealItems, eq(mealItems.mealId, meals.id))
          .where(
            and(
              eq(nutritionLogs.userId, row.userId),
              eq(nutritionLogs.status, 'complete'),
              sql`${nutritionLogs.date} > ${review.snapshot.analysisEnd}`,
              lte(nutritionLogs.date, completedDayCutoff),
            ),
          )
          .limit(1)
          .get(),
      );
    }
    if (review.deferCondition.evidence === 'next_weigh_in') {
      const recommendation = review.snapshot.modules.find(
        (module) => module.kind === 'recommendation',
      );
      const reviewedWeightDates =
        recommendation?.kind === 'recommendation'
          ? [
              ...recommendation.causalBreakdown.includedWeightDates,
              ...recommendation.causalBreakdown.excludedWeight.map((weight) => weight.localDate),
            ]
          : [];
      const latestReviewedWeightDate =
        reviewedWeightDates.sort().at(-1) ?? review.snapshot.analysisEnd;
      const completedDayCutoff = addCalendarDays(today, -1);
      return Boolean(
        db
          .select({ id: bodyWeight.id })
          .from(bodyWeight)
          .where(
            and(
              eq(bodyWeight.userId, row.userId),
              sql`${bodyWeight.date} > ${latestReviewedWeightDate}`,
              lte(bodyWeight.date, completedDayCutoff),
            ),
          )
          .limit(1)
          .get(),
      );
    }
    const eligibility = adaptiveStore.getState(row.userId).eligibility;
    if (!eligibility) return false;
    return review.deferCondition.evidence === 'nutrition_eligibility_restored'
      ? eligibility.eligible &&
          !eligibility.reasonCodes.some((reason) => reason.includes('NUTRITION'))
      : eligibility.eligible &&
          !eligibility.reasonCodes.some((reason) =>
            ['WEIGHT', 'SPAN'].some((fragment) => reason.includes(fragment)),
          );
  };

  const findReviewRowById = (reviewId: string): ReviewRow | null =>
    (db
      .select(reviewRowSelection)
      .from(adaptiveNutritionReviews)
      .where(eq(adaptiveNutritionReviews.id, reviewId))
      .limit(1)
      .get() as ReviewRow | undefined) ?? null;

  const projectCurrentReview = (
    row: ReviewRow,
    actions?: AdaptiveReviewAction[],
  ): AdaptiveWeeklyReview => {
    const hydrated = hydrateReview(row, actions);
    if (['accepted', 'declined', 'superseded'].includes(hydrated.state)) return hydrated;
    const checkIn = adaptiveStore.findCheckInDetail(row.userId, row.checkInId);
    const fresh =
      checkIn !== null &&
      ['held', 'pending'].includes(checkIn.status) &&
      sourceFingerprint(checkIn, loadSourceFacts(row.userId, row.programId, checkIn)) ===
        row.sourceFingerprint;
    if (!fresh) {
      return adaptiveWeeklyReviewSchema.parse({
        ...hydrated,
        state: 'stale',
        availableActions: [],
      });
    }
    if (checkIn.status === 'held') {
      return adaptiveWeeklyReviewSchema.parse({
        ...hydrated,
        availableActions: hydrated.availableActions.filter((action) =>
          ['answer', 'ask_agent'].includes(action),
        ),
      });
    }
    if (hydrated.state === 'deferred' && isDeferredReady(hydrated)) {
      if (hydrated.deferCondition?.kind === 'until_evidence') {
        return adaptiveWeeklyReviewSchema.parse({
          ...hydrated,
          state: 'stale',
          availableActions: [],
        });
      }
      const recommendation = hydrated.snapshot.modules.find(
        (module) => module.kind === 'recommendation',
      );
      const outcome = recommendation?.kind === 'recommendation' ? recommendation.outcome : 'defer';
      return adaptiveWeeklyReviewSchema.parse({
        ...hydrated,
        state: 'pending',
        availableActions: availableActionsFor('pending', outcome),
      });
    }
    return hydrated;
  };

  const getPending = (userId: string): AdaptiveWeeklyReview | null => {
    const rows = db
      .select(reviewRowSelection)
      .from(adaptiveNutritionReviews)
      .where(
        and(
          eq(adaptiveNutritionReviews.userId, userId),
          sql`coalesce((
            select latest.type
              from adaptive_nutrition_review_actions latest
             where latest.review_id = ${adaptiveNutritionReviews.id}
               and latest.user_id = ${userId}
             order by latest.sequence desc
             limit 1
          ), 'pending') in ('pending', 'edit', 'ask_agent', 'answer', 'defer')`,
        ),
      )
      .orderBy(desc(adaptiveNutritionReviews.createdAt))
      .limit(64)
      .all() as ReviewRow[];
    return (
      rows
        .flatMap((row) => {
          const hydrated = hydrateReview(row);
          if (hydrated.state === 'deferred' && !isDeferredReady(hydrated)) return [];
          const current = projectCurrentReview(row);
          const sourceStatus = adaptiveStore.findCheckInDetail(row.userId, row.checkInId)?.status;
          if (
            current.state === 'stale' &&
            sourceStatus !== undefined &&
            ['accepted', 'declined', 'held', 'superseded'].includes(sourceStatus)
          ) {
            return [];
          }
          return [current];
        })
        .find((review) => ['pending', 'awaiting_clarification', 'stale'].includes(review.state)) ??
      null
    );
  };

  const getPendingProjection = (
    userId: string,
  ): Pick<AdaptiveWeeklyReview, 'id' | 'snapshot' | 'state'> | null => {
    const rows = db
      .select(reviewRowSelection)
      .from(adaptiveNutritionReviews)
      .where(
        and(
          eq(adaptiveNutritionReviews.userId, userId),
          sql`coalesce((
            select latest.type
              from adaptive_nutrition_review_actions latest
             where latest.review_id = ${adaptiveNutritionReviews.id}
               and latest.user_id = ${userId}
             order by latest.sequence desc
             limit 1
          ), 'pending') in ('pending', 'edit', 'ask_agent', 'answer', 'defer')`,
        ),
      )
      .orderBy(desc(adaptiveNutritionReviews.createdAt))
      .limit(64)
      .all() as ReviewRow[];
    for (const row of rows) {
      const current = projectCurrentReview(row, loadProjectionActions(row.id, row.userId));
      if (current.state === 'deferred') continue;
      const sourceStatus = adaptiveStore.findCheckInDetail(row.userId, row.checkInId)?.status;
      if (
        current.state === 'stale' &&
        sourceStatus !== undefined &&
        ['accepted', 'declined', 'held', 'superseded'].includes(sourceStatus)
      ) {
        continue;
      }
      if (['pending', 'awaiting_clarification', 'stale'].includes(current.state)) {
        return { id: current.id, snapshot: current.snapshot, state: current.state };
      }
    }
    return null;
  };

  const get = (userId: string, reviewId: string) => {
    const row = findReviewRow(userId, reviewId);
    if (!row) throw new AdaptiveReviewNotFoundError();
    return projectCurrentReview(row);
  };

  const list = (userId: string, rawQuery: { page?: number; limit?: number }) => {
    const query = adaptiveWeeklyReviewListQuerySchema.parse(rawQuery);
    const rows = db
      .select(reviewRowSelection)
      .from(adaptiveNutritionReviews)
      .where(eq(adaptiveNutritionReviews.userId, userId))
      .orderBy(desc(adaptiveNutritionReviews.createdAt), desc(adaptiveNutritionReviews.id))
      .limit(query.limit)
      .offset((query.page - 1) * query.limit)
      .all() as ReviewRow[];
    const total =
      db
        .select({ value: count() })
        .from(adaptiveNutritionReviews)
        .where(eq(adaptiveNutritionReviews.userId, userId))
        .get()?.value ?? 0;
    return { data: rows.map((row) => projectCurrentReview(row)), meta: { ...query, total } };
  };

  const appendAction = (
    row: ReviewRow,
    input: AdaptiveReviewActionInput,
    actor: AdaptiveReviewActor,
    current: AdaptiveWeeklyReview,
    storedPayload: Record<string, unknown> = input,
  ) => {
    if (input.expectedActionSequence !== current.actionSequence) {
      throw new AdaptiveReviewActionConflictError();
    }
    if (!current.availableActions.includes(input.type as never)) {
      throw new AdaptiveReviewActionNotAllowedError();
    }
    const createdAt = now().getTime();
    db.insert(adaptiveNutritionReviewActions)
      .values({
        id: randomUUID(),
        reviewId: row.id,
        userId: row.userId,
        sequence: current.actionSequence + 1,
        type: input.type,
        payload: storedPayload,
        ...actorColumns(actor),
        createdAt,
      })
      .run();
  };

  const assertFresh = (row: ReviewRow, expectedFingerprint: string) => {
    if (row.sourceFingerprint !== expectedFingerprint) throw new AdaptiveReviewStaleError();
    const checkIn = adaptiveStore.findCheckInDetail(row.userId, row.checkInId);
    if (!checkIn || checkIn.status !== 'pending') throw new AdaptiveReviewStaleError();
    const current = sourceFingerprint(checkIn, loadSourceFacts(row.userId, row.programId, checkIn));
    if (current !== row.sourceFingerprint) throw new AdaptiveReviewStaleError();
    return checkIn;
  };

  const validateEditedProposal = (
    review: AdaptiveWeeklyReview,
    proposal: AdaptiveReviewTargetProposal,
    checkIn: AdaptiveCheckInDetail,
  ) => {
    const recommendation = review.snapshot.modules.find(
      (module) => module.kind === 'recommendation',
    );
    const original =
      recommendation?.kind === 'recommendation' ? recommendation.proposedTarget : null;
    if (!original)
      throw new AdaptiveReviewProposalInvalidError('This review has no target proposal');
    if (
      proposal.effectiveDate !== original.effectiveDate ||
      Math.abs(proposal.calories - original.calories) > 500 ||
      Math.abs(proposal.protein - original.protein) > 50
    ) {
      throw new AdaptiveReviewProposalInvalidError();
    }
    const floor = Math.max(
      checkIn.inputSnapshot.constants.absoluteCalorieFloorKcal,
      checkIn.inputSnapshot.program.systemCalorieFloorKcal,
      checkIn.inputSnapshot.program.userCalorieFloorKcal,
    );
    if (floor !== undefined && proposal.calories < floor) {
      throw new AdaptiveReviewProposalInvalidError(
        'Edited calories cannot fall below the safety floor',
      );
    }
    const outcome = review.snapshot.modules.find((module) => module.kind === 'outcome');
    const expenditure = recommendation?.causalBreakdown.proposedExpenditureKcal;
    if (
      outcome?.kind === 'outcome' &&
      outcome.goalType === 'lose' &&
      expenditure !== null &&
      expenditure !== undefined &&
      proposal.calories < expenditure * checkIn.inputSnapshot.constants.minimumLossCaloriesFraction
    ) {
      throw new AdaptiveReviewProposalInvalidError(
        'Edited calories cannot exceed the canonical loss deficit limit',
      );
    }
    const expectedCarbs = original.carbs + (proposal.calories - original.calories) / 4;
    if (
      proposal.protein !== original.protein ||
      proposal.fat !== original.fat ||
      proposal.carbs !== expectedCarbs
    ) {
      throw new AdaptiveReviewProposalInvalidError(
        'Edited calories must be reconciled through carbohydrates while protein and fat stay fixed',
      );
    }
  };

  const act = (
    userId: string,
    reviewId: string,
    rawInput: AdaptiveReviewActionInput,
    actor: AdaptiveReviewActor,
  ): AdaptiveWeeklyReview => {
    const input = adaptiveReviewActionInputSchema.parse(rawInput);
    return immediate(() => {
      const row = findReviewRow(userId, reviewId);
      if (!row) throw new AdaptiveReviewNotFoundError();
      const current = projectCurrentReview(row);
      if (
        (current.state === 'accepted' && input.type === 'accept') ||
        (current.state === 'declined' && input.type === 'decline')
      ) {
        return current;
      }
      if (input.type === 'edit') {
        const checkIn = assertFresh(row, input.expectedFingerprint);
        validateEditedProposal(current, input.proposal, checkIn);
      }
      if (input.type === 'defer') {
        assertFresh(row, input.expectedFingerprint);
        if (
          input.condition.kind === 'until_date' &&
          input.condition.localDate <= dateKeyInTimeZone(now(), current.snapshot.timeZone)
        ) {
          throw new AdaptiveReviewActionNotAllowedError('A defer date must be in the future');
        }
        if (
          input.condition.kind === 'until_evidence' &&
          input.condition.baselineFingerprint !== row.sourceFingerprint
        ) {
          throw new AdaptiveReviewActionConflictError('The evidence baseline does not match');
        }
      }
      if (input.type === 'accept') {
        const checkIn = assertFresh(row, input.expectedFingerprint);
        const proposal = current.effectiveProposal;
        const recommendation = current.snapshot.modules.find(
          (module) => module.kind === 'recommendation',
        );
        if (recommendation?.kind === 'recommendation' && recommendation.outcome === 'keep') {
          adaptiveStore.declineCheckIn(userId, checkIn.id);
        } else {
          if (!proposal) throw new AdaptiveCheckInNotAcceptableError();
          adaptiveStore.acceptCheckIn(
            userId,
            checkIn.id,
            { replaceSameDateTarget: input.replaceSameDateTarget ?? false },
            proposal,
          );
        }
        appendAction(row, input, actor, current, {
          ...input,
          appliedProposal:
            recommendation?.kind === 'recommendation' && recommendation.outcome === 'keep'
              ? null
              : proposal,
        });
        return get(userId, reviewId);
      }
      if (input.type === 'decline') {
        assertFresh(row, input.expectedFingerprint);
        adaptiveStore.declineCheckIn(userId, row.checkInId);
      }
      if (input.type === 'answer' && input.contextId !== null) {
        const context = current.snapshot.contexts.find((item) => item.id === input.contextId);
        if (!context || context.deletedAt !== null) throw new AdaptiveReviewContextNotFoundError();
      }
      appendAction(row, input, actor, current);
      return get(userId, reviewId);
    });
  };

  const refresh = (userId: string, reviewId: string): AdaptiveWeeklyReview =>
    immediate(() => {
      const row = findReviewRow(userId, reviewId);
      if (!row) throw new AdaptiveReviewNotFoundError();
      const sourceCheckIn = adaptiveStore.findCheckInDetail(row.userId, row.checkInId);
      if (
        projectCurrentReview(row).state !== 'stale' ||
        sourceCheckIn === null ||
        sourceCheckIn.status !== 'pending'
      ) {
        throw new AdaptiveReviewRefreshNotAllowedError();
      }
      const refreshed = previewWithinTransaction(userId, { kind: row.kind }, true, row.id);
      if (refreshed.id === row.id) throw new AdaptiveReviewStaleError();
      return refreshed;
    });

  const validateSubjectOwnership = (
    userId: string,
    programId: string,
    subject: AdaptiveReviewContextCreateInput['subject'],
  ) => {
    const owned = (
      table: 'nutrition' | 'weight' | 'scheduled' | 'session' | 'checkin',
      id: string,
    ) => {
      if (table === 'nutrition')
        return db
          .select({ id: nutritionLogs.id })
          .from(nutritionLogs)
          .where(and(eq(nutritionLogs.id, id), eq(nutritionLogs.userId, userId)))
          .get();
      if (table === 'weight')
        return db
          .select({ id: bodyWeight.id })
          .from(bodyWeight)
          .where(and(eq(bodyWeight.id, id), eq(bodyWeight.userId, userId)))
          .get();
      if (table === 'scheduled')
        return db
          .select({ id: scheduledWorkouts.id })
          .from(scheduledWorkouts)
          .where(and(eq(scheduledWorkouts.id, id), eq(scheduledWorkouts.userId, userId)))
          .get();
      if (table === 'session')
        return db
          .select({ id: workoutSessions.id })
          .from(workoutSessions)
          .where(and(eq(workoutSessions.id, id), eq(workoutSessions.userId, userId)))
          .get();
      return db
        .select({ id: adaptiveNutritionCheckIns.id })
        .from(adaptiveNutritionCheckIns)
        .where(
          and(
            eq(adaptiveNutritionCheckIns.id, id),
            eq(adaptiveNutritionCheckIns.userId, userId),
            eq(adaptiveNutritionCheckIns.programId, programId),
          ),
        )
        .get();
    };
    const exists =
      subject.kind === 'nutrition_log'
        ? owned('nutrition', subject.id)
        : subject.kind === 'weigh_in'
          ? owned('weight', subject.id)
          : subject.kind === 'scheduled_workout'
            ? owned('scheduled', subject.id)
            : subject.kind === 'workout_session'
              ? owned('session', subject.id)
              : subject.kind === 'check_in'
                ? owned('checkin', subject.id)
                : { id: 'bounded-date' };
    if (!exists) throw new AdaptiveReviewContextNotFoundError();
  };

  const createContext = (
    userId: string,
    rawInput: AdaptiveReviewContextCreateInput,
    actor: Exclude<AdaptiveReviewActor, { type: 'system' }>,
  ): AdaptiveReviewContext => {
    const input = adaptiveReviewContextCreateInputSchema.parse(rawInput);
    return immediate(() => {
      const program = findProgram(userId);
      if (!program) throw new AdaptiveProgramNotFoundError();
      validateSubjectOwnership(userId, program.id, input.subject);
      const currentState = adaptiveStore.getState(userId);
      const currentLocalDate = dateKeyInTimeZone(now(), program.timeZone);
      const subject: AdaptiveReviewContextSubject =
        input.subject.kind === 'upcoming_check_in'
          ? {
              kind: 'upcoming_check_in',
              targetReviewLocalDate: currentState.checkInDue
                ? currentLocalDate
                : (currentState.nextCheckInDate ?? addCalendarDays(currentLocalDate, 7)),
            }
          : input.subject;
      const timestamp = now().getTime();
      const row = db
        .insert(adaptiveNutritionReviewContexts)
        .values({
          id: randomUUID(),
          userId,
          programId: program.id,
          subjectType: subject.kind,
          subject,
          category: input.category,
          note: input.note,
          resolution: input.resolution ?? null,
          resolutionKind: input.resolutionKind ?? null,
          createdBy: actor.type,
          agentTokenId: actor.type === 'agent_token' ? actor.agentTokenId : null,
          actorLabel: actor.label,
          revision: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
          deletedAt: null,
        })
        .returning(contextSelection)
        .get() as Omit<ContextRow, 'userId' | 'programId' | 'subjectType'> | undefined;
      if (!row) throw new Error('Failed to create review context');
      return parseContext(row);
    });
  };

  const requireEditableContext = (
    userId: string,
    contextId: string,
    actor: Exclude<AdaptiveReviewActor, { type: 'system' }>,
  ) => {
    const row = db
      .select()
      .from(adaptiveNutritionReviewContexts)
      .where(
        and(
          eq(adaptiveNutritionReviewContexts.id, contextId),
          eq(adaptiveNutritionReviewContexts.userId, userId),
          isNull(adaptiveNutritionReviewContexts.deletedAt),
        ),
      )
      .limit(1)
      .get();
    if (!row) throw new AdaptiveReviewContextNotFoundError();
    if (
      actor.type === 'agent_token' &&
      (row.createdBy !== 'agent_token' || row.agentTokenId !== actor.agentTokenId)
    ) {
      throw new AdaptiveReviewContextNotFoundError();
    }
    return row;
  };

  const updateContext = (
    userId: string,
    contextId: string,
    rawInput: AdaptiveReviewContextUpdateInput,
    actor: Exclude<AdaptiveReviewActor, { type: 'system' }>,
  ) => {
    const input = adaptiveReviewContextUpdateInputSchema.parse(rawInput);
    return immediate(() => {
      const existing = requireEditableContext(userId, contextId, actor);
      if (existing.revision !== input.expectedRevision)
        throw new AdaptiveReviewContextConflictError();
      const row = db
        .update(adaptiveNutritionReviewContexts)
        .set({
          ...(input.category === undefined ? {} : { category: input.category }),
          ...(input.note === undefined ? {} : { note: input.note }),
          ...(input.resolution === undefined ? {} : { resolution: input.resolution }),
          ...(input.resolutionKind === undefined
            ? input.resolution === null
              ? { resolutionKind: null }
              : {}
            : { resolutionKind: input.resolutionKind }),
          revision: existing.revision + 1,
          updatedAt: now().getTime(),
        })
        .where(
          and(
            eq(adaptiveNutritionReviewContexts.id, contextId),
            eq(adaptiveNutritionReviewContexts.userId, userId),
          ),
        )
        .returning(contextSelection)
        .get() as Omit<ContextRow, 'userId' | 'programId' | 'subjectType'> | undefined;
      if (!row) throw new AdaptiveReviewContextNotFoundError();
      return parseContext(row);
    });
  };

  const deleteContext = (
    userId: string,
    contextId: string,
    expectedRevision: number,
    actor: Exclude<AdaptiveReviewActor, { type: 'system' }>,
  ) =>
    immediate(() => {
      const existing = requireEditableContext(userId, contextId, actor);
      if (existing.revision !== expectedRevision) throw new AdaptiveReviewContextConflictError();
      const timestamp = now().getTime();
      const row = db
        .update(adaptiveNutritionReviewContexts)
        .set({
          revision: existing.revision + 1,
          updatedAt: timestamp,
          deletedAt: timestamp,
        })
        .where(
          and(
            eq(adaptiveNutritionReviewContexts.id, contextId),
            eq(adaptiveNutritionReviewContexts.userId, userId),
          ),
        )
        .returning(contextSelection)
        .get() as Omit<ContextRow, 'userId' | 'programId' | 'subjectType'> | undefined;
      if (!row) throw new AdaptiveReviewContextNotFoundError();
      return parseContext(row);
    });

  return {
    act,
    createContext,
    deleteContext,
    get,
    getPending,
    getPendingProjection,
    list,
    preview,
    refresh,
    updateContext,
  };
};

const getDefaultStore = async () => {
  const { db, sqlite } = await import('../../db/index.js');
  return createAdaptiveWeeklyReviewStore({ db, sqlite });
};

export const previewAdaptiveWeeklyReview = async (
  userId: string,
  input: AdaptiveWeeklyReviewPreviewInput,
) => (await getDefaultStore()).preview(userId, input);

export const getPendingAdaptiveWeeklyReview = async (userId: string) =>
  (await getDefaultStore()).getPending(userId);

export const getAdaptiveWeeklyReview = async (userId: string, reviewId: string) =>
  (await getDefaultStore()).get(userId, reviewId);

export const refreshAdaptiveWeeklyReview = async (userId: string, reviewId: string) =>
  (await getDefaultStore()).refresh(userId, reviewId);

export const listAdaptiveWeeklyReviews = async (
  userId: string,
  query: { page?: number; limit?: number },
) => (await getDefaultStore()).list(userId, query);

export const actOnAdaptiveWeeklyReview = async (
  userId: string,
  reviewId: string,
  input: AdaptiveReviewActionInput,
  actor: AdaptiveReviewActor,
) => (await getDefaultStore()).act(userId, reviewId, input, actor);

export const createAdaptiveReviewContext = async (
  userId: string,
  input: AdaptiveReviewContextCreateInput,
  actor: Exclude<AdaptiveReviewActor, { type: 'system' }>,
) => (await getDefaultStore()).createContext(userId, input, actor);

export const updateAdaptiveReviewContext = async (
  userId: string,
  contextId: string,
  input: AdaptiveReviewContextUpdateInput,
  actor: Exclude<AdaptiveReviewActor, { type: 'system' }>,
) => (await getDefaultStore()).updateContext(userId, contextId, input, actor);

export const deleteAdaptiveReviewContext = async (
  userId: string,
  contextId: string,
  expectedRevision: number,
  actor: Exclude<AdaptiveReviewActor, { type: 'system' }>,
) => (await getDefaultStore()).deleteContext(userId, contextId, expectedRevision, actor);

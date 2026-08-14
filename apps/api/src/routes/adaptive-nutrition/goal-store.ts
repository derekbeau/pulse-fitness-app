import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import {
  adaptiveCurrentGoalSchema,
  adaptiveGoalDetailSchema,
  adaptiveGoalHistorySummarySchema,
  adaptiveGoalQuerySchema,
  adaptiveGoalRevisionSchema,
  adaptiveGoalSchema,
  adaptiveCheckInSummarySchema,
  calendarDaysBetween,
  type AdaptiveCheckInSummary,
  type AdaptiveCurrentGoal,
  type AdaptiveGoal,
  type AdaptiveGoalDetail,
  type AdaptiveGoalHistorySummary,
  type AdaptiveGoalRevision,
} from '@pulse/shared';

import * as schema from '../../db/schema/index.js';
import {
  adaptiveNutritionCheckIns,
  adaptiveNutritionGoalRevisions,
  adaptiveNutritionGoals,
} from '../../db/schema/index.js';

type AdaptiveDatabase = BetterSQLite3Database<typeof schema>;

export class AdaptiveGoalNotFoundError extends Error {
  constructor() {
    super('Adaptive nutrition goal not found');
    this.name = 'AdaptiveGoalNotFoundError';
  }
}

export const adaptiveGoalSelection = {
  id: adaptiveNutritionGoals.id,
  userId: adaptiveNutritionGoals.userId,
  programId: adaptiveNutritionGoals.programId,
  type: adaptiveNutritionGoals.type,
  status: adaptiveNutritionGoals.status,
  startTrendWeightKg: adaptiveNutritionGoals.startTrendWeightKg,
  startScaleWeightKg: adaptiveNutritionGoals.startScaleWeightKg,
  targetWeightKg: adaptiveNutritionGoals.targetWeightKg,
  maintenanceCenterKg: adaptiveNutritionGoals.maintenanceCenterKg,
  goalRatePctPerWeek: adaptiveNutritionGoals.goalRatePctPerWeek,
  startedLocalDate: adaptiveNutritionGoals.startedLocalDate,
  endedLocalDate: adaptiveNutritionGoals.endedLocalDate,
  endedReason: adaptiveNutritionGoals.endedReason,
  createdAt: adaptiveNutritionGoals.createdAt,
  updatedAt: adaptiveNutritionGoals.updatedAt,
};

export const adaptiveGoalRevisionSelection = {
  id: adaptiveNutritionGoalRevisions.id,
  goalId: adaptiveNutritionGoalRevisions.goalId,
  userId: adaptiveNutritionGoalRevisions.userId,
  sequence: adaptiveNutritionGoalRevisions.sequence,
  targetWeightKg: adaptiveNutritionGoalRevisions.targetWeightKg,
  maintenanceCenterKg: adaptiveNutritionGoalRevisions.maintenanceCenterKg,
  goalRatePctPerWeek: adaptiveNutritionGoalRevisions.goalRatePctPerWeek,
  previousTargetWeightKg: adaptiveNutritionGoalRevisions.previousTargetWeightKg,
  previousCenterKg: adaptiveNutritionGoalRevisions.previousCenterKg,
  previousRatePctPerWeek: adaptiveNutritionGoalRevisions.previousRatePctPerWeek,
  reason: adaptiveNutritionGoalRevisions.reason,
  effectiveLocalDate: adaptiveNutritionGoalRevisions.effectiveLocalDate,
  createdAt: adaptiveNutritionGoalRevisions.createdAt,
};

const checkInSelection = {
  id: adaptiveNutritionCheckIns.id,
  goalId: adaptiveNutritionCheckIns.goalId,
  goalRevisionId: adaptiveNutritionCheckIns.goalRevisionId,
  kind: adaptiveNutritionCheckIns.kind,
  status: adaptiveNutritionCheckIns.status,
  calculationState: adaptiveNutritionCheckIns.calculationState,
  localDate: adaptiveNutritionCheckIns.localDate,
  analysisStart: adaptiveNutritionCheckIns.analysisStart,
  analysisEnd: adaptiveNutritionCheckIns.analysisEnd,
  includeToday: adaptiveNutritionCheckIns.includeToday,
  algorithmVersion: adaptiveNutritionCheckIns.algorithmVersion,
  dataFingerprint: adaptiveNutritionCheckIns.dataFingerprint,
  reasonCodes: adaptiveNutritionCheckIns.reasonCodes,
  priorTdeeKcal: adaptiveNutritionCheckIns.priorTdeeKcal,
  observedTdeeKcal: adaptiveNutritionCheckIns.observedTdeeKcal,
  proposedTdeeKcal: adaptiveNutritionCheckIns.proposedTdeeKcal,
  currentTargets: adaptiveNutritionCheckIns.currentTargets,
  proposedTargets: adaptiveNutritionCheckIns.proposedTargets,
  acceptedNutritionTargetId: adaptiveNutritionCheckIns.acceptedNutritionTargetId,
  resolvedAt: adaptiveNutritionCheckIns.resolvedAt,
  createdAt: adaptiveNutritionCheckIns.createdAt,
};

const parseGoal = (value: unknown): AdaptiveGoal => adaptiveGoalSchema.parse(value);
const parseRevision = (value: unknown): AdaptiveGoalRevision =>
  adaptiveGoalRevisionSchema.parse(value);
const parseCheckIn = (value: unknown): AdaptiveCheckInSummary =>
  adaptiveCheckInSummarySchema.parse(value);

export const createAdaptiveGoalReadStore = ({ db }: { db: AdaptiveDatabase }) => {
  const findLatestRevision = (userId: string, goalId: string): AdaptiveGoalRevision | null => {
    const row = db
      .select(adaptiveGoalRevisionSelection)
      .from(adaptiveNutritionGoalRevisions)
      .where(
        and(
          eq(adaptiveNutritionGoalRevisions.userId, userId),
          eq(adaptiveNutritionGoalRevisions.goalId, goalId),
        ),
      )
      .orderBy(desc(adaptiveNutritionGoalRevisions.sequence))
      .limit(1)
      .get();
    return row ? parseRevision(row) : null;
  };

  const getCurrent = (userId: string): AdaptiveCurrentGoal => {
    const row = db
      .select(adaptiveGoalSelection)
      .from(adaptiveNutritionGoals)
      .where(
        and(eq(adaptiveNutritionGoals.userId, userId), eq(adaptiveNutritionGoals.status, 'active')),
      )
      .limit(1)
      .get();
    if (!row) throw new AdaptiveGoalNotFoundError();
    const goal = parseGoal(row);
    const latestRevision = findLatestRevision(userId, goal.id);
    if (!latestRevision) throw new AdaptiveGoalNotFoundError();
    return adaptiveCurrentGoalSchema.parse({
      goal,
      latestRevision,
      progress: null,
      pendingGoalChange: null,
      allowedActions: { edit: false, startNew: false, cancel: false, complete: false },
    });
  };

  const list = (
    userId: string,
    rawQuery: { page?: number; limit?: number },
  ): {
    data: AdaptiveGoalHistorySummary[];
    meta: { page: number; limit: number; total: number };
  } => {
    const query = adaptiveGoalQuerySchema.parse(rawQuery);
    const goals = db
      .select(adaptiveGoalSelection)
      .from(adaptiveNutritionGoals)
      .where(eq(adaptiveNutritionGoals.userId, userId))
      .orderBy(
        desc(adaptiveNutritionGoals.startedLocalDate),
        desc(adaptiveNutritionGoals.createdAt),
      )
      .limit(query.limit)
      .offset((query.page - 1) * query.limit)
      .all()
      .map(parseGoal);
    const goalIds = goals.map((goal) => goal.id);
    const revisions =
      goalIds.length === 0
        ? []
        : db
            .select(adaptiveGoalRevisionSelection)
            .from(adaptiveNutritionGoalRevisions)
            .where(
              and(
                eq(adaptiveNutritionGoalRevisions.userId, userId),
                inArray(adaptiveNutritionGoalRevisions.goalId, goalIds),
              ),
            )
            .orderBy(desc(adaptiveNutritionGoalRevisions.sequence))
            .all()
            .map(parseRevision);
    const latestByGoal = new Map<string, AdaptiveGoalRevision>();
    for (const revision of revisions) {
      if (!latestByGoal.has(revision.goalId)) latestByGoal.set(revision.goalId, revision);
    }
    const accepted =
      goalIds.length === 0
        ? []
        : db
            .select({
              goalId: adaptiveNutritionCheckIns.goalId,
              latestTrendWeightKg: adaptiveNutritionCheckIns.calculationSnapshot,
              resolvedAt: adaptiveNutritionCheckIns.resolvedAt,
              createdAt: adaptiveNutritionCheckIns.createdAt,
            })
            .from(adaptiveNutritionCheckIns)
            .where(
              and(
                eq(adaptiveNutritionCheckIns.userId, userId),
                eq(adaptiveNutritionCheckIns.status, 'accepted'),
                inArray(adaptiveNutritionCheckIns.goalId, goalIds),
              ),
            )
            .orderBy(
              desc(adaptiveNutritionCheckIns.resolvedAt),
              desc(adaptiveNutritionCheckIns.createdAt),
            )
            .all();
    const finalTrendByGoal = new Map<string, number | null>();
    for (const row of accepted) {
      if (!row.goalId || finalTrendByGoal.has(row.goalId)) continue;
      const snapshot = row.latestTrendWeightKg as { latestTrendWeightKg?: unknown };
      finalTrendByGoal.set(
        row.goalId,
        typeof snapshot.latestTrendWeightKg === 'number' ? snapshot.latestTrendWeightKg : null,
      );
    }
    const data = goals.map((goal) => {
      const latestRevision = latestByGoal.get(goal.id);
      if (!latestRevision) throw new AdaptiveGoalNotFoundError();
      const finalTrendWeightKg = finalTrendByGoal.get(goal.id) ?? null;
      return adaptiveGoalHistorySummarySchema.parse({
        goal,
        latestRevision,
        finalTrendWeightKg,
        netChangeKg:
          finalTrendWeightKg === null ? null : finalTrendWeightKg - goal.startTrendWeightKg,
        durationDays:
          goal.endedLocalDate === null
            ? null
            : calendarDaysBetween(goal.startedLocalDate, goal.endedLocalDate),
      });
    });
    const total =
      db
        .select({ total: count() })
        .from(adaptiveNutritionGoals)
        .where(eq(adaptiveNutritionGoals.userId, userId))
        .get()?.total ?? 0;
    return { data, meta: { ...query, total } };
  };

  const getDetail = (userId: string, goalId: string): AdaptiveGoalDetail => {
    const row = db
      .select(adaptiveGoalSelection)
      .from(adaptiveNutritionGoals)
      .where(and(eq(adaptiveNutritionGoals.id, goalId), eq(adaptiveNutritionGoals.userId, userId)))
      .limit(1)
      .get();
    if (!row) throw new AdaptiveGoalNotFoundError();
    const revisions = db
      .select(adaptiveGoalRevisionSelection)
      .from(adaptiveNutritionGoalRevisions)
      .where(
        and(
          eq(adaptiveNutritionGoalRevisions.goalId, goalId),
          eq(adaptiveNutritionGoalRevisions.userId, userId),
        ),
      )
      .orderBy(asc(adaptiveNutritionGoalRevisions.sequence))
      .all()
      .map(parseRevision);
    const acceptedCheckIns = db
      .select(checkInSelection)
      .from(adaptiveNutritionCheckIns)
      .where(
        and(
          eq(adaptiveNutritionCheckIns.goalId, goalId),
          eq(adaptiveNutritionCheckIns.userId, userId),
          eq(adaptiveNutritionCheckIns.status, 'accepted'),
        ),
      )
      .orderBy(
        desc(adaptiveNutritionCheckIns.resolvedAt),
        desc(adaptiveNutritionCheckIns.createdAt),
      )
      .all()
      .map(parseCheckIn);
    return adaptiveGoalDetailSchema.parse({
      goal: parseGoal(row),
      revisions,
      acceptedCheckIns,
    });
  };

  return { findLatestRevision, getCurrent, getDetail, list };
};

const getDefaultStore = async () => {
  const { db } = await import('../../db/index.js');
  return createAdaptiveGoalReadStore({ db });
};

export const getCurrentAdaptiveGoal = async (userId: string) =>
  (await getDefaultStore()).getCurrent(userId);

export const listAdaptiveGoals = async (userId: string, query: { page?: number; limit?: number }) =>
  (await getDefaultStore()).list(userId, query);

export const getAdaptiveGoal = async (userId: string, goalId: string) =>
  (await getDefaultStore()).getDetail(userId, goalId);

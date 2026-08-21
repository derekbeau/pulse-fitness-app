import { and, asc, desc, eq, gte, lte, or } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import {
  ADAPTIVE_GOAL_TRAJECTORY_CONSTANTS,
  ADAPTIVE_TDEE_CONSTANTS,
  adaptiveGoalRevisionSchema,
  adaptiveGoalSchema,
  adaptiveGoalTrajectoryQuerySchema,
  adaptiveGoalTrajectorySchema,
  adaptiveProgramCalculationSchema,
  addCalendarDays,
  calculateAdaptiveDateBoundaries,
  calculateAdaptiveGoalTrajectory,
  calculateAdaptiveTrendPoints,
  calendarDaysBetween,
  evaluateEligibility,
  type AdaptiveGoalRevision,
  type AdaptiveGoalTrajectory,
  type AdaptiveGoalTrajectoryQuery,
} from '@pulse/shared';

import * as schema from '../../db/schema/index.js';
import {
  adaptiveNutritionCheckIns,
  adaptiveNutritionGoalCompletions,
  adaptiveNutritionGoalRevisions,
  adaptiveNutritionGoals,
  adaptiveNutritionProgramRevisions,
  adaptiveNutritionPrograms,
  bodyWeight,
  nutritionTargets,
} from '../../db/schema/index.js';
import { getDateKeyInTimeZone, resolveEffectiveProgramRevisions } from './analytics-store.js';
import {
  adaptiveGoalRevisionSelection,
  adaptiveGoalSelection,
  AdaptiveGoalNotFoundError,
} from './goal-store.js';

type AdaptiveDatabase = BetterSQLite3Database<typeof schema>;

const RANGE_DAYS = { '1m': 30, '3m': 90, '6m': 180, '1y': 365 } as const;

export class AdaptiveGoalTrajectoryFutureEndError extends Error {
  constructor() {
    super('Goal trajectory end date cannot be in the future');
    this.name = 'AdaptiveGoalTrajectoryFutureEndError';
  }
}

export class AdaptiveGoalTrajectoryPreGoalEndError extends Error {
  constructor() {
    super('Goal trajectory end date cannot be before the goal started');
    this.name = 'AdaptiveGoalTrajectoryPreGoalEndError';
  }
}

type TrajectoryCheckIn = {
  id: string;
  goalId: string | null;
  goalRevisionId: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'superseded' | 'held';
  localDate: string;
  dataFingerprint: string;
  proposedTdeeKcal: number | null;
  proposedTargets: unknown;
  calculationSnapshot: unknown;
  createdAt: number;
};

const proposedTargetEffectiveDate = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') return null;
  const effectiveDate = (value as { effectiveDate?: unknown }).effectiveDate;
  return typeof effectiveDate === 'string' ? effectiveDate : null;
};

const calculationGoalReached = (value: unknown) => {
  if (!value || typeof value !== 'object') return false;
  const goal = (value as { goal?: unknown }).goal;
  return Boolean(
    goal && typeof goal === 'object' && (goal as { goalReached?: unknown }).goalReached === true,
  );
};

const acceptedExpenditureEffectiveDate = (checkIn: TrajectoryCheckIn) =>
  proposedTargetEffectiveDate(checkIn.proposedTargets) ?? checkIn.localDate;

const latestRevisionOn = (revisions: readonly AdaptiveGoalRevision[], date: string) => {
  const revision = [...revisions]
    .filter((candidate) => candidate.effectiveLocalDate <= date)
    .sort((left, right) => left.sequence - right.sequence)
    .at(-1);
  if (!revision) throw new AdaptiveGoalNotFoundError();
  return revision;
};

export const createAdaptiveGoalTrajectoryStore = (dependencies: {
  db: AdaptiveDatabase;
  now?: () => Date;
}) => {
  const { db } = dependencies;
  const now = dependencies.now ?? (() => new Date());

  const getTrajectory = (
    userId: string,
    goalId: string,
    rawQuery: AdaptiveGoalTrajectoryQuery,
  ): AdaptiveGoalTrajectory => {
    const query = adaptiveGoalTrajectoryQuerySchema.parse(rawQuery);
    const goalRow = db
      .select(adaptiveGoalSelection)
      .from(adaptiveNutritionGoals)
      .where(and(eq(adaptiveNutritionGoals.id, goalId), eq(adaptiveNutritionGoals.userId, userId)))
      .limit(1)
      .get();
    if (!goalRow) throw new AdaptiveGoalNotFoundError();
    const goal = adaptiveGoalSchema.parse(goalRow);
    const program = db
      .select({ id: adaptiveNutritionPrograms.id })
      .from(adaptiveNutritionPrograms)
      .where(
        and(
          eq(adaptiveNutritionPrograms.id, goal.programId),
          eq(adaptiveNutritionPrograms.userId, userId),
        ),
      )
      .limit(1)
      .get();
    if (!program) throw new AdaptiveGoalNotFoundError();
    const programRevisions = resolveEffectiveProgramRevisions(
      db
        .select({
          id: adaptiveNutritionProgramRevisions.id,
          sequence: adaptiveNutritionProgramRevisions.sequence,
          effectiveAt: adaptiveNutritionProgramRevisions.effectiveAt,
          snapshot: adaptiveNutritionProgramRevisions.snapshot,
        })
        .from(adaptiveNutritionProgramRevisions)
        .where(
          and(
            eq(adaptiveNutritionProgramRevisions.programId, program.id),
            eq(adaptiveNutritionProgramRevisions.userId, userId),
          ),
        )
        .orderBy(asc(adaptiveNutritionProgramRevisions.sequence))
        .all()
        .map((revision) => ({
          ...revision,
          snapshot: adaptiveProgramCalculationSchema.parse(revision.snapshot),
        })),
    );
    const latestProgramRevision = programRevisions.at(-1);
    const initialProgramRevision = programRevisions[0];
    if (!latestProgramRevision || !initialProgramRevision) {
      throw new Error('Adaptive nutrition program revision history is missing');
    }
    const liveToday = getDateKeyInTimeZone(now(), latestProgramRevision.snapshot.timeZone);
    const requestedEnd =
      query.end ?? (goal.status === 'active' ? liveToday : (goal.endedLocalDate ?? liveToday));
    const strategyAsOfDate =
      goal.endedLocalDate !== null && requestedEnd > goal.endedLocalDate
        ? goal.endedLocalDate
        : requestedEnd;
    const effectiveProgramRevision =
      query.end || goal.status !== 'active'
        ? [...programRevisions]
            .reverse()
            .find((revision) => revision.effectiveLocalDate <= strategyAsOfDate)
        : latestProgramRevision;
    if (!effectiveProgramRevision) throw new AdaptiveGoalTrajectoryPreGoalEndError();
    const timeZone = effectiveProgramRevision.snapshot.timeZone;
    const today = getDateKeyInTimeZone(now(), timeZone);
    if (requestedEnd > today) throw new AdaptiveGoalTrajectoryFutureEndError();
    if (requestedEnd < goal.startedLocalDate) throw new AdaptiveGoalTrajectoryPreGoalEndError();
    const goalClosedAsOf = goal.endedLocalDate !== null && goal.endedLocalDate <= strategyAsOfDate;
    const calculationGoal = goalClosedAsOf
      ? goal
      : adaptiveGoalSchema.parse({
          ...goal,
          status: 'active',
          finalTrendWeightKg: null,
          endedLocalDate: null,
          endedReason: null,
        });
    const evidenceThroughDate =
      strategyAsOfDate >= today ? addCalendarDays(today, -1) : strategyAsOfDate;
    const revisions = db
      .select(adaptiveGoalRevisionSelection)
      .from(adaptiveNutritionGoalRevisions)
      .where(
        and(
          eq(adaptiveNutritionGoalRevisions.goalId, goalId),
          eq(adaptiveNutritionGoalRevisions.userId, userId),
          lte(adaptiveNutritionGoalRevisions.effectiveLocalDate, strategyAsOfDate),
        ),
      )
      .orderBy(asc(adaptiveNutritionGoalRevisions.sequence))
      .all()
      .map((revision) => adaptiveGoalRevisionSchema.parse(revision));
    const activeRevision = latestRevisionOn(revisions, strategyAsOfDate);
    const weightRows = db
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
          gte(
            bodyWeight.date,
            addCalendarDays(
              goal.startedLocalDate,
              -(ADAPTIVE_TDEE_CONSTANTS.analysisDays + ADAPTIVE_TDEE_CONSTANTS.warmupDays - 1),
            ),
          ),
          lte(bodyWeight.date, evidenceThroughDate),
        ),
      )
      .orderBy(asc(bodyWeight.date), asc(bodyWeight.id))
      .all()
      .map((entry) => ({ ...entry, weightKg: Number(entry.weightKg) }));
    const rawModelPoints = calculateAdaptiveTrendPoints(weightRows).filter(
      (point) => point.date >= goal.startedLocalDate && point.date <= evidenceThroughDate,
    );
    const requestedRangeStart =
      query.range === 'all'
        ? goal.startedLocalDate
        : addCalendarDays(strategyAsOfDate, -(RANGE_DAYS[query.range] - 1));
    const rangeStart =
      requestedRangeStart < goal.startedLocalDate ? goal.startedLocalDate : requestedRangeStart;
    const currentBoundaries = calculateAdaptiveDateBoundaries(
      strategyAsOfDate,
      strategyAsOfDate < today,
    );
    const currentEligibility = evaluateEligibility({
      boundaries: currentBoundaries,
      nutritionDays: [],
      weightEntries: weightRows,
    });
    const goalPeriodEligibilityTrendPoints = currentEligibility.trendPoints.filter(
      (point) => point.date >= goal.startedLocalDate && point.date <= strategyAsOfDate,
    );
    const storedStartPoint = {
      date: goal.startedLocalDate,
      weightKg: goal.startTrendWeightKg,
      trendWeightKg: goal.startTrendWeightKg,
      sourceEntryId: null,
      interpolated: true,
    };
    const currentTrendPoint =
      goalClosedAsOf && goal.finalTrendWeightKg !== null
        ? {
            date: goal.endedLocalDate ?? strategyAsOfDate,
            weightKg: goal.finalTrendWeightKg,
            trendWeightKg: goal.finalTrendWeightKg,
            sourceEntryId: null,
            interpolated: true,
          }
        : (goalPeriodEligibilityTrendPoints.at(-1) ?? storedStartPoint);
    const endpointCorrectPointsByDate = new Map(
      rawModelPoints.map((point) => [point.date, point] as const),
    );
    endpointCorrectPointsByDate.set(goal.startedLocalDate, storedStartPoint);
    if (currentTrendPoint)
      endpointCorrectPointsByDate.set(currentTrendPoint.date, currentTrendPoint);
    const modelPoints = [...endpointCorrectPointsByDate.values()].sort((left, right) =>
      left.date.localeCompare(right.date),
    );
    const currentActualWeights = currentEligibility.actualWeights;
    const firstCurrentWeight = currentActualWeights[0];
    const lastCurrentWeight = currentActualWeights.at(-1);
    const currentWeightSpanDays =
      firstCurrentWeight && lastCurrentWeight
        ? calendarDaysBetween(firstCurrentWeight.date, lastCurrentWeight.date)
        : 0;
    const completionTrendSupported =
      currentEligibility.suspectWeightEntryIds.length === 0 &&
      currentActualWeights.length >= ADAPTIVE_TDEE_CONSTANTS.minimumActualWeights &&
      currentWeightSpanDays >= ADAPTIVE_TDEE_CONSTANTS.minimumWeightSpanDays &&
      currentEligibility.trendPoints.length >= ADAPTIVE_TDEE_CONSTANTS.minimumTrendPoints &&
      currentEligibility.latestWeightAgeDays !== null &&
      currentEligibility.latestWeightAgeDays <= ADAPTIVE_TDEE_CONSTANTS.maximumWeightAgeDays &&
      currentActualWeights.some(
        (entry) => entry.date <= addCalendarDays(currentBoundaries.analysisStart, 7),
      ) &&
      currentActualWeights.some(
        (entry) => entry.date >= addCalendarDays(currentBoundaries.analysisEnd, -7),
      );
    const latestScaleRow = db
      .select({ id: bodyWeight.id, date: bodyWeight.date, weightKg: bodyWeight.weightKg })
      .from(bodyWeight)
      .where(
        and(
          eq(bodyWeight.userId, userId),
          gte(bodyWeight.date, goal.startedLocalDate),
          lte(bodyWeight.date, strategyAsOfDate),
        ),
      )
      .orderBy(desc(bodyWeight.date), desc(bodyWeight.updatedAt), desc(bodyWeight.id))
      .limit(1)
      .get();
    const checkIns: TrajectoryCheckIn[] = db
      .select({
        id: adaptiveNutritionCheckIns.id,
        goalId: adaptiveNutritionCheckIns.goalId,
        goalRevisionId: adaptiveNutritionCheckIns.goalRevisionId,
        status: adaptiveNutritionCheckIns.status,
        localDate: adaptiveNutritionCheckIns.localDate,
        dataFingerprint: adaptiveNutritionCheckIns.dataFingerprint,
        proposedTdeeKcal: adaptiveNutritionCheckIns.proposedTdeeKcal,
        proposedTargets: adaptiveNutritionCheckIns.proposedTargets,
        calculationSnapshot: adaptiveNutritionCheckIns.calculationSnapshot,
        createdAt: adaptiveNutritionCheckIns.createdAt,
      })
      .from(adaptiveNutritionCheckIns)
      .where(
        and(
          eq(adaptiveNutritionCheckIns.userId, userId),
          eq(adaptiveNutritionCheckIns.programId, program.id),
          lte(adaptiveNutritionCheckIns.localDate, strategyAsOfDate),
        ),
      )
      .orderBy(
        asc(adaptiveNutritionCheckIns.localDate),
        asc(adaptiveNutritionCheckIns.createdAt),
        asc(adaptiveNutritionCheckIns.id),
      )
      .all();
    const acceptedForGoal = checkIns.filter(
      (checkIn) => checkIn.goalId === goalId && checkIn.status === 'accepted',
    );
    const latestAcceptedForRevision = acceptedForGoal
      .filter((checkIn) => checkIn.goalRevisionId === activeRevision.id)
      .at(-1);
    const completionAllowed =
      goal.status === 'active' &&
      latestAcceptedForRevision !== undefined &&
      calculationGoalReached(latestAcceptedForRevision.calculationSnapshot);
    const calculation = calculateAdaptiveGoalTrajectory({
      goal: calculationGoal,
      revisions,
      strategyAsOfDate,
      evidenceThroughDate,
      lookbackDays: query.lookbackDays,
      trendPoints: modelPoints,
      actualRateTrendPoints: goalPeriodEligibilityTrendPoints,
      currentTrendPoint,
      actualRateBlockReason:
        currentEligibility.suspectWeightEntryIds.length > 0 ? 'SUSPECT_WEIGHT_DATA' : null,
      timeInRangeStartDate: rangeStart,
      timeInRangeTrendPoints: modelPoints.filter((point) => point.date >= rangeStart),
      latestScale: latestScaleRow
        ? {
            id: latestScaleRow.id,
            date: latestScaleRow.date,
            weightKg: Number(latestScaleRow.weightKg),
          }
        : null,
      completionAllowed,
      completionTrendSupported,
    });
    const targets = db
      .select({
        calories: nutritionTargets.calories,
        effectiveDate: nutritionTargets.effectiveDate,
        createdAt: nutritionTargets.createdAt,
      })
      .from(nutritionTargets)
      .where(
        and(
          eq(nutritionTargets.userId, userId),
          lte(nutritionTargets.effectiveDate, strategyAsOfDate),
        ),
      )
      .orderBy(asc(nutritionTargets.effectiveDate), asc(nutritionTargets.createdAt))
      .all();
    const currentTarget = targets.at(-1) ?? null;
    const acceptedExpenditure = checkIns
      .filter(
        (checkIn) =>
          checkIn.status === 'accepted' &&
          checkIn.proposedTdeeKcal !== null &&
          acceptedExpenditureEffectiveDate(checkIn) <= strategyAsOfDate,
      )
      .sort(
        (left, right) =>
          acceptedExpenditureEffectiveDate(left).localeCompare(
            acceptedExpenditureEffectiveDate(right),
          ) ||
          left.createdAt - right.createdAt ||
          left.id.localeCompare(right.id),
      )
      .at(-1);
    const displayPoints = modelPoints
      .filter(
        (point) =>
          point.date >= rangeStart &&
          (point.date <= evidenceThroughDate || point.date === currentTrendPoint.date),
      )
      .map((point) => {
        const revision = latestRevisionOn(revisions, point.date);
        const center = revision.maintenanceCenterKg;
        const radius = center
          ? Math.max(
              ADAPTIVE_GOAL_TRAJECTORY_CONSTANTS.maintenanceMinimumRadiusKg,
              center * ADAPTIVE_GOAL_TRAJECTORY_CONSTANTS.maintenanceRadiusFraction,
            )
          : null;
        return {
          date: point.date,
          trendWeightKg: point.trendWeightKg,
          modeledWeightKg: point.weightKg,
          sourceEntryId: point.sourceEntryId,
          interpolated: point.interpolated,
          goalRevisionId: revision.id,
          revisionSequence: revision.sequence,
          targetWeightKg: revision.targetWeightKg,
          maintenanceCenterKg: center,
          maintenanceLowerKg: center !== null && radius !== null ? center - radius : null,
          maintenanceUpperKg: center !== null && radius !== null ? center + radius : null,
          section:
            point.date === currentTrendPoint.date ? ('current' as const) : ('historical' as const),
        };
      });
    const completion = db
      .select({
        checkInId: adaptiveNutritionGoalCompletions.checkInId,
        completedGoalId: adaptiveNutritionGoalCompletions.completedGoalId,
        maintenanceGoalId: adaptiveNutritionGoalCompletions.maintenanceGoalId,
        createdAt: adaptiveNutritionGoalCompletions.createdAt,
      })
      .from(adaptiveNutritionGoalCompletions)
      .where(
        and(
          eq(adaptiveNutritionGoalCompletions.userId, userId),
          or(
            eq(adaptiveNutritionGoalCompletions.completedGoalId, goalId),
            eq(adaptiveNutritionGoalCompletions.maintenanceGoalId, goalId),
          ),
        ),
      )
      .limit(1)
      .get();
    const annotations = [
      {
        id: `goal-start:${goal.id}`,
        date: goal.startedLocalDate,
        kind: 'goal_started' as const,
        label: 'Goal started',
        goalRevisionId: revisions[0]?.id ?? null,
        revisionSequence: revisions[0]?.sequence ?? null,
        checkInId: null,
      },
      ...revisions
        .filter((revision) => revision.sequence > 1)
        .map((revision) => ({
          id: revision.id,
          date: revision.effectiveLocalDate,
          kind: 'goal_revised' as const,
          label: `Target or rate revised · revision ${revision.sequence}`,
          goalRevisionId: revision.id,
          revisionSequence: revision.sequence,
          checkInId: null,
        })),
      ...acceptedForGoal.map((checkIn) => ({
        id: checkIn.id,
        date: checkIn.localDate,
        kind: 'accepted_check_in' as const,
        label: 'Accepted check-in target change',
        goalRevisionId: checkIn.goalRevisionId,
        revisionSequence:
          revisions.find((revision) => revision.id === checkIn.goalRevisionId)?.sequence ?? null,
        checkInId: checkIn.id,
      })),
      ...(goalClosedAsOf && completion?.completedGoalId === goalId
        ? [
            {
              id: completion.checkInId,
              date: goal.endedLocalDate ?? strategyAsOfDate,
              kind: 'goal_completed' as const,
              label: 'Goal completed after review',
              goalRevisionId: activeRevision.id,
              revisionSequence: activeRevision.sequence,
              checkInId: completion.checkInId,
            },
          ]
        : []),
    ].sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        (left.revisionSequence ?? 0) - (right.revisionSequence ?? 0) ||
        left.id.localeCompare(right.id),
    );
    return adaptiveGoalTrajectorySchema.parse({
      algorithmVersion: 'adaptive-tdee-v1',
      trendSource: 'adaptive_model_trend',
      timeZone,
      isHistorical: calculationGoal.status !== 'active' || strategyAsOfDate < today,
      goal: calculationGoal,
      activeRevision: calculation.activeRevision,
      range: { preset: query.range, startDate: rangeStart, endDate: strategyAsOfDate },
      strategyAsOfDate,
      evidenceThroughDate,
      currentTrendDate: calculation.summary.currentTrendDate,
      summary: calculation.summary,
      actualRate: calculation.actualRate,
      forecast: calculation.forecast,
      context: {
        calorieTargetKcal: currentTarget?.calories ?? null,
        calorieTargetEffectiveDate: currentTarget?.effectiveDate ?? null,
        adaptiveExpenditureKcal:
          acceptedExpenditure?.proposedTdeeKcal ?? initialProgramRevision.snapshot.baselineTdeeKcal,
        expenditureSourceCheckInId: acceptedExpenditure?.id ?? null,
        expenditureSourceInputFingerprint: acceptedExpenditure?.dataFingerprint ?? null,
      },
      trendPoints: displayPoints,
      weeklyContributions: calculation.weeklyContributions,
      annotations,
      completionReview: calculation.completionReview,
    });
  };

  return { getTrajectory };
};

const getDefaultStore = async () => {
  const { db } = await import('../../db/index.js');
  return createAdaptiveGoalTrajectoryStore({ db });
};

export const getAdaptiveGoalTrajectory = async (
  userId: string,
  goalId: string,
  query: AdaptiveGoalTrajectoryQuery,
) => (await getDefaultStore()).getTrajectory(userId, goalId, query);

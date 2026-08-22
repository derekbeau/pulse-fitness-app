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
  calculateCanonicalTrendWeightCurrent,
  calculateCanonicalTrendWeightSeries,
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
  nutritionTargetEvents,
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
  acceptedNutritionTargetId: string | null;
  resolvedAt: number | null;
  createdAt: number;
};

export const endOfLocalDateExclusive = (date: string, timeZone: string) => {
  const center = Date.parse(`${date}T00:00:00.000Z`);
  let lower = center - 2 * 86_400_000;
  let upper = center + 3 * 86_400_000;
  while (lower + 1 < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (getDateKeyInTimeZone(new Date(middle), timeZone) <= date) lower = middle;
    else upper = middle;
  }
  return upper;
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
    let effectiveProgramRevision =
      query.end || goal.status !== 'active'
        ? [...programRevisions]
            .reverse()
            .find(
              (revision) =>
                revision.effectiveLocalDate <= requestedEnd &&
                revision.effectiveAt <
                  endOfLocalDateExclusive(requestedEnd, revision.snapshot.timeZone),
            )
        : latestProgramRevision;
    if (!effectiveProgramRevision) throw new AdaptiveGoalTrajectoryPreGoalEndError();
    let timeZone = effectiveProgramRevision.snapshot.timeZone;
    let today = getDateKeyInTimeZone(now(), timeZone);
    if (requestedEnd > today) throw new AdaptiveGoalTrajectoryFutureEndError();
    if (requestedEnd < goal.startedLocalDate) throw new AdaptiveGoalTrajectoryPreGoalEndError();
    const requestedCausalCutoff = Math.min(
      endOfLocalDateExclusive(requestedEnd, timeZone),
      now().getTime() + 1,
    );
    if (goal.createdAt >= requestedCausalCutoff) throw new AdaptiveGoalTrajectoryPreGoalEndError();
    const goalClosedAsOf =
      goal.endedLocalDate !== null &&
      goal.endedLocalDate <= requestedEnd &&
      (query.end === undefined || goal.updatedAt < requestedCausalCutoff);
    const strategyAsOfDate =
      goalClosedAsOf && goal.endedLocalDate !== null && requestedEnd > goal.endedLocalDate
        ? goal.endedLocalDate
        : requestedEnd;
    if (strategyAsOfDate !== requestedEnd) {
      effectiveProgramRevision = [...programRevisions]
        .reverse()
        .find(
          (revision) =>
            revision.effectiveLocalDate <= strategyAsOfDate &&
            revision.effectiveAt <
              endOfLocalDateExclusive(strategyAsOfDate, revision.snapshot.timeZone),
        );
      if (!effectiveProgramRevision) throw new AdaptiveGoalTrajectoryPreGoalEndError();
      timeZone = effectiveProgramRevision.snapshot.timeZone;
      today = getDateKeyInTimeZone(now(), timeZone);
    }
    const causalCutoff =
      query.end !== undefined || goalClosedAsOf || strategyAsOfDate < today
        ? Math.min(endOfLocalDateExclusive(strategyAsOfDate, timeZone), now().getTime() + 1)
        : now().getTime() + 1;
    const lifecycleGoal = goalClosedAsOf
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
          lte(adaptiveNutritionGoalRevisions.createdAt, causalCutoff - 1),
        ),
      )
      .orderBy(asc(adaptiveNutritionGoalRevisions.sequence))
      .all()
      .map((revision) => adaptiveGoalRevisionSchema.parse(revision));
    const activeRevision = latestRevisionOn(revisions, strategyAsOfDate);
    const calculationGoal = adaptiveGoalSchema.parse({
      ...lifecycleGoal,
      targetWeightKg: activeRevision.targetWeightKg,
      maintenanceCenterKg: activeRevision.maintenanceCenterKg,
      goalRatePctPerWeek: activeRevision.goalRatePctPerWeek,
      updatedAt: goalClosedAsOf ? goal.updatedAt : activeRevision.createdAt,
    });
    const weightRows = db
      .select({
        id: bodyWeight.id,
        date: bodyWeight.date,
        weightKg: bodyWeight.weightKg,
        createdAt: bodyWeight.createdAt,
        updatedAt: bodyWeight.updatedAt,
      })
      .from(bodyWeight)
      .where(and(eq(bodyWeight.userId, userId), lte(bodyWeight.date, strategyAsOfDate)))
      .orderBy(asc(bodyWeight.date), asc(bodyWeight.id))
      .all()
      .map((entry) => ({ ...entry, weightKg: Number(entry.weightKg) }));
    const adaptiveWeightRows = weightRows.filter(
      (entry) =>
        entry.date >=
          addCalendarDays(
            goal.startedLocalDate,
            -(ADAPTIVE_TDEE_CONSTANTS.analysisDays + ADAPTIVE_TDEE_CONSTANTS.warmupDays - 1),
          ) && entry.date <= evidenceThroughDate,
    );
    const rawModelPoints = calculateAdaptiveTrendPoints(adaptiveWeightRows).filter(
      (point) => point.date >= goal.startedLocalDate && point.date <= evidenceThroughDate,
    );
    const productSeries = calculateCanonicalTrendWeightSeries(
      weightRows,
      goal.startedLocalDate,
      strategyAsOfDate,
    );
    const rawProductCurrent = calculateCanonicalTrendWeightCurrent(weightRows, strategyAsOfDate);
    const productCurrent =
      rawProductCurrent.latestScale?.date &&
      rawProductCurrent.latestScale.date >= goal.startedLocalDate
        ? rawProductCurrent
        : {
            latestScale: null,
            trendWeightKg: null,
            trendDate: null,
            scaleTrendDifferenceKg: null,
            rateKgPerWeek: null,
            state: 'no_data' as const,
            evidence: { observationCount: 0, spanDays: 0, latestAgeDays: null },
          };
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
      weightEntries: adaptiveWeightRows,
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
        : (goalPeriodEligibilityTrendPoints.at(-1) ?? null);
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
        acceptedNutritionTargetId: adaptiveNutritionCheckIns.acceptedNutritionTargetId,
        resolvedAt: adaptiveNutritionCheckIns.resolvedAt,
        createdAt: adaptiveNutritionCheckIns.createdAt,
      })
      .from(adaptiveNutritionCheckIns)
      .where(
        and(
          eq(adaptiveNutritionCheckIns.userId, userId),
          eq(adaptiveNutritionCheckIns.programId, program.id),
          lte(adaptiveNutritionCheckIns.localDate, strategyAsOfDate),
          lte(adaptiveNutritionCheckIns.createdAt, causalCutoff - 1),
        ),
      )
      .orderBy(
        asc(adaptiveNutritionCheckIns.localDate),
        asc(adaptiveNutritionCheckIns.createdAt),
        asc(adaptiveNutritionCheckIns.id),
      )
      .all()
      .map((checkIn) => ({
        ...checkIn,
        status:
          checkIn.status !== 'held' &&
          (checkIn.resolvedAt === null || checkIn.resolvedAt >= causalCutoff)
            ? ('pending' as const)
            : checkIn.status,
      }));
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
    const targetEvents = db
      .select({
        id: nutritionTargetEvents.id,
        targetId: nutritionTargetEvents.targetId,
        calories: nutritionTargetEvents.calories,
        protein: nutritionTargetEvents.protein,
        carbs: nutritionTargetEvents.carbs,
        fat: nutritionTargetEvents.fat,
        macroCalories: nutritionTargetEvents.macroCalories,
        source: nutritionTargetEvents.source,
        adaptiveCheckInId: nutritionTargetEvents.adaptiveCheckInId,
        effectiveDate: nutritionTargetEvents.effectiveDate,
        sequence: nutritionTargetEvents.sequence,
        recordedAt: nutritionTargetEvents.recordedAt,
      })
      .from(nutritionTargetEvents)
      .where(
        and(
          eq(nutritionTargetEvents.userId, userId),
          lte(nutritionTargetEvents.effectiveDate, strategyAsOfDate),
          lte(nutritionTargetEvents.recordedAt, causalCutoff - 1),
        ),
      )
      .orderBy(
        asc(nutritionTargetEvents.effectiveDate),
        asc(nutritionTargetEvents.recordedAt),
        asc(nutritionTargetEvents.sequence),
        asc(nutritionTargetEvents.id),
      )
      .all();
    const currentTarget = targetEvents.at(-1) ?? null;
    if (query.end === undefined && !goalClosedAsOf) {
      const materializedTarget = db
        .select()
        .from(nutritionTargets)
        .where(
          and(
            eq(nutritionTargets.userId, userId),
            lte(nutritionTargets.effectiveDate, strategyAsOfDate),
          ),
        )
        .orderBy(asc(nutritionTargets.effectiveDate))
        .all()
        .at(-1);
      const materiallyEqual =
        (materializedTarget === undefined && currentTarget === null) ||
        (materializedTarget !== undefined &&
          currentTarget !== null &&
          materializedTarget.id === currentTarget.targetId &&
          materializedTarget.effectiveDate === currentTarget.effectiveDate &&
          materializedTarget.source === currentTarget.source &&
          materializedTarget.adaptiveCheckInId === currentTarget.adaptiveCheckInId &&
          Math.abs(materializedTarget.calories - currentTarget.calories) < 0.000001 &&
          Math.abs(materializedTarget.protein - currentTarget.protein) < 0.000001 &&
          Math.abs(materializedTarget.carbs - currentTarget.carbs) < 0.000001 &&
          Math.abs(materializedTarget.fat - currentTarget.fat) < 0.000001 &&
          Math.abs(
            (materializedTarget.macroCalories ??
              materializedTarget.protein * 4 +
                materializedTarget.carbs * 4 +
                materializedTarget.fat * 9) - currentTarget.macroCalories,
          ) < 0.000001);
      if (!materiallyEqual)
        throw new Error('Current nutrition target does not match immutable target history');
    }
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
    const productDisplayPoints = productSeries
      .filter((point) => point.date >= rangeStart)
      .map((point) => {
        const revision = latestRevisionOn(revisions, point.date);
        const adaptivePoint = [...modelPoints]
          .reverse()
          .find((candidate) => candidate.date <= point.date);
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
          scaleWeightKg: point.scaleWeightKg,
          sourceEntryId: point.sourceEntryId,
          evidenceState: point.state,
          observationCount: point.observationCount,
          spanDays: point.spanDays,
          gapFromPreviousDays: point.gapFromPreviousDays,
          corrected: point.corrected,
          adaptiveStrategyTrendWeightKg: adaptivePoint?.trendWeightKg ?? null,
          goalRevisionId: revision.id,
          revisionSequence: revision.sequence,
          targetWeightKg: revision.targetWeightKg,
          maintenanceCenterKg: center,
          maintenanceLowerKg: center !== null && radius !== null ? center - radius : null,
          maintenanceUpperKg: center !== null && radius !== null ? center + radius : null,
          section:
            point.date === productCurrent.trendDate
              ? ('current' as const)
              : ('historical' as const),
        };
      });
    const productDates = new Set(productDisplayPoints.map((point) => point.date));
    const strategyEventPoints = revisions
      .filter(
        (revision) =>
          revision.effectiveLocalDate >= rangeStart &&
          revision.effectiveLocalDate <= strategyAsOfDate &&
          !productDates.has(revision.effectiveLocalDate),
      )
      .map((revision) => {
        const center = revision.maintenanceCenterKg;
        const radius = center
          ? Math.max(
              ADAPTIVE_GOAL_TRAJECTORY_CONSTANTS.maintenanceMinimumRadiusKg,
              center * ADAPTIVE_GOAL_TRAJECTORY_CONSTANTS.maintenanceRadiusFraction,
            )
          : null;
        return {
          date: revision.effectiveLocalDate,
          trendWeightKg: null,
          scaleWeightKg: null,
          sourceEntryId: null,
          evidenceState: 'strategy_event' as const,
          observationCount: 0,
          spanDays: 0,
          gapFromPreviousDays: null,
          corrected: false,
          adaptiveStrategyTrendWeightKg: null,
          goalRevisionId: revision.id,
          revisionSequence: revision.sequence,
          targetWeightKg: revision.targetWeightKg,
          maintenanceCenterKg: center,
          maintenanceLowerKg: center !== null && radius !== null ? center - radius : null,
          maintenanceUpperKg: center !== null && radius !== null ? center + radius : null,
          section: 'historical' as const,
        };
      });
    const displayPoints = [...productDisplayPoints, ...strategyEventPoints].sort((left, right) =>
      left.date.localeCompare(right.date),
    );
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
          lte(adaptiveNutritionGoalCompletions.createdAt, causalCutoff - 1),
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
        .map((revision) => {
          const targetChanged =
            revision.targetWeightKg !== revision.previousTargetWeightKg ||
            revision.maintenanceCenterKg !== revision.previousCenterKg;
          const rateChanged = revision.goalRatePctPerWeek !== revision.previousRatePctPerWeek;
          return {
            id: revision.id,
            date: revision.effectiveLocalDate,
            kind: targetChanged
              ? rateChanged
                ? ('goal_target_and_rate_revised' as const)
                : ('goal_target_revised' as const)
              : ('goal_rate_revised' as const),
            label: `${targetChanged ? 'Goal target' : 'Goal rate'}${targetChanged && rateChanged ? ' and rate' : ''} revised · revision ${revision.sequence}`,
            goalRevisionId: revision.id,
            revisionSequence: revision.sequence,
            checkInId: null,
          };
        }),
      ...acceptedForGoal.map((checkIn) => {
        const acceptedTarget = targetEvents.find(
          (target) => target.adaptiveCheckInId === checkIn.id,
        );
        const reached = calculationGoalReached(checkIn.calculationSnapshot);
        return {
          id: checkIn.id,
          date: checkIn.localDate,
          kind: reached
            ? ('goal_reached_review' as const)
            : acceptedTarget
              ? ('accepted_target_change' as const)
              : checkIn.proposedTdeeKcal !== null
                ? ('accepted_expenditure_update' as const)
                : ('accepted_no_target_change' as const),
          label: reached
            ? 'Accepted goal-reached review'
            : acceptedTarget
              ? `Accepted target change · ${Math.round(acceptedTarget.calories).toLocaleString('en-US')} kcal`
              : checkIn.proposedTdeeKcal !== null
                ? 'Accepted expenditure update · targets unchanged'
                : 'Accepted review · targets unchanged',
          goalRevisionId: checkIn.goalRevisionId,
          revisionSequence:
            revisions.find((revision) => revision.id === checkIn.goalRevisionId)?.sequence ?? null,
          checkInId: checkIn.id,
        };
      }),
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
    ].sort((left, right) => {
      const kindOrder = [
        'goal_started',
        'goal_target_revised',
        'goal_rate_revised',
        'goal_target_and_rate_revised',
        'accepted_target_change',
        'accepted_expenditure_update',
        'accepted_no_target_change',
        'goal_reached_review',
        'goal_completed',
      ];
      return (
        left.date.localeCompare(right.date) ||
        kindOrder.indexOf(left.kind) - kindOrder.indexOf(right.kind) ||
        (left.revisionSequence ?? 0) - (right.revisionSequence ?? 0) ||
        left.id.localeCompare(right.id)
      );
    });
    return adaptiveGoalTrajectorySchema.parse({
      algorithmVersion: 'adaptive-tdee-v1',
      trendSource: 'product_trend_weight_v1',
      strategyTrendSource: 'adaptive_model_trend',
      productTrend: {
        currentTrendWeightKg: productCurrent.trendWeightKg,
        currentTrendDate: productCurrent.trendDate,
        state: productCurrent.state,
      },
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

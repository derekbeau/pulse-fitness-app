import { and, asc, eq, gte, lte, min, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import {
  ADAPTIVE_TDEE_CONSTANTS,
  adaptiveEligibilityProgressSchema,
  adaptiveCheckInDetailSchema,
  adaptiveProgramCalculationSchema,
  calculateAdaptiveDateBoundaries,
  calculateAdaptiveTrendPoints,
  calculateConfidence,
  evaluateEligibility,
  energyBalanceAnalyticsQuerySchema,
  energyBalanceAnalyticsSchema,
  aggregateEnergyBalancePoints,
  explainEnergyBalance,
  resolveEnergyBalanceRange,
  summarizeAdaptiveReadinessEvidence,
  summarizeEnergyBalance,
  addCalendarDays,
  type AdaptiveCheckInDetail,
  type AdaptiveNutritionDay,
  type AdaptiveReasonCode,
  type AdaptiveWeightEntry,
  type EnergyBalanceAnalytics,
  type EnergyBalanceAnalyticsQuery,
  type EnergyBalancePoint,
  type EnergyBalanceReasonCode,
  type EnergyBalanceState,
} from '@pulse/shared';

import * as schema from '../../db/schema/index.js';
import {
  adaptiveNutritionCheckIns,
  adaptiveNutritionGoalRevisions,
  adaptiveNutritionGoals,
  adaptiveNutritionProgramRevisions,
  adaptiveNutritionPrograms,
  bodyWeight,
  mealItems,
  meals,
  nutritionLogs,
  nutritionTargets,
} from '../../db/schema/index.js';
export {
  getDateKeyInTimeZone,
  resolveEffectiveProgramRevisions,
} from '../../db/adaptive-program-revision-projection.js';
export type { EffectiveProgramRevision } from '../../db/adaptive-program-revision-projection.js';
import {
  getDateKeyInTimeZone,
  resolveEffectiveProgramRevisions,
} from '../../db/adaptive-program-revision-projection.js';
import { getApplicationNow } from '../../lib/clock.js';
import { AdaptiveProgramNotFoundError } from './store.js';

type AdaptiveDatabase = BetterSQLite3Database<typeof schema>;

export class AdaptiveAnalyticsFutureEndError extends Error {
  constructor() {
    super('Energy balance end date cannot be in the future');
    this.name = 'AdaptiveAnalyticsFutureEndError';
  }
}

export class AdaptiveAnalyticsPreProgramEndError extends Error {
  constructor() {
    super('Energy balance end date cannot precede the adaptive program');
    this.name = 'AdaptiveAnalyticsPreProgramEndError';
  }
}

const datesBetween = (startDate: string, endDate: string) => {
  const dates: string[] = [];
  for (let date = startDate; date <= endDate; date = addCalendarDays(date, 1)) dates.push(date);
  return dates;
};

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];

const acceptedExpenditureEffectiveDate = (checkIn: AdaptiveCheckInDetail) =>
  checkIn.proposedTargets?.effectiveDate ?? checkIn.localDate;

export const adaptiveAnalyticsStateForCheckIn = (
  checkIn: Pick<AdaptiveCheckInDetail, 'status' | 'calculationState'>,
): EnergyBalanceState | null => {
  if (checkIn.status === 'pending') return 'review_needed';
  if (checkIn.status === 'held' || checkIn.calculationState === 'holding') return 'holding';
  if (checkIn.status !== 'accepted') return null;
  if (checkIn.calculationState === 'updating') return 'updating';
  return 'learning';
};

export const adaptiveAnalyticsStateForPoint = (
  checkIn: Pick<AdaptiveCheckInDetail, 'status' | 'calculationState'> | null,
  calculationState: AdaptiveCheckInDetail['calculationState'],
): EnergyBalanceState => {
  if (checkIn) return adaptiveAnalyticsStateForCheckIn(checkIn) ?? 'learning';
  if (calculationState === 'holding') return 'holding';
  if (calculationState === 'updating') return 'updating';
  return 'learning';
};

export const createAdaptiveAnalyticsStore = (dependencies: {
  db: AdaptiveDatabase;
  now?: () => Date;
}) => {
  const { db } = dependencies;
  const now = dependencies.now ?? getApplicationNow;

  const getAnalytics = (
    userId: string,
    rawQuery: EnergyBalanceAnalyticsQuery,
  ): EnergyBalanceAnalytics => {
    const query = energyBalanceAnalyticsQuerySchema.parse(rawQuery);
    const program = db
      .select()
      .from(adaptiveNutritionPrograms)
      .where(eq(adaptiveNutritionPrograms.userId, userId))
      .limit(1)
      .get();
    if (!program) throw new AdaptiveProgramNotFoundError();

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
            eq(adaptiveNutritionProgramRevisions.userId, userId),
            eq(adaptiveNutritionProgramRevisions.programId, program.id),
          ),
        )
        .orderBy(asc(adaptiveNutritionProgramRevisions.sequence))
        .all()
        .map((revision) => {
          const snapshot = adaptiveProgramCalculationSchema.parse(revision.snapshot);
          return {
            ...revision,
            snapshot,
          };
        }),
    );
    const latestProgramRevision = programRevisions.at(-1);
    const initialProgramRevision = programRevisions[0];
    if (!latestProgramRevision || !initialProgramRevision) {
      throw new Error('Adaptive nutrition program revision history is missing');
    }

    const latestToday = getDateKeyInTimeZone(now(), latestProgramRevision.snapshot.timeZone);
    const isLiveRequest = query.end === undefined;
    const endDate = query.end ?? latestToday;
    const effectiveProgramRevision = isLiveRequest
      ? latestProgramRevision
      : [...programRevisions].reverse().find((revision) => revision.effectiveLocalDate <= endDate);
    if (!effectiveProgramRevision) throw new AdaptiveAnalyticsPreProgramEndError();
    const effectiveProgram = effectiveProgramRevision.snapshot;
    const today = getDateKeyInTimeZone(now(), effectiveProgram.timeZone);
    if (!isLiveRequest && endDate > today) throw new AdaptiveAnalyticsFutureEndError();
    const firstNutrition = db
      .select({ date: min(nutritionLogs.date) })
      .from(nutritionLogs)
      .where(and(eq(nutritionLogs.userId, userId), lte(nutritionLogs.date, endDate)))
      .get()?.date;
    const firstWeight = db
      .select({ date: min(bodyWeight.date) })
      .from(bodyWeight)
      .where(and(eq(bodyWeight.userId, userId), lte(bodyWeight.date, endDate)))
      .get()?.date;
    const historicalProgramStart = initialProgramRevision.effectiveLocalDate;
    if (!isLiveRequest && endDate < historicalProgramStart) {
      throw new AdaptiveAnalyticsPreProgramEndError();
    }
    const programStart = historicalProgramStart;
    const firstAvailableDate =
      isLiveRequest && endDate < programStart
        ? endDate
        : ([firstNutrition, firstWeight, programStart]
            .filter((value): value is string => Boolean(value))
            .sort()
            .at(0) ?? programStart);
    const range = resolveEnergyBalanceRange({
      preset: query.range,
      endDate,
      firstAvailableDate,
      aggregation: query.aggregation,
    });
    const completedDayCutoff = endDate >= today ? addCalendarDays(today, -1) : endDate;
    const historicalEvidenceStart = addCalendarDays(
      range.startDate,
      -(ADAPTIVE_TDEE_CONSTANTS.analysisDays + ADAPTIVE_TDEE_CONSTANTS.warmupDays),
    );

    const nutritionRows = db
      .select({
        id: nutritionLogs.id,
        date: nutritionLogs.date,
        status: nutritionLogs.status,
        calories: sql<number>`coalesce(sum(${mealItems.calories}), 0)`,
        itemCount: sql<number>`count(${mealItems.id})`,
        updatedAt: nutritionLogs.updatedAt,
      })
      .from(nutritionLogs)
      .leftJoin(meals, eq(meals.nutritionLogId, nutritionLogs.id))
      .leftJoin(mealItems, eq(mealItems.mealId, meals.id))
      .where(
        and(
          eq(nutritionLogs.userId, userId),
          gte(nutritionLogs.date, historicalEvidenceStart),
          lte(nutritionLogs.date, range.endDate),
        ),
      )
      .groupBy(nutritionLogs.id)
      .orderBy(asc(nutritionLogs.date), asc(nutritionLogs.id))
      .all();
    const nutritionByDate = new Map(nutritionRows.map((row) => [row.date, row]));

    const targets = db
      .select({
        id: nutritionTargets.id,
        effectiveDate: nutritionTargets.effectiveDate,
        calories: nutritionTargets.calories,
      })
      .from(nutritionTargets)
      .where(and(eq(nutritionTargets.userId, userId), lte(nutritionTargets.effectiveDate, endDate)))
      .orderBy(asc(nutritionTargets.effectiveDate), asc(nutritionTargets.createdAt))
      .all();

    const checkIns = db
      .select()
      .from(adaptiveNutritionCheckIns)
      .where(
        and(
          eq(adaptiveNutritionCheckIns.userId, userId),
          eq(adaptiveNutritionCheckIns.programId, program.id),
          lte(adaptiveNutritionCheckIns.localDate, endDate),
        ),
      )
      .orderBy(
        asc(adaptiveNutritionCheckIns.localDate),
        asc(adaptiveNutritionCheckIns.createdAt),
        asc(sql.raw('adaptive_nutrition_checkins.rowid')),
        asc(adaptiveNutritionCheckIns.id),
      )
      .all()
      .map((row) => {
        const { userId: rowUserId, programId: rowProgramId, ...detail } = row;
        if (rowUserId !== userId || rowProgramId !== program.id) {
          throw new Error('Adaptive check-in query returned data outside the requested program');
        }
        return adaptiveCheckInDetailSchema.parse(detail);
      });

    const goalRows = db
      .select({
        id: adaptiveNutritionGoals.id,
        type: adaptiveNutritionGoals.type,
        startedLocalDate: adaptiveNutritionGoals.startedLocalDate,
        endedLocalDate: adaptiveNutritionGoals.endedLocalDate,
        createdAt: adaptiveNutritionGoals.createdAt,
      })
      .from(adaptiveNutritionGoals)
      .where(
        and(
          eq(adaptiveNutritionGoals.userId, userId),
          eq(adaptiveNutritionGoals.programId, program.id),
        ),
      )
      .orderBy(
        asc(adaptiveNutritionGoals.startedLocalDate),
        asc(adaptiveNutritionGoals.createdAt),
        asc(adaptiveNutritionGoals.id),
      )
      .all();
    const goalIds = new Set(goalRows.map((goal) => goal.id));
    const revisions = db
      .select({
        id: adaptiveNutritionGoalRevisions.id,
        goalId: adaptiveNutritionGoalRevisions.goalId,
        sequence: adaptiveNutritionGoalRevisions.sequence,
        effectiveLocalDate: adaptiveNutritionGoalRevisions.effectiveLocalDate,
        reason: adaptiveNutritionGoalRevisions.reason,
        createdAt: adaptiveNutritionGoalRevisions.createdAt,
      })
      .from(adaptiveNutritionGoalRevisions)
      .where(
        and(
          eq(adaptiveNutritionGoalRevisions.userId, userId),
          lte(adaptiveNutritionGoalRevisions.effectiveLocalDate, endDate),
        ),
      )
      .orderBy(
        asc(adaptiveNutritionGoalRevisions.effectiveLocalDate),
        asc(adaptiveNutritionGoalRevisions.sequence),
        asc(adaptiveNutritionGoalRevisions.createdAt),
        asc(adaptiveNutritionGoalRevisions.id),
      )
      .all()
      .filter((revision) => goalIds.has(revision.goalId));

    const weights = db
      .select({
        id: bodyWeight.id,
        date: bodyWeight.date,
        weightKg: bodyWeight.weightKg,
        updatedAt: bodyWeight.updatedAt,
      })
      .from(bodyWeight)
      .where(and(eq(bodyWeight.userId, userId), lte(bodyWeight.date, endDate)))
      .orderBy(asc(bodyWeight.date), asc(bodyWeight.id))
      .all();
    const trendByDate = new Map(
      calculateAdaptiveTrendPoints(weights).map((point) => [point.date, point.trendWeightKg]),
    );

    const acceptedExpenditureEvents = checkIns
      .filter((checkIn) => checkIn.status === 'accepted' && checkIn.proposedTdeeKcal !== null)
      .map((checkIn) => ({ checkIn, effectiveDate: acceptedExpenditureEffectiveDate(checkIn) }))
      .sort(
        (left, right) =>
          left.effectiveDate.localeCompare(right.effectiveDate) ||
          left.checkIn.createdAt - right.checkIn.createdAt ||
          left.checkIn.id.localeCompare(right.checkIn.id),
      );

    let targetIndex = -1;
    let checkInIndex = -1;
    let expenditureEventIndex = -1;
    let currentTarget: (typeof targets)[number] | null = null;
    let expenditureKcal: number | null = null;
    let expenditureSource: AdaptiveCheckInDetail | null = null;
    let stateSource: AdaptiveCheckInDetail | null = null;
    let calculationState: AdaptiveCheckInDetail['calculationState'] = 'baseline';

    const dailyPoints: EnergyBalancePoint[] = datesBetween(range.startDate, range.endDate).map(
      (date) => {
        const pointProgram =
          isLiveRequest && date === endDate
            ? latestProgramRevision.snapshot
            : [...programRevisions]
                .reverse()
                .find((revision) => revision.effectiveLocalDate <= date)?.snapshot;
        if (date >= programStart && expenditureKcal === null && expenditureSource === null) {
          expenditureKcal = initialProgramRevision.snapshot.baselineTdeeKcal;
        }
        while (true) {
          const nextTarget = targets[targetIndex + 1];
          if (!nextTarget || nextTarget.effectiveDate > date) break;
          targetIndex += 1;
          currentTarget = nextTarget;
        }
        while (true) {
          const nextCheckIn = checkIns[checkInIndex + 1];
          if (!nextCheckIn || nextCheckIn.localDate > date) break;
          checkInIndex += 1;
          const event = nextCheckIn;
          if (event.status === 'accepted') {
            stateSource = event;
            calculationState = event.calculationState;
          } else if (event.status === 'held' || event.status === 'pending') {
            stateSource = event;
            calculationState = event.calculationState;
          }
        }
        while (true) {
          const nextExpenditureEvent = acceptedExpenditureEvents[expenditureEventIndex + 1];
          if (!nextExpenditureEvent || nextExpenditureEvent.effectiveDate > date) break;
          expenditureEventIndex += 1;
          expenditureKcal = nextExpenditureEvent.checkIn.proposedTdeeKcal;
          expenditureSource = nextExpenditureEvent.checkIn;
        }

        const currentGoal = [...goalRows]
          .reverse()
          .find(
            (goal) =>
              goal.startedLocalDate <= date &&
              (goal.endedLocalDate === null || date < goal.endedLocalDate),
          );
        const currentRevision = currentGoal
          ? [...revisions]
              .reverse()
              .find(
                (revision) =>
                  revision.goalId === currentGoal.id && revision.effectiveLocalDate <= date,
              )
          : null;

        const nutrition = nutritionByDate.get(date);
        const validComplete =
          nutrition?.status === 'complete' && nutrition.itemCount > 0 && nutrition.calories > 0;
        const pendingCutoff = validComplete && date > completedDayCutoff;
        const includedNutrition = nutrition && validComplete && !pendingCutoff ? nutrition : null;
        const includedInBalance = includedNutrition !== null;
        const reasonCodes: EnergyBalanceReasonCode[] = [];
        let nutritionStatus: EnergyBalancePoint['nutritionStatus'];
        if (!nutrition) {
          nutritionStatus = 'missing';
          reasonCodes.push('MISSING_NUTRITION_EXCLUDED');
        } else if (nutrition.status === 'partial') {
          nutritionStatus = 'partial';
          reasonCodes.push('PARTIAL_NUTRITION_EXCLUDED');
        } else if (nutrition.status === 'unknown') {
          nutritionStatus = 'unknown';
          reasonCodes.push('UNKNOWN_NUTRITION_EXCLUDED');
        } else if (pendingCutoff) {
          nutritionStatus = 'excluded';
          reasonCodes.push('COMPLETE_NUTRITION_PENDING_COMPLETED_DAY_CUTOFF');
        } else if (!validComplete) {
          nutritionStatus = 'excluded';
          reasonCodes.push('INVALID_COMPLETE_NUTRITION_EXCLUDED');
        } else {
          nutritionStatus = 'complete';
        }

        let pointState = adaptiveAnalyticsStateForPoint(stateSource, calculationState);
        let pointCalculationState = calculationState;
        let pointCalculationReasonCodes = stateSource?.reasonCodes ?? [];
        if (pointProgram?.status === 'paused') {
          pointState = 'holding';
          pointCalculationState = 'holding';
          pointCalculationReasonCodes = unique([...pointCalculationReasonCodes, 'PROGRAM_PAUSED']);
        } else if (pointState === 'updating') {
          const pointEligibility = evaluateEligibility({
            boundaries: calculateAdaptiveDateBoundaries(date, false),
            nutritionDays: nutritionRows as AdaptiveNutritionDay[],
            weightEntries: weights as AdaptiveWeightEntry[],
          });
          if (!pointEligibility.eligible) {
            pointState = 'holding';
            pointCalculationState = 'holding';
            pointCalculationReasonCodes = pointEligibility.holdReasons;
          }
        }

        return {
          periodStart: date,
          periodEnd: date,
          nutritionStatus,
          sourceNutritionStatus: nutrition?.status ?? null,
          nutritionLogIds: nutrition ? [nutrition.id] : [],
          loggedIntakeKcal: nutrition ? nutrition.calories : null,
          intakeKcal: includedNutrition?.calories ?? null,
          includedInBalance,
          completeNutritionDays: includedInBalance ? 1 : 0,
          partialNutritionDays: nutrition?.status === 'partial' ? 1 : 0,
          unknownNutritionDays: nutrition?.status === 'unknown' ? 1 : 0,
          missingNutritionDays: nutrition ? 0 : 1,
          excludedNutritionDays: includedInBalance ? 0 : 1,
          targetKcal: currentTarget?.calories ?? null,
          targetIds: currentTarget ? [currentTarget.id] : [],
          expenditureKcal,
          trendWeightKg: trendByDate.get(date) ?? null,
          goalType: currentGoal?.type ?? null,
          state: pointState,
          calculationState: pointCalculationState,
          calculationReasonCodes: pointCalculationReasonCodes,
          reasonCodes,
          expenditureSourceCheckInId: expenditureSource?.id ?? null,
          expenditureSourceInputFingerprint: expenditureSource?.dataFingerprint ?? null,
          stateSourceCheckInId: stateSource?.id ?? null,
          stateSourceInputFingerprint: stateSource?.dataFingerprint ?? null,
          sourceCheckInIds: unique(
            [expenditureSource?.id, stateSource?.id].filter((value): value is string =>
              Boolean(value),
            ),
          ),
          sourceInputFingerprints: unique(
            [expenditureSource?.dataFingerprint, stateSource?.dataFingerprint].filter(
              (value): value is string => Boolean(value),
            ),
          ),
          goalRevisionIds: currentRevision ? [currentRevision.id] : [],
        };
      },
    );

    const readinessBoundaries = calculateAdaptiveDateBoundaries(endDate, false);
    const readinessNutrition = db
      .select({
        id: nutritionLogs.id,
        date: nutritionLogs.date,
        status: nutritionLogs.status,
        calories: sql<number>`coalesce(sum(${mealItems.calories}), 0)`,
        itemCount: sql<number>`count(${mealItems.id})`,
        updatedAt: nutritionLogs.updatedAt,
      })
      .from(nutritionLogs)
      .leftJoin(meals, eq(meals.nutritionLogId, nutritionLogs.id))
      .leftJoin(mealItems, eq(mealItems.mealId, meals.id))
      .where(
        and(
          eq(nutritionLogs.userId, userId),
          gte(nutritionLogs.date, readinessBoundaries.analysisStart),
          lte(nutritionLogs.date, endDate),
        ),
      )
      .groupBy(nutritionLogs.id)
      .orderBy(asc(nutritionLogs.date), asc(nutritionLogs.id))
      .all() as AdaptiveNutritionDay[];
    const readinessWeights = db
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
          gte(bodyWeight.date, readinessBoundaries.warmupStart),
          lte(bodyWeight.date, endDate),
        ),
      )
      .orderBy(asc(bodyWeight.date), asc(bodyWeight.id))
      .all() as AdaptiveWeightEntry[];
    const eligibilityResult = evaluateEligibility({
      boundaries: readinessBoundaries,
      nutritionDays: readinessNutrition,
      weightEntries: readinessWeights,
    });
    const readinessEvidence = summarizeAdaptiveReadinessEvidence({
      boundaries: readinessBoundaries,
      nutritionDays: readinessNutrition,
      weightEntries: readinessWeights,
      eligibility: eligibilityResult,
    });
    const readiness = adaptiveEligibilityProgressSchema.parse({
      eligible: eligibilityResult.eligible,
      ...readinessEvidence,
      requiredCompleteNutritionDays: ADAPTIVE_TDEE_CONSTANTS.minimumCompleteNutritionDays,
      requiredWeighIns: ADAPTIVE_TDEE_CONSTANTS.minimumActualWeights,
      weightSpanDays: eligibilityResult.actualWeightSpanDays,
      requiredWeightSpanDays: ADAPTIVE_TDEE_CONSTANTS.minimumWeightSpanDays,
      latestUsableWeightAgeDays: eligibilityResult.latestWeightAgeDays,
      analysisEndDate: readinessBoundaries.analysisEnd,
      pendingCutoffDate: endDate,
      timeZone: effectiveProgram.timeZone,
      reasonCodes: eligibilityResult.holdReasons,
    });

    const latestAccepted = [...acceptedExpenditureEvents]
      .reverse()
      .find((event) => event.effectiveDate <= endDate)?.checkIn;
    const latestState = [...checkIns]
      .reverse()
      .find(
        (checkIn) =>
          checkIn.status === 'accepted' ||
          checkIn.status === 'held' ||
          checkIn.status === 'pending',
      );
    const pending = [...checkIns].reverse().find((checkIn) => checkIn.status === 'pending');
    let state: EnergyBalanceState;
    if (pending) state = 'review_needed';
    else if (effectiveProgram.status === 'paused') state = 'holding';
    else if (latestState?.status === 'held') state = 'holding';
    else if (
      !latestAccepted ||
      (latestAccepted.kind === 'baseline' && !eligibilityResult.eligible)
    ) {
      state = 'learning';
    } else if (!eligibilityResult.eligible) {
      state = 'holding';
    } else state = 'updating';
    const currentStateSource = pending ?? latestState ?? null;
    const endPoint = dailyPoints.at(-1);
    if (endPoint?.periodEnd === endDate) {
      endPoint.state = state;
      endPoint.calculationState =
        state === 'review_needed' ? (currentStateSource?.calculationState ?? 'baseline') : state;
      if (effectiveProgram.status === 'paused') {
        endPoint.calculationReasonCodes = unique([
          ...endPoint.calculationReasonCodes,
          'PROGRAM_PAUSED',
        ]);
      }
    }
    const currentConfidence = eligibilityResult.eligible
      ? calculateConfidence({
          completeNutritionDays: eligibilityResult.usableNutritionDays.length,
          actualWeightCount: eligibilityResult.actualWeights.length,
          weightSpanDays: eligibilityResult.actualWeightSpanDays,
          latestWeightAgeDays:
            eligibilityResult.latestWeightAgeDays ?? ADAPTIVE_TDEE_CONSTANTS.maximumWeightAgeDays,
        })
      : null;
    const confidence = currentConfidence ?? latestAccepted?.calculationSnapshot.confidence ?? null;
    const currentTargetAtEnd = [...targets]
      .reverse()
      .find((target) => target.effectiveDate <= endDate);
    const currentGoalAtEnd = [...goalRows]
      .reverse()
      .find(
        (goal) =>
          goal.startedLocalDate <= endDate &&
          (goal.endedLocalDate === null || endDate < goal.endedLocalDate),
      );
    const summary = summarizeEnergyBalance({
      points: dailyPoints,
      calendarDays: range.calendarDays,
      rangePreset: range.preset,
    });
    const currentReasonCodes: AdaptiveReasonCode[] = unique([
      ...eligibilityResult.holdReasons,
      ...(currentStateSource?.reasonCodes ?? []),
      ...(effectiveProgram.status === 'paused' ? (['PROGRAM_PAUSED'] as const) : []),
    ]);
    const stateReasons: EnergyBalanceReasonCode[] = [
      ...(state === 'learning' ? (['LEARNING_ESTIMATE'] as const) : []),
      ...(state === 'holding' ? (['HOLDING_ESTIMATE'] as const) : []),
      ...(state === 'review_needed' ? (['RECOMMENDATION_REVIEW_REQUIRED'] as const) : []),
    ];

    return energyBalanceAnalyticsSchema.parse({
      algorithmVersion: effectiveProgram.algorithmVersion,
      timeZone: effectiveProgram.timeZone,
      range,
      isHistorical: isLiveRequest ? false : endDate < today,
      current: {
        state,
        calculationState:
          state === 'review_needed' ? (currentStateSource?.calculationState ?? 'baseline') : state,
        adaptiveTdeeKcal:
          latestAccepted?.proposedTdeeKcal ?? initialProgramRevision.snapshot.baselineTdeeKcal,
        calorieTargetKcal: currentTargetAtEnd?.calories ?? null,
        goalType: currentGoalAtEnd?.type ?? null,
        confidenceLabel: confidence?.label ?? null,
        confidenceScore: confidence?.score ?? null,
        readiness,
        reasonCodes: currentReasonCodes,
        expenditureSourceCheckInId: latestAccepted?.id ?? null,
        expenditureSourceInputFingerprint: latestAccepted?.dataFingerprint ?? null,
        stateSourceCheckInId: currentStateSource?.id ?? null,
        stateSourceInputFingerprint: currentStateSource?.dataFingerprint ?? null,
      },
      summary,
      points: aggregateEnergyBalancePoints(dailyPoints, range.aggregation),
      markers: [
        ...checkIns
          .filter((checkIn) => checkIn.localDate >= range.startDate)
          .map((checkIn) => ({
            id: checkIn.id,
            date: checkIn.localDate,
            type: 'check_in' as const,
            label:
              checkIn.status === 'pending'
                ? 'Recommendation ready for review'
                : `${checkIn.calculationState.charAt(0).toUpperCase()}${checkIn.calculationState.slice(1)} check-in`,
            checkInId: checkIn.id,
            inputFingerprint: checkIn.dataFingerprint,
            goalId: checkIn.goalId,
            goalRevisionId: checkIn.goalRevisionId,
            state: adaptiveAnalyticsStateForCheckIn(checkIn),
          })),
        ...revisions
          .filter((revision) => revision.effectiveLocalDate >= range.startDate)
          .map((revision) => ({
            id: revision.id,
            date: revision.effectiveLocalDate,
            type: 'goal_revision' as const,
            label: revision.reason === 'created' ? 'Goal started' : 'Goal revised',
            checkInId: null,
            inputFingerprint: null,
            goalId: revision.goalId,
            goalRevisionId: revision.id,
            state: null,
          })),
      ].sort(
        (left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id),
      ),
      explanation: {
        ...explainEnergyBalance(summary),
        reasonCodes: unique([...stateReasons, ...summary.reasonCodes]),
      },
    });
  };

  return { getAnalytics };
};

const getDefaultStore = async () => {
  const { db } = await import('../../db/index.js');
  return createAdaptiveAnalyticsStore({ db });
};

export const getAdaptiveEnergyBalanceAnalytics = async (
  userId: string,
  query: EnergyBalanceAnalyticsQuery,
) => (await getDefaultStore()).getAnalytics(userId, query);

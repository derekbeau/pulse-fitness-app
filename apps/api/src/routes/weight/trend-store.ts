import { createHash } from 'node:crypto';

import {
  ADAPTIVE_GOAL_PROGRESS_CONSTANTS,
  TREND_WEIGHT_ALGORITHM,
  adaptiveProgramCalculationSchema,
  addTrendWeightCalendarDays,
  calculateCanonicalTrendWeightCurrent,
  calculateCanonicalTrendWeightDeltas,
  calculateCanonicalTrendWeightSeries,
  convertWeightFromKg,
  trendWeightAnalyticsSchema,
  trendWeightQuerySchema,
  type TrendWeightAnalytics,
  type TrendWeightQuery,
  type WeightUnit,
} from '@pulse/shared';
import { and, asc, eq, lte } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import * as schema from '../../db/schema/index.js';
import { getApplicationNow } from '../../lib/clock.js';
import { resolveUserTimeZone, UserTimeZoneRequiredError } from '../../lib/user-time-zone.js';
import {
  adaptiveNutritionCheckIns,
  adaptiveNutritionGoalRevisions,
  adaptiveNutritionGoals,
  adaptiveNutritionProgramRevisions,
  adaptiveNutritionPrograms,
  bodyWeight,
  users,
} from '../../db/schema/index.js';
import {
  getDateKeyInTimeZone,
  resolveEffectiveProgramRevisions,
} from '../adaptive-nutrition/analytics-store.js';

type TrendDatabase = BetterSQLite3Database<typeof schema>;

const RANGE_DAYS = { '1m': 30, '3m': 90, '6m': 180, '1y': 365 } as const;
const MARKER_KIND_ORDER = {
  goal_started: 0,
  goal_revised: 1,
  check_in: 2,
  correction: 3,
} as const;
const round = (value: number) => Number(value.toFixed(8));
const display = (valueKg: number, unit: WeightUnit) => round(convertWeightFromKg(valueKg, unit));

const confidenceExplanation = (state: TrendWeightAnalytics['current']['state']) => {
  if (state === 'no_data') return 'No measurements support a trend yet.';
  if (state === 'scale_only') return 'At least two recent weigh-ins are needed for Trend Weight.';
  if (state === 'developing')
    return 'Trend Weight is available, but the recent evidence span is limited.';
  if (state === 'stale') return 'The latest weigh-in is more than seven days old.';
  return 'Recent observations span enough time to establish Trend Weight.';
};

const headlineFor = (current: ReturnType<typeof calculateCanonicalTrendWeightCurrent>) => {
  if (current.state === 'no_data') return 'Log your first weigh-in to start Trend Weight.';
  if (current.state === 'scale_only') return 'Trend Weight is still learning.';
  if (current.state === 'developing') return 'Trend Weight has limited confidence.';
  if (current.state === 'stale') return 'Trend Weight may be stale.';
  if (current.rateKgPerWeek === null) return 'Trend Weight is established.';
  if (Math.abs(current.rateKgPerWeek) < 0.01) return 'Trend Weight is holding steady.';
  return current.rateKgPerWeek < 0 ? 'Trend Weight is moving down.' : 'Trend Weight is moving up.';
};

export const createTrendWeightStore = (dependencies: { db: TrendDatabase; now?: () => Date }) => {
  const { db } = dependencies;
  const now = dependencies.now ?? getApplicationNow;

  const getAnalytics = (userId: string, rawQuery: TrendWeightQuery): TrendWeightAnalytics => {
    const query = trendWeightQuerySchema.parse(rawQuery);
    const user = db
      .select({ weightUnit: users.weightUnit, preferences: users.preferences })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .get();
    if (!user) throw new Error('Authenticated user not found while resolving Trend Weight');

    const program = db
      .select({ id: adaptiveNutritionPrograms.id })
      .from(adaptiveNutritionPrograms)
      .where(eq(adaptiveNutritionPrograms.userId, userId))
      .limit(1)
      .get();
    const revisions = program
      ? resolveEffectiveProgramRevisions(
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
            .map((revision) => ({
              ...revision,
              snapshot: adaptiveProgramCalculationSchema.parse(revision.snapshot),
            })),
        )
      : [];
    const latestRevision = revisions.at(-1);
    const liveAuthority = resolveUserTimeZone({
      preferences: user.preferences,
      programTimeZone: latestRevision?.snapshot.timeZone,
    });
    if (!liveAuthority) throw new UserTimeZoneRequiredError();
    const liveTimeZone = liveAuthority.timeZone;
    const liveDate = getDateKeyInTimeZone(now(), liveTimeZone);
    const endDate = query.end ?? liveDate;
    const effectiveRevision = query.end
      ? [...revisions].reverse().find((revision) => revision.effectiveLocalDate <= endDate)
      : latestRevision;
    const effectiveAuthority = resolveUserTimeZone({
      preferences: user.preferences,
      programTimeZone: effectiveRevision?.snapshot.timeZone,
    });
    if (!effectiveAuthority) throw new UserTimeZoneRequiredError();
    const timeZone = effectiveAuthority.timeZone;
    if (query.timeZone && query.timeZone !== timeZone) {
      throw new RangeError('Trend Weight time zone conflicts with the server-resolved authority');
    }
    const todayInEffectiveZone = getDateKeyInTimeZone(now(), timeZone);
    if (query.end && endDate > todayInEffectiveZone) {
      throw new RangeError('Trend Weight end date cannot be in the future');
    }

    const entries = db
      .select({
        id: bodyWeight.id,
        date: bodyWeight.date,
        weightKg: bodyWeight.weightKg,
        unitAtEntry: bodyWeight.unitAtEntry,
        notes: bodyWeight.notes,
        createdAt: bodyWeight.createdAt,
        updatedAt: bodyWeight.updatedAt,
      })
      .from(bodyWeight)
      .where(and(eq(bodyWeight.userId, userId), lte(bodyWeight.date, endDate)))
      .orderBy(asc(bodyWeight.date), asc(bodyWeight.id))
      .all()
      .map((entry) => ({ ...entry, weightKg: Number(entry.weightKg) }));
    const firstDate = entries[0]?.date ?? endDate;
    const startDate =
      query.range === 'all'
        ? firstDate
        : addTrendWeightCalendarDays(endDate, -(RANGE_DAYS[query.range] - 1));
    const current = calculateCanonicalTrendWeightCurrent(entries, endDate);
    const canonicalPoints = calculateCanonicalTrendWeightSeries(entries, startDate, endDate);
    const unit = user.weightUnit;

    const goals = db
      .select()
      .from(adaptiveNutritionGoals)
      .where(eq(adaptiveNutritionGoals.userId, userId))
      .orderBy(
        asc(adaptiveNutritionGoals.startedLocalDate),
        asc(adaptiveNutritionGoals.createdAt),
        asc(adaptiveNutritionGoals.id),
      )
      .all();
    const goal = [...goals]
      .reverse()
      .find(
        (candidate) =>
          candidate.startedLocalDate <= endDate &&
          (candidate.endedLocalDate === null || candidate.endedLocalDate > endDate),
      );
    const allGoalRevisions = db
      .select()
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
        asc(adaptiveNutritionGoalRevisions.id),
      )
      .all();
    const goalRevision = goal
      ? allGoalRevisions.filter((revision) => revision.goalId === goal.id).at(-1)
      : null;
    const desiredRateKgPerWeek =
      goal && goalRevision && current.trendWeightKg !== null
        ? (current.trendWeightKg * goalRevision.goalRatePctPerWeek) / 100
        : null;
    const actualRate = current.rateKgPerWeek;
    const paceInside =
      goal?.type === 'maintain'
        ? actualRate !== null && Math.abs(actualRate) <= 0.1
        : actualRate !== null && desiredRateKgPerWeek !== null
          ? Math.sign(actualRate) === Math.sign(desiredRateKgPerWeek) &&
            Math.abs(actualRate) >= Math.abs(desiredRateKgPerWeek) * 0.75 &&
            Math.abs(actualRate) <= Math.abs(desiredRateKgPerWeek) * 1.25
          : false;
    const maintenanceCenterKg = goalRevision?.maintenanceCenterKg ?? null;
    const maintenanceRadiusKg = maintenanceCenterKg
      ? Math.max(
          ADAPTIVE_GOAL_PROGRESS_CONSTANTS.maintenanceMinimumRadiusKg,
          maintenanceCenterKg * ADAPTIVE_GOAL_PROGRESS_CONSTANTS.maintenanceRadiusFraction,
        )
      : null;
    const maintenanceBandState =
      goal?.type !== 'maintain'
        ? ('not_applicable' as const)
        : current.trendWeightKg === null ||
            maintenanceCenterKg === null ||
            maintenanceRadiusKg === null
          ? ('unavailable' as const)
          : current.trendWeightKg >= maintenanceCenterKg - maintenanceRadiusKg &&
              current.trendWeightKg <= maintenanceCenterKg + maintenanceRadiusKg
            ? ('inside_maintenance_band' as const)
            : ('outside_maintenance_band' as const);

    const goalRevisions = allGoalRevisions.map((revision) => ({
      id: revision.id,
      goalId: revision.goalId,
      date: revision.effectiveLocalDate,
      sequence: revision.sequence,
    }));
    const checkIns = program
      ? db
          .select({ id: adaptiveNutritionCheckIns.id, date: adaptiveNutritionCheckIns.localDate })
          .from(adaptiveNutritionCheckIns)
          .where(
            and(
              eq(adaptiveNutritionCheckIns.userId, userId),
              eq(adaptiveNutritionCheckIns.programId, program.id),
              lte(adaptiveNutritionCheckIns.localDate, endDate),
            ),
          )
          .orderBy(asc(adaptiveNutritionCheckIns.localDate), asc(adaptiveNutritionCheckIns.id))
          .all()
      : [];
    const markers: TrendWeightAnalytics['markers'] = [
      ...goals
        .filter(
          (candidate) =>
            candidate.startedLocalDate >= startDate && candidate.startedLocalDate <= endDate,
        )
        .map((candidate) => ({
          id: candidate.id,
          date: candidate.startedLocalDate,
          kind: 'goal_started' as const,
          label: 'Goal started',
        })),
      ...goalRevisions
        .filter((revision) => revision.sequence > 1 && revision.date >= startDate)
        .map((revision) => ({
          id: revision.id,
          date: revision.date,
          kind: 'goal_revised' as const,
          label: 'Goal revised',
        })),
      ...checkIns
        .filter((checkIn) => checkIn.date >= startDate)
        .map((checkIn) => ({ ...checkIn, kind: 'check_in' as const, label: 'Check-in' })),
    ].sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        MARKER_KIND_ORDER[left.kind] - MARKER_KIND_ORDER[right.kind] ||
        left.id.localeCompare(right.id),
    );

    const latestScaleEntry = current.latestScale
      ? (entries.find((entry) => entry.id === current.latestScale?.id) ?? null)
      : null;
    const response = {
      range: { preset: query.range, startDate, endDate },
      timeZone,
      isHistorical: endDate < todayInEffectiveZone,
      unit,
      algorithm: {
        version: TREND_WEIGHT_ALGORITHM.version,
        windowDays: TREND_WEIGHT_ALGORITHM.windowDays,
        alpha: TREND_WEIGHT_ALGORITHM.alpha,
        interpolation: TREND_WEIGHT_ALGORITHM.interpolation,
        minimumObservations: TREND_WEIGHT_ALGORITHM.minimumObservations,
      },
      current: {
        latestScale: latestScaleEntry
          ? {
              id: latestScaleEntry.id,
              date: latestScaleEntry.date,
              weight: display(latestScaleEntry.weightKg, unit),
              unit,
              notes: latestScaleEntry.notes,
              createdAt: latestScaleEntry.createdAt,
              updatedAt: latestScaleEntry.updatedAt,
            }
          : null,
        trendWeight: current.trendWeightKg === null ? null : display(current.trendWeightKg, unit),
        trendDate: current.trendDate,
        scaleTrendDifference:
          current.scaleTrendDifferenceKg === null
            ? null
            : display(current.scaleTrendDifferenceKg, unit),
        ratePerWeek: current.rateKgPerWeek === null ? null : display(current.rateKgPerWeek, unit),
        rateEffectiveDate: current.rateKgPerWeek === null ? null : current.trendDate,
        state: current.state,
        evidence: current.evidence,
      },
      deltas: calculateCanonicalTrendWeightDeltas(entries, endDate).map((delta) => ({
        requestedDays: delta.requestedDays,
        status: delta.status,
        value: delta.valueKg === null ? null : display(delta.valueKg, unit),
        fromAsOfDate: delta.fromAsOfDate,
        fromTrendDate: delta.fromTrendDate,
        toTrendDate: delta.toTrendDate,
        reasonCode: delta.reasonCode,
      })),
      points: canonicalPoints.map((point) => ({
        sourceEntryId: point.sourceEntryId,
        date: point.date,
        scaleWeight: display(point.scaleWeightKg, unit),
        trendWeight: point.trendWeightKg === null ? null : display(point.trendWeightKg, unit),
        scaleTrendDifference:
          point.scaleTrendDifferenceKg === null
            ? null
            : display(point.scaleTrendDifferenceKg, unit),
        startsNewTrendSegment:
          point.gapFromPreviousDays !== null &&
          point.gapFromPreviousDays > TREND_WEIGHT_ALGORITHM.staleAfterDays,
        annotation: point.corrected ? 'Corrected weigh-in' : null,
        state: point.state,
        observationCount: point.observationCount,
        spanDays: point.spanDays,
        gapFromPreviousDays: point.gapFromPreviousDays,
        corrected: point.corrected,
      })),
      markers,
      goal:
        goal && goalRevision
          ? {
              id: goal.id,
              type: goal.type,
              targetWeight:
                goalRevision.targetWeightKg === null
                  ? null
                  : display(goalRevision.targetWeightKg, unit),
              maintenanceCenter:
                goalRevision.maintenanceCenterKg === null
                  ? null
                  : display(goalRevision.maintenanceCenterKg, unit),
              maintenanceLower:
                goalRevision.maintenanceCenterKg === null || maintenanceRadiusKg === null
                  ? null
                  : display(goalRevision.maintenanceCenterKg - maintenanceRadiusKg, unit),
              maintenanceUpper:
                goalRevision.maintenanceCenterKg === null || maintenanceRadiusKg === null
                  ? null
                  : display(goalRevision.maintenanceCenterKg + maintenanceRadiusKg, unit),
              desiredRatePerWeek:
                desiredRateKgPerWeek === null
                  ? goal.type === 'maintain'
                    ? 0
                    : null
                  : display(desiredRateKgPerWeek, unit),
              actualRatePerWeek: actualRate === null ? null : display(actualRate, unit),
              paceState:
                actualRate === null
                  ? 'unavailable'
                  : paceInside
                    ? 'inside_goal_band'
                    : 'outside_goal_band',
              maintenanceBandState,
              explanation:
                actualRate === null
                  ? 'More recent Trend Weight evidence is needed before pace can be compared.'
                  : goal.type === 'maintain' && !paceInside
                    ? maintenanceBandState === 'inside_maintenance_band'
                      ? 'Trend Weight is inside the maintenance band, but recent pace is outside the stable range.'
                      : 'Recent pace is outside the stable range and Trend Weight is outside the maintenance band.'
                    : goal.type === 'maintain' &&
                        maintenanceBandState === 'outside_maintenance_band'
                      ? 'Recent pace is stable, but Trend Weight is outside the maintenance band.'
                      : paceInside
                        ? 'Recent Trend Weight pace is inside the selected goal band.'
                        : 'Recent Trend Weight pace is outside the selected goal band.',
            }
          : null,
      explanation: {
        headline: headlineFor(current),
        detail:
          current.scaleTrendDifferenceKg === null
            ? 'Pulse will separate scale weight from Trend Weight after another recent observation.'
            : 'Scale weight can move faster than Trend Weight because Trend Weight waits for repeated evidence.',
        lag: 'Trend Weight intentionally responds gradually to short-term scale changes; it does not diagnose their cause.',
        confidence: confidenceExplanation(current.state),
        facts: {
          confidenceReason:
            current.state === 'no_data'
              ? 'NO_MEASUREMENTS'
              : current.state === 'scale_only'
                ? 'ONE_RECENT_MEASUREMENT'
                : current.state === 'developing'
                  ? 'LIMITED_EVIDENCE_SPAN'
                  : current.state === 'stale'
                    ? 'STALE_MEASUREMENTS'
                    : 'SUFFICIENT_EVIDENCE',
          scaleTrendRelation:
            current.scaleTrendDifferenceKg === null
              ? 'unavailable'
              : Math.abs(current.scaleTrendDifferenceKg) < 0.01
                ? 'aligned'
                : current.scaleTrendDifferenceKg > 0
                  ? 'above'
                  : 'below',
          paceDirection:
            current.rateKgPerWeek === null
              ? 'unavailable'
              : Math.abs(current.rateKgPerWeek) < 0.01
                ? 'stable'
                : current.rateKgPerWeek > 0
                  ? 'gaining'
                  : 'losing',
          paceFreshness:
            current.state === 'stale'
              ? 'stale'
              : current.rateKgPerWeek === null
                ? 'unavailable'
                : 'current',
          goalComparison: goal
            ? actualRate === null
              ? 'unavailable'
              : paceInside
                ? 'inside_goal_band'
                : 'outside_goal_band'
            : 'no_goal',
        },
      },
      policy: {
        productTrend: 'trend-weight-v1',
        trajectory: 'product_trend_weight',
        coaching: 'product_trend_weight',
        goalEta: 'adaptive_model_trend',
        goalCompletion: 'adaptive_model_trend',
        maintenanceRange: 'adaptive_model_trend',
        celebrations: 'adaptive_model_trend',
        adaptiveTdee: 'adaptive_model_trend',
        measurementHistory: 'scale_weight',
        explanation:
          'Pulse uses Product Trend Weight for display and coaching direction. Adaptive TDEE and existing goal ETA/completion safeguards continue to use their versioned model trend; scale weight remains the measurement record.',
      },
      sourceFingerprint: '0'.repeat(64),
    } satisfies TrendWeightAnalytics;
    response.sourceFingerprint = createHash('sha256')
      .update(JSON.stringify({ ...response, sourceFingerprint: undefined }))
      .digest('hex');
    return trendWeightAnalyticsSchema.parse(response);
  };

  return { getAnalytics };
};

export const getTrendWeightAnalytics = async (userId: string, query: TrendWeightQuery) => {
  const { db } = await import('../../db/index.js');
  return createTrendWeightStore({ db }).getAnalytics(userId, query);
};

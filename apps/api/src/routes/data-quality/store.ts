import {
  adaptiveProgramCalculationSchema,
  adaptiveRecommendationSchema,
  adaptiveWeeklyReviewSnapshotSchema,
  calculateAdaptiveDateBoundaries,
  calculateCanonicalTrendWeightSeries,
  convertWeightFromKg,
  dataQualityCalendarQuerySchema,
  dataQualityCalendarSchema,
  evaluateEligibility,
  type AdaptiveNutritionDay,
  type AdaptiveWeightEntry,
  type DataQualityCalendar,
  type DataQualityCalendarDay,
  type DataQualityCalendarQuery,
  type DataQualityEvidenceState,
  type WeightUnit,
} from '@pulse/shared';
import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import * as schema from '../../db/schema/index.js';
import {
  adaptiveNutritionCheckIns,
  adaptiveNutritionProgramRevisions,
  adaptiveNutritionPrograms,
  adaptiveNutritionReviewActions,
  adaptiveNutritionReviewContexts,
  adaptiveNutritionReviews,
  bodyWeight,
  mealItems,
  meals,
  nutritionLogs,
  scheduledWorkouts,
  users,
  workoutSessions,
  workoutTemplates,
} from '../../db/schema/index.js';
import {
  getDateKeyInTimeZone,
  resolveEffectiveProgramRevisions,
  type EffectiveProgramRevision,
} from '../adaptive-nutrition/analytics-store.js';

type DataQualityDatabase = BetterSQLite3Database<typeof schema>;

const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const datesBetween = (start: string, end: string) => {
  const dates: string[] = [];
  for (let current = start; current <= end; current = addDays(current, 1)) dates.push(current);
  return dates;
};

const isSupportedTimeZone = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
};

const preferenceTimeZone = (preferences: unknown) => {
  if (!preferences || typeof preferences !== 'object') return null;
  const value = preferences as { timeZone?: unknown; timezone?: unknown };
  const candidate = value.timeZone ?? value.timezone;
  return isSupportedTimeZone(candidate) ? candidate : null;
};

const unique = <T>(values: readonly T[]) => [...new Set(values)];

const nutritionStatusAction = (date: string) => ({
  kind: 'set_nutrition_status' as const,
  label: 'Review nutrition day status',
  href: `/nutrition?date=${date}`,
  method: 'navigate' as const,
});

const addContextAction = (date: string) => ({
  kind: 'add_context' as const,
  label: 'Add bounded context',
  href: `/data-quality?date=${date}&action=context`,
  method: 'navigate' as const,
});

const reviewActionState = (
  actions: Array<{ type: string }>,
): DataQualityCalendarDay['algorithm']['events'][number]['state'] => {
  const latest = actions.at(-1)?.type;
  if (latest === 'accept') return 'accepted';
  if (latest === 'decline') return 'declined';
  if (latest === 'defer') return 'deferred';
  if (latest === 'ask_agent') return 'awaiting_clarification';
  if (latest === 'supersede') return 'superseded';
  return 'pending';
};

const programRevisionForDate = (
  revisions: EffectiveProgramRevision[],
  date: string,
): EffectiveProgramRevision | null =>
  [...revisions].reverse().find((revision) => revision.effectiveLocalDate <= date) ?? null;

const algorithmStateForDate = (
  date: string,
  revisions: EffectiveProgramRevision[],
  checkIns: Array<{
    localDate: string;
    calculationState: 'baseline' | 'learning' | 'updating' | 'holding';
    status: 'pending' | 'accepted' | 'declined' | 'superseded' | 'held';
    createdAt: number;
  }>,
  eligible: boolean,
): DataQualityCalendarDay['algorithm']['state'] => {
  const revision = programRevisionForDate(revisions, date);
  if (!revision) return revisions.length === 0 ? 'no_program' : 'pre_program';
  if (revision.snapshot.status === 'paused') return 'holding';
  if (eligible) return 'updating';
  const latest = checkIns
    .filter((checkIn) => checkIn.localDate <= date)
    .sort(
      (left, right) =>
        left.localDate.localeCompare(right.localDate) || left.createdAt - right.createdAt,
    )
    .at(-1);
  if (!latest) return 'learning';
  if (latest.status === 'held' || latest.calculationState === 'holding') return 'holding';
  if (latest.status === 'accepted' && latest.calculationState === 'updating') return 'holding';
  return 'learning';
};

const summaryFor = (days: DataQualityCalendarDay[]): DataQualityCalendar['summary'] => ({
  nutrition: {
    complete: days.filter((day) => day.nutrition.qualityState === 'complete').length,
    partial: days.filter((day) => day.nutrition.qualityState === 'partial').length,
    unknown: days.filter((day) => day.nutrition.qualityState === 'unknown').length,
    missing: days.filter((day) => day.nutrition.qualityState === 'no_records').length,
    pending: days.filter((day) => day.nutrition.evidenceState === 'pending_cutoff').length,
    excluded: days.filter((day) => day.nutrition.evidenceState === 'excluded').length,
  },
  weight: {
    logged: days.filter((day) => day.weight.entryId !== null).length,
    missing: days.filter((day) => day.weight.entryId === null).length,
    pending: days.filter((day) => day.weight.evidenceState === 'pending_cutoff').length,
    excluded: days.filter((day) => day.weight.evidenceState === 'excluded').length,
    corrected: days.filter((day) => day.weight.corrected).length,
  },
  workout: {
    planned: days.flatMap((day) => day.workouts).filter((item) => item.state === 'planned').length,
    active: days
      .flatMap((day) => day.workouts)
      .filter((item) => item.state === 'in_progress' || item.state === 'paused').length,
    completed: days.flatMap((day) => day.workouts).filter((item) => item.state === 'completed')
      .length,
    cancelled: days.flatMap((day) => day.workouts).filter((item) => item.state === 'cancelled')
      .length,
    corrected: days.flatMap((day) => day.workouts).filter((item) => item.state === 'corrected')
      .length,
  },
  algorithm: {
    learning: days.filter((day) => day.algorithm.state === 'learning').length,
    updating: days.filter((day) => day.algorithm.state === 'updating').length,
    holding: days.filter((day) => day.algorithm.state === 'holding').length,
    pendingReview: days.filter((day) =>
      day.algorithm.events.some((event) =>
        ['pending', 'awaiting_clarification', 'deferred', 'stale'].includes(event.state),
      ),
    ).length,
  },
  contextDays: days.filter((day) => day.contexts.length > 0).length,
});

export const createDataQualityCalendarStore = (dependencies: {
  db: DataQualityDatabase;
  now?: () => Date;
  onQuery?: (source: string) => void;
}) => {
  const { db } = dependencies;
  const now = dependencies.now ?? (() => new Date());
  const observe = dependencies.onQuery ?? (() => undefined);

  const getCalendar = (userId: string, rawQuery: DataQualityCalendarQuery): DataQualityCalendar => {
    const query = dataQualityCalendarQuerySchema.parse(rawQuery);
    observe('user');
    const user = db
      .select({ weightUnit: users.weightUnit, preferences: users.preferences })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .get();
    if (!user) throw new Error('Authenticated user not found while loading Data Quality calendar');

    observe('program');
    const program = db
      .select({ id: adaptiveNutritionPrograms.id })
      .from(adaptiveNutritionPrograms)
      .where(eq(adaptiveNutritionPrograms.userId, userId))
      .limit(1)
      .get();
    const programRevisions = program
      ? (observe('program-revisions'),
        resolveEffectiveProgramRevisions(
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
        ))
      : [];
    const timeZone =
      query.timeZone ??
      programRevisions.at(-1)?.snapshot.timeZone ??
      preferenceTimeZone(user.preferences) ??
      'UTC';
    const today = getDateKeyInTimeZone(now(), timeZone);
    const dates = datesBetween(query.start, query.end);
    const evidenceStart = calculateAdaptiveDateBoundaries(query.start, false).analysisStart;

    observe('nutrition');
    const nutritionRows = db
      .select({
        id: nutritionLogs.id,
        date: nutritionLogs.date,
        status: nutritionLogs.status,
        statusUpdatedAt: nutritionLogs.statusUpdatedAt,
        updatedAt: nutritionLogs.updatedAt,
        calories: sql<number>`coalesce(sum(${mealItems.calories}), 0)`,
        protein: sql<number>`coalesce(sum(${mealItems.protein}), 0)`,
        carbs: sql<number>`coalesce(sum(${mealItems.carbs}), 0)`,
        fat: sql<number>`coalesce(sum(${mealItems.fat}), 0)`,
        mealCount: sql<number>`count(distinct ${meals.id})`,
        itemCount: sql<number>`count(${mealItems.id})`,
      })
      .from(nutritionLogs)
      .leftJoin(meals, eq(meals.nutritionLogId, nutritionLogs.id))
      .leftJoin(mealItems, eq(mealItems.mealId, meals.id))
      .where(
        and(
          eq(nutritionLogs.userId, userId),
          gte(nutritionLogs.date, evidenceStart),
          lte(nutritionLogs.date, query.end),
        ),
      )
      .groupBy(nutritionLogs.id)
      .orderBy(asc(nutritionLogs.date))
      .all();
    const visibleNutritionRows = nutritionRows.filter((row) => row.date >= query.start);
    const nutritionByDate = new Map(visibleNutritionRows.map((row) => [row.date, row]));

    observe('weight');
    const allWeightRows = db
      .select({
        id: bodyWeight.id,
        date: bodyWeight.date,
        weightKg: bodyWeight.weightKg,
        unitAtEntry: bodyWeight.unitAtEntry,
        createdAt: bodyWeight.createdAt,
        updatedAt: bodyWeight.updatedAt,
      })
      .from(bodyWeight)
      .where(and(eq(bodyWeight.userId, userId), lte(bodyWeight.date, query.end)))
      .orderBy(asc(bodyWeight.date), asc(bodyWeight.id))
      .all()
      .map((row) => ({ ...row, weightKg: Number(row.weightKg) }));
    const visibleWeightRows = allWeightRows.filter(
      (row) => row.date >= query.start && row.date <= query.end,
    );
    const weightByDate = new Map(visibleWeightRows.map((row) => [row.date, row]));
    const trendByDate = new Map(
      calculateCanonicalTrendWeightSeries(allWeightRows, query.start, query.end).map((point) => [
        point.date,
        point.trendWeightKg,
      ]),
    );
    const eligibilityByDate = new Map(
      dates.map((date) => [
        date,
        evaluateEligibility({
          boundaries: calculateAdaptiveDateBoundaries(date, false),
          nutritionDays: nutritionRows as AdaptiveNutritionDay[],
          weightEntries: allWeightRows as AdaptiveWeightEntry[],
        }),
      ]),
    );

    observe('scheduled-workouts');
    const scheduledRows = db
      .select({
        id: scheduledWorkouts.id,
        date: scheduledWorkouts.date,
        sessionId: scheduledWorkouts.sessionId,
        templateName: workoutTemplates.name,
        createdAt: scheduledWorkouts.createdAt,
        updatedAt: scheduledWorkouts.updatedAt,
      })
      .from(scheduledWorkouts)
      .leftJoin(workoutTemplates, eq(workoutTemplates.id, scheduledWorkouts.templateId))
      .where(
        and(
          eq(scheduledWorkouts.userId, userId),
          gte(scheduledWorkouts.date, query.start),
          lte(scheduledWorkouts.date, query.end),
        ),
      )
      .orderBy(asc(scheduledWorkouts.date), asc(scheduledWorkouts.createdAt))
      .all();
    observe('workout-sessions');
    const sessionRows = db
      .select({
        id: workoutSessions.id,
        scheduledWorkoutId: workoutSessions.scheduledWorkoutId,
        name: workoutSessions.name,
        date: workoutSessions.date,
        status: workoutSessions.status,
        startedAt: workoutSessions.startedAt,
        completedAt: workoutSessions.completedAt,
        createdAt: workoutSessions.createdAt,
        updatedAt: workoutSessions.updatedAt,
      })
      .from(workoutSessions)
      .where(
        and(
          eq(workoutSessions.userId, userId),
          isNull(workoutSessions.deletedAt),
          gte(workoutSessions.date, query.start),
          lte(workoutSessions.date, query.end),
        ),
      )
      .orderBy(asc(workoutSessions.date), asc(workoutSessions.startedAt))
      .all();
    const sessionsByDate = new Map<string, typeof sessionRows>();
    for (const row of sessionRows) {
      const existing = sessionsByDate.get(row.date) ?? [];
      existing.push(row);
      sessionsByDate.set(row.date, existing);
    }
    const schedulesByDate = new Map<string, typeof scheduledRows>();
    for (const row of scheduledRows) {
      const existing = schedulesByDate.get(row.date) ?? [];
      existing.push(row);
      schedulesByDate.set(row.date, existing);
    }

    const priorCheckIn = program
      ? (observe('prior-check-in'),
        db
          .select()
          .from(adaptiveNutritionCheckIns)
          .where(
            and(
              eq(adaptiveNutritionCheckIns.userId, userId),
              eq(adaptiveNutritionCheckIns.programId, program.id),
              lte(adaptiveNutritionCheckIns.localDate, query.start),
            ),
          )
          .orderBy(
            sql`${adaptiveNutritionCheckIns.localDate} desc`,
            sql`${adaptiveNutritionCheckIns.createdAt} desc`,
          )
          .limit(1)
          .get())
      : undefined;
    const rangeCheckIns = program
      ? (observe('range-check-ins'),
        db
          .select()
          .from(adaptiveNutritionCheckIns)
          .where(
            and(
              eq(adaptiveNutritionCheckIns.userId, userId),
              eq(adaptiveNutritionCheckIns.programId, program.id),
              gte(adaptiveNutritionCheckIns.localDate, query.start),
              lte(adaptiveNutritionCheckIns.localDate, query.end),
            ),
          )
          .orderBy(
            asc(adaptiveNutritionCheckIns.localDate),
            asc(adaptiveNutritionCheckIns.createdAt),
          )
          .all())
      : [];
    const checkIns = priorCheckIn
      ? [priorCheckIn, ...rangeCheckIns.filter((row) => row.id !== priorCheckIn.id)]
      : rangeCheckIns;

    const overlappingReviews = program
      ? (observe('overlapping-reviews'),
        db
          .select()
          .from(adaptiveNutritionReviews)
          .where(
            and(
              eq(adaptiveNutritionReviews.userId, userId),
              eq(adaptiveNutritionReviews.programId, program.id),
              lte(adaptiveNutritionReviews.analysisStart, query.end),
              gte(adaptiveNutritionReviews.analysisEnd, query.start),
            ),
          )
          .orderBy(asc(adaptiveNutritionReviews.createdAt))
          .all())
      : [];
    const reviewIds = overlappingReviews.map((review) => review.id);
    const reviewActions =
      reviewIds.length > 0
        ? (observe('review-actions'),
          db
            .select()
            .from(adaptiveNutritionReviewActions)
            .where(
              and(
                eq(adaptiveNutritionReviewActions.userId, userId),
                inArray(adaptiveNutritionReviewActions.reviewId, reviewIds),
              ),
            )
            .orderBy(
              asc(adaptiveNutritionReviewActions.reviewId),
              asc(adaptiveNutritionReviewActions.sequence),
            )
            .all())
        : [];
    const actionsByReview = new Map<string, typeof reviewActions>();
    for (const action of reviewActions) {
      const existing = actionsByReview.get(action.reviewId) ?? [];
      existing.push(action);
      actionsByReview.set(action.reviewId, existing);
    }

    const nutritionEvidence = new Map<
      string,
      { state: DataQualityEvidenceState; reasonCodes: string[]; suspectedPartial: boolean }
    >();
    const weightEvidence = new Map<
      string,
      { state: DataQualityEvidenceState; reasonCodes: string[]; suspect: boolean }
    >();
    for (const eligibility of eligibilityByDate.values()) {
      for (const day of eligibility.usableNutritionDays) {
        if (day.date >= query.start && day.date <= query.end) {
          nutritionEvidence.set(day.date, {
            state: 'usable',
            reasonCodes: [],
            suspectedPartial: false,
          });
        }
      }
      for (const date of eligibility.excludedNutritionDates) {
        if (date >= query.start && date <= query.end && !nutritionEvidence.has(date)) {
          nutritionEvidence.set(date, {
            state: 'excluded',
            reasonCodes: ['INCOMPLETE_NUTRITION_EXCLUDED'],
            suspectedPartial: false,
          });
        }
      }
      const suspectIds = new Set(eligibility.suspectWeightEntryIds);
      for (const weight of eligibility.actualWeights) {
        if (weight.date < query.start || weight.date > query.end) continue;
        const suspect = suspectIds.has(weight.id);
        weightEvidence.set(weight.date, {
          state: suspect ? 'excluded' : 'usable',
          reasonCodes: suspect ? ['SUSPECT_WEIGHT'] : [],
          suspect,
        });
      }
    }
    for (const review of overlappingReviews) {
      const snapshot = adaptiveWeeklyReviewSnapshotSchema.parse(review.snapshot);
      const recommendation = snapshot.modules.find((module) => module.kind === 'recommendation');
      if (recommendation?.kind === 'recommendation') {
        for (const date of recommendation.causalBreakdown.includedNutritionDates) {
          nutritionEvidence.set(date, {
            state: 'usable',
            reasonCodes: [],
            suspectedPartial: false,
          });
        }
        for (const item of recommendation.causalBreakdown.excludedNutrition) {
          nutritionEvidence.set(item.localDate, {
            state: 'excluded',
            reasonCodes: item.reasonCodes,
            suspectedPartial: false,
          });
        }
        for (const date of recommendation.causalBreakdown.includedWeightDates) {
          weightEvidence.set(date, { state: 'usable', reasonCodes: [], suspect: false });
        }
        for (const item of recommendation.causalBreakdown.excludedWeight) {
          weightEvidence.set(item.localDate, {
            state: 'excluded',
            reasonCodes: item.reasonCodes,
            suspect: item.reasonCodes.some((code) => code.includes('SUSPECT')),
          });
        }
      }
      const dataQuality = snapshot.modules.find((module) => module.kind === 'data_quality');
      if (dataQuality?.kind === 'data_quality') {
        for (const evidence of dataQuality.evidence) {
          if (evidence.kind !== 'nutrition') continue;
          const current = nutritionEvidence.get(evidence.localDate) ?? {
            state: evidence.state,
            reasonCodes: [],
            suspectedPartial: false,
          };
          nutritionEvidence.set(evidence.localDate, {
            ...current,
            reasonCodes: unique([...current.reasonCodes, ...evidence.reasonCodes]),
            suspectedPartial:
              current.suspectedPartial || evidence.reasonCodes.includes('LIKELY_PARTIAL_NUTRITION'),
          });
        }
      }
    }
    for (const checkIn of checkIns) {
      const calculation = adaptiveRecommendationSchema.parse(checkIn.calculationSnapshot);
      for (const date of calculation.excludedNutritionDates) {
        if (!nutritionEvidence.has(date)) {
          nutritionEvidence.set(date, {
            state: 'excluded',
            reasonCodes: calculation.reasonCodes,
            suspectedPartial: false,
          });
        }
      }
      for (const entry of calculation.suspectWeightEntries) {
        if (!weightEvidence.has(entry.date)) {
          weightEvidence.set(entry.date, {
            state: 'excluded',
            reasonCodes: ['SUSPECT_WEIGHT'],
            suspect: true,
          });
        }
      }
    }

    const boundedEntityIds = unique([
      ...visibleNutritionRows.map((row) => row.id),
      ...visibleWeightRows.map((row) => row.id),
      ...scheduledRows.map((row) => row.id),
      ...sessionRows.map((row) => row.id),
      ...rangeCheckIns.map((row) => row.id),
    ]);
    const contexts = program
      ? (observe('contexts'),
        db
          .select()
          .from(adaptiveNutritionReviewContexts)
          .where(
            and(
              eq(adaptiveNutritionReviewContexts.userId, userId),
              eq(adaptiveNutritionReviewContexts.programId, program.id),
              isNull(adaptiveNutritionReviewContexts.deletedAt),
              or(
                and(
                  eq(adaptiveNutritionReviewContexts.subjectType, 'date'),
                  sql`json_extract(${adaptiveNutritionReviewContexts.subject}, '$.localDate') between ${query.start} and ${query.end}`,
                ),
                and(
                  eq(adaptiveNutritionReviewContexts.subjectType, 'date_range'),
                  sql`json_extract(${adaptiveNutritionReviewContexts.subject}, '$.startDate') <= ${query.end}`,
                  sql`json_extract(${adaptiveNutritionReviewContexts.subject}, '$.endDate') >= ${query.start}`,
                ),
                ...(boundedEntityIds.length > 0
                  ? [
                      sql`json_extract(${adaptiveNutritionReviewContexts.subject}, '$.id') in ${boundedEntityIds}`,
                    ]
                  : []),
                and(
                  eq(adaptiveNutritionReviewContexts.subjectType, 'upcoming_check_in'),
                  sql`json_extract(${adaptiveNutritionReviewContexts.subject}, '$.targetReviewLocalDate') between ${query.start} and ${query.end}`,
                ),
              ),
            ),
          )
          .orderBy(
            asc(adaptiveNutritionReviewContexts.createdAt),
            asc(adaptiveNutritionReviewContexts.id),
          )
          .all())
      : [];

    const contextDates = (context: (typeof contexts)[number]) => {
      const subject = context.subject;
      if (subject.kind === 'date') return [subject.localDate];
      if (subject.kind === 'date_range') {
        return datesBetween(
          subject.startDate < query.start ? query.start : subject.startDate,
          subject.endDate > query.end ? query.end : subject.endDate,
        );
      }
      if (subject.kind === 'upcoming_check_in') return [subject.targetReviewLocalDate];
      const rowDate =
        subject.kind === 'nutrition_log'
          ? visibleNutritionRows.find((row) => row.id === subject.id)?.date
          : subject.kind === 'weigh_in'
            ? visibleWeightRows.find((row) => row.id === subject.id)?.date
            : subject.kind === 'scheduled_workout'
              ? scheduledRows.find((row) => row.id === subject.id)?.date
              : subject.kind === 'workout_session'
                ? sessionRows.find((row) => row.id === subject.id)?.date
                : rangeCheckIns.find((row) => row.id === subject.id)?.localDate;
      return rowDate ? [rowDate] : [];
    };
    const contextsByDate = new Map<string, typeof contexts>();
    for (const context of contexts) {
      for (const date of contextDates(context)) {
        const existing = contextsByDate.get(date) ?? [];
        existing.push(context);
        contextsByDate.set(date, existing);
      }
    }

    const reviewsByDate = new Map<string, typeof overlappingReviews>();
    for (const review of overlappingReviews.filter(
      (item) => item.reviewLocalDate >= query.start && item.reviewLocalDate <= query.end,
    )) {
      const existing = reviewsByDate.get(review.reviewLocalDate) ?? [];
      existing.push(review);
      reviewsByDate.set(review.reviewLocalDate, existing);
    }

    const days: DataQualityCalendarDay[] = dates.map((date) => {
      const nutrition = nutritionByDate.get(date);
      const recordedNutritionState = nutritionEvidence.get(date);
      const nutritionEvidenceState: DataQualityEvidenceState =
        date === today && nutrition
          ? 'pending_cutoff'
          : (recordedNutritionState?.state ?? (nutrition ? 'logged' : 'missing'));
      const qualityState = !nutrition
        ? ('no_records' as const)
        : recordedNutritionState?.suspectedPartial && nutrition.status === 'complete'
          ? ('suspected_partial' as const)
          : nutrition.status;

      const weight = weightByDate.get(date);
      const recordedWeightState = weightEvidence.get(date);
      const weightEvidenceState: DataQualityEvidenceState =
        date === today && weight
          ? 'pending_cutoff'
          : (recordedWeightState?.state ?? (weight ? 'logged' : 'missing'));
      const trendWeightKg = trendByDate.get(date) ?? null;
      const unit = user.weightUnit as WeightUnit;

      const sessions = sessionsByDate.get(date) ?? [];
      const sessionIds = new Set(sessions.map((session) => session.id));
      const workoutItems: DataQualityCalendarDay['workouts'] = [
        ...(schedulesByDate.get(date) ?? [])
          .filter((schedule) => schedule.sessionId === null || !sessionIds.has(schedule.sessionId))
          .map((schedule) => ({
            id: schedule.id,
            kind: 'scheduled_workout' as const,
            state: 'planned' as const,
            name: schedule.templateName ?? 'Unavailable scheduled workout',
            sessionStatus: null,
            scheduledWorkoutId: schedule.id,
            sessionId: schedule.sessionId,
            startedAt: null,
            completedAt: null,
            createdAt: schedule.createdAt,
            updatedAt: schedule.updatedAt,
            reasonCodes: [],
            actions: [
              {
                kind: 'correct_workout' as const,
                label: 'Review scheduled workout',
                href: `/workouts/scheduled/${schedule.id}`,
                method: 'navigate' as const,
              },
            ],
          })),
        ...sessions.map((session) => {
          const corrected =
            session.status === 'completed' &&
            session.completedAt !== null &&
            session.updatedAt > session.completedAt;
          const state = corrected
            ? ('corrected' as const)
            : session.status === 'completed'
              ? ('completed' as const)
              : session.status === 'cancelled'
                ? ('cancelled' as const)
                : session.status === 'paused'
                  ? ('paused' as const)
                  : ('in_progress' as const);
          return {
            id: session.id,
            kind: 'workout_session' as const,
            state,
            name: session.name,
            sessionStatus: session.status,
            scheduledWorkoutId: session.scheduledWorkoutId,
            sessionId: session.id,
            startedAt: session.startedAt,
            completedAt: session.completedAt,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            reasonCodes: corrected ? ['SESSION_CORRECTED_AFTER_COMPLETION'] : [],
            actions: [
              {
                kind: 'correct_workout' as const,
                label: corrected ? 'Review corrected workout' : 'Review workout',
                href: `/workouts/session/${session.id}`,
                method: 'navigate' as const,
              },
            ],
          };
        }),
      ];

      const checkInEvents: DataQualityCalendarDay['algorithm']['events'] = rangeCheckIns
        .filter((checkIn) => {
          const proposedTargets = checkIn.proposedTargets as { effectiveDate?: unknown } | null;
          const effectiveDate =
            checkIn.status === 'accepted' && typeof proposedTargets?.effectiveDate === 'string'
              ? proposedTargets.effectiveDate
              : checkIn.localDate;
          return effectiveDate === date;
        })
        .map((checkIn) => {
          const proposedTargets = checkIn.proposedTargets as { effectiveDate?: unknown } | null;
          const effectiveDate =
            checkIn.status === 'accepted' && typeof proposedTargets?.effectiveDate === 'string'
              ? proposedTargets.effectiveDate
              : checkIn.localDate;
          return {
            id: checkIn.id,
            kind: 'check_in' as const,
            state: checkIn.status,
            effectiveDate,
            createdAt: checkIn.createdAt,
            reasonCodes: checkIn.reasonCodes,
            actions: [
              {
                kind: 'view_check_in' as const,
                label: 'Open Nutrition Coach',
                href: '/nutrition?view=coach',
                method: 'navigate' as const,
              },
            ],
          };
        });
      const reviewEvents: DataQualityCalendarDay['algorithm']['events'] = (
        reviewsByDate.get(date) ?? []
      ).map((review) => {
        const state = reviewActionState(actionsByReview.get(review.id) ?? []);
        return {
          id: review.id,
          kind: 'weekly_review' as const,
          state,
          effectiveDate: review.reviewLocalDate,
          createdAt: review.createdAt,
          reasonCodes: [],
          actions: [
            {
              kind: 'view_review' as const,
              label: 'View weekly review',
              href: `/nutrition/reviews/${review.id}`,
              method: 'navigate' as const,
            },
          ],
        };
      });
      const eligibility = eligibilityByDate.get(date);
      const state =
        date > today && programRevisions.length > 0
          ? ('future' as const)
          : algorithmStateForDate(date, programRevisions, checkIns, eligibility?.eligible ?? false);
      const algorithmNutritionState =
        state === 'no_program' || state === 'pre_program' || state === 'future'
          ? 'not_applicable'
          : nutritionEvidenceState;
      const algorithmWeightState =
        state === 'no_program' || state === 'pre_program' || state === 'future'
          ? 'not_applicable'
          : weightEvidenceState;

      return {
        date,
        isToday: date === today,
        nutrition: {
          qualityState,
          evidenceState: nutritionEvidenceState,
          logId: nutrition?.id ?? null,
          explicitStatus: nutrition?.status ?? null,
          totals: nutrition
            ? {
                calories: Number(nutrition.calories),
                protein: Number(nutrition.protein),
                carbs: Number(nutrition.carbs),
                fat: Number(nutrition.fat),
              }
            : null,
          mealCount: nutrition ? Number(nutrition.mealCount) : null,
          itemCount: nutrition ? Number(nutrition.itemCount) : null,
          statusUpdatedAt: nutrition?.statusUpdatedAt ?? null,
          updatedAt: nutrition?.updatedAt ?? null,
          reasonCodes: recordedNutritionState?.reasonCodes ?? [],
          actions: [nutritionStatusAction(date), addContextAction(date)],
        },
        weight: {
          evidenceState: weightEvidenceState,
          entryId: weight?.id ?? null,
          weight: weight ? convertWeightFromKg(weight.weightKg, unit) : null,
          unit: weight ? unit : null,
          trendWeight: trendWeightKg === null ? null : convertWeightFromKg(trendWeightKg, unit),
          corrected: weight ? weight.updatedAt > weight.createdAt : false,
          suspect: recordedWeightState?.suspect ?? false,
          stale:
            weight !== undefined &&
            date < addDays(today, -7) &&
            visibleWeightRows.at(-1)?.date === date,
          createdAt: weight?.createdAt ?? null,
          updatedAt: weight?.updatedAt ?? null,
          reasonCodes: recordedWeightState?.reasonCodes ?? [],
          actions: weight
            ? [
                {
                  kind: 'correct_weight' as const,
                  label: 'Review weight measurement',
                  href: `/weight/history?date=${date}`,
                  method: 'navigate' as const,
                },
                addContextAction(date),
              ]
            : [addContextAction(date)],
        },
        workouts: workoutItems,
        algorithm: {
          state,
          nutritionEvidenceState: algorithmNutritionState,
          weightEvidenceState: algorithmWeightState,
          reasonCodes: unique([
            ...(state === 'future' ? ['FUTURE_DATE_NOT_EVALUATED'] : []),
            ...(state === 'learning' || state === 'holding'
              ? (eligibility?.holdReasons ?? [])
              : []),
            ...(recordedNutritionState?.reasonCodes ?? []),
            ...(recordedWeightState?.reasonCodes ?? []),
          ]),
          events: [...checkInEvents, ...reviewEvents].sort(
            (left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id),
          ),
        },
        contexts: (contextsByDate.get(date) ?? []).map((context) => ({
          id: context.id,
          category: context.category,
          note: context.note,
          resolution: context.resolution,
          provenance: {
            type: context.createdBy,
            agentTokenId: context.agentTokenId,
            label: context.actorLabel,
          },
          subjectKind: context.subject.kind,
          revision: context.revision,
          createdAt: context.createdAt,
          updatedAt: context.updatedAt,
          actions: [
            {
              kind: 'add_context' as const,
              label: 'Review context in Nutrition Coach',
              href: '/nutrition?view=coach',
              method: 'navigate' as const,
            },
          ],
        })),
      };
    });

    return dataQualityCalendarSchema.parse({
      range: { startDate: query.start, endDate: query.end },
      timeZone,
      days,
      summary: summaryFor(days),
    });
  };

  return { getCalendar };
};

export const getDataQualityCalendar = async (userId: string, query: DataQualityCalendarQuery) => {
  const { db } = await import('../../db/index.js');
  return createDataQualityCalendarStore({ db }).getCalendar(userId, query);
};

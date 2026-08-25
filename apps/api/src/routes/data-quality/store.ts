import {
  adaptiveProgramCalculationSchema,
  adaptiveRecommendationSchema,
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
import type Database from 'better-sqlite3';
import { and, asc, desc, eq, gte, inArray, isNull, lte, max, or, sql } from 'drizzle-orm';
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
  adaptiveAnalyticsStateForPoint,
  getDateKeyInTimeZone,
  type EffectiveProgramRevision,
} from '../adaptive-nutrition/analytics-store.js';
import { getApplicationNow } from '../../lib/clock.js';
import { createAdaptiveWeeklyReviewStore } from '../adaptive-nutrition/review-store.js';

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

const notRecordedProvenance = (limitation: string) => ({
  type: 'not_recorded' as const,
  label: 'Not recorded',
  agentTokenId: null,
  limitation,
});

const systemProvenance = {
  type: 'system_derived' as const,
  label: 'Pulse algorithm',
  agentTokenId: null,
  limitation: null,
};

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

const monthGridRange = (date: string) => {
  const monthStart = `${date.slice(0, 7)}-01`;
  const first = new Date(`${monthStart}T00:00:00.000Z`);
  const start = addDays(monthStart, -((first.getUTCDay() + 6) % 7));
  const next = new Date(first);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const last = addDays(next.toISOString().slice(0, 10), -1);
  return { start, end: addDays(last, (7 - new Date(`${last}T00:00:00.000Z`).getUTCDay()) % 7) };
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
  const latest = checkIns
    .filter(
      (checkIn) =>
        checkIn.localDate <= date && ['accepted', 'held', 'pending'].includes(checkIn.status),
    )
    .sort(
      (left, right) =>
        left.localDate.localeCompare(right.localDate) || left.createdAt - right.createdAt,
    )
    .at(-1);
  if (!latest) return 'learning';
  const state = adaptiveAnalyticsStateForPoint(latest, latest.calculationState);
  if (state === 'holding') return 'holding';
  if (state === 'updating') return eligible ? 'updating' : 'holding';
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
  },
  workout: {
    planned: days
      .flatMap((day) => day.workouts)
      .filter((item) => item.state === 'planned' || item.state === 'scheduled').length,
    active: days
      .flatMap((day) => day.workouts)
      .filter((item) => item.state === 'in_progress' || item.state === 'paused').length,
    completed: days.flatMap((day) => day.workouts).filter((item) => item.state === 'completed')
      .length,
    cancelled: days.flatMap((day) => day.workouts).filter((item) => item.state === 'cancelled')
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
  intervalLabel: 'Visible calendar grid',
});

export const createDataQualityCalendarStore = (dependencies: {
  db: DataQualityDatabase;
  sqlite: Database.Database;
  now?: () => Date;
  onQuery?: (source: string) => void;
}) => {
  const { db } = dependencies;
  const now = dependencies.now ?? getApplicationNow;
  const observe = dependencies.onQuery ?? (() => undefined);
  const reviewStore = createAdaptiveWeeklyReviewStore({ db, sqlite: dependencies.sqlite, now });

  const getCalendar = (userId: string, rawQuery: DataQualityCalendarQuery): DataQualityCalendar => {
    const parsedQuery = dataQualityCalendarQuerySchema.parse(rawQuery);
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
    const revisionSelection = {
      id: adaptiveNutritionProgramRevisions.id,
      sequence: adaptiveNutritionProgramRevisions.sequence,
      effectiveAt: adaptiveNutritionProgramRevisions.effectiveAt,
      snapshot: adaptiveNutritionProgramRevisions.snapshot,
    };
    const latestRevisionRow = program
      ? (observe('latest-program-revision'),
        db
          .select(revisionSelection)
          .from(adaptiveNutritionProgramRevisions)
          .where(
            and(
              eq(adaptiveNutritionProgramRevisions.userId, userId),
              eq(adaptiveNutritionProgramRevisions.programId, program.id),
            ),
          )
          .orderBy(desc(adaptiveNutritionProgramRevisions.sequence))
          .limit(1)
          .get())
      : undefined;
    const latestRevisionSnapshot = latestRevisionRow
      ? adaptiveProgramCalculationSchema.parse(latestRevisionRow.snapshot)
      : null;
    const timeZone =
      parsedQuery.timeZone ??
      latestRevisionSnapshot?.timeZone ??
      preferenceTimeZone(user.preferences) ??
      'UTC';
    const today = getDateKeyInTimeZone(now(), timeZone);
    const bootstrapRange = monthGridRange(today);
    const query = {
      start: parsedQuery.start ?? bootstrapRange.start,
      end: parsedQuery.end ?? bootstrapRange.end,
      timeZone: parsedQuery.timeZone,
    };
    type RevisionDateRow = {
      id: string;
      sequence: number;
      effectiveAt: number;
      snapshot: string | unknown;
      effectiveLocalDate: string;
    };
    const programRevisions = program
      ? (observe('range-program-revisions'),
        (
          dependencies.sqlite
            .prepare(
              `with in_range as (
               select revision.id,
                      revision.sequence,
                      revision.effective_at as effectiveAt,
                      revision.snapshot,
                      projection.effective_local_date as effectiveLocalDate,
                      row_number() over (
                        partition by projection.effective_local_date
                        order by projection.sequence desc
                      ) as dateRank
                 from adaptive_nutrition_program_revision_dates projection
                 join adaptive_nutrition_program_revisions revision
                   on revision.id = projection.revision_id
                where projection.user_id = @userId
                  and projection.program_id = @programId
                  and projection.effective_local_date between @start and @end
             ), prior as (
               select revision.id,
                      revision.sequence,
                      revision.effective_at as effectiveAt,
                      revision.snapshot,
                      projection.effective_local_date as effectiveLocalDate
                 from adaptive_nutrition_program_revision_dates projection
                 join adaptive_nutrition_program_revisions revision
                   on revision.id = projection.revision_id
                where projection.user_id = @userId
                  and projection.program_id = @programId
                  and projection.effective_local_date < @start
                order by projection.effective_local_date desc, projection.sequence desc
                limit 1
             )
             select id, sequence, effectiveAt, snapshot, effectiveLocalDate from prior
             union all
             select id, sequence, effectiveAt, snapshot, effectiveLocalDate
               from in_range
              where dateRank = 1
             order by sequence`,
            )
            .all({
              userId,
              programId: program.id,
              start: query.start,
              end: query.end,
            }) as RevisionDateRow[]
        ).map((revision) => ({
          ...revision,
          snapshot: adaptiveProgramCalculationSchema.parse(
            typeof revision.snapshot === 'string'
              ? JSON.parse(revision.snapshot)
              : revision.snapshot,
          ),
        })))
      : [];
    const dates = datesBetween(query.start, query.end);
    const earliestBoundaries = calculateAdaptiveDateBoundaries(query.start, false);
    const evidenceStart = earliestBoundaries.analysisStart;
    const canonicalTrendStart = addDays(query.start, -29);
    const weightEvidenceStart =
      earliestBoundaries.warmupStart < canonicalTrendStart
        ? earliestBoundaries.warmupStart
        : canonicalTrendStart;

    observe('nutrition');
    const nutritionRows = db
      .select({
        id: nutritionLogs.id,
        date: nutritionLogs.date,
        status: nutritionLogs.status,
        createdAt: nutritionLogs.createdAt,
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
      .where(
        and(
          eq(bodyWeight.userId, userId),
          gte(bodyWeight.date, weightEvidenceStart),
          lte(bodyWeight.date, query.end),
        ),
      )
      .orderBy(asc(bodyWeight.date), asc(bodyWeight.id))
      .all()
      .map((row) => ({ ...row, weightKg: Number(row.weightKg) }));
    const visibleWeightRows = allWeightRows.filter(
      (row) => row.date >= query.start && row.date <= query.end,
    );
    const weightByDate = new Map(visibleWeightRows.map((row) => [row.date, row]));
    observe('latest-weight');
    const latestWeightDate = db
      .select({ date: max(bodyWeight.date) })
      .from(bodyWeight)
      .where(and(eq(bodyWeight.userId, userId), lte(bodyWeight.date, today)))
      .get()?.date;
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
    const visibleScheduledRows = db
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
      .orderBy(
        sql`row_number() over (partition by ${scheduledWorkouts.date} order by ${scheduledWorkouts.createdAt}, ${scheduledWorkouts.id})`,
        asc(scheduledWorkouts.date),
      )
      .limit(2_100)
      .all();
    observe('workout-sessions');
    const visibleSessionRows = db
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
      .orderBy(
        sql`row_number() over (partition by ${workoutSessions.date} order by ${workoutSessions.createdAt}, ${workoutSessions.id})`,
        asc(workoutSessions.date),
      )
      .limit(2_100)
      .all();
    observe('workout-counts');
    const visibleScheduleCounts = db
      .select({
        date: scheduledWorkouts.date,
        count: sql<number>`count(*)`,
      })
      .from(scheduledWorkouts)
      .leftJoin(
        workoutSessions,
        and(
          eq(workoutSessions.id, scheduledWorkouts.sessionId),
          eq(workoutSessions.userId, userId),
          isNull(workoutSessions.deletedAt),
        ),
      )
      .where(
        and(
          eq(scheduledWorkouts.userId, userId),
          gte(scheduledWorkouts.date, query.start),
          lte(scheduledWorkouts.date, query.end),
          or(
            isNull(scheduledWorkouts.sessionId),
            isNull(workoutSessions.id),
            sql`${workoutSessions.date} <> ${scheduledWorkouts.date}`,
          ),
        ),
      )
      .groupBy(scheduledWorkouts.date)
      .all();
    const visibleSessionCounts = db
      .select({ date: workoutSessions.date, count: sql<number>`count(*)` })
      .from(workoutSessions)
      .where(
        and(
          eq(workoutSessions.userId, userId),
          isNull(workoutSessions.deletedAt),
          gte(workoutSessions.date, query.start),
          lte(workoutSessions.date, query.end),
        ),
      )
      .groupBy(workoutSessions.date)
      .all();
    const workoutCountByDate = new Map<string, number>();
    for (const row of [...visibleScheduleCounts, ...visibleSessionCounts]) {
      workoutCountByDate.set(row.date, (workoutCountByDate.get(row.date) ?? 0) + Number(row.count));
    }
    const linkedScheduleIds = unique(
      visibleSessionRows
        .map((session) => session.scheduledWorkoutId)
        .filter((value): value is string => value !== null),
    );
    const relatedScheduledRows = linkedScheduleIds.length
      ? (observe('related-scheduled-workouts'),
        db
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
              inArray(scheduledWorkouts.id, linkedScheduleIds),
            ),
          )
          .orderBy(asc(scheduledWorkouts.date), asc(scheduledWorkouts.createdAt))
          .limit(2_100)
          .all())
      : [];
    const linkedSessionIds = unique(
      visibleScheduledRows
        .map((schedule) => schedule.sessionId)
        .filter((value): value is string => value !== null),
    );
    const relatedSessionRows = linkedSessionIds.length
      ? (observe('related-workout-sessions'),
        db
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
              inArray(workoutSessions.id, linkedSessionIds),
            ),
          )
          .orderBy(
            asc(workoutSessions.date),
            asc(workoutSessions.startedAt),
            asc(workoutSessions.id),
          )
          .limit(2_100)
          .all())
      : [];
    const scheduledRows = [
      ...new Map(
        [...visibleScheduledRows, ...relatedScheduledRows].map((row) => [row.id, row]),
      ).values(),
    ];
    const sessionRows = [
      ...new Map(
        [...visibleSessionRows, ...relatedSessionRows].map((row) => [row.id, row]),
      ).values(),
    ];
    const sessionsByDate = new Map<string, typeof sessionRows>();
    for (const row of visibleSessionRows) {
      const existing = sessionsByDate.get(row.date) ?? [];
      existing.push(row);
      sessionsByDate.set(row.date, existing);
    }
    const schedulesByDate = new Map<string, typeof scheduledRows>();
    for (const row of visibleScheduledRows) {
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
              or(
                and(
                  gte(adaptiveNutritionCheckIns.localDate, query.start),
                  lte(adaptiveNutritionCheckIns.localDate, query.end),
                ),
                sql`json_extract(${adaptiveNutritionCheckIns.proposedTargets}, '$.effectiveDate') between ${query.start} and ${query.end}`,
              ),
            ),
          )
          .orderBy(
            sql`row_number() over (
              partition by case
                when ${adaptiveNutritionCheckIns.status} = 'accepted'
                  then coalesce(json_extract(${adaptiveNutritionCheckIns.proposedTargets}, '$.effectiveDate'), ${adaptiveNutritionCheckIns.localDate})
                else ${adaptiveNutritionCheckIns.localDate}
              end
              order by ${adaptiveNutritionCheckIns.createdAt}, ${adaptiveNutritionCheckIns.id}
            )`,
            asc(adaptiveNutritionCheckIns.localDate),
          )
          .limit(2_100)
          .all())
      : [];
    const checkInCounts = program
      ? (observe('check-in-counts'),
        dependencies.sqlite
          .prepare(
            `select case
                      when status = 'accepted'
                        then coalesce(json_extract(proposed_targets, '$.effectiveDate'), local_date)
                      else local_date
                    end as localDate,
                    count(*) as totalCount
               from adaptive_nutrition_checkins
              where user_id = @userId
                and program_id = @programId
                and (local_date between @start and @end
                  or json_extract(proposed_targets, '$.effectiveDate') between @start and @end)
              group by localDate`,
          )
          .all({ userId, programId: program.id, start: query.start, end: query.end }) as Array<{
          localDate: string;
          totalCount: number;
        }>)
      : [];
    const checkIns = priorCheckIn
      ? [priorCheckIn, ...rangeCheckIns.filter((row) => row.id !== priorCheckIn.id)]
      : rangeCheckIns;

    const overlappingReviews = program
      ? (observe('range-reviews'),
        db
          .select()
          .from(adaptiveNutritionReviews)
          .where(
            and(
              eq(adaptiveNutritionReviews.userId, userId),
              eq(adaptiveNutritionReviews.programId, program.id),
              gte(adaptiveNutritionReviews.reviewLocalDate, query.start),
              lte(adaptiveNutritionReviews.reviewLocalDate, query.end),
            ),
          )
          .orderBy(
            sql`row_number() over (
              partition by ${adaptiveNutritionReviews.reviewLocalDate}
              order by ${adaptiveNutritionReviews.createdAt}, ${adaptiveNutritionReviews.id}
            )`,
            asc(adaptiveNutritionReviews.reviewLocalDate),
          )
          .limit(2_100)
          .all())
      : [];
    const reviewCounts = program
      ? (observe('review-counts'),
        db
          .select({
            localDate: adaptiveNutritionReviews.reviewLocalDate,
            totalCount: sql<number>`count(*)`,
          })
          .from(adaptiveNutritionReviews)
          .where(
            and(
              eq(adaptiveNutritionReviews.userId, userId),
              eq(adaptiveNutritionReviews.programId, program.id),
              gte(adaptiveNutritionReviews.reviewLocalDate, query.start),
              lte(adaptiveNutritionReviews.reviewLocalDate, query.end),
            ),
          )
          .groupBy(adaptiveNutritionReviews.reviewLocalDate)
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
                sql`${adaptiveNutritionReviewActions.sequence} = (
                  select max(latest.sequence)
                    from adaptive_nutrition_review_actions latest
                   where latest.review_id = ${adaptiveNutritionReviewActions.reviewId}
                     and latest.user_id = ${userId}
                )`,
              ),
            )
            .orderBy(asc(adaptiveNutritionReviewActions.reviewId))
            .all())
        : [];
    const actionsByReview = new Map<string, typeof reviewActions>();
    for (const action of reviewActions) {
      const existing = actionsByReview.get(action.reviewId) ?? [];
      existing.push(action);
      actionsByReview.set(action.reviewId, existing);
    }
    const pendingReview = program ? reviewStore.getPendingProjection(userId) : null;
    const projectedReview =
      pendingReview &&
      pendingReview.snapshot.analysisStart <= query.end &&
      pendingReview.snapshot.analysisEnd >= query.start
        ? pendingReview
        : null;

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
    if (projectedReview && projectedReview.state !== 'stale') {
      const dataQuality = projectedReview.snapshot.modules.find(
        (module) => module.kind === 'data_quality',
      );
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

    type ContextDateRow = { contextId: string; localDate: string; totalCount: number };
    const contextDateRows = program
      ? (observe('contexts'),
        dependencies.sqlite
          .prepare(
            `with recursive requested_dates(local_date) as (
               select @start
               union all
               select date(local_date, '+1 day') from requested_dates where local_date < @end
             ), mapped as (
               select c.id as contextId,
                      d.local_date as localDate,
                      row_number() over (
                        partition by d.local_date order by c.created_at, c.id
                      ) as rowNumber,
                      count(*) over (partition by d.local_date) as totalCount
                 from adaptive_nutrition_review_contexts c
                 cross join requested_dates d
                where c.user_id = @userId
                  and c.program_id = @programId
                  and c.deleted_at is null
                  and (
                    (c.subject_type = 'date'
                      and json_extract(c.subject, '$.localDate') = d.local_date)
                    or (c.subject_type = 'date_range'
                      and json_extract(c.subject, '$.startDate') <= d.local_date
                      and json_extract(c.subject, '$.endDate') >= d.local_date)
                    or (c.subject_type = 'upcoming_check_in'
                      and json_extract(c.subject, '$.targetReviewLocalDate') = d.local_date)
                    or (c.subject_type = 'nutrition_log' and exists (
                      select 1 from nutrition_logs n
                       where n.id = json_extract(c.subject, '$.id')
                         and n.user_id = @userId and n.date = d.local_date
                    ))
                    or (c.subject_type = 'weigh_in' and exists (
                      select 1 from body_weight w
                       where w.id = json_extract(c.subject, '$.id')
                         and w.user_id = @userId and w.date = d.local_date
                    ))
                    or (c.subject_type = 'scheduled_workout' and exists (
                      select 1 from scheduled_workouts sw
                       where sw.id = json_extract(c.subject, '$.id')
                         and sw.user_id = @userId and sw.date = d.local_date
                    ))
                    or (c.subject_type = 'workout_session' and exists (
                      select 1 from workout_sessions ws
                       where ws.id = json_extract(c.subject, '$.id')
                         and ws.user_id = @userId and ws.deleted_at is null
                         and ws.date = d.local_date
                    ))
                    or (c.subject_type = 'check_in' and exists (
                      select 1 from adaptive_nutrition_checkins ci
                       where ci.id = json_extract(c.subject, '$.id')
                         and ci.user_id = @userId and ci.local_date = d.local_date
                    ))
                  )
             )
             select contextId, localDate, totalCount
               from mapped
              where rowNumber <= 100
              order by localDate, rowNumber`,
          )
          .all({
            start: query.start,
            end: query.end,
            userId,
            programId: program.id,
          }) as ContextDateRow[])
      : [];
    const selectedContextIds = unique(contextDateRows.map((row) => row.contextId));
    const contexts =
      selectedContextIds.length > 0
        ? db
            .select()
            .from(adaptiveNutritionReviewContexts)
            .where(
              and(
                eq(adaptiveNutritionReviewContexts.userId, userId),
                isNull(adaptiveNutritionReviewContexts.deletedAt),
                inArray(adaptiveNutritionReviewContexts.id, selectedContextIds),
              ),
            )
            .orderBy(
              asc(adaptiveNutritionReviewContexts.createdAt),
              asc(adaptiveNutritionReviewContexts.id),
            )
            .all()
        : [];
    const contextById = new Map(contexts.map((context) => [context.id, context]));
    const contextsByDate = new Map<string, typeof contexts>();
    const contextCountByDate = new Map<string, number>();
    for (const row of contextDateRows) {
      const context = contextById.get(row.contextId);
      if (!context) continue;
      const existing = contextsByDate.get(row.localDate) ?? [];
      existing.push(context);
      contextsByDate.set(row.localDate, existing);
      contextCountByDate.set(row.localDate, Number(row.totalCount));
    }

    const reviewsByDate = new Map<string, typeof overlappingReviews>();
    for (const review of overlappingReviews.filter(
      (item) => item.reviewLocalDate >= query.start && item.reviewLocalDate <= query.end,
    )) {
      const existing = reviewsByDate.get(review.reviewLocalDate) ?? [];
      existing.push(review);
      reviewsByDate.set(review.reviewLocalDate, existing);
    }
    const algorithmEventCountByDate = new Map<string, number>();
    for (const row of [...checkInCounts, ...reviewCounts]) {
      algorithmEventCountByDate.set(
        row.localDate,
        (algorithmEventCountByDate.get(row.localDate) ?? 0) + Number(row.totalCount),
      );
    }
    const scheduleById = new Map(scheduledRows.map((row) => [row.id, row]));
    const sessionById = new Map(sessionRows.map((row) => [row.id, row]));

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
      const allWorkoutItems: DataQualityCalendarDay['workouts'] = [
        ...(schedulesByDate.get(date) ?? [])
          .filter((schedule) => {
            if (!schedule.sessionId) return true;
            const linkedSession = sessionById.get(schedule.sessionId);
            return linkedSession === undefined || linkedSession.date !== schedule.date;
          })
          .map((schedule) => {
            const linkedSession = schedule.sessionId
              ? sessionById.get(schedule.sessionId)
              : undefined;
            const moved = linkedSession !== undefined && linkedSession.date !== schedule.date;
            return {
              id: schedule.id,
              kind: 'scheduled_workout' as const,
              state: moved ? ('moved' as const) : ('planned' as const),
              name: schedule.templateName ?? 'Unavailable scheduled workout',
              sessionStatus: linkedSession?.status ?? null,
              scheduledWorkoutId: schedule.id,
              sessionId: schedule.sessionId,
              plannedDate: schedule.date,
              sessionDate: linkedSession?.date ?? null,
              relation:
                linkedSession === undefined
                  ? ('unlinked' as const)
                  : moved
                    ? ('linked_different_date' as const)
                    : ('linked_same_date' as const),
              relationLimitation: moved
                ? 'Pulse retains the linked plan and session dates, but no immutable movement event is recorded.'
                : null,
              correctionState: 'not_applicable' as const,
              startedAt: null,
              completedAt: null,
              createdAt: schedule.createdAt,
              updatedAt: schedule.updatedAt,
              provenance: notRecordedProvenance(
                'Historical creator provenance is not retained for scheduled workouts.',
              ),
              reasonCodes: [],
              actions: [
                {
                  kind: 'correct_workout' as const,
                  label: 'Review scheduled workout',
                  href: `/workouts/scheduled/${schedule.id}`,
                  method: 'navigate' as const,
                },
              ],
            };
          }),
        ...sessions.map((session) => {
          const linkedSchedule = session.scheduledWorkoutId
            ? scheduleById.get(session.scheduledWorkoutId)
            : undefined;
          const state =
            session.status === 'completed'
              ? ('completed' as const)
              : session.status === 'cancelled'
                ? ('cancelled' as const)
                : session.status === 'paused'
                  ? ('paused' as const)
                  : session.status === 'scheduled'
                    ? ('scheduled' as const)
                    : ('in_progress' as const);
          return {
            id: session.id,
            kind: 'workout_session' as const,
            state,
            name: session.name,
            sessionStatus: session.status,
            scheduledWorkoutId: session.scheduledWorkoutId,
            sessionId: session.id,
            plannedDate: linkedSchedule?.date ?? null,
            sessionDate: session.date,
            relation:
              linkedSchedule === undefined
                ? ('unlinked' as const)
                : linkedSchedule.date === session.date
                  ? ('linked_same_date' as const)
                  : ('linked_different_date' as const),
            relationLimitation:
              linkedSchedule && linkedSchedule.date !== session.date
                ? 'Pulse retains the linked plan and session dates, but no immutable movement event is recorded.'
                : null,
            correctionState:
              session.status === 'completed'
                ? ('history_unavailable' as const)
                : ('not_applicable' as const),
            startedAt: session.startedAt,
            completedAt: session.completedAt,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            provenance: notRecordedProvenance(
              'Historical creator provenance is not retained for workout sessions.',
            ),
            reasonCodes: [],
            actions: [
              {
                kind: 'correct_workout' as const,
                label: 'Review workout',
                href: `/workouts/session/${session.id}`,
                method: 'navigate' as const,
              },
            ],
          };
        }),
      ];
      const workoutItems = allWorkoutItems
        .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id))
        .slice(0, 50);

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
            provenance: systemProvenance,
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
        const current = projectedReview?.id === review.id ? projectedReview : null;
        const state = current?.state ?? reviewActionState(actionsByReview.get(review.id) ?? []);
        return {
          id: review.id,
          kind: 'weekly_review' as const,
          state,
          effectiveDate: review.reviewLocalDate,
          createdAt: review.createdAt,
          reasonCodes: [],
          provenance: systemProvenance,
          actions: [
            {
              kind: 'view_review' as const,
              label: 'View weekly review',
              href: `/nutrition/reviews/${review.id}`,
              method: 'navigate' as const,
            },
            ...(state === 'stale'
              ? [
                  {
                    kind: 'refresh_review' as const,
                    label: 'Refresh stale weekly review',
                    href: `/nutrition/reviews/${review.id}`,
                    method: 'navigate' as const,
                  },
                ]
              : []),
          ],
        };
      });
      const allAlgorithmEvents = [...checkInEvents, ...reviewEvents].sort(
        (left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id),
      );
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
          createdAt: nutrition?.createdAt ?? null,
          statusUpdatedAt: nutrition?.statusUpdatedAt ?? null,
          updatedAt: nutrition?.updatedAt ?? null,
          provenance: nutrition
            ? notRecordedProvenance(
                'Historical creator provenance is not retained for nutrition logs.',
              )
            : notRecordedProvenance('No nutrition source record exists for this date.'),
          reasonCodes: recordedNutritionState?.reasonCodes ?? [],
          actions: [nutritionStatusAction(date), addContextAction(date)],
        },
        weight: {
          evidenceState: weightEvidenceState,
          entryId: weight?.id ?? null,
          weight: weight ? convertWeightFromKg(weight.weightKg, unit) : null,
          unit: weight ? unit : null,
          trendWeight: trendWeightKg === null ? null : convertWeightFromKg(trendWeightKg, unit),
          correctionState: weight ? 'history_unavailable' : 'not_applicable',
          suspect: recordedWeightState?.suspect ?? false,
          stale: weight !== undefined && date < addDays(today, -7) && latestWeightDate === date,
          createdAt: weight?.createdAt ?? null,
          updatedAt: weight?.updatedAt ?? null,
          provenance: weight
            ? notRecordedProvenance(
                'Historical creator provenance is not retained for weight measurements.',
              )
            : notRecordedProvenance('No weight source record exists for this date.'),
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
          events: allAlgorithmEvents.slice(0, 50),
          omittedEventCount: Math.max(
            0,
            (algorithmEventCountByDate.get(date) ?? allAlgorithmEvents.length) - 50,
          ),
        },
        contexts: (contextsByDate.get(date) ?? []).slice(0, 100).map((context) => ({
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
        omittedWorkoutCount: Math.max(
          0,
          (workoutCountByDate.get(date) ?? allWorkoutItems.length) - workoutItems.length,
        ),
        omittedContextCount: Math.max(
          0,
          (contextCountByDate.get(date) ?? (contextsByDate.get(date) ?? []).length) - 100,
        ),
      };
    });

    return dataQualityCalendarSchema.parse({
      range: { startDate: query.start, endDate: query.end },
      today,
      timeZone,
      days,
      summary: summaryFor(days),
    });
  };

  return { getCalendar };
};

export const getDataQualityCalendar = async (userId: string, query: DataQualityCalendarQuery) => {
  const { db, sqlite } = await import('../../db/index.js');
  return createDataQualityCalendarStore({ db, sqlite }).getCalendar(userId, query);
};

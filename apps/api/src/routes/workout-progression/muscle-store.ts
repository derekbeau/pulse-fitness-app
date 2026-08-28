import {
  addChartCalendarDays,
  chartDateKeyInTimeZone,
  workoutMuscleAnalyticsSchema,
  type WorkoutMuscleAnalytics,
  type WorkoutMuscleAnalyticsQuery,
} from '@pulse/shared';
import { eq } from 'drizzle-orm';

import { db, sqlite } from '../../db/index.js';
import { users } from '../../db/schema/index.js';
import { resolveUserTimeZoneForUser, UserTimeZoneRequiredError } from '../../lib/user-time-zone.js';

const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 } as const;
const SOURCE_LIMIT = 5_000;
const ROW_SOURCE_ID_LIMIT = 500;

export class WorkoutMuscleAnalyticsTimeZoneConflictError extends Error {
  constructor() {
    super('Requested time zone does not match the authoritative user time zone');
    this.name = 'WorkoutMuscleAnalyticsTimeZoneConflictError';
  }
}

function changeState(current: number, previous: number) {
  if (previous === 0) return 'no_comparison' as const;
  if (current > previous + 0.25) return 'increased' as const;
  if (current < previous - 0.25) return 'decreased' as const;
  return 'stable' as const;
}

export async function getWorkoutMuscleAnalytics(
  userId: string,
  query: WorkoutMuscleAnalyticsQuery,
  now = Date.now(),
): Promise<WorkoutMuscleAnalytics> {
  const user = db
    .select({ weightUnit: users.weightUnit })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!user) throw new RangeError('Workout muscle analytics user not found');

  const resolvedTimeZone = await resolveUserTimeZoneForUser(userId);
  if (!resolvedTimeZone) throw new UserTimeZoneRequiredError();
  if (query.timeZone && query.timeZone !== resolvedTimeZone.timeZone) {
    throw new WorkoutMuscleAnalyticsTimeZoneConflictError();
  }
  const timeZone = resolvedTimeZone.timeZone;
  sqlite.function(
    'pulse_progression_date_key',
    { deterministic: true },
    (effectiveAt: number, zone: string) =>
      chartDateKeyInTimeZone(Number(effectiveAt), String(zone)),
  );
  const endDate = query.end ?? chartDateKeyInTimeZone(now, timeZone);
  const days = RANGE_DAYS[query.range];
  const startDate = addChartCalendarDays(endDate, -(days - 1));
  const previousEndDate = addChartCalendarDays(startDate, -1);
  const previousStartDate = addChartCalendarDays(previousEndDate, -(days - 1));

  type JoinedSource = {
    contributionId: string;
    date: string;
    exerciseId: string;
    exerciseName: string;
    factor: number;
    muscle: string;
    role: 'primary' | 'secondary';
    scheduledWorkoutId: string | null;
    sessionId: string | null;
    setId: string;
    sourceScheduledSetId: string | null;
    sourceType: 'completed' | 'planned';
    volumeLoad: number | null;
    fulfilled: number;
    priority: number;
  };
  type MuscleAggregate = {
    completed: number;
    fulfilled: number;
    planned: number;
    previous: number;
    priority: boolean;
    sourceCount: number;
    sourceIds: string[];
    volumeLoad: number;
    hasVolume: boolean;
    sessionIds: Set<string>;
    exerciseIds: Set<string>;
  };
  type SeriesAggregate = {
    date: string;
    muscle: string;
    completed: number;
    planned: number;
    volumeLoad: number;
    hasVolume: boolean;
  };

  const muscleAggregates = new Map<string, MuscleAggregate>();
  const seriesAggregates = new Map<string, SeriesAggregate>();
  const sources: WorkoutMuscleAnalytics['sources'] = [];
  let sourceCount = 0;
  const aggregateFor = (muscle: string) => {
    const existing = muscleAggregates.get(muscle);
    if (existing) return existing;
    const created: MuscleAggregate = {
      completed: 0,
      exerciseIds: new Set(),
      fulfilled: 0,
      hasVolume: false,
      planned: 0,
      previous: 0,
      priority: false,
      sessionIds: new Set(),
      sourceCount: 0,
      sourceIds: [],
      volumeLoad: 0,
    };
    muscleAggregates.set(muscle, created);
    return created;
  };
  const qualifierSql = (
    alias: string,
    weight: string,
    reps: string,
    seconds: string,
    distance: string,
  ) => `(
    (${alias} = 'weight_reps' AND ${weight} IS NOT NULL AND ${reps} IS NOT NULL) OR
    (${alias} = 'weight_seconds' AND ${weight} IS NOT NULL AND ${seconds} IS NOT NULL) OR
    (${alias} IN ('bodyweight_reps', 'reps_only') AND ${reps} IS NOT NULL) OR
    (${alias} = 'reps_seconds' AND ${reps} IS NOT NULL AND ${seconds} IS NOT NULL) OR
    (${alias} IN ('seconds_only', 'duration') AND ${seconds} IS NOT NULL) OR
    (${alias} IN ('distance', 'cardio') AND (${distance} IS NOT NULL OR ${seconds} IS NOT NULL))
  )`;
  const record = (row: JoinedSource) => {
    const aggregate = aggregateFor(row.muscle);
    if (row.date < startDate) {
      aggregate.previous += row.factor;
      return;
    }
    sourceCount += 1;
    aggregate.sourceCount += 1;
    if (aggregate.sourceIds.length < ROW_SOURCE_ID_LIMIT) aggregate.sourceIds.push(row.setId);
    aggregate.exerciseIds.add(row.exerciseId);
    if (row.sourceType === 'completed') {
      aggregate.completed += row.factor;
      if (row.sessionId) aggregate.sessionIds.add(row.sessionId);
      if (row.volumeLoad !== null) {
        aggregate.hasVolume = true;
        aggregate.volumeLoad += row.volumeLoad;
      }
    } else {
      aggregate.planned += row.factor;
      aggregate.fulfilled += row.fulfilled ? row.factor : 0;
      aggregate.priority ||= row.priority === 1;
    }
    const key = `${row.date}\u0000${row.muscle}`;
    const point = seriesAggregates.get(key) ?? {
      completed: 0,
      date: row.date,
      hasVolume: false,
      muscle: row.muscle,
      planned: 0,
      volumeLoad: 0,
    };
    if (row.sourceType === 'completed') {
      point.completed += row.factor;
      if (row.volumeLoad !== null) {
        point.hasVolume = true;
        point.volumeLoad += row.volumeLoad;
      }
    } else {
      point.planned += row.factor;
    }
    seriesAggregates.set(key, point);
    if (sources.length < SOURCE_LIMIT) {
      sources.push(
        row.sourceType === 'completed'
          ? {
              contributionId: row.contributionId,
              date: row.date,
              exerciseId: row.exerciseId,
              exerciseName: row.exerciseName,
              factor: row.factor,
              muscle: row.muscle,
              role: row.role,
              scheduledWorkoutId: row.scheduledWorkoutId,
              sessionId: row.sessionId ?? '',
              setId: row.setId,
              sourceScheduledSetId: row.sourceScheduledSetId,
              sourceType: 'completed',
              volumeLoad: row.volumeLoad,
            }
          : {
              contributionId: row.contributionId,
              date: row.date,
              exerciseId: row.exerciseId,
              exerciseName: row.exerciseName,
              factor: row.factor,
              muscle: row.muscle,
              role: row.role,
              scheduledWorkoutId: row.scheduledWorkoutId ?? '',
              sessionId: null,
              setId: row.setId,
              sourceType: 'planned',
              volumeLoad: row.volumeLoad,
            },
      );
    }
  };

  const effectiveRevision = (
    contributionAlias: string,
    exerciseExpression: string,
    dateExpression: string,
  ) => `
    ${contributionAlias}.revision = (
      SELECT max(previous.revision)
      FROM exercise_muscle_contributions AS previous
      WHERE previous.exercise_id = ${exerciseExpression}
        AND (previous.owner_user_id IS NULL OR previous.owner_user_id = @userId)
        AND pulse_progression_date_key(previous.effective_at, @timeZone) <= ${dateExpression}
    )`;

  const completedSql = `
    SELECT contribution.id AS contributionId,
           session.date,
           set_row.exercise_id_snapshot AS exerciseId,
           set_row.exercise_name_snapshot AS exerciseName,
           contribution.factor,
           contribution.muscle,
           contribution.role,
           session.scheduled_workout_id AS scheduledWorkoutId,
           session.id AS sessionId,
           set_row.id AS setId,
           set_row.source_scheduled_set_id AS sourceScheduledSetId,
           'completed' AS sourceType,
           CASE WHEN set_row.weight IS NOT NULL AND set_row.reps IS NOT NULL
                THEN round(set_row.weight * set_row.reps * contribution.factor, 6)
                ELSE NULL END AS volumeLoad,
           0 AS fulfilled,
           0 AS priority
    FROM session_sets AS set_row
    JOIN workout_sessions AS session ON session.id = set_row.session_id
    JOIN exercise_muscle_contributions AS contribution
      ON contribution.exercise_id = set_row.exercise_id_snapshot
     AND (contribution.owner_user_id IS NULL OR contribution.owner_user_id = @userId)
     AND ${effectiveRevision('contribution', 'set_row.exercise_id_snapshot', 'session.date')}
    WHERE session.user_id = @userId
      AND session.status = 'completed'
      AND session.deleted_at IS NULL
      AND session.date BETWEEN @previousStartDate AND @endDate
      AND set_row.completed = 1
      AND set_row.skipped = 0
      AND set_row.section IN ('main', 'supplemental')
      AND set_row.exercise_id_snapshot IS NOT NULL
      AND set_row.exercise_name_snapshot IS NOT NULL
      AND set_row.tracking_type_snapshot IS NOT NULL
      AND ${qualifierSql('set_row.tracking_type_snapshot', 'set_row.weight', 'set_row.reps', 'set_row.seconds', 'set_row.distance')}
    ORDER BY session.date, session.id, set_row.id, contribution.id`;
  for (const row of sqlite
    .prepare(completedSql)
    .iterate({ endDate, previousStartDate, timeZone, userId }) as Iterable<JoinedSource>) {
    record(row);
  }

  const plannedSql = `
    SELECT contribution.id AS contributionId,
           scheduled.date,
           scheduled_exercise.exercise_id AS exerciseId,
           scheduled_exercise.exercise_name_snapshot AS exerciseName,
           contribution.factor,
           contribution.muscle,
           contribution.role,
           scheduled.id AS scheduledWorkoutId,
           NULL AS sessionId,
           scheduled_set.id AS setId,
           NULL AS sourceScheduledSetId,
           'planned' AS sourceType,
           CASE WHEN scheduled_set.target_weight IS NOT NULL AND scheduled_set.reps IS NOT NULL
                THEN round(scheduled_set.target_weight * scheduled_set.reps * contribution.factor, 6)
                ELSE NULL END AS volumeLoad,
           EXISTS (
             SELECT 1
             FROM session_sets AS completed_set
             JOIN workout_sessions AS completed_session ON completed_session.id = completed_set.session_id
             JOIN exercise_muscle_contributions AS completed_contribution
               ON completed_contribution.exercise_id = completed_set.exercise_id_snapshot
              AND completed_contribution.muscle = contribution.muscle
              AND (completed_contribution.owner_user_id IS NULL OR completed_contribution.owner_user_id = @userId)
              AND ${effectiveRevision('completed_contribution', 'completed_set.exercise_id_snapshot', 'completed_session.date')}
             WHERE completed_session.user_id = @userId
               AND completed_session.status = 'completed'
               AND completed_session.deleted_at IS NULL
               AND completed_session.date BETWEEN @startDate AND @endDate
               AND completed_set.completed = 1
               AND completed_set.skipped = 0
               AND completed_set.section IN ('main', 'supplemental')
               AND completed_set.exercise_id_snapshot IS NOT NULL
               AND completed_set.exercise_name_snapshot IS NOT NULL
               AND completed_set.tracking_type_snapshot IS NOT NULL
               AND ${qualifierSql('completed_set.tracking_type_snapshot', 'completed_set.weight', 'completed_set.reps', 'completed_set.seconds', 'completed_set.distance')}
               AND completed_set.source_scheduled_set_id = scheduled_set.id
           ) AS fulfilled,
           coalesce(json_extract(configuration.snapshot, '$.priority'), 0) AS priority
    FROM scheduled_workout_exercise_sets AS scheduled_set
    JOIN scheduled_workout_exercises AS scheduled_exercise
      ON scheduled_exercise.id = scheduled_set.scheduled_workout_exercise_id
    JOIN scheduled_workouts AS scheduled ON scheduled.id = scheduled_exercise.scheduled_workout_id
    LEFT JOIN workout_sessions AS linked_session ON linked_session.id = scheduled.session_id
    LEFT JOIN workout_progression_configurations AS configuration
      ON configuration.scheduled_workout_exercise_id = scheduled_exercise.id
    JOIN exercise_muscle_contributions AS contribution
      ON contribution.exercise_id = scheduled_exercise.exercise_id
     AND (contribution.owner_user_id IS NULL OR contribution.owner_user_id = @userId)
     AND ${effectiveRevision('contribution', 'scheduled_exercise.exercise_id', 'scheduled.date')}
    WHERE scheduled.user_id = @userId
      AND scheduled.date BETWEEN @startDate AND @endDate
      AND scheduled_exercise.section IN ('main', 'supplemental')
      AND scheduled_exercise.exercise_name_snapshot IS NOT NULL
      AND scheduled_exercise.tracking_type_snapshot IS NOT NULL
      AND (linked_session.id IS NULL OR linked_session.status <> 'cancelled')
      AND ${qualifierSql('scheduled_exercise.tracking_type_snapshot', 'scheduled_set.target_weight', 'coalesce(scheduled_set.reps, scheduled_set.reps_min, scheduled_set.reps_max)', 'scheduled_set.target_seconds', 'scheduled_set.target_distance')}
    ORDER BY scheduled.date, scheduled.id, scheduled_set.id, contribution.id`;
  for (const row of sqlite
    .prepare(plannedSql)
    .iterate({ endDate, startDate, timeZone, userId }) as Iterable<JoinedSource>) {
    record(row);
  }

  const rows = [...muscleAggregates.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([muscle, aggregate]) => ({
      change: changeState(aggregate.completed, aggregate.previous),
      completedSessionCount: aggregate.sessionIds.size,
      exerciseCount: aggregate.exerciseIds.size,
      exposureState:
        aggregate.planned === 0
          ? ('no_plan' as const)
          : aggregate.fulfilled + 0.001 >= aggregate.planned
            ? ('fully_completed' as const)
            : aggregate.fulfilled > 0
              ? ('partially_completed' as const)
              : ('missed' as const),
      fulfilledPlannedSetEquivalents: aggregate.fulfilled,
      muscle,
      plannedSetEquivalents: aggregate.planned,
      previousQualifyingSetEquivalents: aggregate.previous,
      priority: aggregate.priority,
      qualifyingSetEquivalents: aggregate.completed,
      sourceCount: aggregate.sourceCount,
      sourceIds: aggregate.sourceIds,
      sourceIdsTruncated: aggregate.sourceCount > aggregate.sourceIds.length,
      volumeLoad: aggregate.hasVolume ? aggregate.volumeLoad : null,
    }));
  const series = [...seriesAggregates.values()]
    .sort((left, right) =>
      left.date === right.date
        ? left.muscle.localeCompare(right.muscle)
        : left.date.localeCompare(right.date),
    )
    .map((point) => ({
      date: point.date,
      muscle: point.muscle,
      plannedSetEquivalents: point.planned,
      qualifyingSetEquivalents: point.completed,
      volumeLoad: point.hasVolume ? point.volumeLoad : null,
    }));

  return workoutMuscleAnalyticsSchema.parse({
    contributionVersion: 1,
    endDate,
    range: query.range,
    qualifyingSetPolicyVersion: 1,
    rows,
    series,
    sourceCount,
    sources,
    sourcesTruncated: sourceCount > sources.length,
    startDate,
    timeZone,
    weightUnit: user.weightUnit,
  });
}

import {
  addChartCalendarDays,
  chartDateKeyInTimeZone,
  chartDateCoordinate,
  workoutMuscleAnalyticsSchema,
  workoutProgressionConfigurationSchema,
  type ExerciseTrackingType,
  type WorkoutMuscleAnalytics,
  type WorkoutMuscleAnalyticsQuery,
} from '@pulse/shared';
import { and, asc, between, eq, inArray, isNull } from 'drizzle-orm';

import { db, sqlite } from '../../db/index.js';
import {
  exerciseMuscleContributions,
  scheduledWorkoutExerciseSets,
  scheduledWorkoutExercises,
  scheduledWorkouts,
  sessionSets,
  users,
  workoutProgressionConfigurations,
  workoutSessions,
} from '../../db/schema/index.js';

const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 } as const;

type ContributionRow = typeof exerciseMuscleContributions.$inferSelect;

type CompletedSet = {
  date: string;
  exerciseId: string;
  exerciseName: string;
  sessionId: string;
  scheduledWorkoutId: string | null;
  sourceScheduledSetId: string | null;
  setId: string;
  trackingType: ExerciseTrackingType;
  weight: number | null;
  reps: number | null;
  seconds: number | null;
  distance: number | null;
};

type PlannedSet = {
  date: string;
  exerciseId: string;
  exerciseName: string;
  scheduledWorkoutId: string;
  scheduledWorkoutExerciseId: string;
  linkedSessionId: string | null;
  setId: string;
  trackingType: ExerciseTrackingType;
  weight: number | null;
  reps: number | null;
  repsMin: number | null;
  repsMax: number | null;
  seconds: number | null;
  distance: number | null;
};

function isQualifyingMeasurement(
  trackingType: CompletedSet['trackingType'],
  value: Pick<CompletedSet, 'distance' | 'reps' | 'seconds' | 'weight'>,
) {
  switch (trackingType) {
    case 'weight_reps':
      return value.weight !== null && value.reps !== null;
    case 'weight_seconds':
      return value.weight !== null && value.seconds !== null;
    case 'bodyweight_reps':
    case 'reps_only':
      return value.reps !== null;
    case 'reps_seconds':
      return value.reps !== null && value.seconds !== null;
    case 'seconds_only':
    case 'duration':
      return value.seconds !== null;
    case 'distance':
    case 'cardio':
      return value.distance !== null || value.seconds !== null;
  }
}

function isQualifyingPlannedMeasurement(value: PlannedSet) {
  return isQualifyingMeasurement(value.trackingType, {
    distance: value.distance,
    reps: value.reps ?? value.repsMin ?? value.repsMax,
    seconds: value.seconds,
    weight: value.weight,
  });
}

function effectiveContributions(rows: ContributionRow[], date: string) {
  const endOfDate = chartDateCoordinate(addChartCalendarDays(date, 1)) - 1;
  const eligible = rows.filter((row) => row.effectiveAt <= endOfDate);
  const revision = Math.max(0, ...eligible.map((row) => row.revision));
  return eligible.filter((row) => row.revision === revision);
}

const SOURCE_LIMIT = 5_000;
const ROW_SOURCE_ID_LIMIT = 500;

function loadBoundedContributions({
  endDate,
  exerciseIds,
  startDate,
  userId,
}: {
  endDate: string;
  exerciseIds: string[];
  startDate: string;
  userId: string;
}): ContributionRow[] {
  if (exerciseIds.length === 0) return [];
  const placeholders = exerciseIds.map(() => '?').join(', ');
  const startAt = chartDateCoordinate(startDate);
  const endExclusive = chartDateCoordinate(addChartCalendarDays(endDate, 1));
  return sqlite
    .prepare(
      `SELECT current.id,
              current.exercise_id AS exerciseId,
              current.owner_user_id AS ownerUserId,
              current.revision,
              current.muscle,
              current.role,
              current.factor,
              current.version,
              current.effective_at AS effectiveAt,
              current.created_at AS createdAt
       FROM exercise_muscle_contributions AS current
       WHERE current.exercise_id IN (${placeholders})
         AND (current.owner_user_id IS NULL OR current.owner_user_id = ?)
         AND current.effective_at < ?
         AND (
           current.effective_at >= ?
           OR current.revision = (
             SELECT max(previous.revision)
             FROM exercise_muscle_contributions AS previous
             WHERE previous.exercise_id = current.exercise_id
               AND coalesce(previous.owner_user_id, '') = coalesce(current.owner_user_id, '')
               AND previous.effective_at < ?
           )
         )
       ORDER BY current.exercise_id, current.revision, current.muscle`,
    )
    .all(...exerciseIds, userId, endExclusive, startAt, startAt) as ContributionRow[];
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
  const timeZone = query.timeZone ?? 'UTC';
  const endDate = query.end ?? chartDateKeyInTimeZone(now, timeZone);
  const days = RANGE_DAYS[query.range];
  const startDate = addChartCalendarDays(endDate, -(days - 1));
  const previousEndDate = addChartCalendarDays(startDate, -1);
  const previousStartDate = addChartCalendarDays(previousEndDate, -(days - 1));

  const user = db
    .select({ weightUnit: users.weightUnit })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!user) throw new RangeError('Workout muscle analytics user not found');

  const completedRows = db
    .select({
      date: workoutSessions.date,
      distance: sessionSets.distance,
      exerciseId: sessionSets.exerciseIdSnapshot,
      exerciseName: sessionSets.exerciseNameSnapshot,
      reps: sessionSets.reps,
      scheduledWorkoutId: workoutSessions.scheduledWorkoutId,
      seconds: sessionSets.seconds,
      sessionId: workoutSessions.id,
      setId: sessionSets.id,
      sourceScheduledSetId: sessionSets.sourceScheduledSetId,
      trackingType: sessionSets.trackingTypeSnapshot,
      weight: sessionSets.weight,
    })
    .from(sessionSets)
    .innerJoin(workoutSessions, eq(workoutSessions.id, sessionSets.sessionId))
    .where(
      and(
        eq(workoutSessions.userId, userId),
        eq(workoutSessions.status, 'completed'),
        isNull(workoutSessions.deletedAt),
        eq(sessionSets.completed, true),
        eq(sessionSets.skipped, false),
        inArray(sessionSets.section, ['main', 'supplemental']),
        between(workoutSessions.date, previousStartDate, endDate),
      ),
    )
    .orderBy(asc(workoutSessions.date), asc(workoutSessions.id), asc(sessionSets.id))
    .all()
    .filter(
      (row): row is CompletedSet =>
        row.exerciseId !== null && row.exerciseName !== null && row.trackingType !== null,
    )
    .filter((row) => isQualifyingMeasurement(row.trackingType, row));

  const plannedRows = db
    .select({
      date: scheduledWorkouts.date,
      distance: scheduledWorkoutExerciseSets.targetDistance,
      exerciseId: scheduledWorkoutExercises.exerciseId,
      exerciseName: scheduledWorkoutExercises.exerciseNameSnapshot,
      linkedSessionId: scheduledWorkouts.sessionId,
      reps: scheduledWorkoutExerciseSets.reps,
      repsMax: scheduledWorkoutExerciseSets.repsMax,
      repsMin: scheduledWorkoutExerciseSets.repsMin,
      scheduledWorkoutId: scheduledWorkouts.id,
      scheduledWorkoutExerciseId: scheduledWorkoutExercises.id,
      seconds: scheduledWorkoutExerciseSets.targetSeconds,
      setId: scheduledWorkoutExerciseSets.id,
      trackingType: scheduledWorkoutExercises.trackingTypeSnapshot,
      weight: scheduledWorkoutExerciseSets.targetWeight,
    })
    .from(scheduledWorkoutExerciseSets)
    .innerJoin(
      scheduledWorkoutExercises,
      eq(scheduledWorkoutExercises.id, scheduledWorkoutExerciseSets.scheduledWorkoutExerciseId),
    )
    .innerJoin(
      scheduledWorkouts,
      eq(scheduledWorkouts.id, scheduledWorkoutExercises.scheduledWorkoutId),
    )
    .where(
      and(
        eq(scheduledWorkouts.userId, userId),
        inArray(scheduledWorkoutExercises.section, ['main', 'supplemental']),
        between(scheduledWorkouts.date, startDate, endDate),
      ),
    )
    .orderBy(
      asc(scheduledWorkouts.date),
      asc(scheduledWorkouts.id),
      asc(scheduledWorkoutExerciseSets.id),
    )
    .all()
    .filter((row): row is PlannedSet => row.exerciseName !== null && row.trackingType !== null)
    .filter(isQualifyingPlannedMeasurement);

  const linkedSessionIds = [
    ...new Set(plannedRows.flatMap((row) => (row.linkedSessionId ? [row.linkedSessionId] : []))),
  ];
  const linkedStatuses = new Map(
    linkedSessionIds.length === 0
      ? []
      : db
          .select({ id: workoutSessions.id, status: workoutSessions.status })
          .from(workoutSessions)
          .where(inArray(workoutSessions.id, linkedSessionIds))
          .all()
          .map((row) => [row.id, row.status] as const),
  );
  const activePlannedRows = plannedRows.filter(
    (row) =>
      row.linkedSessionId === null || linkedStatuses.get(row.linkedSessionId) !== 'cancelled',
  );

  const plannedScheduledExerciseIds = [
    ...new Set(activePlannedRows.map((row) => row.scheduledWorkoutExerciseId)),
  ];
  const configurationRows =
    plannedScheduledExerciseIds.length === 0
      ? []
      : db
          .select({
            scheduledWorkoutExerciseId: workoutProgressionConfigurations.scheduledWorkoutExerciseId,
            snapshot: workoutProgressionConfigurations.snapshot,
          })
          .from(workoutProgressionConfigurations)
          .where(
            inArray(
              workoutProgressionConfigurations.scheduledWorkoutExerciseId,
              plannedScheduledExerciseIds,
            ),
          )
          .all();
  const priorityScheduledExerciseIds = new Set(
    configurationRows
      .filter((row) => workoutProgressionConfigurationSchema.parse(row.snapshot).priority)
      .map((row) => row.scheduledWorkoutExerciseId),
  );

  const exerciseIds = [
    ...new Set([...completedRows, ...activePlannedRows].map((row) => row.exerciseId)),
  ];
  const contributionRows = loadBoundedContributions({
    endDate,
    exerciseIds,
    startDate: previousStartDate,
    userId,
  });
  const contributionsByExercise = new Map<string, ContributionRow[]>();
  for (const row of contributionRows) {
    contributionsByExercise.set(row.exerciseId, [
      ...(contributionsByExercise.get(row.exerciseId) ?? []),
      row,
    ]);
  }

  const currentCompleted = completedRows.filter((row) => row.date >= startDate);
  const previousCompleted = completedRows.filter((row) => row.date <= previousEndDate);
  const sources: WorkoutMuscleAnalytics['sources'] = [];

  for (const row of currentCompleted) {
    for (const contribution of effectiveContributions(
      contributionsByExercise.get(row.exerciseId) ?? [],
      row.date,
    )) {
      sources.push({
        contributionId: contribution.id,
        date: row.date,
        exerciseId: row.exerciseId,
        exerciseName: row.exerciseName,
        factor: contribution.factor,
        muscle: contribution.muscle,
        role: contribution.role,
        scheduledWorkoutId: row.scheduledWorkoutId,
        sessionId: row.sessionId,
        setId: row.setId,
        sourceScheduledSetId: row.sourceScheduledSetId,
        sourceType: 'completed',
        volumeLoad:
          row.weight !== null && row.reps !== null
            ? Number((row.weight * row.reps * contribution.factor).toFixed(6))
            : null,
      });
    }
  }
  for (const row of activePlannedRows) {
    for (const contribution of effectiveContributions(
      contributionsByExercise.get(row.exerciseId) ?? [],
      row.date,
    )) {
      sources.push({
        contributionId: contribution.id,
        date: row.date,
        exerciseId: row.exerciseId,
        exerciseName: row.exerciseName,
        factor: contribution.factor,
        muscle: contribution.muscle,
        role: contribution.role,
        scheduledWorkoutId: row.scheduledWorkoutId,
        sessionId: null,
        setId: row.setId,
        sourceType: 'planned',
        volumeLoad:
          row.weight !== null && row.reps !== null
            ? Number((row.weight * row.reps * contribution.factor).toFixed(6))
            : null,
      });
    }
  }

  const previousByMuscle = new Map<string, number>();
  for (const row of previousCompleted) {
    for (const contribution of effectiveContributions(
      contributionsByExercise.get(row.exerciseId) ?? [],
      row.date,
    )) {
      previousByMuscle.set(
        contribution.muscle,
        (previousByMuscle.get(contribution.muscle) ?? 0) + contribution.factor,
      );
    }
  }

  const muscleNames = [...new Set(sources.map((source) => source.muscle))].sort((a, b) =>
    a.localeCompare(b),
  );
  const rows = muscleNames.map((muscle) => {
    const muscleSources = sources.filter((source) => source.muscle === muscle);
    const completed = muscleSources.filter((source) => source.sourceType === 'completed');
    const planned = muscleSources.filter((source) => source.sourceType === 'planned');
    const plannedSetIds = new Set(planned.map((source) => source.setId));
    const fulfilledPlanned = completed.filter(
      (source) =>
        source.sourceScheduledSetId !== null && plannedSetIds.has(source.sourceScheduledSetId),
    );
    const qualifyingSetEquivalents = completed.reduce((sum, source) => sum + source.factor, 0);
    const plannedSetEquivalents = planned.reduce((sum, source) => sum + source.factor, 0);
    const fulfilledPlannedSetEquivalents = fulfilledPlanned.reduce(
      (sum, source) => sum + source.factor,
      0,
    );
    const previousQualifyingSetEquivalents = previousByMuscle.get(muscle) ?? 0;
    const volumeSources = completed.filter((source) => source.volumeLoad !== null);
    return {
      change: changeState(qualifyingSetEquivalents, previousQualifyingSetEquivalents),
      completedSessionCount: new Set(completed.map((source) => source.sessionId)).size,
      exerciseCount: new Set(muscleSources.map((source) => source.exerciseId)).size,
      exposureState:
        planned.length === 0
          ? ('no_plan' as const)
          : fulfilledPlannedSetEquivalents + 0.001 >= plannedSetEquivalents
            ? ('fully_completed' as const)
            : fulfilledPlannedSetEquivalents > 0
              ? ('partially_completed' as const)
              : ('missed' as const),
      fulfilledPlannedSetEquivalents,
      muscle,
      plannedSetEquivalents,
      previousQualifyingSetEquivalents,
      priority: activePlannedRows.some(
        (row) =>
          priorityScheduledExerciseIds.has(row.scheduledWorkoutExerciseId) &&
          planned.some((source) => source.setId === row.setId),
      ),
      qualifyingSetEquivalents,
      sourceCount: muscleSources.length,
      sourceIds: muscleSources.slice(0, ROW_SOURCE_ID_LIMIT).map((source) => source.setId),
      sourceIdsTruncated: muscleSources.length > ROW_SOURCE_ID_LIMIT,
      volumeLoad:
        volumeSources.length === 0
          ? null
          : volumeSources.reduce((sum, source) => sum + (source.volumeLoad ?? 0), 0),
    };
  });

  const series = [...new Set(sources.map((source) => `${source.date}\u0000${source.muscle}`))]
    .sort()
    .map((key) => {
      const [date, muscle] = key.split('\u0000') as [string, string];
      const pointSources = sources.filter(
        (source) => source.date === date && source.muscle === muscle,
      );
      const completed = pointSources.filter((source) => source.sourceType === 'completed');
      const planned = pointSources.filter((source) => source.sourceType === 'planned');
      const volumeSources = completed.filter((source) => source.volumeLoad !== null);
      return {
        date,
        muscle,
        plannedSetEquivalents: planned.reduce((sum, source) => sum + source.factor, 0),
        qualifyingSetEquivalents: completed.reduce((sum, source) => sum + source.factor, 0),
        volumeLoad:
          volumeSources.length === 0
            ? null
            : volumeSources.reduce((sum, source) => sum + (source.volumeLoad ?? 0), 0),
      };
    });

  return workoutMuscleAnalyticsSchema.parse({
    contributionVersion: 1,
    endDate,
    range: query.range,
    qualifyingSetPolicyVersion: 1,
    rows,
    series,
    sourceCount: sources.length,
    sources: sources.slice(0, SOURCE_LIMIT),
    sourcesTruncated: sources.length > SOURCE_LIMIT,
    startDate,
    timeZone,
    weightUnit: user.weightUnit,
  });
}

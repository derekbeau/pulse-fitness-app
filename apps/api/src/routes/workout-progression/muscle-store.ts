import {
  addChartCalendarDays,
  chartDateKeyInTimeZone,
  chartDateCoordinate,
  workoutMuscleAnalyticsSchema,
  type WorkoutMuscleAnalytics,
  type WorkoutMuscleAnalyticsQuery,
} from '@pulse/shared';
import { and, asc, between, eq, inArray, isNull } from 'drizzle-orm';

import { db } from '../../db/index.js';
import {
  exerciseMuscleContributions,
  exercises,
  scheduledWorkoutExerciseSets,
  scheduledWorkoutExercises,
  scheduledWorkouts,
  sessionSets,
  users,
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
  setId: string;
  trackingType: typeof exercises.$inferSelect.trackingType;
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
  setId: string;
  trackingType: typeof exercises.$inferSelect.trackingType;
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
      exerciseId: sessionSets.exerciseId,
      exerciseName: exercises.name,
      reps: sessionSets.reps,
      scheduledWorkoutId: workoutSessions.scheduledWorkoutId,
      seconds: sessionSets.seconds,
      sessionId: workoutSessions.id,
      setId: sessionSets.id,
      trackingType: exercises.trackingType,
      weight: sessionSets.weight,
    })
    .from(sessionSets)
    .innerJoin(workoutSessions, eq(workoutSessions.id, sessionSets.sessionId))
    .innerJoin(exercises, eq(exercises.id, sessionSets.exerciseId))
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
    .filter((row): row is CompletedSet => row.exerciseId !== null)
    .filter((row) => isQualifyingMeasurement(row.trackingType, row));

  const plannedRows = db
    .select({
      date: scheduledWorkouts.date,
      distance: scheduledWorkoutExerciseSets.targetDistance,
      exerciseId: scheduledWorkoutExercises.exerciseId,
      exerciseName: exercises.name,
      reps: scheduledWorkoutExerciseSets.reps,
      repsMax: scheduledWorkoutExerciseSets.repsMax,
      repsMin: scheduledWorkoutExerciseSets.repsMin,
      scheduledWorkoutId: scheduledWorkouts.id,
      seconds: scheduledWorkoutExerciseSets.targetSeconds,
      setId: scheduledWorkoutExerciseSets.id,
      trackingType: exercises.trackingType,
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
    .innerJoin(exercises, eq(exercises.id, scheduledWorkoutExercises.exerciseId))
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
    .filter(isQualifyingPlannedMeasurement);

  const exerciseIds = [...new Set([...completedRows, ...plannedRows].map((row) => row.exerciseId))];
  const contributionRows =
    exerciseIds.length === 0
      ? []
      : db
          .select()
          .from(exerciseMuscleContributions)
          .where(inArray(exerciseMuscleContributions.exerciseId, exerciseIds))
          .orderBy(
            asc(exerciseMuscleContributions.exerciseId),
            asc(exerciseMuscleContributions.revision),
            asc(exerciseMuscleContributions.muscle),
          )
          .all();
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
        sourceType: 'completed',
        volumeLoad:
          row.weight !== null && row.reps !== null
            ? Number((row.weight * row.reps * contribution.factor).toFixed(6))
            : null,
      });
    }
  }
  for (const row of plannedRows) {
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
    const qualifyingSetEquivalents = completed.reduce((sum, source) => sum + source.factor, 0);
    const previousQualifyingSetEquivalents = previousByMuscle.get(muscle) ?? 0;
    const volumeSources = completed.filter((source) => source.volumeLoad !== null);
    return {
      change: changeState(qualifyingSetEquivalents, previousQualifyingSetEquivalents),
      completedSessionCount: new Set(completed.map((source) => source.sessionId)).size,
      exerciseCount: new Set(muscleSources.map((source) => source.exerciseId)).size,
      muscle,
      plannedSetEquivalents: planned.reduce((sum, source) => sum + source.factor, 0),
      previousQualifyingSetEquivalents,
      priority: planned.length > 0,
      qualifyingSetEquivalents,
      sourceIds: muscleSources.map((source) => source.setId),
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
    rows,
    series,
    sources,
    startDate,
    timeZone,
    weightUnit: user.weightUnit,
  });
}

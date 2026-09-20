import { createHash } from 'node:crypto';

import type Database from 'better-sqlite3';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { DailyCheckInSourceKind, DailyCheckInSourceReference } from '@pulse/shared';

import * as schema from '../../db/schema/index.js';
import {
  activityAssignments,
  activityExecutions,
  activityGoals,
  activityRecurrenceRevisions,
  bodyContextCapabilities,
  bodyContextConcerns,
  bodyContextFlares,
  bodyContextGuidance,
  canonicalActivities,
  dailyCheckInAnswers,
  dailyCheckInQuestions,
  mealItems,
  meals,
  nutritionLogs,
  planChangeProposals,
  scheduledWorkoutExerciseSets,
  scheduledWorkoutExercises,
  scheduledWorkouts,
  sessionSets,
  workoutSessions,
} from '../../db/schema/index.js';

export type StoredSourceReference = Omit<DailyCheckInSourceReference, 'subjectUserId'>;
type SourceDatabase = BetterSQLite3Database<typeof schema>;
type SourceRevisionResolver = (db: SourceDatabase, userId: string, id: string) => string | null;

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  return value;
};

const semanticRevision = (kind: DailyCheckInSourceKind, value: unknown) =>
  `sha256:${createHash('sha256')
    .update(JSON.stringify(canonicalize({ kind, value })))
    .digest('hex')}`;

const sourceRevisionResolvers = {
  activity: (db, userId, id) =>
    db
      .select({ revisionId: canonicalActivities.currentRevisionId })
      .from(canonicalActivities)
      .where(and(eq(canonicalActivities.id, id), eq(canonicalActivities.userId, userId)))
      .get()?.revisionId ?? null,
  activity_assignment: (db, userId, id) =>
    db
      .select({ revisionId: activityAssignments.currentRevisionId })
      .from(activityAssignments)
      .where(and(eq(activityAssignments.id, id), eq(activityAssignments.userId, userId)))
      .get()?.revisionId ?? null,
  activity_execution: (db, userId, id) =>
    db
      .select({ revisionId: activityExecutions.currentRevisionId })
      .from(activityExecutions)
      .where(and(eq(activityExecutions.id, id), eq(activityExecutions.userId, userId)))
      .get()?.revisionId ?? null,
  activity_goal: (db, userId, id) => {
    const goal = db
      .select()
      .from(activityGoals)
      .where(and(eq(activityGoals.id, id), eq(activityGoals.userId, userId)))
      .get();
    return goal ? semanticRevision('activity_goal', goal) : null;
  },
  activity_recurrence_revision: (db, userId, id) =>
    db
      .select({ revisionId: activityRecurrenceRevisions.id })
      .from(activityRecurrenceRevisions)
      .where(
        and(eq(activityRecurrenceRevisions.id, id), eq(activityRecurrenceRevisions.userId, userId)),
      )
      .get()?.revisionId ?? null,
  workout_session: (db, userId, id) => {
    const session = db
      .select()
      .from(workoutSessions)
      .where(
        and(
          eq(workoutSessions.id, id),
          eq(workoutSessions.userId, userId),
          isNull(workoutSessions.deletedAt),
        ),
      )
      .get();
    if (!session) return null;
    const sets = db
      .select()
      .from(sessionSets)
      .where(eq(sessionSets.sessionId, id))
      .orderBy(
        asc(sessionSets.orderIndex),
        asc(sessionSets.section),
        asc(sessionSets.setNumber),
        asc(sessionSets.id),
      )
      .all();
    return semanticRevision('workout_session', { session, sets });
  },
  scheduled_workout: (db, userId, id) => {
    const scheduled = db
      .select()
      .from(scheduledWorkouts)
      .where(and(eq(scheduledWorkouts.id, id), eq(scheduledWorkouts.userId, userId)))
      .get();
    if (!scheduled) return null;
    const exercises = db
      .select()
      .from(scheduledWorkoutExercises)
      .where(eq(scheduledWorkoutExercises.scheduledWorkoutId, id))
      .orderBy(
        asc(scheduledWorkoutExercises.orderIndex),
        asc(scheduledWorkoutExercises.section),
        asc(scheduledWorkoutExercises.id),
      )
      .all();
    const sets = db
      .select({ set: scheduledWorkoutExerciseSets })
      .from(scheduledWorkoutExerciseSets)
      .innerJoin(
        scheduledWorkoutExercises,
        eq(scheduledWorkoutExercises.id, scheduledWorkoutExerciseSets.scheduledWorkoutExerciseId),
      )
      .where(eq(scheduledWorkoutExercises.scheduledWorkoutId, id))
      .orderBy(
        asc(scheduledWorkoutExercises.orderIndex),
        asc(scheduledWorkoutExerciseSets.setNumber),
        asc(scheduledWorkoutExerciseSets.id),
      )
      .all()
      .map(({ set }) => set);
    return semanticRevision('scheduled_workout', { scheduled, exercises, sets });
  },
  body_concern: (db, userId, id) =>
    db
      .select({ revisionId: bodyContextConcerns.currentRevisionId })
      .from(bodyContextConcerns)
      .where(and(eq(bodyContextConcerns.id, id), eq(bodyContextConcerns.userId, userId)))
      .get()?.revisionId ?? null,
  capability: (db, userId, id) =>
    db
      .select({ revisionId: bodyContextCapabilities.currentRevisionId })
      .from(bodyContextCapabilities)
      .where(and(eq(bodyContextCapabilities.id, id), eq(bodyContextCapabilities.userId, userId)))
      .get()?.revisionId ?? null,
  guidance: (db, userId, id) =>
    db
      .select({ revisionId: bodyContextGuidance.currentRevisionId })
      .from(bodyContextGuidance)
      .where(and(eq(bodyContextGuidance.id, id), eq(bodyContextGuidance.userId, userId)))
      .get()?.revisionId ?? null,
  observation: (db, userId, id) => {
    const observation = db
      .select()
      .from(bodyContextFlares)
      .where(and(eq(bodyContextFlares.id, id), eq(bodyContextFlares.userId, userId)))
      .get();
    return observation ? semanticRevision('observation', observation) : null;
  },
  check_in_question: (db, userId, id) =>
    db
      .select({ revisionId: dailyCheckInQuestions.currentRevisionId })
      .from(dailyCheckInQuestions)
      .where(and(eq(dailyCheckInQuestions.id, id), eq(dailyCheckInQuestions.userId, userId)))
      .get()?.revisionId ?? null,
  check_in_answer: (db, userId, id) =>
    db
      .select({ revisionId: dailyCheckInAnswers.currentRevisionId })
      .from(dailyCheckInAnswers)
      .where(and(eq(dailyCheckInAnswers.id, id), eq(dailyCheckInAnswers.userId, userId)))
      .get()?.revisionId ?? null,
  proposal: (db, userId, id) =>
    db
      .select({ revisionId: planChangeProposals.currentRevisionId })
      .from(planChangeProposals)
      .where(and(eq(planChangeProposals.id, id), eq(planChangeProposals.userId, userId)))
      .get()?.revisionId ?? null,
  nutrition_log: (db, userId, id) => {
    const log = db
      .select()
      .from(nutritionLogs)
      .where(and(eq(nutritionLogs.id, id), eq(nutritionLogs.userId, userId)))
      .get();
    if (!log) return null;
    const dayMeals = db
      .select()
      .from(meals)
      .where(eq(meals.nutritionLogId, id))
      .orderBy(asc(meals.createdAt), asc(meals.id))
      .all();
    const items = db
      .select({ item: mealItems })
      .from(mealItems)
      .innerJoin(meals, eq(meals.id, mealItems.mealId))
      .where(eq(meals.nutritionLogId, id))
      .orderBy(asc(meals.createdAt), asc(mealItems.createdAt), asc(mealItems.id))
      .all()
      .map(({ item }) => item);
    return semanticRevision('nutrition_log', { log, meals: dayMeals, items });
  },
  meal: (db, userId, id) => {
    const meal = db
      .select({ meal: meals })
      .from(meals)
      .innerJoin(nutritionLogs, eq(nutritionLogs.id, meals.nutritionLogId))
      .where(and(eq(meals.id, id), eq(nutritionLogs.userId, userId)))
      .get()?.meal;
    if (!meal) return null;
    const items = db
      .select()
      .from(mealItems)
      .where(eq(mealItems.mealId, id))
      .orderBy(asc(mealItems.createdAt), asc(mealItems.id))
      .all();
    return semanticRevision('meal', { meal, items });
  },
} satisfies Record<DailyCheckInSourceKind, SourceRevisionResolver>;

const sourceDb = (sqlite: Database.Database) => drizzle(sqlite, { schema });

export const readCurrentSourceRevision = (
  sqlite: Database.Database,
  userId: string,
  kind: DailyCheckInSourceKind,
  id: string,
) => sourceRevisionResolvers[kind](sourceDb(sqlite), userId, id);

export const readSourceReference = (
  sqlite: Database.Database,
  userId: string,
  kind: DailyCheckInSourceKind,
  id: string,
): DailyCheckInSourceReference | null => {
  const revisionId = readCurrentSourceRevision(sqlite, userId, kind, id);
  return revisionId === null ? null : { kind, id, subjectUserId: userId, revisionId };
};

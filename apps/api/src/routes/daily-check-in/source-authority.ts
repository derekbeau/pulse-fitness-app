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

// Journal accepts the same current tokens as check-in, but a linked row with a
// corrupted cross-subject parent is not an owned source. Keep that relationship
// check beside the shared source resolvers rather than duplicating lifecycle
// rules in the Journal store. These queries read only; they never rewrite a
// historical receipt or source projection.
const journalNestedOwnershipSql: Partial<Record<DailyCheckInSourceKind, string>> = {
  activity: `select 1 from canonical_activities a
    left join workout_sessions w on w.id = a.structured_workout_session_id
    where a.id = @id and a.user_id = @userId
      and (a.structured_workout_session_id is null or w.user_id = @userId)`,
  activity_assignment: `select 1 from activity_assignments x
    join canonical_activities a on a.id = x.activity_id
    left join activity_recurrences r on r.id = x.recurrence_id
    where x.id = @id and x.user_id = @userId and a.user_id = @userId
      and (x.recurrence_id is null or (r.user_id = @userId and r.activity_id = x.activity_id))`,
  activity_execution: `select 1 from activity_executions x
    join canonical_activities a on a.id = x.activity_id
    left join activity_assignments assignment on assignment.id = x.assignment_id
    left join workout_sessions w on w.id = x.structured_workout_session_id
    where x.id = @id and x.user_id = @userId and a.user_id = @userId
      and (x.assignment_id is null or (assignment.user_id = @userId and assignment.activity_id = x.activity_id))
      and (x.structured_workout_session_id is null or w.user_id = @userId)`,
  workout_session: `select 1 from workout_sessions w
    left join workout_templates t on t.id = w.template_id
    left join scheduled_workouts s on s.id = w.scheduled_workout_id
    where w.id = @id and w.user_id = @userId
      and (w.template_id is null or t.user_id = @userId)
      and (w.scheduled_workout_id is null or s.user_id = @userId)`,
  scheduled_workout: `select 1 from scheduled_workouts s
    left join workout_templates t on t.id = s.template_id
    left join workout_sessions w on w.id = s.session_id
    where s.id = @id and s.user_id = @userId
      and (s.template_id is null or t.user_id = @userId)
      and (s.session_id is null or w.user_id = @userId)`,
  guidance: `select 1 from body_context_guidance g
    left join body_context_concerns c on c.id = g.concern_id
    left join body_context_capabilities cap on cap.id = g.capability_id
    where g.id = @id and g.user_id = @userId
      and (g.concern_id is null or c.user_id = @userId)
      and (g.capability_id is null or cap.user_id = @userId)`,
  observation: `select 1 from body_context_flares f
    join body_context_concerns c on c.id = f.concern_id
    where f.id = @id and f.user_id = @userId and c.user_id = @userId`,
  check_in_question: `select 1 from daily_check_in_questions q
    left join daily_check_in_questions parent on parent.id = q.follow_up_question_id
    where q.id = @id and q.user_id = @userId
      and (q.follow_up_question_id is null or parent.user_id = @userId)`,
  check_in_answer: `select 1 from daily_check_in_answers a
    join daily_check_in_questions q on q.id = a.question_id
    where a.id = @id and a.user_id = @userId and q.user_id = @userId`,
};

export const readCurrentJournalSourceRevision = (
  sqlite: Database.Database,
  userId: string,
  kind: DailyCheckInSourceKind,
  id: string,
): string | null => {
  const revisionId = readCurrentSourceRevision(sqlite, userId, kind, id);
  if (revisionId === null) return null;
  const nestedSql = journalNestedOwnershipSql[kind];
  return nestedSql && !sqlite.prepare(nestedSql).get({ id, userId }) ? null : revisionId;
};

export const readSourceReference = (
  sqlite: Database.Database,
  userId: string,
  kind: DailyCheckInSourceKind,
  id: string,
): DailyCheckInSourceReference | null => {
  const revisionId = readCurrentSourceRevision(sqlite, userId, kind, id);
  return revisionId === null ? null : { kind, id, subjectUserId: userId, revisionId };
};

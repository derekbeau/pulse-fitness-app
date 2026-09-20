import type Database from 'better-sqlite3';
import { and, asc, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type {
  CheckInQuestionRevision,
  DailyCheckInAnswerAuditRevision,
  DailyCheckInSourceReference,
} from '@pulse/shared';
import {
  activityJournalActorSchema,
  dailyContextRuntimeResponseSchema,
  provenanceSchema,
} from '@pulse/shared';

import * as schema from '../../db/schema/index.js';
import {
  activityAssignmentRevisions,
  activityAssignments,
  activityExecutions,
  activityGoalLinks,
  bodyContextCapabilities,
  bodyContextConcerns,
  bodyContextFlares,
  bodyContextGuidance,
  canonicalActivities,
  scheduledWorkouts,
  workoutSessions,
  workoutTemplates,
} from '../../db/schema/index.js';
import { getDailyNutritionForDate } from '../nutrition/store.js';
import { readSourceReference } from './source-authority.js';

const CONTEXT_LIMIT = 200;
const SOURCE_REFERENCE_LIMIT = 1000;

const requiredSourceReference = (
  sqlite: Database.Database,
  userId: string,
  kind: DailyCheckInSourceReference['kind'],
  id: string,
) => {
  const reference = readSourceReference(sqlite, userId, kind, id);
  if (!reference) throw new Error(`Current ${kind} source ${id} was unavailable.`);
  return reference;
};

const instantOrNull = (value: string | number | null): string | null => {
  if (value === null) return null;
  return typeof value === 'number' ? new Date(value).toISOString() : value;
};

const deduplicateReferences = (references: DailyCheckInSourceReference[]) => {
  const seen = new Set<string>();
  return references
    .filter((reference) => {
      const key = `${reference.kind}:${reference.id}:${reference.revisionId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, SOURCE_REFERENCE_LIMIT);
};

export const buildDailyContextReadModel = async ({
  sqlite,
  userId,
  localDate,
  timeZone,
  pendingQuestions,
  currentAnswers,
  generatedAt,
}: {
  sqlite: Database.Database;
  userId: string;
  localDate: string;
  timeZone: string;
  pendingQuestions: CheckInQuestionRevision[];
  currentAnswers: DailyCheckInAnswerAuditRevision[];
  generatedAt: string;
}) => {
  const db = drizzle(sqlite, { schema });

  const assignments = db
    .select({
      id: activityAssignments.id,
      subjectUserId: activityAssignments.userId,
      activityId: activityAssignments.activityId,
      plannedLocalDate: activityAssignments.plannedLocalDate,
      timeZone: activityAssignments.timeZone,
      recurrenceRevisionId: activityAssignments.recurrenceRevisionId,
      priorAssignmentRevisionId: activityAssignmentRevisions.priorRevisionId,
      revision: activityAssignments.revision,
      state: activityAssignments.state,
      createdAt: activityAssignments.createdAt,
      updatedAt: activityAssignments.updatedAt,
    })
    .from(activityAssignments)
    .innerJoin(
      activityAssignmentRevisions,
      and(
        eq(activityAssignmentRevisions.id, activityAssignments.currentRevisionId),
        eq(activityAssignmentRevisions.userId, activityAssignments.userId),
      ),
    )
    .where(
      and(
        eq(activityAssignments.userId, userId),
        eq(activityAssignments.plannedLocalDate, localDate),
      ),
    )
    .orderBy(asc(activityAssignments.createdAt), asc(activityAssignments.id))
    .limit(CONTEXT_LIMIT)
    .all();

  const executionRows = db
    .select({
      id: activityExecutions.id,
      subjectUserId: activityExecutions.userId,
      activityId: activityExecutions.activityId,
      assignmentId: activityExecutions.assignmentId,
      actualOccurredAt: activityExecutions.actualOccurredAt,
      actualLocalDate: activityExecutions.actualLocalDate,
      timeZone: activityExecutions.timeZone,
      durationMinutes: activityExecutions.durationMinutes,
      outcome: activityExecutions.outcome,
      structuredWorkoutSessionId: activityExecutions.structuredWorkoutSessionId,
      sourceJson: activityExecutions.sourceJson,
      createdAt: activityExecutions.createdAt,
    })
    .from(activityExecutions)
    .where(
      and(eq(activityExecutions.userId, userId), eq(activityExecutions.actualLocalDate, localDate)),
    )
    .orderBy(asc(activityExecutions.createdAt), asc(activityExecutions.id))
    .limit(CONTEXT_LIMIT)
    .all();
  const executions = executionRows.map(({ sourceJson, ...execution }) => ({
    ...execution,
    source: provenanceSchema.parse(JSON.parse(sourceJson)),
  }));

  const activityIds = [
    ...new Set([
      ...assignments.map((assignment) => assignment.activityId),
      ...executions.map((execution) => execution.activityId),
    ]),
  ].slice(0, CONTEXT_LIMIT);
  const activityRows =
    activityIds.length === 0
      ? []
      : db
          .select()
          .from(canonicalActivities)
          .where(
            and(
              eq(canonicalActivities.userId, userId),
              inArray(canonicalActivities.id, activityIds),
            ),
          )
          .orderBy(asc(canonicalActivities.createdAt), asc(canonicalActivities.id))
          .limit(CONTEXT_LIMIT)
          .all();
  const goalLinks =
    activityIds.length === 0
      ? []
      : db
          .select({ activityId: activityGoalLinks.activityId, goalId: activityGoalLinks.goalId })
          .from(activityGoalLinks)
          .where(
            and(
              eq(activityGoalLinks.userId, userId),
              inArray(activityGoalLinks.activityId, activityIds),
            ),
          )
          .orderBy(asc(activityGoalLinks.activityId), asc(activityGoalLinks.goalId))
          .all();
  const activities = activityRows.map((activity) => ({
    id: activity.id,
    subjectUserId: activity.userId,
    kind: activity.kind,
    name: activity.name,
    source: provenanceSchema.parse(JSON.parse(activity.sourceJson)),
    actor: activityJournalActorSchema.parse(JSON.parse(activity.actorJson)),
    revision: activity.revision,
    currentRevisionId: activity.currentRevisionId,
    goalIds: goalLinks
      .filter((link) => link.activityId === activity.id)
      .slice(0, 20)
      .map((link) => link.goalId),
    assignmentIds: assignments
      .filter((assignment) => assignment.activityId === activity.id)
      .map((assignment) => assignment.id),
    executionIds: executions
      .filter((execution) => execution.activityId === activity.id)
      .map((execution) => execution.id),
    structuredWorkoutSessionId: activity.structuredWorkoutSessionId,
    createdAt: activity.createdAt,
    updatedAt: activity.updatedAt,
    sourceReference: requiredSourceReference(sqlite, userId, 'activity', activity.id),
  }));

  const concerns = db
    .select()
    .from(bodyContextConcerns)
    .where(
      and(
        eq(bodyContextConcerns.userId, userId),
        ne(bodyContextConcerns.managementState, 'archived'),
      ),
    )
    .orderBy(asc(bodyContextConcerns.createdAt), asc(bodyContextConcerns.id))
    .limit(CONTEXT_LIMIT)
    .all()
    .map((concern) => ({
      id: concern.id,
      subjectUserId: concern.userId,
      label: concern.label,
      bodyRegion: concern.bodyRegion,
      symptomState: concern.symptomState,
      managementState: concern.managementState,
      source: concern.source,
      currentRevisionId: concern.currentRevisionId,
      createdAt: concern.createdAt,
      updatedAt: concern.updatedAt,
    }));
  const capabilities = db
    .select()
    .from(bodyContextCapabilities)
    .where(eq(bodyContextCapabilities.userId, userId))
    .orderBy(asc(bodyContextCapabilities.updatedAt), asc(bodyContextCapabilities.id))
    .limit(CONTEXT_LIMIT)
    .all()
    .map((capability) => ({
      id: capability.id,
      subjectUserId: capability.userId,
      label: capability.label,
      state: capability.state,
      source: capability.source,
      currentRevisionId: capability.currentRevisionId,
      updatedAt: capability.updatedAt,
    }));
  const guidance = db
    .select()
    .from(bodyContextGuidance)
    .where(and(eq(bodyContextGuidance.userId, userId), eq(bodyContextGuidance.state, 'current')))
    .orderBy(asc(bodyContextGuidance.createdAt), asc(bodyContextGuidance.id))
    .limit(CONTEXT_LIMIT)
    .all()
    .map((item) => ({
      id: item.id,
      subjectUserId: item.userId,
      concernId: item.concernId,
      capabilityId: item.capabilityId,
      text: item.text,
      source: item.source,
      state: 'current' as const,
      currentRevisionId: item.currentRevisionId,
      createdAt: item.createdAt,
    }));
  const observations = db
    .select()
    .from(bodyContextFlares)
    .where(and(eq(bodyContextFlares.userId, userId), eq(bodyContextFlares.localDate, localDate)))
    .orderBy(asc(bodyContextFlares.occurredAt), asc(bodyContextFlares.id))
    .limit(CONTEXT_LIMIT)
    .all()
    .map((observation) => ({
      id: observation.id,
      subjectUserId: observation.userId,
      category: 'injury' as const,
      text: observation.observation,
      finding: 'affirmed' as const,
      occurredAt: observation.occurredAt,
      localDate: observation.localDate,
      timeZone: observation.timeZone,
      source: observation.source,
      concernIds: [observation.concernId],
      capabilityIds: [],
      activityExecutionIds: [],
      workoutSessionIds: [],
      currentRevisionId: requiredSourceReference(sqlite, userId, 'observation', observation.id)
        .revisionId,
    }));

  const scheduledForDay = db
    .select({
      scheduled: scheduledWorkouts,
      templateName: workoutTemplates.name,
    })
    .from(scheduledWorkouts)
    .leftJoin(
      workoutTemplates,
      and(
        eq(workoutTemplates.id, scheduledWorkouts.templateId),
        isNull(workoutTemplates.deletedAt),
      ),
    )
    .where(and(eq(scheduledWorkouts.userId, userId), eq(scheduledWorkouts.date, localDate)))
    .orderBy(asc(scheduledWorkouts.createdAt), asc(scheduledWorkouts.id))
    .limit(CONTEXT_LIMIT)
    .all();
  const scheduledIds = scheduledForDay.map(({ scheduled }) => scheduled.id);
  const linkedSessionIds = scheduledForDay
    .map(({ scheduled }) => scheduled.sessionId)
    .filter((id): id is string => id !== null);
  const sessionPredicate = [eq(workoutSessions.date, localDate)];
  if (linkedSessionIds.length > 0)
    sessionPredicate.push(inArray(workoutSessions.id, linkedSessionIds));
  if (scheduledIds.length > 0)
    sessionPredicate.push(inArray(workoutSessions.scheduledWorkoutId, scheduledIds));
  const sessionRows = db
    .select()
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.userId, userId),
        isNull(workoutSessions.deletedAt),
        ne(workoutSessions.status, 'cancelled'),
        or(...sessionPredicate),
      ),
    )
    .orderBy(asc(workoutSessions.startedAt), asc(workoutSessions.id))
    .limit(CONTEXT_LIMIT)
    .all();
  const sessionIds = sessionRows.map((session) => session.id);
  const referencedScheduledIds = sessionRows
    .map((session) => session.scheduledWorkoutId)
    .filter((id): id is string => id !== null);
  const linkedSchedules =
    sessionRows.length === 0
      ? []
      : db
          .select()
          .from(scheduledWorkouts)
          .where(
            and(
              eq(scheduledWorkouts.userId, userId),
              or(
                ...(referencedScheduledIds.length > 0
                  ? [inArray(scheduledWorkouts.id, referencedScheduledIds)]
                  : []),
                inArray(scheduledWorkouts.sessionId, sessionIds),
              ),
            ),
          )
          .orderBy(asc(scheduledWorkouts.createdAt), asc(scheduledWorkouts.id))
          .limit(CONTEXT_LIMIT)
          .all();
  const liveScheduledIds = new Set(
    sessionRows
      .map((session) => session.scheduledWorkoutId)
      .filter((id): id is string => id !== null),
  );
  const plannedWorkouts = scheduledForDay
    .filter(({ scheduled }) => scheduled.sessionId === null && !liveScheduledIds.has(scheduled.id))
    .map(({ scheduled, templateName }) => ({
      id: scheduled.id,
      kind: 'planned' as const,
      plannedLocalDate: scheduled.date,
      actualLocalDate: null,
      name: templateName ?? 'Scheduled workout',
      status: 'scheduled' as const,
      scheduledWorkoutId: scheduled.id,
      workoutSessionId: null,
      sourceReference: requiredSourceReference(sqlite, userId, 'scheduled_workout', scheduled.id),
      sourceTime: instantOrNull(scheduled.createdAt),
    }));
  const sessionWorkouts = sessionRows.map((session) => {
    const scheduled = linkedSchedules.find(
      (candidate) =>
        candidate.id === session.scheduledWorkoutId || candidate.sessionId === session.id,
    );
    const kind =
      session.status === 'completed'
        ? ('completed' as const)
        : session.status === 'paused'
          ? ('paused' as const)
          : session.status === 'scheduled'
            ? ('planned' as const)
            : ('in_progress' as const);
    return {
      id: session.id,
      kind,
      plannedLocalDate: scheduled?.date ?? null,
      actualLocalDate: session.date,
      name: session.name,
      status: session.status,
      scheduledWorkoutId: scheduled?.id ?? null,
      workoutSessionId: session.id,
      sourceReference: requiredSourceReference(sqlite, userId, 'workout_session', session.id),
      sourceTime: instantOrNull(session.completedAt) ?? instantOrNull(session.startedAt),
    };
  });

  const nutritionRecord = await getDailyNutritionForDate(userId, localDate);
  const nutrition = nutritionRecord
    ? {
        status: nutritionRecord.log.status,
        meals: nutritionRecord.meals.slice(0, CONTEXT_LIMIT).map(({ meal }) => ({
          id: meal.id,
          name: meal.name,
          summary: meal.summary,
          time: meal.time,
          sourceReference: requiredSourceReference(sqlite, userId, 'meal', meal.id),
        })),
        totals: nutritionRecord.meals
          .flatMap(({ items }) => items)
          .reduce(
            (totals, item) => ({
              calories: totals.calories + item.calories,
              protein: totals.protein + item.protein,
              carbs: totals.carbs + item.carbs,
              fat: totals.fat + item.fat,
            }),
            { calories: 0, protein: 0, carbs: 0, fat: 0 },
          ),
        sourceReference: requiredSourceReference(
          sqlite,
          userId,
          'nutrition_log',
          nutritionRecord.log.id,
        ),
      }
    : null;

  const sourceReferences = deduplicateReferences([
    ...pendingQuestions.map((question) =>
      requiredSourceReference(sqlite, userId, 'check_in_question', question.questionId),
    ),
    ...currentAnswers.map((answer) =>
      requiredSourceReference(sqlite, userId, 'check_in_answer', answer.answerId),
    ),
    ...activities.map((activity) => activity.sourceReference),
    ...activities.flatMap((activity) =>
      activity.goalIds.map((goalId) =>
        requiredSourceReference(sqlite, userId, 'activity_goal', goalId),
      ),
    ),
    ...assignments.map((assignment) =>
      requiredSourceReference(sqlite, userId, 'activity_assignment', assignment.id),
    ),
    ...assignments.flatMap((assignment) =>
      assignment.recurrenceRevisionId
        ? [
            requiredSourceReference(
              sqlite,
              userId,
              'activity_recurrence_revision',
              assignment.recurrenceRevisionId,
            ),
          ]
        : [],
    ),
    ...executions.map((execution) =>
      requiredSourceReference(sqlite, userId, 'activity_execution', execution.id),
    ),
    ...concerns.map((concern) =>
      requiredSourceReference(sqlite, userId, 'body_concern', concern.id),
    ),
    ...capabilities.map((capability) =>
      requiredSourceReference(sqlite, userId, 'capability', capability.id),
    ),
    ...guidance.map((item) => requiredSourceReference(sqlite, userId, 'guidance', item.id)),
    ...observations.map((observation) =>
      requiredSourceReference(sqlite, userId, 'observation', observation.id),
    ),
    ...plannedWorkouts.map((workout) => workout.sourceReference),
    ...sessionWorkouts.map((workout) => workout.sourceReference),
    ...(nutrition
      ? [nutrition.sourceReference, ...nutrition.meals.map((meal) => meal.sourceReference)]
      : []),
  ]);

  return dailyContextRuntimeResponseSchema.parse({
    contractVersion: 'activity-journal-v1',
    subjectUserId: userId,
    localDate,
    timeZone,
    pendingQuestions,
    currentAnswers,
    observations,
    assignments,
    executions,
    activities,
    concerns,
    capabilities,
    guidance,
    workoutSessionIds: sessionWorkouts.map((workout) => workout.workoutSessionId),
    nutritionLocalDate: localDate,
    generatedAt,
    nutrition,
    workouts: [...plannedWorkouts, ...sessionWorkouts],
    sourceReferences,
  });
};

import { randomUUID } from 'node:crypto';

import { and, asc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import {
  canonicalizeWorkoutRepTarget,
  type CreateScheduledWorkoutInput,
  type ExerciseTrackingType,
  type ReorderScheduledWorkoutInput,
  type ScheduledWorkoutDetail,
  type ScheduledWorkout,
  type ScheduledWorkoutListItem,
  type UpdateScheduledWorkoutExercisesInput,
  type UpdateScheduledWorkoutExerciseSetsInput,
  type UpdateScheduledWorkoutInput,
  type WorkoutFeedbackQuestionDefinition,
} from '@pulse/shared';
import {
  exercises,
  type WorkoutTemplateSectionType,
  scheduledWorkoutExerciseSets,
  scheduledWorkoutExercises,
  scheduledWorkouts,
  templateExercises,
  workoutTemplates,
} from '../../db/schema/index.js';
import { readSnapshot, templateVersionMatchesCurrentTemplate } from './snapshot-store.js';
import {
  readQuestionList,
  writeAuthoredQuestionList,
  writeFrozenQuestionList,
  type FeedbackMutationActor,
} from '../workout-feedback/store.js';

// Supplemental is retained for deterministic ordering of legacy snapshot rows.
// Structural edit input schemas prevent callers from assigning supplemental.
const SECTION_RANK: Record<WorkoutTemplateSectionType, number> = {
  warmup: 0,
  main: 1,
  supplemental: 2,
  cooldown: 3,
};
const TEMPLATE_DRIFT_SUMMARY = 'Template has been updated since scheduling.';
const UNKNOWN_SNAPSHOT_EXERCISE_NAME = 'Unknown exercise';

const scheduledWorkoutSelection = {
  id: scheduledWorkouts.id,
  userId: scheduledWorkouts.userId,
  templateId: scheduledWorkouts.templateId,
  date: scheduledWorkouts.date,
  sessionId: scheduledWorkouts.sessionId,
  createdAt: scheduledWorkouts.createdAt,
  updatedAt: scheduledWorkouts.updatedAt,
};

const scheduledWorkoutSelectionWithTemplateVersion = {
  ...scheduledWorkoutSelection,
  templateVersion: scheduledWorkouts.templateVersion,
};

const scheduledWorkoutListSelection = {
  id: scheduledWorkouts.id,
  date: scheduledWorkouts.date,
  templateId: scheduledWorkouts.templateId,
  templateName: workoutTemplates.name,
  sessionId: scheduledWorkouts.sessionId,
  createdAt: scheduledWorkouts.createdAt,
};

const scheduledWorkoutExerciseMutationSelection = {
  id: scheduledWorkoutExercises.id,
  exerciseId: scheduledWorkoutExercises.exerciseId,
  section: scheduledWorkoutExercises.section,
  orderIndex: scheduledWorkoutExercises.orderIndex,
  supersetGroup: scheduledWorkoutExercises.supersetGroup,
  tempo: scheduledWorkoutExercises.tempo,
  restSeconds: scheduledWorkoutExercises.restSeconds,
  programmingNotes: scheduledWorkoutExercises.programmingNotes,
};

const scheduledWorkoutExerciseSetMutationSelection = {
  id: scheduledWorkoutExerciseSets.id,
  scheduledWorkoutExerciseId: scheduledWorkoutExerciseSets.scheduledWorkoutExerciseId,
  setNumber: scheduledWorkoutExerciseSets.setNumber,
  targetWeight: scheduledWorkoutExerciseSets.targetWeight,
  targetWeightMin: scheduledWorkoutExerciseSets.targetWeightMin,
  targetWeightMax: scheduledWorkoutExerciseSets.targetWeightMax,
  targetSeconds: scheduledWorkoutExerciseSets.targetSeconds,
  targetDistance: scheduledWorkoutExerciseSets.targetDistance,
  targetZone: scheduledWorkoutExerciseSets.targetZone,
  repsMin: scheduledWorkoutExerciseSets.repsMin,
  repsMax: scheduledWorkoutExerciseSets.repsMax,
  reps: scheduledWorkoutExerciseSets.reps,
  createdAt: scheduledWorkoutExerciseSets.createdAt,
};

type ScheduledWorkoutExerciseMutationRow = {
  id: string;
  exerciseId: string;
  section: WorkoutTemplateSectionType;
  orderIndex: number;
  supersetGroup: string | null;
  tempo: string | null;
  restSeconds: number | null;
  programmingNotes: string | null;
};

type ScheduledWorkoutExerciseSetMutationRow = {
  id: string;
  scheduledWorkoutExerciseId: string;
  setNumber: number;
  targetWeight: number | null;
  targetWeightMin: number | null;
  targetWeightMax: number | null;
  targetSeconds: number | null;
  targetDistance: number | null;
  targetZone: number | null;
  repsMin: number | null;
  repsMax: number | null;
  reps: number | null;
  createdAt: number;
};

type ScheduledWorkoutExercisePatch = Partial<
  Pick<
    ScheduledWorkoutExerciseMutationRow,
    'supersetGroup' | 'section' | 'tempo' | 'restSeconds' | 'programmingNotes'
  >
>;

const mapSnapshotExercise = (
  exercise: Awaited<ReturnType<typeof readSnapshot>>['exercises'][number],
  exerciseName: string,
) => ({
  exerciseId: exercise.exerciseId,
  exerciseName,
  section: exercise.section,
  orderIndex: exercise.orderIndex,
  programmingNotes: exercise.programmingNotes,
  agentNotes: exercise.agentNotes,
  agentNotesMeta: exercise.agentNotesMeta
    ? {
        ...exercise.agentNotesMeta,
        stale: exercise.agentNotesMeta.stale ?? false,
      }
    : null,
  templateCues: exercise.templateCues,
  supersetGroup: exercise.supersetGroup,
  tempo: exercise.tempo,
  restSeconds: exercise.restSeconds,
  sets: exercise.sets.map((set) => ({
    setNumber: set.setNumber,
    repsMin: set.repsMin,
    repsMax: set.repsMax,
    reps: set.reps,
    targetWeight: set.targetWeight,
    targetWeightMin: set.targetWeightMin,
    targetWeightMax: set.targetWeightMax,
    targetSeconds: set.targetSeconds,
    targetDistance: set.targetDistance,
    targetZone: set.targetZone,
  })),
});

const buildScheduledWorkoutDetail = async ({
  scheduledWorkoutId,
  userId,
}: {
  scheduledWorkoutId: string;
  userId: string;
}): Promise<ScheduledWorkoutDetail | null> => {
  const scheduledWorkout = await findScheduledWorkoutByIdWithTemplateVersion(
    scheduledWorkoutId,
    userId,
  );
  if (!scheduledWorkout) {
    return null;
  }

  const { db } = await import('../../db/index.js');
  const snapshot = await readSnapshot(scheduledWorkout.id, db);
  const uniqueSnapshotExerciseIds = [
    ...new Set(snapshot.exercises.map((exercise) => exercise.exerciseId)),
  ];

  const exerciseRows =
    uniqueSnapshotExerciseIds.length === 0
      ? []
      : db
          .select({
            id: exercises.id,
            userId: exercises.userId,
            name: exercises.name,
            deletedAt: exercises.deletedAt,
          })
          .from(exercises)
          .where(inArray(exercises.id, uniqueSnapshotExerciseIds))
          .all();

  const exercisesById = new Map(exerciseRows.map((row) => [row.id, row]));
  const snapshotExercises = snapshot.exercises.map((exercise) =>
    mapSnapshotExercise(
      exercise,
      exercisesById.get(exercise.exerciseId)?.name ?? UNKNOWN_SNAPSHOT_EXERCISE_NAME,
    ),
  );
  const staleByExerciseId = new Map<string, { exerciseId: string; snapshotName: string }>();

  for (const snapshotExercise of snapshotExercises) {
    const exercise = exercisesById.get(snapshotExercise.exerciseId);
    const isMissing = !exercise;
    const isSoftDeleted = exercise?.deletedAt != null;
    const isOutsideUserScope =
      exercise !== undefined && exercise.userId !== null && exercise.userId !== userId;

    if (isMissing || isSoftDeleted || isOutsideUserScope) {
      staleByExerciseId.set(snapshotExercise.exerciseId, {
        exerciseId: snapshotExercise.exerciseId,
        snapshotName: exercise?.name ?? UNKNOWN_SNAPSHOT_EXERCISE_NAME,
      });
    }
  }

  let templateDeleted = false;
  let templateDrift: { changedAt: number; summary: string } | null = null;

  if (scheduledWorkout.templateId) {
    const sourceTemplate = db
      .select({
        id: workoutTemplates.id,
        deletedAt: workoutTemplates.deletedAt,
        updatedAt: workoutTemplates.updatedAt,
      })
      .from(workoutTemplates)
      .where(
        and(
          eq(workoutTemplates.id, scheduledWorkout.templateId),
          eq(workoutTemplates.userId, userId),
        ),
      )
      .limit(1)
      .get();

    templateDeleted = !sourceTemplate || sourceTemplate.deletedAt !== null;

    if (sourceTemplate && sourceTemplate.deletedAt === null && scheduledWorkout.templateVersion) {
      const templateVersionMatches = await templateVersionMatchesCurrentTemplate({
        database: db,
        templateId: scheduledWorkout.templateId,
        templateVersion: scheduledWorkout.templateVersion,
      });

      if (!templateVersionMatches) {
        templateDrift = {
          changedAt: sourceTemplate.updatedAt,
          summary: TEMPLATE_DRIFT_SUMMARY,
        };
      }
    }
  }

  return {
    ...scheduledWorkout,
    feedbackQuestions: readQuestionList(db, userId, 'scheduled', scheduledWorkout.id),
    exercises: snapshotExercises,
    templateDrift,
    staleExercises: [...staleByExerciseId.values()],
    templateDeleted,
  };
};

const sortSnapshotExercises = (
  left: {
    section: WorkoutTemplateSectionType;
    orderIndex: number;
    id: string;
  },
  right: {
    section: WorkoutTemplateSectionType;
    orderIndex: number;
    id: string;
  },
) => {
  const sectionDelta = SECTION_RANK[left.section] - SECTION_RANK[right.section];
  if (sectionDelta !== 0) {
    return sectionDelta;
  }

  if (left.orderIndex !== right.orderIndex) {
    return left.orderIndex - right.orderIndex;
  }

  return left.id.localeCompare(right.id);
};

const sortSnapshotSets = (
  left: {
    setNumber: number;
    createdAt: number;
    id: string;
  },
  right: {
    setNumber: number;
    createdAt: number;
    id: string;
  },
) => {
  if (left.setNumber !== right.setNumber) {
    return left.setNumber - right.setNumber;
  }

  if (left.createdAt !== right.createdAt) {
    return left.createdAt - right.createdAt;
  }

  return left.id.localeCompare(right.id);
};

const getDuplicateIds = (values: string[]) => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
      continue;
    }

    seen.add(value);
  }

  return [...duplicates];
};

const buildSetUpdatePayload = (
  current: ScheduledWorkoutExerciseSetMutationRow,
  input: Omit<UpdateScheduledWorkoutExerciseSetsInput['sets'][number], 'setNumber' | 'remove'>,
) => {
  const payload: Partial<
    Pick<
      ScheduledWorkoutExerciseSetMutationRow,
      | 'targetWeight'
      | 'targetWeightMin'
      | 'targetWeightMax'
      | 'targetSeconds'
      | 'targetDistance'
      | 'targetZone'
      | 'repsMin'
      | 'repsMax'
      | 'reps'
    >
  > = {};

  const canonicalReps = canonicalizeWorkoutRepTarget({
    reps: input.reps !== undefined ? input.reps : current.reps,
    repsMin: input.repsMin !== undefined ? input.repsMin : current.repsMin,
    repsMax: input.repsMax !== undefined ? input.repsMax : current.repsMax,
  });

  if (input.targetWeight !== undefined && input.targetWeight !== current.targetWeight) {
    payload.targetWeight = input.targetWeight;
  }
  if (input.targetWeightMin !== undefined && input.targetWeightMin !== current.targetWeightMin) {
    payload.targetWeightMin = input.targetWeightMin;
  }
  if (input.targetWeightMax !== undefined && input.targetWeightMax !== current.targetWeightMax) {
    payload.targetWeightMax = input.targetWeightMax;
  }
  if (input.targetSeconds !== undefined && input.targetSeconds !== current.targetSeconds) {
    payload.targetSeconds = input.targetSeconds;
  }
  if (input.targetDistance !== undefined && input.targetDistance !== current.targetDistance) {
    payload.targetDistance = input.targetDistance;
  }
  if (input.targetZone !== undefined && input.targetZone !== current.targetZone) {
    payload.targetZone = input.targetZone;
  }
  if (canonicalReps.repsMin !== current.repsMin) {
    payload.repsMin = canonicalReps.repsMin ?? null;
  }
  if (canonicalReps.repsMax !== current.repsMax) {
    payload.repsMax = canonicalReps.repsMax ?? null;
  }
  if (canonicalReps.reps !== current.reps) {
    payload.reps = canonicalReps.reps ?? null;
  }

  return payload;
};

export const SCHEDULED_WORKOUT_REORDER_INVALID_ORDER = 'invalid-order' as const;
export const SCHEDULED_WORKOUT_UNKNOWN_EXERCISE = 'unknown-exercise' as const;
export const SCHEDULED_WORKOUT_INVALID_REP_TARGET = 'invalid-rep-target' as const;

export type ReorderScheduledWorkoutExercisesValidationError = {
  error: typeof SCHEDULED_WORKOUT_REORDER_INVALID_ORDER;
  missingExerciseIds: string[];
  extraExerciseIds: string[];
  duplicateExerciseIds: string[];
};

export type UpdateScheduledWorkoutExercisesValidationError = {
  error: typeof SCHEDULED_WORKOUT_UNKNOWN_EXERCISE | typeof SCHEDULED_WORKOUT_INVALID_REP_TARGET;
  exerciseId: string;
};

export const createScheduledWorkout = async ({
  id,
  userId,
  input,
  templateQuestions,
}: {
  id: string;
  userId: string;
  input: CreateScheduledWorkoutInput;
  templateQuestions: WorkoutFeedbackQuestionDefinition[];
}): Promise<ScheduledWorkout> => {
  const { db } = await import('../../db/index.js');

  const result = db.transaction((tx) => {
    const inserted = tx
      .insert(scheduledWorkouts)
      .values({ id, userId, templateId: input.templateId, date: input.date })
      .run();
    if (inserted.changes !== 1) return inserted;
    writeFrozenQuestionList(tx, {
      userId,
      scopeKind: 'scheduled',
      scopeId: id,
      source: 'template_snapshot',
      expectedRevision: 0,
      definitions: templateQuestions,
      actor: { kind: 'system', id: null, name: null },
    });
    return inserted;
  });

  if (result.changes !== 1) {
    throw new Error('Failed to persist scheduled workout');
  }

  const scheduledWorkout = await findScheduledWorkoutById(id, userId);
  if (!scheduledWorkout) {
    throw new Error('Created scheduled workout could not be loaded');
  }

  return scheduledWorkout;
};

export const listScheduledWorkouts = async ({
  userId,
  from,
  to,
}: {
  userId: string;
  from: string;
  to: string;
}): Promise<ScheduledWorkoutListItem[]> => {
  const { db } = await import('../../db/index.js');

  const scheduledWorkoutRows = db
    .select(scheduledWorkoutListSelection)
    .from(scheduledWorkouts)
    .leftJoin(
      workoutTemplates,
      and(
        eq(workoutTemplates.id, scheduledWorkouts.templateId),
        isNull(workoutTemplates.deletedAt),
      ),
    )
    .where(
      and(
        eq(scheduledWorkouts.userId, userId),
        gte(scheduledWorkouts.date, from),
        lte(scheduledWorkouts.date, to),
        isNull(scheduledWorkouts.sessionId),
      ),
    )
    .orderBy(asc(scheduledWorkouts.date), asc(scheduledWorkouts.createdAt))
    .all();

  const templateIds = [
    ...new Set(
      scheduledWorkoutRows
        .map((scheduledWorkout) => scheduledWorkout.templateId)
        .filter((templateId): templateId is string => templateId !== null),
    ),
  ];

  if (templateIds.length === 0) {
    return scheduledWorkoutRows;
  }

  const templateTrackingTypeRows = db
    .select({
      templateId: templateExercises.templateId,
      trackingType: exercises.trackingType,
    })
    .from(templateExercises)
    .innerJoin(exercises, eq(exercises.id, templateExercises.exerciseId))
    .where(
      and(
        inArray(templateExercises.templateId, templateIds),
        or(
          isNull(exercises.userId),
          and(eq(exercises.userId, userId), isNull(exercises.deletedAt)),
        ),
      ),
    )
    .all();

  const trackingTypesByTemplateId = new Map<string, Set<ExerciseTrackingType>>();
  for (const row of templateTrackingTypeRows) {
    const existingTrackingTypes = trackingTypesByTemplateId.get(row.templateId) ?? new Set();
    existingTrackingTypes.add(row.trackingType);
    trackingTypesByTemplateId.set(row.templateId, existingTrackingTypes);
  }

  return scheduledWorkoutRows.map((scheduledWorkout) => {
    const trackingTypes =
      scheduledWorkout.templateId !== null
        ? [...(trackingTypesByTemplateId.get(scheduledWorkout.templateId) ?? new Set())]
        : [];

    if (trackingTypes.length === 0) {
      return scheduledWorkout;
    }

    return {
      ...scheduledWorkout,
      templateTrackingTypes: trackingTypes,
    };
  });
};

export const findScheduledWorkoutById = async (
  id: string,
  userId: string,
): Promise<ScheduledWorkout | undefined> => {
  const { db } = await import('../../db/index.js');
  const scheduledWorkout = await findScheduledWorkoutByIdWithTemplateVersion(id, userId);
  if (!scheduledWorkout) {
    return undefined;
  }

  return {
    id: scheduledWorkout.id,
    userId: scheduledWorkout.userId,
    templateId: scheduledWorkout.templateId,
    date: scheduledWorkout.date,
    sessionId: scheduledWorkout.sessionId,
    createdAt: scheduledWorkout.createdAt,
    updatedAt: scheduledWorkout.updatedAt,
    feedbackQuestions: readQuestionList(db, userId, 'scheduled', id),
  };
};

export const findScheduledWorkoutByIdWithTemplateVersion = async (
  id: string,
  userId: string,
): Promise<
  (Omit<ScheduledWorkout, 'feedbackQuestions'> & { templateVersion: string | null }) | undefined
> => {
  const { db } = await import('../../db/index.js');

  return db
    .select(scheduledWorkoutSelectionWithTemplateVersion)
    .from(scheduledWorkouts)
    .where(and(eq(scheduledWorkouts.id, id), eq(scheduledWorkouts.userId, userId)))
    .limit(1)
    .get();
};

export const updateScheduledWorkout = async ({
  id,
  userId,
  changes,
  actor,
}: {
  id: string;
  userId: string;
  changes: UpdateScheduledWorkoutInput;
  actor: FeedbackMutationActor;
}): Promise<ScheduledWorkout | undefined> => {
  const { db } = await import('../../db/index.js');

  const existingWorkout = await findScheduledWorkoutById(id, userId);
  if (!existingWorkout) {
    return undefined;
  }

  const { feedbackQuestions, feedbackQuestionsExpectedRevision, ...scheduledChanges } = changes;
  const shouldClearSessionLink =
    scheduledChanges.date !== undefined && existingWorkout.date !== scheduledChanges.date;
  const updatePayload = shouldClearSessionLink
    ? { ...scheduledChanges, sessionId: null }
    : scheduledChanges;

  const updatedWorkout = db.transaction((tx) => {
    const updated =
      Object.keys(updatePayload).length === 0
        ? existingWorkout
        : tx
            .update(scheduledWorkouts)
            .set(updatePayload)
            .where(and(eq(scheduledWorkouts.id, id), eq(scheduledWorkouts.userId, userId)))
            .returning(scheduledWorkoutSelection)
            .get();
    if (feedbackQuestions !== undefined) {
      writeAuthoredQuestionList(tx, {
        userId,
        scopeKind: 'scheduled',
        scopeId: id,
        source: 'scheduled_override',
        expectedRevision: feedbackQuestionsExpectedRevision ?? 0,
        questions: feedbackQuestions,
        actor,
      });
    }
    return updated;
  });

  if (!updatedWorkout) return undefined;
  return {
    ...updatedWorkout,
    feedbackQuestions: readQuestionList(db, userId, 'scheduled', id),
  };
};

export const deleteScheduledWorkout = async (id: string, userId: string): Promise<boolean> => {
  const { db } = await import('../../db/index.js');

  const result = db
    .delete(scheduledWorkouts)
    .where(and(eq(scheduledWorkouts.id, id), eq(scheduledWorkouts.userId, userId)))
    .run();

  return result.changes === 1;
};

export const findScheduledWorkoutBySessionId = async (
  sessionId: string,
  userId: string,
): Promise<ScheduledWorkout | undefined> => {
  const { db } = await import('../../db/index.js');

  const scheduled = db
    .select(scheduledWorkoutSelection)
    .from(scheduledWorkouts)
    .where(and(eq(scheduledWorkouts.sessionId, sessionId), eq(scheduledWorkouts.userId, userId)))
    .limit(1)
    .get();
  return scheduled
    ? {
        ...scheduled,
        feedbackQuestions: readQuestionList(db, userId, 'scheduled', scheduled.id),
      }
    : undefined;
};

export const unlinkScheduledWorkoutSession = async (
  id: string,
  userId: string,
): Promise<boolean> => {
  const { db } = await import('../../db/index.js');

  const result = db
    .update(scheduledWorkouts)
    .set({ sessionId: null })
    .where(and(eq(scheduledWorkouts.id, id), eq(scheduledWorkouts.userId, userId)))
    .run();

  return result.changes === 1;
};

export const linkTodayScheduledWorkoutToSession = async ({
  userId,
  templateId,
  date,
  sessionId,
}: {
  userId: string;
  templateId: string;
  date: string;
  sessionId: string;
}): Promise<boolean> => {
  const { db } = await import('../../db/index.js');

  const scheduledWorkout = db
    .select({
      id: scheduledWorkouts.id,
    })
    .from(scheduledWorkouts)
    .where(
      and(
        eq(scheduledWorkouts.userId, userId),
        eq(scheduledWorkouts.templateId, templateId),
        eq(scheduledWorkouts.date, date),
        isNull(scheduledWorkouts.sessionId),
      ),
    )
    .orderBy(asc(scheduledWorkouts.createdAt))
    .limit(1)
    .get();

  if (!scheduledWorkout) {
    return false;
  }

  const result = db
    .update(scheduledWorkouts)
    .set({ sessionId })
    .where(and(eq(scheduledWorkouts.id, scheduledWorkout.id), eq(scheduledWorkouts.userId, userId)))
    .run();

  return result.changes === 1;
};

export const reorderScheduledWorkoutExercises = async ({
  userId,
  scheduledWorkoutId,
  order,
}: {
  userId: string;
  scheduledWorkoutId: string;
  order: ReorderScheduledWorkoutInput['order'];
}): Promise<
  ScheduledWorkoutDetail | ReorderScheduledWorkoutExercisesValidationError | undefined
> => {
  const { db } = await import('../../db/index.js');

  const scheduledWorkout = await findScheduledWorkoutById(scheduledWorkoutId, userId);
  if (!scheduledWorkout) {
    return undefined;
  }

  const snapshotRows = db
    .select(scheduledWorkoutExerciseMutationSelection)
    .from(scheduledWorkoutExercises)
    .where(eq(scheduledWorkoutExercises.scheduledWorkoutId, scheduledWorkoutId))
    .all()
    .sort(sortSnapshotExercises);

  const existingExerciseIds = new Set(snapshotRows.map((row) => row.exerciseId));
  const missingExerciseIds = [...existingExerciseIds].filter(
    (exerciseId) => !order.includes(exerciseId),
  );
  const extraExerciseIds = order.filter((exerciseId) => !existingExerciseIds.has(exerciseId));
  const duplicateExerciseIds = getDuplicateIds(order);

  if (
    order.length !== snapshotRows.length ||
    missingExerciseIds.length > 0 ||
    extraExerciseIds.length > 0 ||
    duplicateExerciseIds.length > 0
  ) {
    return {
      error: SCHEDULED_WORKOUT_REORDER_INVALID_ORDER,
      missingExerciseIds,
      extraExerciseIds,
      duplicateExerciseIds,
    };
  }

  const nextOrderByExerciseId = new Map(order.map((exerciseId, index) => [exerciseId, index]));
  const rowsNeedingUpdate = snapshotRows.filter(
    (row) => row.orderIndex !== nextOrderByExerciseId.get(row.exerciseId),
  );

  if (rowsNeedingUpdate.length > 0) {
    db.transaction((tx) => {
      for (const [index, row] of rowsNeedingUpdate.entries()) {
        tx.update(scheduledWorkoutExercises)
          .set({ orderIndex: -1 * (index + 1) })
          .where(
            and(
              eq(scheduledWorkoutExercises.id, row.id),
              eq(scheduledWorkoutExercises.scheduledWorkoutId, scheduledWorkoutId),
            ),
          )
          .run();
      }

      for (const row of rowsNeedingUpdate) {
        tx.update(scheduledWorkoutExercises)
          .set({ orderIndex: nextOrderByExerciseId.get(row.exerciseId) ?? row.orderIndex })
          .where(
            and(
              eq(scheduledWorkoutExercises.id, row.id),
              eq(scheduledWorkoutExercises.scheduledWorkoutId, scheduledWorkoutId),
            ),
          )
          .run();
      }

      tx.update(scheduledWorkouts)
        .set({ updatedAt: Date.now() })
        .where(eq(scheduledWorkouts.id, scheduledWorkoutId))
        .run();
    });
  }

  const detail = await buildScheduledWorkoutDetail({
    scheduledWorkoutId,
    userId,
  });
  if (!detail) {
    throw new Error('Updated scheduled workout could not be loaded');
  }

  return detail;
};

export const updateScheduledWorkoutExercises = async ({
  userId,
  scheduledWorkoutId,
  updates,
}: {
  userId: string;
  scheduledWorkoutId: string;
  updates: UpdateScheduledWorkoutExercisesInput['updates'];
}): Promise<
  ScheduledWorkoutDetail | UpdateScheduledWorkoutExercisesValidationError | undefined
> => {
  const { db } = await import('../../db/index.js');

  const scheduledWorkout = await findScheduledWorkoutById(scheduledWorkoutId, userId);
  if (!scheduledWorkout) {
    return undefined;
  }

  const snapshotRows = db
    .select(scheduledWorkoutExerciseMutationSelection)
    .from(scheduledWorkoutExercises)
    .where(eq(scheduledWorkoutExercises.scheduledWorkoutId, scheduledWorkoutId))
    .all()
    .sort(sortSnapshotExercises);

  const rowsByExerciseId = new Map(snapshotRows.map((row) => [row.exerciseId, { ...row }]));
  const updatesToPersist: Array<{
    id: string;
    payload: ScheduledWorkoutExercisePatch;
  }> = [];

  for (const update of updates) {
    const row = rowsByExerciseId.get(update.exerciseId);
    if (!row) {
      return {
        error: SCHEDULED_WORKOUT_UNKNOWN_EXERCISE,
        exerciseId: update.exerciseId,
      };
    }

    const payload: ScheduledWorkoutExercisePatch = {};

    if (update.supersetGroup !== undefined && update.supersetGroup !== row.supersetGroup) {
      payload.supersetGroup = update.supersetGroup;
      row.supersetGroup = update.supersetGroup;
    }
    if (update.section !== undefined && update.section !== row.section) {
      payload.section = update.section;
      row.section = update.section;
    }
    if (update.tempo !== undefined && update.tempo !== row.tempo) {
      payload.tempo = update.tempo;
      row.tempo = update.tempo;
    }
    if (update.restSeconds !== undefined && update.restSeconds !== row.restSeconds) {
      payload.restSeconds = update.restSeconds;
      row.restSeconds = update.restSeconds;
    }
    if (update.programmingNotes !== undefined && update.programmingNotes !== row.programmingNotes) {
      payload.programmingNotes = update.programmingNotes;
      row.programmingNotes = update.programmingNotes;
    }

    if (Object.keys(payload).length > 0) {
      updatesToPersist.push({
        id: row.id,
        payload,
      });
    }
  }

  if (updatesToPersist.length > 0) {
    db.transaction((tx) => {
      for (const update of updatesToPersist) {
        tx.update(scheduledWorkoutExercises)
          .set(update.payload)
          .where(
            and(
              eq(scheduledWorkoutExercises.id, update.id),
              eq(scheduledWorkoutExercises.scheduledWorkoutId, scheduledWorkoutId),
            ),
          )
          .run();
      }

      tx.update(scheduledWorkouts)
        .set({ updatedAt: Date.now() })
        .where(eq(scheduledWorkouts.id, scheduledWorkoutId))
        .run();
    });
  }

  const detail = await buildScheduledWorkoutDetail({
    scheduledWorkoutId,
    userId,
  });
  if (!detail) {
    throw new Error('Updated scheduled workout could not be loaded');
  }

  return detail;
};

export const updateScheduledWorkoutExerciseSets = async ({
  userId,
  scheduledWorkoutId,
  exerciseId,
  sets,
}: {
  userId: string;
  scheduledWorkoutId: string;
  exerciseId: UpdateScheduledWorkoutExerciseSetsInput['exerciseId'];
  sets: UpdateScheduledWorkoutExerciseSetsInput['sets'];
}): Promise<
  ScheduledWorkoutDetail | UpdateScheduledWorkoutExercisesValidationError | undefined
> => {
  const { db } = await import('../../db/index.js');

  const scheduledWorkout = await findScheduledWorkoutById(scheduledWorkoutId, userId);
  if (!scheduledWorkout) {
    return undefined;
  }

  const snapshotExercises = db
    .select({
      id: scheduledWorkoutExercises.id,
      exerciseId: scheduledWorkoutExercises.exerciseId,
      section: scheduledWorkoutExercises.section,
      orderIndex: scheduledWorkoutExercises.orderIndex,
    })
    .from(scheduledWorkoutExercises)
    .where(eq(scheduledWorkoutExercises.scheduledWorkoutId, scheduledWorkoutId))
    .all()
    .sort(sortSnapshotExercises);

  const snapshotExercise = snapshotExercises.find((row) => row.exerciseId === exerciseId);
  if (!snapshotExercise) {
    return {
      error: SCHEDULED_WORKOUT_UNKNOWN_EXERCISE,
      exerciseId,
    };
  }

  try {
    db.transaction((tx) => {
      let mutated = false;

      let persistedRows = tx
        .select(scheduledWorkoutExerciseSetMutationSelection)
        .from(scheduledWorkoutExerciseSets)
        .where(eq(scheduledWorkoutExerciseSets.scheduledWorkoutExerciseId, snapshotExercise.id))
        .all()
        .sort(sortSnapshotSets);

      const persistedBySetNumber = new Map(persistedRows.map((row) => [row.setNumber, row]));

      for (const setUpdate of sets) {
        const existing = persistedBySetNumber.get(setUpdate.setNumber);
        if (setUpdate.remove === true) {
          if (!existing) {
            continue;
          }

          tx.delete(scheduledWorkoutExerciseSets)
            .where(eq(scheduledWorkoutExerciseSets.id, existing.id))
            .run();
          persistedBySetNumber.delete(setUpdate.setNumber);
          mutated = true;
          continue;
        }

        if (existing) {
          const payload = buildSetUpdatePayload(existing, setUpdate);
          if (Object.keys(payload).length === 0) {
            continue;
          }

          tx.update(scheduledWorkoutExerciseSets)
            .set(payload)
            .where(eq(scheduledWorkoutExerciseSets.id, existing.id))
            .run();

          persistedBySetNumber.set(setUpdate.setNumber, {
            ...existing,
            ...payload,
          });
          mutated = true;
          continue;
        }

        const canonicalReps = canonicalizeWorkoutRepTarget({
          reps: setUpdate.reps ?? null,
          repsMin: setUpdate.repsMin ?? null,
          repsMax: setUpdate.repsMax ?? null,
        });

        tx.insert(scheduledWorkoutExerciseSets)
          .values({
            id: randomUUID(),
            scheduledWorkoutExerciseId: snapshotExercise.id,
            setNumber: setUpdate.setNumber,
            targetWeight: setUpdate.targetWeight ?? null,
            targetWeightMin: setUpdate.targetWeightMin ?? null,
            targetWeightMax: setUpdate.targetWeightMax ?? null,
            targetSeconds: setUpdate.targetSeconds ?? null,
            targetDistance: setUpdate.targetDistance ?? null,
            targetZone: setUpdate.targetZone ?? null,
            repsMin: canonicalReps.repsMin ?? null,
            repsMax: canonicalReps.repsMax ?? null,
            reps: canonicalReps.reps ?? null,
          })
          .run();
        mutated = true;
      }

      persistedRows = tx
        .select(scheduledWorkoutExerciseSetMutationSelection)
        .from(scheduledWorkoutExerciseSets)
        .where(eq(scheduledWorkoutExerciseSets.scheduledWorkoutExerciseId, snapshotExercise.id))
        .all()
        .sort(sortSnapshotSets);

      const renumberUpdates = persistedRows
        .map((row, index) => ({
          id: row.id,
          currentSetNumber: row.setNumber,
          nextSetNumber: index + 1,
        }))
        .filter((row) => row.currentSetNumber !== row.nextSetNumber);

      if (renumberUpdates.length > 0) {
        const maxPersistedSetNumber = persistedRows.reduce(
          (maxValue, row) => Math.max(maxValue, row.setNumber),
          0,
        );
        const tempOffset = maxPersistedSetNumber + persistedRows.length + 1_000;

        for (const update of renumberUpdates) {
          tx.update(scheduledWorkoutExerciseSets)
            .set({ setNumber: update.nextSetNumber + tempOffset })
            .where(eq(scheduledWorkoutExerciseSets.id, update.id))
            .run();
        }

        for (const update of renumberUpdates) {
          tx.update(scheduledWorkoutExerciseSets)
            .set({ setNumber: update.nextSetNumber })
            .where(eq(scheduledWorkoutExerciseSets.id, update.id))
            .run();
        }

        mutated = true;
      }

      if (mutated) {
        tx.update(scheduledWorkouts)
          .set({ updatedAt: Date.now() })
          .where(eq(scheduledWorkouts.id, scheduledWorkoutId))
          .run();
      }

      return mutated;
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === 'INVALID_REP_TARGET' || error.message === 'CONFLICTING_REP_TARGET')
    ) {
      return {
        error: SCHEDULED_WORKOUT_INVALID_REP_TARGET,
        exerciseId,
      };
    }
    throw error;
  }

  const detail = await buildScheduledWorkoutDetail({
    scheduledWorkoutId,
    userId,
  });
  if (!detail) {
    throw new Error('Updated scheduled workout could not be loaded');
  }

  return detail;
};

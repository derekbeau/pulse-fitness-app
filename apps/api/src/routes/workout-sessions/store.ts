import { randomUUID } from 'node:crypto';

import { and, desc, eq, gte, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import type {
  BatchUpsertSetsInput,
  CreateSetInput,
  CreateWorkoutSessionInput,
  ExerciseTrackingType,
  SaveWorkoutSessionAsTemplateInput,
  SetCorrection,
  SessionSet,
  UpdateSetInput,
  WorkoutSession,
  WorkoutSessionExercise,
  WorkoutSessionListItem,
  WorkoutTemplateSectionType,
} from '@pulse/shared';

import {
  exercises,
  parseWorkoutSessionFeedback,
  parseWorkoutSessionExerciseProgrammingNotes,
  parseWorkoutSessionTimeSegments,
  type WorkoutSessionExerciseAgentNotesMeta,
  sessionSets,
  scheduledWorkouts,
  serializeWorkoutSessionFeedback,
  serializeWorkoutSessionExerciseProgrammingNotes,
  serializeWorkoutSessionTimeSegments,
  templateExercises,
  workoutSessions,
  workoutTemplates,
} from '../../db/schema/index.js';
import { findWorkoutTemplateById } from '../workout-templates/store.js';
import { backfillTimeSegmentSections, calculateSectionDurations } from './time-segments.js';

const SECTION_ORDER: WorkoutTemplateSectionType[] = ['warmup', 'main', 'cooldown'];

type WorkoutSessionRecord = {
  id: string;
  userId: string;
  templateId: string | null;
  scheduledWorkoutId: string | null;
  name: string;
  date: string;
  status: WorkoutSession['status'];
  startedAt: number;
  completedAt: number | null;
  duration: number | null;
  timeSegments: string;
  feedback: string | null;
  exerciseProgrammingNotes: string | null;
  exerciseAgentNotes: Record<string, string | null> | null;
  exerciseAgentNotesMeta: Record<string, WorkoutSessionExerciseAgentNotesMeta | null> | null;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
};

type WorkoutSessionAccessRecord = {
  id: string;
  status: WorkoutSession['status'];
};

type SessionSetRecord = {
  id: string;
  sessionId: string;
  exerciseId: string | null;
  orderIndex: number;
  setNumber: number;
  weight: number | null;
  reps: number | null;
  targetWeight: number | null;
  targetWeightMin: number | null;
  targetWeightMax: number | null;
  targetSeconds: number | null;
  targetDistance: number | null;
  supersetGroup: string | null;
  completed: boolean;
  skipped: boolean;
  section: WorkoutTemplateSectionType | null;
  notes: string | null;
  createdAt: number;
};

export type SessionSetGroup = {
  exerciseId: string | null;
  sets: SessionSet[];
};

const workoutSessionSelection = {
  id: workoutSessions.id,
  userId: workoutSessions.userId,
  templateId: workoutSessions.templateId,
  scheduledWorkoutId: workoutSessions.scheduledWorkoutId,
  name: workoutSessions.name,
  date: workoutSessions.date,
  status: workoutSessions.status,
  startedAt: workoutSessions.startedAt,
  completedAt: workoutSessions.completedAt,
  duration: workoutSessions.duration,
  timeSegments: workoutSessions.timeSegments,
  feedback: workoutSessions.feedback,
  exerciseProgrammingNotes: workoutSessions.exerciseProgrammingNotes,
  exerciseAgentNotes: workoutSessions.exerciseAgentNotes,
  exerciseAgentNotesMeta: workoutSessions.exerciseAgentNotesMeta,
  notes: workoutSessions.notes,
  createdAt: workoutSessions.createdAt,
  updatedAt: workoutSessions.updatedAt,
};

const workoutSessionAccessSelection = {
  id: workoutSessions.id,
  status: workoutSessions.status,
};

const workoutSessionListSelection = {
  id: workoutSessions.id,
  name: workoutSessions.name,
  date: workoutSessions.date,
  status: workoutSessions.status,
  templateId: workoutSessions.templateId,
  templateName: workoutTemplates.name,
  startedAt: workoutSessions.startedAt,
  completedAt: workoutSessions.completedAt,
  duration: workoutSessions.duration,
  notes: workoutSessions.notes,
  exerciseCount: sql<number>`coalesce((
    select count(distinct ${sessionSets.exerciseId})
    from ${sessionSets}
    where ${sessionSets.sessionId} = ${workoutSessions.id}
  ), 0)`,
  createdAt: workoutSessions.createdAt,
};

const sessionSetSelection = {
  id: sessionSets.id,
  sessionId: sessionSets.sessionId,
  exerciseId: sessionSets.exerciseId,
  orderIndex: sessionSets.orderIndex,
  setNumber: sessionSets.setNumber,
  weight: sessionSets.weight,
  reps: sessionSets.reps,
  targetWeight: sessionSets.targetWeight,
  targetWeightMin: sessionSets.targetWeightMin,
  targetWeightMax: sessionSets.targetWeightMax,
  targetSeconds: sessionSets.targetSeconds,
  targetDistance: sessionSets.targetDistance,
  supersetGroup: sessionSets.supersetGroup,
  completed: sessionSets.completed,
  skipped: sessionSets.skipped,
  section: sessionSets.section,
  notes: sessionSets.notes,
  createdAt: sessionSets.createdAt,
};

const sortSessionSets = (left: SessionSetRecord, right: SessionSetRecord) => {
  const leftSectionIndex =
    left.section === null ? SECTION_ORDER.length : SECTION_ORDER.indexOf(left.section);
  const rightSectionIndex =
    right.section === null ? SECTION_ORDER.length : SECTION_ORDER.indexOf(right.section);

  if (leftSectionIndex !== rightSectionIndex) {
    return leftSectionIndex - rightSectionIndex;
  }

  if (left.orderIndex !== right.orderIndex) {
    return left.orderIndex - right.orderIndex;
  }

  const leftExerciseId = left.exerciseId ?? '';
  const rightExerciseId = right.exerciseId ?? '';
  if (leftExerciseId !== rightExerciseId) {
    return leftExerciseId.localeCompare(rightExerciseId);
  }

  if (left.setNumber !== right.setNumber) {
    return left.setNumber - right.setNumber;
  }

  return left.createdAt - right.createdAt;
};

const buildSessionSet = (set: SessionSetRecord): SessionSet => ({
  id: set.id,
  exerciseId: set.exerciseId,
  orderIndex: set.orderIndex,
  setNumber: set.setNumber,
  weight: set.weight,
  reps: set.reps,
  ...(set.targetWeight !== null ? { targetWeight: set.targetWeight } : {}),
  ...(set.targetWeightMin !== null ? { targetWeightMin: set.targetWeightMin } : {}),
  ...(set.targetWeightMax !== null ? { targetWeightMax: set.targetWeightMax } : {}),
  ...(set.targetSeconds !== null ? { targetSeconds: set.targetSeconds } : {}),
  ...(set.targetDistance !== null ? { targetDistance: set.targetDistance } : {}),
  completed: set.completed,
  skipped: set.skipped,
  section: set.section,
  notes: set.notes,
  createdAt: set.createdAt,
});

const buildSessionSetGroups = (sets: SessionSetRecord[]): SessionSetGroup[] => {
  const groups = new Map<string, { exerciseId: string | null; sets: SessionSet[] }>();

  for (const set of sets.sort(sortSessionSets)) {
    const groupKey = set.exerciseId ?? `deleted-${set.section ?? 'supplemental'}-${set.orderIndex}`;
    const existingGroup = groups.get(groupKey);
    const parsedSet = buildSessionSet(set);

    if (existingGroup) {
      existingGroup.sets.push(parsedSet);
      continue;
    }

    groups.set(groupKey, {
      exerciseId: set.exerciseId,
      sets: [parsedSet],
    });
  }

  return Array.from(groups.values()).map((group) => ({
    exerciseId: group.exerciseId,
    sets: group.sets,
  }));
};

const buildWorkoutSession = (
  session: WorkoutSessionRecord,
  sets: SessionSetRecord[],
  exerciseInfoById: Map<
    string,
    {
      name: string;
      deletedAt: string | null;
      trackingType: ExerciseTrackingType | null;
      formCues: string[];
      coachingNotes: string | null;
      instructions: string | null;
    }
  >,
): WorkoutSession => {
  const timeSegments = backfillTimeSegmentSections(
    parseWorkoutSessionTimeSegments(session.timeSegments),
  );
  const programmingNotesByExerciseSection = parseWorkoutSessionExerciseProgrammingNotes(
    session.exerciseProgrammingNotes,
  );
  const agentNotesByExerciseSection = session.exerciseAgentNotes ?? {};
  const agentNotesMetaByExerciseSection = session.exerciseAgentNotesMeta ?? {};
  const sectionDurations = calculateSectionDurations(timeSegments);

  return {
    id: session.id,
    userId: session.userId,
    templateId: session.templateId,
    name: session.name,
    date: session.date,
    status: session.status,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    duration: session.duration,
    timeSegments,
    sectionDurations,
    feedback: parseWorkoutSessionFeedback(session.feedback),
    notes: session.notes,
    exercises: buildWorkoutSessionExercises(
      sets,
      exerciseInfoById,
      programmingNotesByExerciseSection,
      agentNotesByExerciseSection,
      agentNotesMetaByExerciseSection,
    ),
    sets: sets.sort(sortSessionSets).map<SessionSet>(buildSessionSet),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
};

const buildWorkoutSessionExercises = (
  sets: SessionSetRecord[],
  exerciseInfoById: Map<
    string,
    {
      name: string;
      deletedAt: string | null;
      trackingType: ExerciseTrackingType | null;
      formCues: string[];
      coachingNotes: string | null;
      instructions: string | null;
    }
  >,
  programmingNotesByExerciseSection: Record<string, string | null>,
  agentNotesByExerciseSection: Record<string, string | null>,
  agentNotesMetaByExerciseSection: Record<string, WorkoutSessionExerciseAgentNotesMeta | null>,
): WorkoutSessionExercise[] => {
  const groupedByExercise = new Map<
    string,
    {
      exerciseId: string | null;
      exerciseName: string;
      deletedAt: string | null;
      supersetGroup: string | null;
      trackingType: ExerciseTrackingType | null;
      orderIndex: number;
      section: WorkoutTemplateSectionType | null;
      sets: SessionSet[];
      formCues: string[];
      coachingNotes: string | null;
      instructions: string | null;
    }
  >();

  for (const set of sets.sort(sortSessionSets)) {
    const groupKey = set.exerciseId ?? `deleted-${set.section ?? 'supplemental'}-${set.orderIndex}`;
    const existing = groupedByExercise.get(groupKey);
    const parsedSet = buildSessionSet(set);
    const exerciseInfo =
      typeof set.exerciseId === 'string' ? exerciseInfoById.get(set.exerciseId) : undefined;
    const exerciseName =
      set.exerciseId === null ? 'Deleted exercise' : (exerciseInfo?.name ?? 'Unknown Exercise');

    if (existing) {
      existing.orderIndex = Math.min(existing.orderIndex, set.orderIndex);
      if (set.supersetGroup !== null) {
        existing.supersetGroup = set.supersetGroup;
      }
      existing.sets.push(parsedSet);
      continue;
    }

    groupedByExercise.set(groupKey, {
      exerciseId: set.exerciseId,
      exerciseName,
      deletedAt: exerciseInfo?.deletedAt ?? null,
      supersetGroup: set.supersetGroup,
      trackingType: (exerciseInfo?.trackingType as ExerciseTrackingType) ?? null,
      orderIndex: set.orderIndex,
      section: set.section,
      sets: [parsedSet],
      formCues: exerciseInfo?.formCues ?? [],
      coachingNotes: exerciseInfo?.coachingNotes ?? null,
      instructions: exerciseInfo?.instructions ?? null,
    });
  }

  return Array.from(groupedByExercise.values())
    .sort((left, right) => {
      const leftSectionIndex =
        left.section === null ? SECTION_ORDER.length : SECTION_ORDER.indexOf(left.section);
      const rightSectionIndex =
        right.section === null ? SECTION_ORDER.length : SECTION_ORDER.indexOf(right.section);

      if (leftSectionIndex !== rightSectionIndex) {
        return leftSectionIndex - rightSectionIndex;
      }

      if (left.orderIndex !== right.orderIndex) {
        return left.orderIndex - right.orderIndex;
      }

      return left.exerciseName.localeCompare(right.exerciseName);
    })
    .map((exercise) => ({
      exerciseId: exercise.exerciseId,
      exerciseName: exercise.exerciseName,
      deletedAt: exercise.deletedAt,
      supersetGroup: exercise.supersetGroup,
      trackingType: exercise.trackingType,
      exercise: {
        formCues: exercise.formCues,
        coachingNotes: exercise.coachingNotes,
        instructions: exercise.instructions,
      },
      orderIndex: exercise.orderIndex,
      section: exercise.section,
      programmingNotes:
        exercise.exerciseId === null
          ? null
          : (programmingNotesByExerciseSection[
              `${exercise.section ?? 'main'}::${exercise.exerciseId}`
            ] ?? null),
      agentNotes:
        exercise.exerciseId === null
          ? null
          : (agentNotesByExerciseSection[`${exercise.section ?? 'main'}::${exercise.exerciseId}`] ??
            null),
      agentNotesMeta:
        exercise.exerciseId === null
          ? null
          : (agentNotesMetaByExerciseSection[
              `${exercise.section ?? 'main'}::${exercise.exerciseId}`
            ] ?? null),
      sets: exercise.sets,
    }));
};

const buildSessionSetRows = (sessionId: string, sets: CreateWorkoutSessionInput['sets']) =>
  sets.map((set) => {
    const setWithTargets = set as typeof set & {
      targetWeight?: number | null;
      targetWeightMin?: number | null;
      targetWeightMax?: number | null;
      targetSeconds?: number | null;
      targetDistance?: number | null;
    };

    return {
      id: randomUUID(),
      sessionId,
      exerciseId: set.exerciseId,
      orderIndex: set.orderIndex,
      setNumber: set.setNumber,
      weight: set.weight,
      reps: set.reps,
      // Scheduled-workout snapshot seeding still passes target fields through the
      // create path even though public session set input does not accept them.
      targetWeight: setWithTargets.targetWeight ?? null,
      targetWeightMin: setWithTargets.targetWeightMin ?? null,
      targetWeightMax: setWithTargets.targetWeightMax ?? null,
      targetSeconds: setWithTargets.targetSeconds ?? null,
      targetDistance: setWithTargets.targetDistance ?? null,
      supersetGroup: set.supersetGroup,
      completed: set.completed ?? false,
      skipped: set.skipped ?? false,
      section: set.section ?? 'main',
      notes: set.notes,
    };
  });

export const findInvalidSessionExerciseIds = async ({
  userId,
  exerciseIds,
}: {
  userId: string;
  exerciseIds: string[];
}): Promise<string[]> => {
  if (exerciseIds.length === 0) {
    return [];
  }

  const uniqueIds = [...new Set(exerciseIds)];
  const { db } = await import('../../db/index.js');

  const visibleExerciseIds = db
    .select({ id: exercises.id })
    .from(exercises)
    .where(
      and(
        inArray(exercises.id, uniqueIds),
        isNull(exercises.deletedAt),
        or(isNull(exercises.userId), eq(exercises.userId, userId)),
      ),
    )
    .all()
    .map((exercise) => exercise.id);

  const visibleExerciseIdSet = new Set(visibleExerciseIds);
  return uniqueIds.filter((exerciseId) => !visibleExerciseIdSet.has(exerciseId));
};

export class SessionSetNotFoundError extends Error {
  readonly setId: string;

  constructor(setId: string) {
    super(`Session set ${setId} not found`);
    this.name = 'SessionSetNotFoundError';
    this.setId = setId;
  }
}

export class WorkoutSessionNotFoundError extends Error {
  readonly sessionId: string;

  constructor(sessionId: string) {
    super(`Workout session ${sessionId} not found`);
    this.name = 'WorkoutSessionNotFoundError';
    this.sessionId = sessionId;
  }
}

export class WorkoutSessionNotCompletedError extends Error {
  readonly sessionId: string;

  constructor(sessionId: string) {
    super(`Workout session ${sessionId} is not completed`);
    this.name = 'WorkoutSessionNotCompletedError';
    this.sessionId = sessionId;
  }
}

export class InvalidSessionCorrectionSetError extends Error {
  readonly setId: string;

  constructor(setId: string) {
    super(`Session set ${setId} does not belong to the workout session`);
    this.name = 'InvalidSessionCorrectionSetError';
    this.setId = setId;
  }
}

export const findWorkoutSessionAccess = async (
  id: string,
  userId: string,
): Promise<WorkoutSessionAccessRecord | undefined> => {
  const { db } = await import('../../db/index.js');

  return db
    .select(workoutSessionAccessSelection)
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.id, id),
        eq(workoutSessions.userId, userId),
        isNull(workoutSessions.deletedAt),
      ),
    )
    .limit(1)
    .get();
};

export const createSessionSet = async ({
  id,
  sessionId,
  input,
}: {
  id: string;
  sessionId: string;
  input: CreateSetInput;
}): Promise<SessionSet> => {
  const { db } = await import('../../db/index.js');
  const normalizedSection = input.section ?? 'main';
  const existingSets = db
    .select(sessionSetSelection)
    .from(sessionSets)
    .where(eq(sessionSets.sessionId, sessionId))
    .all();
  const sameExerciseOrderIndex = existingSets.find(
    (set) => set.exerciseId === input.exerciseId && set.section === normalizedSection,
  )?.orderIndex;
  const maxOrderIndexInSection = existingSets
    .filter((set) => set.section === normalizedSection)
    .reduce((maxValue, set) => Math.max(maxValue, set.orderIndex), -1);
  const nextOrderIndex = sameExerciseOrderIndex ?? maxOrderIndexInSection + 1;

  const sameExerciseSets = existingSets.filter((set) => set.exerciseId === input.exerciseId);
  const sameExerciseSupersetGroup =
    sameExerciseSets.find((set) => set.supersetGroup !== null)?.supersetGroup ?? null;
  const maxExerciseSetNumber = sameExerciseSets.reduce(
    (maxValue, set) => Math.max(maxValue, set.setNumber),
    0,
  );
  const resolvedSetNumber =
    input.setNumber <= maxExerciseSetNumber ? maxExerciseSetNumber + 1 : input.setNumber;

  const result = db
    .insert(sessionSets)
    .values({
      id,
      sessionId,
      exerciseId: input.exerciseId,
      orderIndex: nextOrderIndex,
      setNumber: resolvedSetNumber,
      weight: input.weight,
      reps: input.reps,
      supersetGroup: sameExerciseSupersetGroup,
      section: normalizedSection,
    })
    .run();

  if (result.changes !== 1) {
    throw new Error('Failed to persist session set');
  }

  const createdSet = db
    .select(sessionSetSelection)
    .from(sessionSets)
    .where(and(eq(sessionSets.id, id), eq(sessionSets.sessionId, sessionId)))
    .limit(1)
    .get();

  if (!createdSet) {
    throw new Error('Created session set could not be loaded');
  }

  return buildSessionSet(createdSet);
};

export const updateSessionSet = async ({
  sessionId,
  setId,
  input,
}: {
  sessionId: string;
  setId: string;
  input: UpdateSetInput;
}): Promise<SessionSet | undefined> => {
  const { db } = await import('../../db/index.js');
  const persistedInput = {
    weight: input.weight,
    reps: input.reps,
    completed: input.completed,
    skipped: input.skipped,
    notes: input.notes,
  };

  const result = db
    .update(sessionSets)
    .set(persistedInput)
    .where(and(eq(sessionSets.id, setId), eq(sessionSets.sessionId, sessionId)))
    .run();

  if (result.changes !== 1) {
    return undefined;
  }

  const updatedSet = db
    .select(sessionSetSelection)
    .from(sessionSets)
    .where(and(eq(sessionSets.id, setId), eq(sessionSets.sessionId, sessionId)))
    .limit(1)
    .get();

  if (!updatedSet) {
    throw new Error('Updated session set could not be loaded');
  }

  return buildSessionSet(updatedSet);
};

export const listSessionSetGroups = async (sessionId: string): Promise<SessionSetGroup[]> => {
  const { db } = await import('../../db/index.js');

  const sets = db
    .select(sessionSetSelection)
    .from(sessionSets)
    .where(eq(sessionSets.sessionId, sessionId))
    .all();

  return buildSessionSetGroups(sets);
};

export const applySessionCorrections = async ({
  sessionId,
  userId,
  corrections,
}: {
  sessionId: string;
  userId: string;
  corrections: SetCorrection[];
}): Promise<WorkoutSession> => {
  const { db } = await import('../../db/index.js');

  db.transaction((tx) => {
    const session = tx
      .select(workoutSessionAccessSelection)
      .from(workoutSessions)
      .where(
        and(
          eq(workoutSessions.id, sessionId),
          eq(workoutSessions.userId, userId),
          isNull(workoutSessions.deletedAt),
        ),
      )
      .limit(1)
      .get();

    if (!session) {
      throw new WorkoutSessionNotFoundError(sessionId);
    }

    if (session.status !== 'completed') {
      throw new WorkoutSessionNotCompletedError(sessionId);
    }

    const uniqueSetIds = [...new Set(corrections.map((correction) => correction.setId))];
    const persistedSetIds =
      uniqueSetIds.length === 0
        ? []
        : tx
            .select({ id: sessionSets.id })
            .from(sessionSets)
            .where(and(eq(sessionSets.sessionId, sessionId), inArray(sessionSets.id, uniqueSetIds)))
            .all()
            .map((set) => set.id);
    const persistedSetIdSet = new Set(persistedSetIds);

    for (const setId of uniqueSetIds) {
      if (!persistedSetIdSet.has(setId)) {
        throw new InvalidSessionCorrectionSetError(setId);
      }
    }

    const persistedCorrectionsBySetId = new Map<
      string,
      {
        setId: string;
        weight?: number;
        reps?: number;
      }
    >();

    for (const correction of corrections) {
      // The correction payload reserves `rpe` for future set-level support.
      // The current session_sets table only persists weight/reps, so update the fields we can store.
      const persistedCorrection = persistedCorrectionsBySetId.get(correction.setId) ?? {
        setId: correction.setId,
      };

      if (correction.weight !== undefined) {
        persistedCorrection.weight = correction.weight;
      }

      if (correction.reps !== undefined) {
        persistedCorrection.reps = correction.reps;
      }

      persistedCorrectionsBySetId.set(correction.setId, persistedCorrection);
    }

    const correctionsByPersistedFields = new Map<
      string,
      Array<{
        setId: string;
        weight?: number;
        reps?: number;
      }>
    >();

    for (const correction of persistedCorrectionsBySetId.values()) {
      const persistedFieldKey = [
        correction.weight !== undefined ? 'weight' : null,
        correction.reps !== undefined ? 'reps' : null,
      ]
        .filter((field): field is 'weight' | 'reps' => field !== null)
        .join(',');

      if (!persistedFieldKey) {
        continue;
      }

      const groupedCorrections = correctionsByPersistedFields.get(persistedFieldKey) ?? [];
      groupedCorrections.push(correction);
      correctionsByPersistedFields.set(persistedFieldKey, groupedCorrections);
    }

    for (const [persistedFieldKey, groupedCorrections] of correctionsByPersistedFields.entries()) {
      const updatePayload: Partial<Record<'weight' | 'reps', SQL<number>>> = {};
      const groupedSetIds = groupedCorrections.map((correction) => correction.setId);

      if (persistedFieldKey.includes('weight')) {
        const weightCorrections = groupedCorrections.filter(
          (
            correction,
          ): correction is {
            setId: string;
            weight: number;
            reps?: number;
          } => correction.weight !== undefined,
        );
        const weightCases = sql.join(
          weightCorrections.map(
            (correction) =>
              sql`when ${sessionSets.id} = ${correction.setId} then ${correction.weight}`,
          ),
          sql.raw(' '),
        );
        updatePayload.weight = sql<number>`case ${weightCases} else ${sessionSets.weight} end`;
      }

      if (persistedFieldKey.includes('reps')) {
        const repsCorrections = groupedCorrections.filter(
          (
            correction,
          ): correction is {
            setId: string;
            weight?: number;
            reps: number;
          } => correction.reps !== undefined,
        );
        const repsCases = sql.join(
          repsCorrections.map(
            (correction) =>
              sql`when ${sessionSets.id} = ${correction.setId} then ${correction.reps}`,
          ),
          sql.raw(' '),
        );
        updatePayload.reps = sql<number>`case ${repsCases} else ${sessionSets.reps} end`;
      }

      tx.update(sessionSets)
        .set(updatePayload)
        .where(and(eq(sessionSets.sessionId, sessionId), inArray(sessionSets.id, groupedSetIds)))
        .run();
    }

    tx.update(workoutSessions)
      .set({ updatedAt: Date.now() })
      .where(
        and(
          eq(workoutSessions.id, sessionId),
          eq(workoutSessions.userId, userId),
          isNull(workoutSessions.deletedAt),
        ),
      )
      .run();
  });

  const session = await findWorkoutSessionById(sessionId, userId);
  if (!session) {
    throw new Error('Corrected workout session could not be loaded');
  }

  return session;
};

export const batchUpsertSessionSets = async ({
  sessionId,
  input,
}: {
  sessionId: string;
  input: BatchUpsertSetsInput;
}): Promise<SessionSetGroup[]> => {
  const { db } = await import('../../db/index.js');

  const groupedSets = db.transaction((tx) => {
    const existingSets = tx
      .select(sessionSetSelection)
      .from(sessionSets)
      .where(eq(sessionSets.sessionId, sessionId))
      .all();
    const orderIndexByExerciseAndSection = new Map<string, number>();
    const nextOrderIndexBySection = new Map<WorkoutTemplateSectionType, number>();
    const supersetGroupByExerciseId = new Map<string, string | null>();

    for (const set of existingSets) {
      const key = `${set.section}:${set.exerciseId}`;
      if (!orderIndexByExerciseAndSection.has(key)) {
        orderIndexByExerciseAndSection.set(key, set.orderIndex);
      }

      const currentNextOrderIndex = nextOrderIndexBySection.get(set.section) ?? 0;
      nextOrderIndexBySection.set(set.section, Math.max(currentNextOrderIndex, set.orderIndex + 1));

      if (set.exerciseId !== null) {
        const existingSupersetGroup = supersetGroupByExerciseId.get(set.exerciseId);
        if (existingSupersetGroup === undefined) {
          supersetGroupByExerciseId.set(set.exerciseId, set.supersetGroup);
        } else if (existingSupersetGroup === null && set.supersetGroup !== null) {
          supersetGroupByExerciseId.set(set.exerciseId, set.supersetGroup);
        }
      }
    }

    for (const set of input.sets) {
      const normalizedSection = set.section ?? 'main';
      const orderIndexKey = `${normalizedSection}:${set.exerciseId}`;
      const hasExistingOrderIndex = orderIndexByExerciseAndSection.has(orderIndexKey);
      const nextOrderIndex =
        orderIndexByExerciseAndSection.get(orderIndexKey) ??
        nextOrderIndexBySection.get(normalizedSection) ??
        0;
      orderIndexByExerciseAndSection.set(orderIndexKey, nextOrderIndex);
      if (!nextOrderIndexBySection.has(normalizedSection) || !hasExistingOrderIndex) {
        nextOrderIndexBySection.set(normalizedSection, nextOrderIndex + 1);
      }

      if (set.id) {
        // Batch upsert intentionally syncs structural/performance fields only.
        // `completed`, `skipped`, and `notes` are controlled via PATCH /sets/:setId.
        const updateResult = tx
          .update(sessionSets)
          .set({
            exerciseId: set.exerciseId,
            orderIndex: nextOrderIndex,
            setNumber: set.setNumber,
            weight: set.weight,
            reps: set.reps,
            section: normalizedSection,
          })
          .where(and(eq(sessionSets.id, set.id), eq(sessionSets.sessionId, sessionId)))
          .run();

        if (updateResult.changes !== 1) {
          throw new SessionSetNotFoundError(set.id);
        }

        continue;
      }

      const inheritedSupersetGroup = supersetGroupByExerciseId.get(set.exerciseId) ?? null;
      if (!supersetGroupByExerciseId.has(set.exerciseId)) {
        supersetGroupByExerciseId.set(set.exerciseId, inheritedSupersetGroup);
      }

      tx.insert(sessionSets)
        .values({
          id: randomUUID(),
          sessionId,
          exerciseId: set.exerciseId,
          orderIndex: nextOrderIndex,
          setNumber: set.setNumber,
          weight: set.weight,
          reps: set.reps,
          supersetGroup: inheritedSupersetGroup,
          section: normalizedSection,
        })
        .run();
    }

    const sets = tx
      .select(sessionSetSelection)
      .from(sessionSets)
      .where(eq(sessionSets.sessionId, sessionId))
      .all();

    return buildSessionSetGroups(sets);
  });

  return groupedSets;
};

export const createWorkoutSession = async ({
  id,
  userId,
  input,
  programmingNotesByExerciseSection,
  agentNotesByExerciseSection,
  agentNotesMetaByExerciseSection,
  scheduledWorkoutId,
  linkScheduledWorkoutSession,
}: {
  id: string;
  userId: string;
  input: CreateWorkoutSessionInput;
  programmingNotesByExerciseSection?: Record<string, string | null>;
  agentNotesByExerciseSection?: Record<string, string | null>;
  agentNotesMetaByExerciseSection?: Record<string, WorkoutSessionExerciseAgentNotesMeta | null>;
  scheduledWorkoutId?: string;
  linkScheduledWorkoutSession?: boolean;
}): Promise<WorkoutSession> => {
  const { db } = await import('../../db/index.js');
  const setRows = buildSessionSetRows(id, input.sets);

  db.transaction((tx) => {
    const insertResult = tx
      .insert(workoutSessions)
      .values({
        id,
        userId,
        templateId: input.templateId,
        scheduledWorkoutId: scheduledWorkoutId ?? null,
        name: input.name,
        date: input.date,
        status: input.status,
        startedAt: input.startedAt,
        completedAt: input.completedAt,
        duration: input.duration,
        timeSegments: serializeWorkoutSessionTimeSegments(input.timeSegments),
        feedback: serializeWorkoutSessionFeedback(input.feedback),
        exerciseProgrammingNotes: serializeWorkoutSessionExerciseProgrammingNotes(
          programmingNotesByExerciseSection,
        ),
        exerciseAgentNotes: agentNotesByExerciseSection ?? null,
        exerciseAgentNotesMeta: agentNotesMetaByExerciseSection ?? null,
        notes: input.notes,
      })
      .run();

    if (insertResult.changes !== 1) {
      throw new Error('Failed to persist workout session');
    }

    if (setRows.length > 0) {
      tx.insert(sessionSets).values(setRows).run();
    }

    if (linkScheduledWorkoutSession && scheduledWorkoutId) {
      const linkResult = tx
        .update(scheduledWorkouts)
        .set({
          sessionId: id,
        })
        .where(
          and(
            eq(scheduledWorkouts.id, scheduledWorkoutId),
            eq(scheduledWorkouts.userId, userId),
            isNull(scheduledWorkouts.sessionId),
          ),
        )
        .run();

      if (linkResult.changes !== 1) {
        throw new Error('Failed to link scheduled workout to the new session');
      }
    }
  });

  const session = await findWorkoutSessionById(id, userId);
  if (!session) {
    throw new Error('Created workout session could not be loaded');
  }

  return session;
};

export const listWorkoutSessions = async ({
  userId,
  from,
  to,
  status,
  limit,
}: {
  userId: string;
  from?: string;
  to?: string;
  status?: WorkoutSession['status'][];
  limit?: number;
}): Promise<WorkoutSessionListItem[]> => {
  const { db } = await import('../../db/index.js');
  const whereClauses = [eq(workoutSessions.userId, userId), isNull(workoutSessions.deletedAt)];

  if (from) {
    whereClauses.push(gte(workoutSessions.date, from));
  }

  if (to) {
    whereClauses.push(lte(workoutSessions.date, to));
  }

  if (status && status.length > 0) {
    whereClauses.push(inArray(workoutSessions.status, status));
  }

  const query = db
    .select(workoutSessionListSelection)
    .from(workoutSessions)
    .leftJoin(
      workoutTemplates,
      and(eq(workoutTemplates.id, workoutSessions.templateId), isNull(workoutTemplates.deletedAt)),
    )
    .where(and(...whereClauses))
    .orderBy(
      desc(workoutSessions.date),
      desc(workoutSessions.startedAt),
      desc(workoutSessions.createdAt),
    );

  if (typeof limit === 'number') {
    return query.limit(limit).all();
  }

  return query.all();
};

export const findWorkoutSessionById = async (
  id: string,
  userId: string,
): Promise<WorkoutSession | undefined> => {
  const { db } = await import('../../db/index.js');

  const session = db
    .select(workoutSessionSelection)
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.id, id),
        eq(workoutSessions.userId, userId),
        isNull(workoutSessions.deletedAt),
      ),
    )
    .limit(1)
    .get();

  if (!session) {
    return undefined;
  }

  const sets = db
    .select(sessionSetSelection)
    .from(sessionSets)
    .where(eq(sessionSets.sessionId, id))
    .all();

  const uniqueExerciseIds = [...new Set(sets.map((set) => set.exerciseId))];
  const nonNullExerciseIds = uniqueExerciseIds.filter(
    (exerciseId): exerciseId is string => typeof exerciseId === 'string',
  );
  const exerciseNameRows =
    nonNullExerciseIds.length === 0
      ? []
      : db
          .select({
            id: exercises.id,
            name: exercises.name,
            deletedAt: exercises.deletedAt,
            trackingType: exercises.trackingType,
            formCues: exercises.formCues,
            coachingNotes: exercises.coachingNotes,
            instructions: exercises.instructions,
          })
          .from(exercises)
          .where(inArray(exercises.id, nonNullExerciseIds))
          .all();
  const exerciseInfoById = new Map(
    exerciseNameRows.map((row) => [
      row.id,
      {
        name: row.name,
        deletedAt: row.deletedAt,
        trackingType: row.trackingType,
        formCues: row.formCues ?? [],
        coachingNotes: row.coachingNotes,
        instructions: row.instructions,
      },
    ]),
  );

  return buildWorkoutSession(session, sets, exerciseInfoById);
};

export const updateWorkoutSession = async ({
  id,
  userId,
  input,
}: {
  id: string;
  userId: string;
  input: CreateWorkoutSessionInput; // Full snapshot; the route merges the partial patch first.
}): Promise<WorkoutSession | undefined> => {
  const { db } = await import('../../db/index.js');
  const setRows = buildSessionSetRows(id, input.sets);

  const result = db.transaction((tx) => {
    const updateResult = tx
      .update(workoutSessions)
      .set({
        templateId: input.templateId,
        name: input.name,
        date: input.date,
        status: input.status,
        startedAt: input.startedAt,
        completedAt: input.completedAt,
        duration: input.duration,
        timeSegments: serializeWorkoutSessionTimeSegments(input.timeSegments),
        feedback: serializeWorkoutSessionFeedback(input.feedback),
        notes: input.notes,
      })
      .where(
        and(
          eq(workoutSessions.id, id),
          eq(workoutSessions.userId, userId),
          isNull(workoutSessions.deletedAt),
        ),
      )
      .run();

    if (updateResult.changes !== 1) {
      return false;
    }

    tx.delete(sessionSets).where(eq(sessionSets.sessionId, id)).run();

    if (setRows.length > 0) {
      tx.insert(sessionSets).values(setRows).run();
    }

    return true;
  });

  if (!result) {
    return undefined;
  }

  return findWorkoutSessionById(id, userId);
};

export const deleteWorkoutSession = async (id: string, userId: string): Promise<boolean> => {
  const { db } = await import('../../db/index.js');

  const result = db
    .update(workoutSessions)
    .set({
      deletedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(workoutSessions.id, id),
        eq(workoutSessions.userId, userId),
        isNull(workoutSessions.deletedAt),
      ),
    )
    .run();

  return result.changes === 1;
};

export const hardDeleteWorkoutSession = async (id: string, userId: string): Promise<boolean> => {
  const { db } = await import('../../db/index.js');

  const result = db.transaction((tx) => {
    tx.delete(sessionSets).where(eq(sessionSets.sessionId, id)).run();
    return tx
      .delete(workoutSessions)
      .where(and(eq(workoutSessions.id, id), eq(workoutSessions.userId, userId)))
      .run();
  });

  return result.changes === 1;
};

export const reorderWorkoutSessionExercises = async ({
  sessionId,
  userId,
  section,
  exerciseIds,
}: {
  sessionId: string;
  userId: string;
  section: WorkoutTemplateSectionType;
  exerciseIds: string[];
}): Promise<WorkoutSession | undefined> => {
  const { db } = await import('../../db/index.js');

  const reordered = db.transaction((tx) => {
    const session = tx
      .select(workoutSessionAccessSelection)
      .from(workoutSessions)
      .where(
        and(
          eq(workoutSessions.id, sessionId),
          eq(workoutSessions.userId, userId),
          isNull(workoutSessions.deletedAt),
        ),
      )
      .limit(1)
      .get();

    if (!session) {
      return false;
    }

    for (const [orderIndex, exerciseId] of exerciseIds.entries()) {
      tx.update(sessionSets)
        .set({ orderIndex })
        .where(
          and(
            eq(sessionSets.sessionId, sessionId),
            eq(sessionSets.exerciseId, exerciseId),
            eq(sessionSets.section, section),
          ),
        )
        .run();
    }

    tx.update(workoutSessions)
      .set({ updatedAt: Date.now() })
      .where(
        and(
          eq(workoutSessions.id, sessionId),
          eq(workoutSessions.userId, userId),
          isNull(workoutSessions.deletedAt),
        ),
      )
      .run();

    return true;
  });

  if (!reordered) {
    return undefined;
  }

  return findWorkoutSessionById(sessionId, userId);
};

export const swapWorkoutSessionExercise = async ({
  sessionId,
  userId,
  exerciseId,
  newExerciseId,
}: {
  sessionId: string;
  userId: string;
  exerciseId: string;
  newExerciseId: string;
}): Promise<WorkoutSession | undefined> => {
  const { db } = await import('../../db/index.js');

  const swapped = db.transaction((tx) => {
    const session = tx
      .select(workoutSessionAccessSelection)
      .from(workoutSessions)
      .where(
        and(
          eq(workoutSessions.id, sessionId),
          eq(workoutSessions.userId, userId),
          isNull(workoutSessions.deletedAt),
        ),
      )
      .limit(1)
      .get();

    if (!session) {
      return false;
    }

    const updateResult = tx
      .update(sessionSets)
      .set({
        exerciseId: newExerciseId,
      })
      // Session swaps intentionally replace every set tied to the source exercise across sections.
      .where(and(eq(sessionSets.sessionId, sessionId), eq(sessionSets.exerciseId, exerciseId)))
      .run();

    if (updateResult.changes === 0) {
      return false;
    }

    tx.update(workoutSessions)
      .set({ updatedAt: Date.now() })
      .where(
        and(
          eq(workoutSessions.id, sessionId),
          eq(workoutSessions.userId, userId),
          isNull(workoutSessions.deletedAt),
        ),
      )
      .run();

    return true;
  });

  if (!swapped) {
    return undefined;
  }

  return findWorkoutSessionById(sessionId, userId);
};

const mapSessionSectionToTemplateSection = (
  section: WorkoutTemplateSectionType | null,
): WorkoutTemplateSectionType => section ?? 'main';

type SessionExerciseTemplateRoundTripSource = WorkoutSessionExercise & {
  notes?: string | null;
  agentNotes?: string | null;
  agentNotesMeta?: WorkoutSessionExerciseAgentNotesMeta | null;
};

const getTemplateNotesFromSessionExercise = (
  exercise: SessionExerciseTemplateRoundTripSource,
): string | null => {
  // Agent notes and user notes do not round-trip — they are session-specific.
  const { programmingNotes, notes, agentNotes, agentNotesMeta } = exercise;
  void notes;
  void agentNotes;
  void agentNotesMeta;
  return programmingNotes ?? null;
};

export const saveCompletedSessionAsTemplate = async ({
  input,
  userId,
  session,
}: {
  input: SaveWorkoutSessionAsTemplateInput;
  userId: string;
  session: WorkoutSession;
}) => {
  const { db } = await import('../../db/index.js');
  const templateId = randomUUID();
  const sectionOrderIndex = {
    warmup: 0,
    main: 0,
    cooldown: 0,
  } as Record<WorkoutTemplateSectionType, number>;

  const groupedExercises = new Map<
    string,
    {
      exerciseId: string;
      section: WorkoutTemplateSectionType;
      setCount: number;
    }
  >();
  const programmingNotesByExercise = new Map<string, string | null>();

  for (const exercise of session.exercises ?? []) {
    if (exercise.exerciseId === null) {
      continue;
    }

    const section = mapSessionSectionToTemplateSection(exercise.section);
    const groupKey = `${section}:${exercise.exerciseId}`;
    programmingNotesByExercise.set(groupKey, getTemplateNotesFromSessionExercise(exercise));
  }

  for (const set of session.sets) {
    if (set.exerciseId === null) {
      // Deleted exercises cannot be part of new templates because template rows require a valid exercise id.
      continue;
    }

    const section = mapSessionSectionToTemplateSection(set.section);
    const groupKey = `${section}:${set.exerciseId}`;
    const existing = groupedExercises.get(groupKey);

    if (!existing) {
      groupedExercises.set(groupKey, {
        exerciseId: set.exerciseId,
        section,
        setCount: set.setNumber,
      });
      continue;
    }

    existing.setCount = Math.max(existing.setCount, set.setNumber);
  }

  const templateExerciseRows = Array.from(groupedExercises.values()).map((exercise) => ({
    id: randomUUID(),
    templateId,
    exerciseId: exercise.exerciseId,
    orderIndex: sectionOrderIndex[exercise.section]++,
    sets: exercise.setCount,
    repsMin: null,
    repsMax: null,
    tempo: null,
    restSeconds: null,
    supersetGroup: null,
    section: exercise.section,
    notes: programmingNotesByExercise.get(`${exercise.section}:${exercise.exerciseId}`) ?? null,
    cues: [],
  }));

  const result = db.transaction((tx) => {
    const insertTemplateResult = tx
      .insert(workoutTemplates)
      .values({
        id: templateId,
        userId,
        name: input.name ?? session.name,
        description: input.description ?? null,
        tags: input.tags ?? [],
      })
      .run();
    if (insertTemplateResult.changes !== 1) {
      return false;
    }

    if (templateExerciseRows.length > 0) {
      tx.insert(templateExercises).values(templateExerciseRows).run();
    }

    return true;
  });
  if (!result) {
    throw new Error('Created workout template could not be saved');
  }

  const createdTemplate = await findWorkoutTemplateById(templateId, userId);
  if (!createdTemplate) {
    throw new Error('Created workout template could not be loaded');
  }

  return createdTemplate;
};

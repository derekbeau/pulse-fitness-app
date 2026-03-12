import { randomUUID } from 'node:crypto';

import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type {
  BatchUpsertSetsInput,
  CreateSetInput,
  CreateWorkoutSessionInput,
  SaveWorkoutSessionAsTemplateInput,
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
  parseWorkoutSessionTimeSegments,
  sessionSets,
  serializeWorkoutSessionFeedback,
  serializeWorkoutSessionTimeSegments,
  templateExercises,
  workoutSessions,
  workoutTemplates,
} from '../../db/schema/index.js';
import { findWorkoutTemplateById } from '../workout-templates/store.js';

const SECTION_ORDER: WorkoutTemplateSectionType[] = ['warmup', 'main', 'cooldown'];

type WorkoutSessionRecord = {
  id: string;
  userId: string;
  templateId: string | null;
  name: string;
  date: string;
  status: WorkoutSession['status'];
  startedAt: number;
  completedAt: number | null;
  duration: number | null;
  timeSegments: string;
  feedback: string | null;
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
  exerciseId: string;
  orderIndex: number;
  setNumber: number;
  weight: number | null;
  reps: number | null;
  completed: boolean;
  skipped: boolean;
  section: WorkoutTemplateSectionType | null;
  notes: string | null;
  createdAt: number;
};

export type SessionSetGroup = {
  exerciseId: string;
  sets: SessionSet[];
};

const workoutSessionSelection = {
  id: workoutSessions.id,
  userId: workoutSessions.userId,
  templateId: workoutSessions.templateId,
  name: workoutSessions.name,
  date: workoutSessions.date,
  status: workoutSessions.status,
  startedAt: workoutSessions.startedAt,
  completedAt: workoutSessions.completedAt,
  duration: workoutSessions.duration,
  timeSegments: workoutSessions.timeSegments,
  feedback: workoutSessions.feedback,
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

  if (left.exerciseId !== right.exerciseId) {
    return left.exerciseId.localeCompare(right.exerciseId);
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
  completed: set.completed,
  skipped: set.skipped,
  section: set.section,
  notes: set.notes,
  createdAt: set.createdAt,
});

const buildSessionSetGroups = (sets: SessionSetRecord[]): SessionSetGroup[] => {
  const groups = new Map<string, SessionSet[]>();

  for (const set of sets.sort(sortSessionSets)) {
    const existingGroup = groups.get(set.exerciseId);
    const parsedSet = buildSessionSet(set);

    if (existingGroup) {
      existingGroup.push(parsedSet);
      continue;
    }

    groups.set(set.exerciseId, [parsedSet]);
  }

  return Array.from(groups.entries()).map(([exerciseId, groupedSets]) => ({
    exerciseId,
    sets: groupedSets,
  }));
};

const buildWorkoutSession = (
  session: WorkoutSessionRecord,
  sets: SessionSetRecord[],
  exerciseNamesById: Map<string, string>,
): WorkoutSession => {
  const parsedTimeSegments = parseWorkoutSessionTimeSegments(session.timeSegments);
  const timeSegments =
    parsedTimeSegments.length === 0 && session.status === 'in-progress'
      ? [{ start: new Date(session.startedAt).toISOString(), end: null }]
      : parsedTimeSegments;

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
    feedback: parseWorkoutSessionFeedback(session.feedback),
    notes: session.notes,
    exercises: buildWorkoutSessionExercises(sets, exerciseNamesById),
    sets: sets.sort(sortSessionSets).map<SessionSet>(buildSessionSet),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
};

const buildWorkoutSessionExercises = (
  sets: SessionSetRecord[],
  exerciseNamesById: Map<string, string>,
): WorkoutSessionExercise[] => {
  const groupedByExercise = new Map<
    string,
    {
      exerciseId: string;
      exerciseName: string;
      orderIndex: number;
      section: WorkoutTemplateSectionType | null;
      sets: SessionSet[];
    }
  >();

  for (const set of sets.sort(sortSessionSets)) {
    const existing = groupedByExercise.get(set.exerciseId);
    const parsedSet = buildSessionSet(set);
    const exerciseName = exerciseNamesById.get(set.exerciseId) ?? 'Unknown Exercise';

    if (existing) {
      existing.orderIndex = Math.min(existing.orderIndex, set.orderIndex);
      existing.sets.push(parsedSet);
      continue;
    }

    groupedByExercise.set(set.exerciseId, {
      exerciseId: set.exerciseId,
      exerciseName,
      orderIndex: set.orderIndex,
      section: set.section,
      sets: [parsedSet],
    });
  }

  return Array.from(groupedByExercise.values()).sort((left, right) => {
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
  });
};

const buildSessionSetRows = (sessionId: string, sets: CreateWorkoutSessionInput['sets']) =>
  sets.map((set) => ({
    id: randomUUID(),
    sessionId,
    exerciseId: set.exerciseId,
    orderIndex: set.orderIndex,
    setNumber: set.setNumber,
    weight: set.weight,
    reps: set.reps,
    completed: set.completed,
    skipped: set.skipped,
    section: set.section,
    notes: set.notes,
  }));

export const allSessionExercisesAccessible = async ({
  userId,
  exerciseIds,
}: {
  userId: string;
  exerciseIds: string[];
}): Promise<boolean> => {
  if (exerciseIds.length === 0) {
    return true;
  }

  const uniqueIds = [...new Set(exerciseIds)];
  const { db } = await import('../../db/index.js');

  const visibleExerciseIds = db
    .select({ id: exercises.id })
    .from(exercises)
    .where(
      and(
        inArray(exercises.id, uniqueIds),
        or(
          isNull(exercises.userId),
          and(eq(exercises.userId, userId), isNull(exercises.deletedAt)),
        ),
      ),
    )
    .all()
    .map((exercise) => exercise.id);

  return visibleExerciseIds.length === uniqueIds.length;
};

export class SessionSetNotFoundError extends Error {
  readonly setId: string;

  constructor(setId: string) {
    super(`Session set ${setId} not found`);
    this.name = 'SessionSetNotFoundError';
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
  const existingSets = db
    .select(sessionSetSelection)
    .from(sessionSets)
    .where(eq(sessionSets.sessionId, sessionId))
    .all();
  const sameExerciseOrderIndex = existingSets.find(
    (set) => set.exerciseId === input.exerciseId && set.section === input.section,
  )?.orderIndex;
  const maxOrderIndexInSection = existingSets
    .filter((set) => set.section === input.section)
    .reduce((maxValue, set) => Math.max(maxValue, set.orderIndex), -1);
  const nextOrderIndex = sameExerciseOrderIndex ?? maxOrderIndexInSection + 1;

  const result = db
    .insert(sessionSets)
    .values({
      id,
      sessionId,
      exerciseId: input.exerciseId,
      orderIndex: nextOrderIndex,
      setNumber: input.setNumber,
      weight: input.weight,
      reps: input.reps,
      section: input.section,
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
    const nextOrderIndexBySection = new Map<WorkoutTemplateSectionType | null, number>();

    for (const set of existingSets) {
      const key = `${set.section ?? 'null'}:${set.exerciseId}`;
      if (!orderIndexByExerciseAndSection.has(key)) {
        orderIndexByExerciseAndSection.set(key, set.orderIndex);
      }

      const currentNextOrderIndex = nextOrderIndexBySection.get(set.section) ?? 0;
      nextOrderIndexBySection.set(set.section, Math.max(currentNextOrderIndex, set.orderIndex + 1));
    }

    for (const set of input.sets) {
      const orderIndexKey = `${set.section ?? 'null'}:${set.exerciseId}`;
      const hasExistingOrderIndex = orderIndexByExerciseAndSection.has(orderIndexKey);
      const nextOrderIndex =
        orderIndexByExerciseAndSection.get(orderIndexKey) ??
        nextOrderIndexBySection.get(set.section) ??
        0;
      orderIndexByExerciseAndSection.set(orderIndexKey, nextOrderIndex);
      if (!nextOrderIndexBySection.has(set.section) || !hasExistingOrderIndex) {
        nextOrderIndexBySection.set(set.section, nextOrderIndex + 1);
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
            section: set.section,
          })
          .where(and(eq(sessionSets.id, set.id), eq(sessionSets.sessionId, sessionId)))
          .run();

        if (updateResult.changes !== 1) {
          throw new SessionSetNotFoundError(set.id);
        }

        continue;
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
          section: set.section,
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
}: {
  id: string;
  userId: string;
  input: CreateWorkoutSessionInput;
}): Promise<WorkoutSession> => {
  const { db } = await import('../../db/index.js');
  const setRows = buildSessionSetRows(id, input.sets);

  const result = db.transaction((tx) => {
    const insertResult = tx
      .insert(workoutSessions)
      .values({
        id,
        userId,
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
      .run();

    if (insertResult.changes !== 1) {
      return false;
    }

    if (setRows.length > 0) {
      tx.insert(sessionSets).values(setRows).run();
    }

    return true;
  });

  if (!result) {
    throw new Error('Failed to persist workout session');
  }

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
  const exerciseNameRows =
    uniqueExerciseIds.length === 0
      ? []
      : db
          .select({ id: exercises.id, name: exercises.name })
          .from(exercises)
          .where(inArray(exercises.id, uniqueExerciseIds))
          .all();
  const exerciseNamesById = new Map(exerciseNameRows.map((row) => [row.id, row.name]));

  return buildWorkoutSession(session, sets, exerciseNamesById);
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

const mapSessionSectionToTemplateSection = (
  section: WorkoutTemplateSectionType | null,
): WorkoutTemplateSectionType => section ?? 'main';

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

  for (const set of session.sets) {
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
    notes: null,
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

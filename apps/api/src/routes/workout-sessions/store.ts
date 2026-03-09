import { randomUUID } from 'node:crypto';

import { and, desc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import type {
  BatchUpsertSetsInput,
  CreateSetInput,
  CreateWorkoutSessionInput,
  SessionSet,
  UpdateSetInput,
  WorkoutSession,
  WorkoutSessionListItem,
  WorkoutTemplateSectionType,
} from '@pulse/shared';

import {
  exercises,
  parseWorkoutSessionFeedback,
  sessionSets,
  serializeWorkoutSessionFeedback,
  workoutSessions,
  workoutTemplates,
} from '../../db/schema/index.js';

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
  createdAt: workoutSessions.createdAt,
};

const sessionSetSelection = {
  id: sessionSets.id,
  sessionId: sessionSets.sessionId,
  exerciseId: sessionSets.exerciseId,
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

  // TODO(pr-12): Persist session-set exercise order explicitly (orderIndex) once session editing supports reordering.
  // Session sets do not yet persist an exercise order index, so UUID order is the deterministic fallback.
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
): WorkoutSession => ({
  id: session.id,
  userId: session.userId,
  templateId: session.templateId,
  name: session.name,
  date: session.date,
  status: session.status,
  startedAt: session.startedAt,
  completedAt: session.completedAt,
  duration: session.duration,
  feedback: parseWorkoutSessionFeedback(session.feedback),
  notes: session.notes,
  sets: sets.sort(sortSessionSets).map<SessionSet>(buildSessionSet),
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
});

const buildSessionSetRows = (sessionId: string, sets: CreateWorkoutSessionInput['sets']) =>
  sets.map((set) => ({
    id: randomUUID(),
    sessionId,
    exerciseId: set.exerciseId,
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
        or(isNull(exercises.userId), eq(exercises.userId, userId)),
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
    .where(and(eq(workoutSessions.id, id), eq(workoutSessions.userId, userId)))
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

  const result = db
    .insert(sessionSets)
    .values({
      id,
      sessionId,
      exerciseId: input.exerciseId,
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

  const result = db
    .update(sessionSets)
    .set(input)
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

  db.transaction((tx) => {
    for (const set of input.sets) {
      if (set.id) {
        const updateResult = tx
          .update(sessionSets)
          .set({
            exerciseId: set.exerciseId,
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
          setNumber: set.setNumber,
          weight: set.weight,
          reps: set.reps,
          section: set.section,
        })
        .run();
    }
  });

  return listSessionSetGroups(sessionId);
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
}: {
  userId: string;
  from: string;
  to: string;
}): Promise<WorkoutSessionListItem[]> => {
  const { db } = await import('../../db/index.js');

  return db
    .select(workoutSessionListSelection)
    .from(workoutSessions)
    .leftJoin(workoutTemplates, eq(workoutTemplates.id, workoutSessions.templateId))
    .where(
      and(
        eq(workoutSessions.userId, userId),
        gte(workoutSessions.date, from),
        lte(workoutSessions.date, to),
      ),
    )
    .orderBy(
      desc(workoutSessions.date),
      desc(workoutSessions.startedAt),
      desc(workoutSessions.createdAt),
    )
    .all();
};

export const findWorkoutSessionById = async (
  id: string,
  userId: string,
): Promise<WorkoutSession | undefined> => {
  const { db } = await import('../../db/index.js');

  const session = db
    .select(workoutSessionSelection)
    .from(workoutSessions)
    .where(and(eq(workoutSessions.id, id), eq(workoutSessions.userId, userId)))
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

  return buildWorkoutSession(session, sets);
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
        feedback: serializeWorkoutSessionFeedback(input.feedback),
        notes: input.notes,
      })
      .where(and(eq(workoutSessions.id, id), eq(workoutSessions.userId, userId)))
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
    .delete(workoutSessions)
    .where(and(eq(workoutSessions.id, id), eq(workoutSessions.userId, userId)))
    .run();

  return result.changes === 1;
};

import { and, asc, desc, eq, isNull, or, sql } from 'drizzle-orm';
import type {
  CreateExerciseInput,
  Exercise,
  ExerciseCategory,
  ExerciseLastPerformance,
  UpdateExerciseInput,
} from '@pulse/shared';

import { exercises, sessionSets, workoutSessions } from '../../db/schema/index.js';

type ListExercisesInput = {
  userId: string;
  q?: string;
  muscleGroup?: string;
  equipment?: string;
  category?: ExerciseCategory;
  page: number;
  limit: number;
};

type ExerciseOwnershipRecord = {
  id: string;
  userId: string | null;
};

export type ExerciseDedupCandidate = {
  id: string;
  name: string;
  similarity: number;
};

export type ExerciseFilters = {
  muscleGroups: string[];
  equipment: string[];
};

const exerciseSelection = {
  id: exercises.id,
  userId: exercises.userId,
  name: exercises.name,
  muscleGroups: exercises.muscleGroups,
  equipment: exercises.equipment,
  category: exercises.category,
  trackingType: exercises.trackingType,
  tags: exercises.tags,
  formCues: exercises.formCues,
  instructions: exercises.instructions,
  createdAt: exercises.createdAt,
  updatedAt: exercises.updatedAt,
};

const buildListWhereClause = ({
  userId,
  q,
  muscleGroup,
  equipment,
  category,
}: Omit<ListExercisesInput, 'page' | 'limit'>) =>
  and(
    or(isNull(exercises.userId), eq(exercises.userId, userId)),
    q ? sql`lower(${exercises.name}) like ${`%${q.toLowerCase()}%`}` : undefined,
    muscleGroup
      ? sql`exists (
          select 1
          from json_each(${exercises.muscleGroups})
          where lower(json_each.value) = ${muscleGroup.toLowerCase()}
        )`
      : undefined,
    equipment ? sql`lower(${exercises.equipment}) = ${equipment.toLowerCase()}` : undefined,
    category ? eq(exercises.category, category) : undefined,
  );

export const createExercise = async ({
  id,
  userId,
  name,
  muscleGroups,
  equipment,
  category,
  trackingType,
  tags,
  formCues,
  instructions,
}: CreateExerciseInput & { id: string; userId: string }): Promise<Exercise> => {
  const { db } = await import('../../db/index.js');

  const result = db
    .insert(exercises)
    .values({
      id,
      userId,
      name,
      muscleGroups,
      equipment,
      category,
      trackingType,
      tags,
      formCues,
      instructions,
    })
    .run();

  if (result.changes !== 1) {
    throw new Error('Failed to persist exercise');
  }

  const createdExercise = await findExerciseById(id);
  if (!createdExercise) {
    throw new Error('Created exercise could not be loaded');
  }

  return createdExercise;
};

export const listExercises = async ({
  userId,
  q,
  muscleGroup,
  equipment,
  category,
  page,
  limit,
}: ListExercisesInput): Promise<{
  data: Exercise[];
  meta: { page: number; limit: number; total: number };
}> => {
  const { db } = await import('../../db/index.js');
  const whereClause = buildListWhereClause({ userId, q, muscleGroup, equipment, category });
  const offset = (page - 1) * limit;

  const [data, totalResult] = await Promise.all([
    db
      .select(exerciseSelection)
      .from(exercises)
      .where(whereClause)
      .orderBy(asc(exercises.name), asc(exercises.createdAt))
      .limit(limit)
      .offset(offset)
      .all(),
    db
      .select({
        total: sql<number>`count(*)`,
      })
      .from(exercises)
      .where(whereClause)
      .get(),
  ]);

  return {
    data,
    meta: {
      page,
      limit,
      total: totalResult?.total ?? 0,
    },
  };
};

export const listExerciseFilters = async (userId: string): Promise<ExerciseFilters> => {
  const { db } = await import('../../db/index.js');

  const visibleExercises = await db
    .select({
      muscleGroups: exercises.muscleGroups,
      equipment: exercises.equipment,
    })
    .from(exercises)
    .where(or(isNull(exercises.userId), eq(exercises.userId, userId)))
    .all();

  return {
    muscleGroups: Array.from(
      new Set(visibleExercises.flatMap((exercise) => exercise.muscleGroups)),
    ).sort(),
    equipment: Array.from(new Set(visibleExercises.map((exercise) => exercise.equipment))).sort(),
  };
};

export const findExerciseById = async (id: string): Promise<Exercise | undefined> => {
  const { db } = await import('../../db/index.js');

  return db.select(exerciseSelection).from(exercises).where(eq(exercises.id, id)).limit(1).get();
};

export const findExerciseOwnership = async (
  id: string,
): Promise<ExerciseOwnershipRecord | undefined> => {
  const { db } = await import('../../db/index.js');

  return db
    .select({
      id: exercises.id,
      userId: exercises.userId,
    })
    .from(exercises)
    .where(eq(exercises.id, id))
    .limit(1)
    .get();
};

export const updateOwnedExercise = async ({
  id,
  userId,
  changes,
}: {
  id: string;
  userId: string;
  changes: UpdateExerciseInput;
}): Promise<Exercise | undefined> => {
  const { db } = await import('../../db/index.js');

  const [updatedExercise] = await db
    .update(exercises)
    .set(changes)
    .where(and(eq(exercises.id, id), eq(exercises.userId, userId)))
    .returning(exerciseSelection);

  return updatedExercise;
};

export const deleteOwnedExercise = async (id: string, userId: string): Promise<boolean> => {
  const { db } = await import('../../db/index.js');

  const result = db
    .delete(exercises)
    .where(and(eq(exercises.id, id), eq(exercises.userId, userId)))
    .run();

  return result.changes === 1;
};

export const findVisibleExerciseById = async ({
  id,
  userId,
}: {
  id: string;
  userId: string;
}): Promise<ExerciseOwnershipRecord | undefined> => {
  const { db } = await import('../../db/index.js');

  return db
    .select({
      id: exercises.id,
      userId: exercises.userId,
    })
    .from(exercises)
    .where(and(eq(exercises.id, id), or(isNull(exercises.userId), eq(exercises.userId, userId))))
    .limit(1)
    .get();
};

export const findVisibleExerciseByName = async ({
  name,
  userId,
}: {
  name: string;
  userId: string;
}): Promise<Exercise | undefined> => {
  const { db } = await import('../../db/index.js');
  const normalizedName = name.trim().toLowerCase();

  return db
    .select(exerciseSelection)
    .from(exercises)
    .where(
      and(
        sql`lower(${exercises.name}) = ${normalizedName}`,
        or(isNull(exercises.userId), eq(exercises.userId, userId)),
      ),
    )
    .orderBy(sql`case when ${exercises.userId} is null then 1 else 0 end asc`, asc(exercises.name))
    .limit(1)
    .get();
};

const EXERCISE_PREFIXES = ['barbell', 'dumbbell', 'kettlebell', 'cable', 'machine', 'smith'];

const normalizeExerciseName = (name: string): string => {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.length === 0) {
    return normalized;
  }

  const parts = normalized.split(' ');
  const filtered = parts.filter((part, index) => !(index === 0 && EXERCISE_PREFIXES.includes(part)));

  return filtered.join(' ').trim();
};

const calculateExerciseSimilarity = (input: string, candidate: string): number => {
  if (input === candidate) {
    return 1;
  }

  if (input.length === 0 || candidate.length === 0) {
    return 0;
  }

  if (input.includes(candidate) || candidate.includes(input)) {
    return Number((Math.min(input.length, candidate.length) / Math.max(input.length, candidate.length)).toFixed(2));
  }

  return 0;
};

export const findExerciseDedupCandidates = async ({
  userId,
  name,
  limit = 5,
}: {
  userId: string;
  name: string;
  limit?: number;
}): Promise<ExerciseDedupCandidate[]> => {
  const { db } = await import('../../db/index.js');
  const inputNormalized = normalizeExerciseName(name);
  const inputLower = name.trim().toLowerCase();

  const visibleExercises = await db
    .select({
      id: exercises.id,
      name: exercises.name,
    })
    .from(exercises)
    .where(or(isNull(exercises.userId), eq(exercises.userId, userId)))
    .all();

  return visibleExercises
    .map((exercise) => {
      const candidateNormalized = normalizeExerciseName(exercise.name);
      const candidateLower = exercise.name.trim().toLowerCase();
      const similarity = Math.max(
        calculateExerciseSimilarity(inputNormalized, candidateNormalized),
        calculateExerciseSimilarity(inputLower, candidateLower),
      );

      return {
        id: exercise.id,
        name: exercise.name,
        similarity,
      };
    })
    .filter((candidate) => candidate.similarity >= 0.5)
    .sort((left, right) => {
      if (right.similarity !== left.similarity) {
        return right.similarity - left.similarity;
      }

      return left.name.localeCompare(right.name);
    })
    .slice(0, limit);
};

export const findExerciseLastPerformance = async ({
  exerciseId,
  userId,
}: {
  exerciseId: string;
  userId: string;
}): Promise<ExerciseLastPerformance | undefined> => {
  const { db } = await import('../../db/index.js');

  const latestSession = db
    .select({
      id: workoutSessions.id,
      date: workoutSessions.date,
    })
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.userId, userId),
        eq(workoutSessions.status, 'completed'),
        sql`exists (
          select 1
          from ${sessionSets}
          where ${sessionSets.sessionId} = ${workoutSessions.id}
            and ${sessionSets.exerciseId} = ${exerciseId}
        )`,
      ),
    )
    .orderBy(
      desc(workoutSessions.completedAt),
      desc(workoutSessions.startedAt),
      desc(workoutSessions.createdAt),
    )
    .limit(1)
    .as('latest_session');

  const latestSets = db
    .select({
      sessionId: latestSession.id,
      date: latestSession.date,
      setNumber: sessionSets.setNumber,
      weight: sessionSets.weight,
      reps: sessionSets.reps,
    })
    .from(latestSession)
    .innerJoin(
      sessionSets,
      and(eq(sessionSets.sessionId, latestSession.id), eq(sessionSets.exerciseId, exerciseId)),
    )
    .orderBy(asc(sessionSets.setNumber), asc(sessionSets.createdAt))
    .all();

  if (latestSets.length === 0) {
    return undefined;
  }

  const [{ sessionId, date }] = latestSets;

  return {
    sessionId,
    date,
    sets: latestSets.map((set) => ({
      setNumber: set.setNumber,
      weight: set.weight,
      reps: set.reps,
    })),
  };
};

import { createHash, randomUUID } from 'node:crypto';

import { eq, inArray } from 'drizzle-orm';

import type {
  TemplateExerciseSetTarget,
  WorkoutTemplateSectionType,
} from '../../db/schema/index.js';
import {
  scheduledWorkoutExerciseSets,
  scheduledWorkoutExercises,
  scheduledWorkouts,
  templateExercises,
  workoutTemplates,
} from '../../db/schema/index.js';

type PulseDb = typeof import('../../db/index.js').db;

const SECTION_ORDER: WorkoutTemplateSectionType[] = ['warmup', 'main', 'cooldown', 'supplemental'];
const SECTION_RANK: Record<WorkoutTemplateSectionType, number> = {
  warmup: 0,
  main: 1,
  cooldown: 2,
  supplemental: 3,
};

type TemplateExerciseSnapshotRow = {
  id: string;
  exerciseId: string;
  section: WorkoutTemplateSectionType;
  orderIndex: number;
  sets: number | null;
  repsMin: number | null;
  repsMax: number | null;
  tempo: string | null;
  restSeconds: number | null;
  supersetGroup: string | null;
  notes: string | null;
  programmingNotes: string | null;
  cues: string[] | null;
  setTargets: TemplateExerciseSetTarget[] | null;
};

export type ScheduledWorkoutSnapshotSet = {
  id: string;
  scheduledWorkoutExerciseId: string;
  setNumber: number;
  repsMin: number | null;
  repsMax: number | null;
  reps: number | null;
  targetWeight: number | null;
  targetWeightMin: number | null;
  targetWeightMax: number | null;
  targetSeconds: number | null;
  targetDistance: number | null;
  createdAt: number;
};

export type ScheduledWorkoutSnapshotExercise = {
  id: string;
  scheduledWorkoutId: string;
  exerciseId: string;
  section: WorkoutTemplateSectionType;
  orderIndex: number;
  programmingNotes: string | null;
  agentNotes: string | null;
  agentNotesMeta: {
    author: string;
    generatedAt: string;
    scheduledDateAtGeneration: string;
    stale?: boolean;
  } | null;
  templateCues: string[] | null;
  supersetGroup: string | null;
  tempo: string | null;
  restSeconds: number | null;
  createdAt: number;
  updatedAt: number;
  sets: ScheduledWorkoutSnapshotSet[];
};

export type ScheduledWorkoutSnapshot = {
  scheduledWorkoutId: string;
  exercises: ScheduledWorkoutSnapshotExercise[];
};

type SnapshotWriteResult = {
  templateVersion: string;
  exerciseCount: number;
  setCount: number;
};

const resolveDb = async (database?: PulseDb): Promise<PulseDb> => {
  if (database) {
    return database;
  }

  const { db } = await import('../../db/index.js');
  return db;
};

const templateExerciseSnapshotSelection = {
  id: templateExercises.id,
  exerciseId: templateExercises.exerciseId,
  section: templateExercises.section,
  orderIndex: templateExercises.orderIndex,
  sets: templateExercises.sets,
  repsMin: templateExercises.repsMin,
  repsMax: templateExercises.repsMax,
  tempo: templateExercises.tempo,
  restSeconds: templateExercises.restSeconds,
  supersetGroup: templateExercises.supersetGroup,
  notes: templateExercises.notes,
  programmingNotes: templateExercises.programmingNotes,
  cues: templateExercises.cues,
  setTargets: templateExercises.setTargets,
};

const scheduledWorkoutExerciseSelection = {
  id: scheduledWorkoutExercises.id,
  scheduledWorkoutId: scheduledWorkoutExercises.scheduledWorkoutId,
  exerciseId: scheduledWorkoutExercises.exerciseId,
  section: scheduledWorkoutExercises.section,
  orderIndex: scheduledWorkoutExercises.orderIndex,
  programmingNotes: scheduledWorkoutExercises.programmingNotes,
  agentNotes: scheduledWorkoutExercises.agentNotes,
  agentNotesMeta: scheduledWorkoutExercises.agentNotesMeta,
  templateCues: scheduledWorkoutExercises.templateCues,
  supersetGroup: scheduledWorkoutExercises.supersetGroup,
  tempo: scheduledWorkoutExercises.tempo,
  restSeconds: scheduledWorkoutExercises.restSeconds,
  createdAt: scheduledWorkoutExercises.createdAt,
  updatedAt: scheduledWorkoutExercises.updatedAt,
};

const scheduledWorkoutExerciseSetSelection = {
  id: scheduledWorkoutExerciseSets.id,
  scheduledWorkoutExerciseId: scheduledWorkoutExerciseSets.scheduledWorkoutExerciseId,
  setNumber: scheduledWorkoutExerciseSets.setNumber,
  repsMin: scheduledWorkoutExerciseSets.repsMin,
  repsMax: scheduledWorkoutExerciseSets.repsMax,
  reps: scheduledWorkoutExerciseSets.reps,
  targetWeight: scheduledWorkoutExerciseSets.targetWeight,
  targetWeightMin: scheduledWorkoutExerciseSets.targetWeightMin,
  targetWeightMax: scheduledWorkoutExerciseSets.targetWeightMax,
  targetSeconds: scheduledWorkoutExerciseSets.targetSeconds,
  targetDistance: scheduledWorkoutExerciseSets.targetDistance,
  createdAt: scheduledWorkoutExerciseSets.createdAt,
};

const toExerciseProgrammingNotes = (
  row: Pick<TemplateExerciseSnapshotRow, 'programmingNotes' | 'notes'>,
) => row.programmingNotes ?? row.notes ?? null;

const compareTemplateExercises = (
  left: TemplateExerciseSnapshotRow,
  right: TemplateExerciseSnapshotRow,
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

const toExactReps = (repsMin: number | null, repsMax: number | null): number | null => {
  if (repsMin === null || repsMax === null) {
    return null;
  }

  return repsMin === repsMax ? repsMin : null;
};

type SnapshotSetDraft = {
  setNumber: number;
  repsMin: number | null;
  repsMax: number | null;
  reps: number | null;
  targetWeight: number | null;
  targetWeightMin: number | null;
  targetWeightMax: number | null;
  targetSeconds: number | null;
  targetDistance: number | null;
};

const toSnapshotSetDrafts = (row: TemplateExerciseSnapshotRow): SnapshotSetDraft[] => {
  const targets = [...(row.setTargets ?? [])].sort(
    (left, right) => left.setNumber - right.setNumber,
  );
  const reps = toExactReps(row.repsMin, row.repsMax);

  if (targets.length > 0) {
    return targets.map((target) => ({
      setNumber: target.setNumber,
      repsMin: row.repsMin,
      repsMax: row.repsMax,
      reps,
      targetWeight: target.targetWeight ?? null,
      targetWeightMin: target.targetWeightMin ?? null,
      targetWeightMax: target.targetWeightMax ?? null,
      targetSeconds: target.targetSeconds ?? null,
      targetDistance: target.targetDistance ?? null,
    }));
  }

  const setCount = Math.max(1, row.sets ?? 1);
  return Array.from({ length: setCount }, (_, index) => ({
    setNumber: index + 1,
    repsMin: row.repsMin,
    repsMax: row.repsMax,
    reps,
    targetWeight: null,
    targetWeightMin: null,
    targetWeightMax: null,
    targetSeconds: null,
    targetDistance: null,
  }));
};

const toTemplateVersionPayload = (rows: TemplateExerciseSnapshotRow[]) =>
  rows.map((row) => ({
    exerciseId: row.exerciseId,
    section: row.section,
    orderIndex: row.orderIndex,
    programmingNotes: toExerciseProgrammingNotes(row),
    templateCues: row.cues ?? null,
    supersetGroup: row.supersetGroup,
    tempo: row.tempo,
    restSeconds: row.restSeconds,
    sets: toSnapshotSetDrafts(row).map((set) => ({
      setNumber: set.setNumber,
      repsMin: set.repsMin,
      repsMax: set.repsMax,
      reps: set.reps,
      targetWeight: set.targetWeight,
      targetWeightMin: set.targetWeightMin,
      targetWeightMax: set.targetWeightMax,
      targetSeconds: set.targetSeconds,
      targetDistance: set.targetDistance,
    })),
  }));

export const computeScheduledWorkoutTemplateVersion = (
  rows: TemplateExerciseSnapshotRow[],
): string =>
  createHash('sha256')
    .update(JSON.stringify(toTemplateVersionPayload(rows)))
    .digest('hex');

export const readSnapshot = async (
  scheduledWorkoutId: string,
  database?: PulseDb,
): Promise<ScheduledWorkoutSnapshot> => {
  const db = await resolveDb(database);

  const exercisesRows = db
    .select(scheduledWorkoutExerciseSelection)
    .from(scheduledWorkoutExercises)
    .where(eq(scheduledWorkoutExercises.scheduledWorkoutId, scheduledWorkoutId))
    .all()
    .sort((left, right) => {
      const sectionDelta = SECTION_RANK[left.section] - SECTION_RANK[right.section];
      if (sectionDelta !== 0) {
        return sectionDelta;
      }

      if (left.orderIndex !== right.orderIndex) {
        return left.orderIndex - right.orderIndex;
      }

      return left.id.localeCompare(right.id);
    });

  if (exercisesRows.length === 0) {
    return {
      scheduledWorkoutId,
      exercises: [],
    };
  }

  const setRows = db
    .select(scheduledWorkoutExerciseSetSelection)
    .from(scheduledWorkoutExerciseSets)
    .where(
      inArray(
        scheduledWorkoutExerciseSets.scheduledWorkoutExerciseId,
        exercisesRows.map((row) => row.id),
      ),
    )
    .all()
    .sort((left, right) => {
      if (left.scheduledWorkoutExerciseId !== right.scheduledWorkoutExerciseId) {
        return left.scheduledWorkoutExerciseId.localeCompare(right.scheduledWorkoutExerciseId);
      }

      if (left.setNumber !== right.setNumber) {
        return left.setNumber - right.setNumber;
      }

      return left.id.localeCompare(right.id);
    });

  const setsByExerciseId = new Map<string, ScheduledWorkoutSnapshotSet[]>();
  for (const setRow of setRows) {
    const existing = setsByExerciseId.get(setRow.scheduledWorkoutExerciseId) ?? [];
    existing.push(setRow);
    setsByExerciseId.set(setRow.scheduledWorkoutExerciseId, existing);
  }

  return {
    scheduledWorkoutId,
    exercises: exercisesRows.map((exerciseRow) => ({
      ...exerciseRow,
      sets: setsByExerciseId.get(exerciseRow.id) ?? [],
    })),
  };
};

export const deleteSnapshot = async (
  scheduledWorkoutId: string,
  database?: PulseDb,
): Promise<number> => {
  const db = await resolveDb(database);
  const result = db
    .delete(scheduledWorkoutExercises)
    .where(eq(scheduledWorkoutExercises.scheduledWorkoutId, scheduledWorkoutId))
    .run();

  return result.changes;
};

export const writeSnapshot = async ({
  scheduledWorkoutId,
  templateId,
  database,
}: {
  scheduledWorkoutId: string;
  templateId: string;
  database?: PulseDb;
}): Promise<SnapshotWriteResult> => {
  const db = await resolveDb(database);

  return db.transaction((tx) => {
    const template = tx
      .select({
        id: workoutTemplates.id,
        deletedAt: workoutTemplates.deletedAt,
      })
      .from(workoutTemplates)
      .where(eq(workoutTemplates.id, templateId))
      .limit(1)
      .get();

    if (!template || template.deletedAt !== null) {
      throw new Error(`Cannot snapshot missing or deleted template: ${templateId}`);
    }

    const templateRows = tx
      .select(templateExerciseSnapshotSelection)
      .from(templateExercises)
      .where(eq(templateExercises.templateId, templateId))
      .all()
      .sort(compareTemplateExercises);

    tx.delete(scheduledWorkoutExercises)
      .where(eq(scheduledWorkoutExercises.scheduledWorkoutId, scheduledWorkoutId))
      .run();

    const templateVersion = computeScheduledWorkoutTemplateVersion(templateRows);

    const exerciseRows = templateRows.map((row) => ({
      id: randomUUID(),
      scheduledWorkoutId,
      exerciseId: row.exerciseId,
      section: row.section,
      orderIndex: row.orderIndex,
      programmingNotes: toExerciseProgrammingNotes(row),
      agentNotes: null,
      agentNotesMeta: null,
      templateCues: row.cues ?? null,
      supersetGroup: row.supersetGroup,
      tempo: row.tempo,
      restSeconds: row.restSeconds,
    }));

    if (exerciseRows.length > 0) {
      tx.insert(scheduledWorkoutExercises).values(exerciseRows).run();
    }

    const setRows = exerciseRows.flatMap((exerciseRow, index) =>
      toSnapshotSetDrafts(templateRows[index] as TemplateExerciseSnapshotRow).map((setDraft) => ({
        id: randomUUID(),
        scheduledWorkoutExerciseId: exerciseRow.id,
        setNumber: setDraft.setNumber,
        repsMin: setDraft.repsMin,
        repsMax: setDraft.repsMax,
        reps: setDraft.reps,
        targetWeight: setDraft.targetWeight,
        targetWeightMin: setDraft.targetWeightMin,
        targetWeightMax: setDraft.targetWeightMax,
        targetSeconds: setDraft.targetSeconds,
        targetDistance: setDraft.targetDistance,
      })),
    );

    if (setRows.length > 0) {
      tx.insert(scheduledWorkoutExerciseSets).values(setRows).run();
    }

    const updateResult = tx
      .update(scheduledWorkouts)
      .set({ templateVersion })
      .where(eq(scheduledWorkouts.id, scheduledWorkoutId))
      .run();

    if (updateResult.changes !== 1) {
      throw new Error(`Scheduled workout not found: ${scheduledWorkoutId}`);
    }

    return {
      templateVersion,
      exerciseCount: exerciseRows.length,
      setCount: setRows.length,
    };
  });
};

export const getSectionOrder = () => SECTION_ORDER;

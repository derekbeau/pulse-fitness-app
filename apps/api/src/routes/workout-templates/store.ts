import { randomUUID } from 'node:crypto';

import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
import type {
  CreateWorkoutTemplateInput,
  WorkoutTemplate,
  WorkoutTemplateExercise,
  WorkoutTemplateSection,
  WorkoutTemplateSectionType,
} from '@pulse/shared';

import { exercises, templateExercises, workoutTemplates } from '../../db/schema/index.js';

const SECTION_ORDER: WorkoutTemplateSectionType[] = ['warmup', 'main', 'cooldown'];

type TemplateRecord = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  tags: string[];
  createdAt: number;
  updatedAt: number;
};

type TemplateExerciseRecord = {
  id: string;
  templateId: string;
  exerciseId: string;
  exerciseName: string;
  exerciseFormCues: string[];
  orderIndex: number;
  sets: number | null;
  repsMin: number | null;
  repsMax: number | null;
  tempo: string | null;
  restSeconds: number | null;
  supersetGroup: string | null;
  section: WorkoutTemplateSectionType;
  notes: string | null;
  cues: string[] | null;
};

const templateSelection = {
  id: workoutTemplates.id,
  userId: workoutTemplates.userId,
  name: workoutTemplates.name,
  description: workoutTemplates.description,
  tags: workoutTemplates.tags,
  createdAt: workoutTemplates.createdAt,
  updatedAt: workoutTemplates.updatedAt,
};

const templateExerciseSelection = {
  id: templateExercises.id,
  templateId: templateExercises.templateId,
  exerciseId: templateExercises.exerciseId,
  exerciseName: exercises.name,
  exerciseFormCues: exercises.formCues,
  orderIndex: templateExercises.orderIndex,
  sets: templateExercises.sets,
  repsMin: templateExercises.repsMin,
  repsMax: templateExercises.repsMax,
  tempo: templateExercises.tempo,
  restSeconds: templateExercises.restSeconds,
  supersetGroup: templateExercises.supersetGroup,
  section: templateExercises.section,
  notes: templateExercises.notes,
  cues: templateExercises.cues,
};

const buildTemplateSections = (
  rows: TemplateExerciseRecord[],
): [WorkoutTemplateSection, WorkoutTemplateSection, WorkoutTemplateSection] =>
  SECTION_ORDER.map((sectionType) => ({
    type: sectionType,
    exercises: rows
      .filter((row) => row.section === sectionType)
      .sort((left, right) => left.orderIndex - right.orderIndex)
      .map<WorkoutTemplateExercise>((row) => ({
        id: row.id,
        exerciseId: row.exerciseId,
        exerciseName: row.exerciseName,
        formCues: row.exerciseFormCues ?? [],
        sets: row.sets,
        repsMin: row.repsMin,
        repsMax: row.repsMax,
        tempo: row.tempo,
        restSeconds: row.restSeconds,
        supersetGroup: row.supersetGroup,
        notes: row.notes,
        cues: row.cues ?? [],
      })),
  })) as [WorkoutTemplateSection, WorkoutTemplateSection, WorkoutTemplateSection];

const buildTemplate = (
  template: TemplateRecord,
  rows: TemplateExerciseRecord[],
): WorkoutTemplate => ({
  id: template.id,
  userId: template.userId,
  name: template.name,
  description: template.description,
  tags: template.tags,
  sections: buildTemplateSections(rows),
  createdAt: template.createdAt,
  updatedAt: template.updatedAt,
});

const flattenSections = (templateId: string, sections: CreateWorkoutTemplateInput['sections']) =>
  SECTION_ORDER.flatMap((sectionType) => {
    const section = sections.find((value) => value.type === sectionType);
    if (!section) {
      return [];
    }

    return section.exercises.map((exercise, orderIndex) => ({
      id: randomUUID(),
      templateId,
      exerciseId: exercise.exerciseId,
      orderIndex,
      sets: exercise.sets,
      repsMin: exercise.repsMin,
      repsMax: exercise.repsMax,
      tempo: exercise.tempo,
      restSeconds: exercise.restSeconds,
      supersetGroup: exercise.supersetGroup,
      section: sectionType,
      notes: exercise.notes,
      cues: exercise.cues,
    }));
  });

const findTemplateRows = async (userId: string): Promise<TemplateRecord[]> => {
  const { db } = await import('../../db/index.js');

  return db
    .select(templateSelection)
    .from(workoutTemplates)
    .where(eq(workoutTemplates.userId, userId))
    .orderBy(asc(workoutTemplates.name), asc(workoutTemplates.createdAt))
    .all();
};

const findTemplateExerciseRows = async (
  templateIds: string[],
): Promise<TemplateExerciseRecord[]> => {
  if (templateIds.length === 0) {
    return [];
  }

  const { db } = await import('../../db/index.js');

  return db
    .select(templateExerciseSelection)
    .from(templateExercises)
    .innerJoin(exercises, eq(exercises.id, templateExercises.exerciseId))
    .where(inArray(templateExercises.templateId, templateIds))
    .all();
};

export const listWorkoutTemplates = async (userId: string): Promise<WorkoutTemplate[]> => {
  const templates = await findTemplateRows(userId);
  if (templates.length === 0) {
    return [];
  }

  const exerciseRows = await findTemplateExerciseRows(templates.map((template) => template.id));

  return templates.map((template) =>
    buildTemplate(
      template,
      exerciseRows.filter((row) => row.templateId === template.id),
    ),
  );
};

export const findWorkoutTemplateById = async (
  id: string,
  userId: string,
): Promise<WorkoutTemplate | undefined> => {
  const { db } = await import('../../db/index.js');

  const template = db
    .select(templateSelection)
    .from(workoutTemplates)
    .where(and(eq(workoutTemplates.id, id), eq(workoutTemplates.userId, userId)))
    .limit(1)
    .get();

  if (!template) {
    return undefined;
  }

  const rows = db
    .select(templateExerciseSelection)
    .from(templateExercises)
    .innerJoin(exercises, eq(exercises.id, templateExercises.exerciseId))
    .where(eq(templateExercises.templateId, id))
    .all();

  return buildTemplate(template, rows);
};

export const allTemplateExercisesAccessible = async ({
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

export const createWorkoutTemplate = async ({
  id,
  userId,
  input,
}: {
  id: string;
  userId: string;
  input: CreateWorkoutTemplateInput;
}): Promise<WorkoutTemplate> => {
  const { db } = await import('../../db/index.js');
  const nestedRows = flattenSections(id, input.sections);

  db.transaction((tx) => {
    tx.insert(workoutTemplates)
      .values({
        id,
        userId,
        name: input.name,
        description: input.description,
        tags: input.tags,
      })
      .run();

    if (nestedRows.length > 0) {
      tx.insert(templateExercises).values(nestedRows).run();
    }
  });

  const createdTemplate = await findWorkoutTemplateById(id, userId);
  if (!createdTemplate) {
    throw new Error('Created workout template could not be loaded');
  }

  return createdTemplate;
};

export const updateWorkoutTemplate = async ({
  id,
  userId,
  input,
}: {
  id: string;
  userId: string;
  input: CreateWorkoutTemplateInput;
}): Promise<WorkoutTemplate | undefined> => {
  const { db } = await import('../../db/index.js');
  const nestedRows = flattenSections(id, input.sections);

  const result = db.transaction((tx) => {
    const updateResult = tx
      .update(workoutTemplates)
      .set({
        name: input.name,
        description: input.description,
        tags: input.tags,
      })
      .where(and(eq(workoutTemplates.id, id), eq(workoutTemplates.userId, userId)))
      .run();

    if (updateResult.changes !== 1) {
      return false;
    }

    tx.delete(templateExercises).where(eq(templateExercises.templateId, id)).run();

    if (nestedRows.length > 0) {
      tx.insert(templateExercises).values(nestedRows).run();
    }

    return true;
  });

  if (!result) {
    return undefined;
  }

  return findWorkoutTemplateById(id, userId);
};

export const reorderWorkoutTemplateExercises = async ({
  templateId,
  userId,
  section,
  exerciseIds,
}: {
  templateId: string;
  userId: string;
  section: WorkoutTemplateSectionType;
  exerciseIds: string[];
}): Promise<boolean> => {
  const { db } = await import('../../db/index.js');

  return db.transaction((tx) => {
    const templateExists = tx
      .select({ id: workoutTemplates.id })
      .from(workoutTemplates)
      .where(and(eq(workoutTemplates.id, templateId), eq(workoutTemplates.userId, userId)))
      .limit(1)
      .get();

    if (!templateExists) {
      return false;
    }

    for (const [orderIndex, exerciseId] of exerciseIds.entries()) {
      const updateResult = tx
        .update(templateExercises)
        .set({ orderIndex: orderIndex + exerciseIds.length })
        .where(
          and(
            eq(templateExercises.templateId, templateId),
            eq(templateExercises.id, exerciseId),
            eq(templateExercises.section, section),
          ),
        )
        .run();

      if (updateResult.changes !== 1) {
        return false;
      }
    }

    for (const [orderIndex, exerciseId] of exerciseIds.entries()) {
      const updateResult = tx
        .update(templateExercises)
        .set({ orderIndex })
        .where(
          and(
            eq(templateExercises.templateId, templateId),
            eq(templateExercises.id, exerciseId),
            eq(templateExercises.section, section),
          ),
        )
        .run();

      if (updateResult.changes !== 1) {
        return false;
      }
    }

    tx.update(workoutTemplates)
      .set({
        updatedAt: Date.now(),
      })
      .where(and(eq(workoutTemplates.id, templateId), eq(workoutTemplates.userId, userId)))
      .run();

    return true;
  });
};

export const deleteWorkoutTemplate = async (id: string, userId: string): Promise<boolean> => {
  const { db } = await import('../../db/index.js');

  const result = db
    .delete(workoutTemplates)
    .where(and(eq(workoutTemplates.id, id), eq(workoutTemplates.userId, userId)))
    .run();

  return result.changes === 1;
};

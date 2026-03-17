import type {
  AgentTemplateNewExercise,
  CreateWorkoutSessionInput,
  SessionSetInput,
  WorkoutSession,
  WorkoutTemplateSectionType,
} from '@pulse/shared';

import { autoCreateIfMissing } from './agentEnrichment.js';
import { updateOwnedExercise } from './exercises/store.js';

const SECTION_ORDER: WorkoutTemplateSectionType[] = ['warmup', 'main', 'cooldown'];
const SITUATIONAL_CUE_PATTERN =
  /\b(today|tonight|tomorrow|this week|next week|week \d+|day \d+|block|phase|cycle|mesocycle|deload|amrap|top set|backoff|back-off|drop set|rpe|rir|percent|%|heavy|light)\b/i;

const dedupeStrings = (values: string[] | undefined): string[] =>
  values ? [...new Set(values)] : [];

const classifyCues = ({ cues, formCues }: { cues?: string[]; formCues?: string[] }) => {
  const durable = [...(formCues ?? [])];
  const situational: string[] = [];

  for (const cue of cues ?? []) {
    if (SITUATIONAL_CUE_PATTERN.test(cue)) {
      situational.push(cue);
      continue;
    }

    durable.push(cue);
  }

  return {
    durable: dedupeStrings(durable),
    situational: dedupeStrings(situational),
  };
};

const inferSectionType = (name: string): WorkoutTemplateSectionType => {
  const normalized = name.trim().toLowerCase();

  if (normalized.includes('warm')) {
    return 'warmup';
  }

  if (normalized.includes('cool')) {
    return 'cooldown';
  }

  return 'main';
};

export const resolveExerciseIdByName = async ({
  name,
  userId,
  tags,
  cues,
  formCues,
}: {
  name: string;
  userId: string;
  tags?: string[];
  cues?: string[];
  formCues?: string[];
}): Promise<{
  exerciseId: string;
  newExercise: AgentTemplateNewExercise | null;
  templateCues: string[];
}> => {
  const classifiedCues = classifyCues({ cues, formCues });
  const resolvedExercise = await autoCreateIfMissing(
    'exercise',
    {
      name,
      tags,
      formCues: classifiedCues.durable,
      muscleGroups: [],
      equipment: '',
      instructions: null,
      coachingNotes: null,
      relatedExerciseIds: [],
    },
    userId,
  );

  if (!resolvedExercise.created) {
    if (resolvedExercise.entity.userId === userId && classifiedCues.durable.length > 0) {
      const mergedFormCues = dedupeStrings([
        ...(resolvedExercise.entity.formCues ?? []),
        ...classifiedCues.durable,
      ]);

      if (mergedFormCues.length !== (resolvedExercise.entity.formCues ?? []).length) {
        await updateOwnedExercise({
          id: resolvedExercise.entity.id,
          userId,
          changes: { formCues: mergedFormCues },
        });
      }
    }

    return {
      exerciseId: resolvedExercise.entity.id,
      newExercise: null,
      templateCues: classifiedCues.situational,
    };
  }

  return {
    exerciseId: resolvedExercise.entity.id,
    templateCues: classifiedCues.situational,
    newExercise: {
      id: resolvedExercise.entity.id,
      name: resolvedExercise.entity.name,
      possibleDuplicates: resolvedExercise.possibleDuplicates.map((candidate) => candidate.id),
    },
  };
};

export const buildTemplateSections = async ({
  sections,
  userId,
}: {
  sections: Array<{
    name: string;
    exercises: Array<{
      name: string;
      sets: number;
      reps: number | string;
      restSeconds?: number;
      tags?: string[];
      cues?: string[];
      formCues?: string[];
    }>;
  }>;
  userId: string;
}) => {
  const groupedByType = new Map<
    WorkoutTemplateSectionType,
    Array<{
      exerciseId: string;
      sets: number;
      repsMin: number;
      repsMax: number;
      tempo: null;
      restSeconds: number | null;
      supersetGroup: null;
      notes: null;
      cues: string[];
    }>
  >();
  groupedByType.set('warmup', []);
  groupedByType.set('main', []);
  groupedByType.set('cooldown', []);
  const newExercises: AgentTemplateNewExercise[] = [];

  const resolvedSections = await Promise.all(
    sections.map(async (section) => ({
      sectionType: inferSectionType(section.name),
      exercises: await Promise.all(
        section.exercises.map(async (exercise) => ({
          exercise,
          resolvedExercise: await resolveExerciseIdByName({
            name: exercise.name,
            userId,
            tags: exercise.tags,
            cues: exercise.cues,
            formCues: exercise.formCues,
          }),
        })),
      ),
    })),
  );

  for (const section of resolvedSections) {
    const existingExercises = groupedByType.get(section.sectionType);
    if (!existingExercises) {
      continue;
    }

    for (const { exercise, resolvedExercise } of section.exercises) {
      if (resolvedExercise.newExercise) {
        newExercises.push(resolvedExercise.newExercise);
      }

      const { repsMin, repsMax } = parseRepsInput(exercise.reps);

      existingExercises.push({
        exerciseId: resolvedExercise.exerciseId,
        sets: exercise.sets,
        repsMin,
        repsMax,
        tempo: null,
        restSeconds: exercise.restSeconds ?? null,
        supersetGroup: null,
        notes: null,
        cues: resolvedExercise.templateCues,
      });
    }
  }

  return {
    sections: SECTION_ORDER.flatMap((type) => {
      const exercises = groupedByType.get(type) ?? [];
      return exercises.length > 0 ? [{ type, exercises }] : [];
    }),
    newExercises,
  };
};

function parseRepsInput(reps: number | string): { repsMin: number; repsMax: number } {
  if (typeof reps === 'number') {
    return { repsMin: reps, repsMax: reps };
  }

  const rangeMatch = reps.match(/^(\d+)\s*-\s*(\d+)$/);
  if (rangeMatch) {
    return {
      repsMin: Number.parseInt(rangeMatch[1], 10),
      repsMax: Number.parseInt(rangeMatch[2], 10),
    };
  }

  const singleMatch = reps.match(/^(\d+)$/);
  if (singleMatch) {
    const value = Number.parseInt(singleMatch[1], 10);
    return { repsMin: value, repsMax: value };
  }

  return { repsMin: 10, repsMax: 10 };
}

export const toCreateWorkoutSessionInput = (
  session: WorkoutSession,
): CreateWorkoutSessionInput => ({
  templateId: session.templateId,
  name: session.name,
  date: session.date,
  status: session.status,
  startedAt: session.startedAt,
  completedAt: session.completedAt,
  duration: session.duration,
  timeSegments: session.timeSegments,
  feedback: session.feedback,
  notes: session.notes,
  sets: session.sets.map((set) => ({
    exerciseId: set.exerciseId,
    orderIndex: set.orderIndex ?? 0,
    setNumber: set.setNumber,
    weight: set.weight,
    reps: set.reps,
    completed: set.completed,
    skipped: set.skipped,
    section: set.section,
    notes: set.notes,
  })),
});

export const buildInitialSessionSets = (
  sections: Array<{
    type: WorkoutTemplateSectionType;
    exercises: Array<{ exerciseId: string; sets: number | null }>;
  }>,
): CreateWorkoutSessionInput['sets'] => {
  const sets: CreateWorkoutSessionInput['sets'] = [];

  for (const section of sections) {
    for (const [exerciseIndex, exercise] of section.exercises.entries()) {
      const setCount = exercise.sets ?? 1;

      for (let setNumber = 1; setNumber <= setCount; setNumber += 1) {
        sets.push({
          exerciseId: exercise.exerciseId,
          orderIndex: exerciseIndex,
          setNumber,
          weight: null,
          reps: null,
          completed: false,
          skipped: false,
          section: section.type,
          notes: null,
        });
      }
    }
  }

  return sets;
};

export const buildExerciseSectionOrder = (
  sets: CreateWorkoutSessionInput['sets'],
): Map<string, { section: WorkoutTemplateSectionType | null; orderIndex: number }> => {
  const byExerciseId = new Map<
    string,
    { section: WorkoutTemplateSectionType | null; orderIndex: number }
  >();

  for (const set of sets) {
    const existing = byExerciseId.get(set.exerciseId);
    const setOrderIndex = set.orderIndex ?? 0;

    if (!existing || setOrderIndex < existing.orderIndex) {
      byExerciseId.set(set.exerciseId, {
        section: set.section,
        orderIndex: setOrderIndex,
      });
    }
  }

  return byExerciseId;
};

export const reorderSessionSetsByExercise = (
  sets: CreateWorkoutSessionInput['sets'],
  reorderExerciseIds: string[],
) => {
  const exerciseOrder = buildExerciseSectionOrder(sets);
  const existingBySection = new Map<WorkoutTemplateSectionType | null, string[]>();

  for (const [exerciseId, metadata] of exerciseOrder.entries()) {
    const current = existingBySection.get(metadata.section) ?? [];
    current.push(exerciseId);
    existingBySection.set(metadata.section, current);
  }

  for (const [section, exerciseIds] of existingBySection.entries()) {
    exerciseIds.sort((left, right) => {
      const leftOrder = exerciseOrder.get(left)?.orderIndex ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = exerciseOrder.get(right)?.orderIndex ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return left.localeCompare(right);
    });
    existingBySection.set(section, exerciseIds);
  }

  const reorderedBySection = new Map<WorkoutTemplateSectionType | null, string[]>();

  for (const exerciseId of reorderExerciseIds) {
    const metadata = exerciseOrder.get(exerciseId);
    if (!metadata) {
      continue;
    }

    const sectionExerciseIds = reorderedBySection.get(metadata.section) ?? [];
    if (!sectionExerciseIds.includes(exerciseId)) {
      sectionExerciseIds.push(exerciseId);
      reorderedBySection.set(metadata.section, sectionExerciseIds);
    }
  }

  for (const [section, currentIds] of existingBySection.entries()) {
    const preferred = reorderedBySection.get(section) ?? [];
    reorderedBySection.set(section, [
      ...preferred,
      ...currentIds.filter((exerciseId) => !preferred.includes(exerciseId)),
    ]);
  }

  const nextOrderIndexByExerciseId = new Map<string, number>();
  for (const exerciseIds of reorderedBySection.values()) {
    exerciseIds.forEach((exerciseId, index) => {
      nextOrderIndexByExerciseId.set(exerciseId, index);
    });
  }

  return sets.map((set) => ({
    ...set,
    orderIndex: nextOrderIndexByExerciseId.get(set.exerciseId) ?? set.orderIndex ?? 0,
  }));
};

export const applyExerciseNotesToSets = ({
  sets,
  exerciseNotes,
}: {
  sets: SessionSetInput[];
  exerciseNotes: Record<string, string | null>;
}) => {
  const firstSetIndexByExerciseId = new Map<string, number>();

  sets.forEach((set, index) => {
    const existingIndex = firstSetIndexByExerciseId.get(set.exerciseId);
    if (existingIndex === undefined) {
      firstSetIndexByExerciseId.set(set.exerciseId, index);
      return;
    }

    const existingSet = sets[existingIndex];
    if (!existingSet) {
      return;
    }

    if (set.setNumber < existingSet.setNumber) {
      firstSetIndexByExerciseId.set(set.exerciseId, index);
    }
  });

  return sets.map((set, index) => {
    const nextExerciseNote = exerciseNotes[set.exerciseId];

    if (
      firstSetIndexByExerciseId.get(set.exerciseId) !== index ||
      !Object.hasOwn(exerciseNotes, set.exerciseId) ||
      nextExerciseNote === null
    ) {
      return set;
    }

    return {
      ...set,
      notes: nextExerciseNote,
    };
  });
};

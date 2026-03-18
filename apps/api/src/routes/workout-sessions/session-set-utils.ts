import type {
  CreateWorkoutSessionInput,
  SessionSetInput,
  WorkoutTemplateSectionType,
} from '@pulse/shared';

export const buildInitialSessionSets = (
  sections: Array<{
    type: WorkoutTemplateSectionType;
    exercises: Array<{ exerciseId: string; sets: number | null; supersetGroup?: string | null }>;
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
          supersetGroup: exercise.supersetGroup ?? null,
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

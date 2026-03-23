import type {
  CreateWorkoutSessionInput,
  SessionSetInput,
  WorkoutTemplateSectionType,
} from '@pulse/shared';

export const toExerciseSectionKey = (
  exerciseId: string,
  section: WorkoutTemplateSectionType | null,
) => `${exerciseId}::${section}`;

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
    const key = toExerciseSectionKey(set.exerciseId, set.section);
    const existing = byExerciseId.get(key);
    const setOrderIndex = set.orderIndex ?? 0;

    if (!existing || setOrderIndex < existing.orderIndex) {
      byExerciseId.set(key, {
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

  for (const [exerciseSectionKey, metadata] of exerciseOrder.entries()) {
    const current = existingBySection.get(metadata.section) ?? [];
    current.push(exerciseSectionKey);
    existingBySection.set(metadata.section, current);
  }

  for (const [section, exerciseSectionKeys] of existingBySection.entries()) {
    exerciseSectionKeys.sort((left, right) => {
      const leftOrder = exerciseOrder.get(left)?.orderIndex ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = exerciseOrder.get(right)?.orderIndex ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return left.localeCompare(right);
    });
    existingBySection.set(section, exerciseSectionKeys);
  }

  const reorderedBySection = new Map<WorkoutTemplateSectionType | null, string[]>();

  for (const exerciseId of reorderExerciseIds) {
    for (const [exerciseSectionKey, metadata] of exerciseOrder.entries()) {
      if (!exerciseSectionKey.startsWith(`${exerciseId}::`)) {
        continue;
      }

      const sectionExerciseKeys = reorderedBySection.get(metadata.section) ?? [];
      if (!sectionExerciseKeys.includes(exerciseSectionKey)) {
        sectionExerciseKeys.push(exerciseSectionKey);
        reorderedBySection.set(metadata.section, sectionExerciseKeys);
      }
    }
  }

  for (const [section, currentExerciseSectionKeys] of existingBySection.entries()) {
    const preferred = reorderedBySection.get(section) ?? [];
    reorderedBySection.set(section, [
      ...preferred,
      ...currentExerciseSectionKeys.filter((exerciseSectionKey) => !preferred.includes(exerciseSectionKey)),
    ]);
  }

  const nextOrderIndexByExerciseSectionKey = new Map<string, number>();
  for (const exerciseSectionKeys of reorderedBySection.values()) {
    exerciseSectionKeys.forEach((exerciseSectionKey, index) => {
      nextOrderIndexByExerciseSectionKey.set(exerciseSectionKey, index);
    });
  }

  return sets.map((set) => ({
    ...set,
    orderIndex:
      nextOrderIndexByExerciseSectionKey.get(toExerciseSectionKey(set.exerciseId, set.section)) ??
      set.orderIndex ??
      0,
  }));
};

export const applyExerciseNotesToSets = ({
  sets,
  exerciseNotes,
}: {
  sets: SessionSetInput[];
  exerciseNotes: Record<string, string | null>;
}) => {
  const firstSetIndexByExerciseSectionKey = new Map<string, number>();

  sets.forEach((set, index) => {
    const exerciseSectionKey = toExerciseSectionKey(set.exerciseId, set.section);
    const existingIndex = firstSetIndexByExerciseSectionKey.get(exerciseSectionKey);
    if (existingIndex === undefined) {
      firstSetIndexByExerciseSectionKey.set(exerciseSectionKey, index);
      return;
    }

    const existingSet = sets[existingIndex];
    if (!existingSet) {
      return;
    }

    if (set.setNumber < existingSet.setNumber) {
      firstSetIndexByExerciseSectionKey.set(exerciseSectionKey, index);
    }
  });

  return sets.map((set, index) => {
    const nextExerciseNote = exerciseNotes[set.exerciseId];
    const exerciseSectionKey = toExerciseSectionKey(set.exerciseId, set.section);

    if (
      firstSetIndexByExerciseSectionKey.get(exerciseSectionKey) !== index ||
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

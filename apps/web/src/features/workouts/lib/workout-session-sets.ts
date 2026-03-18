import type { WorkoutTemplate } from '@pulse/shared';

export function buildInitialSessionSets(template: WorkoutTemplate) {
  return template.sections.flatMap((section) =>
    section.exercises.flatMap((exercise, exerciseIndex) => {
      if (exercise.sets === null || exercise.sets < 1) {
        return [];
      }

      return Array.from({ length: exercise.sets }, (_, index) => {
        const target = exercise.setTargets?.find((entry) => entry.setNumber === index + 1);
        const targetValues =
          target !== undefined
            ? Object.fromEntries(
                Object.entries({
                  targetDistance: target.targetDistance,
                  targetSeconds: target.targetSeconds,
                  targetWeight: target.targetWeight,
                  targetWeightMax: target.targetWeightMax,
                  targetWeightMin: target.targetWeightMin,
                }).filter(([, value]) => value !== undefined && value !== null),
              )
            : {};

        return {
          ...targetValues,
          exerciseId: exercise.exerciseId,
          orderIndex: exerciseIndex,
          reps: null,
          section: section.type,
          setNumber: index + 1,
          supersetGroup: exercise.supersetGroup ?? null,
          weight: null,
        };
      });
    }),
  );
}

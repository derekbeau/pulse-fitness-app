import type { WorkoutTemplate } from '@pulse/shared';

export function buildInitialSessionSets(template: WorkoutTemplate) {
  return template.sections.flatMap((section) =>
    section.exercises.flatMap((exercise, exerciseIndex) => {
      if (exercise.sets === null || exercise.sets < 1) {
        return [];
      }

      return Array.from({ length: exercise.sets }, (_, index) => ({
        ...(exercise.setTargets?.find((target) => target.setNumber === index + 1) ?? {}),
        exerciseId: exercise.exerciseId,
        orderIndex: exerciseIndex,
        reps: null,
        section: section.type,
        setNumber: index + 1,
        weight: null,
      }));
    }),
  );
}

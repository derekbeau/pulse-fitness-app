import {
  mockExercises,
  type WorkoutTemplate,
  type WorkoutTemplateExercise,
} from '@/lib/mock-data/workouts';

import type {
  ActiveWorkoutExercise,
  ActiveWorkoutSection,
  ActiveWorkoutSessionData,
  ActiveWorkoutSet,
} from '../types';

const exerciseById = new Map(mockExercises.map((exercise) => [exercise.id, exercise]));

export function createWorkoutSetId(exerciseId: string, setNumber: number) {
  return `${exerciseId}:set-${setNumber}`;
}

export function buildActiveWorkoutSession(
  template: WorkoutTemplate,
  completedSetIds: ReadonlySet<string>,
): ActiveWorkoutSessionData {
  const sections = template.sections.map((section): ActiveWorkoutSection => {
    const exercises = section.exercises.map((templateExercise): ActiveWorkoutExercise => {
      const exercise = exerciseById.get(templateExercise.exerciseId);

      return {
        badges: templateExercise.badges,
        category: exercise?.category ?? 'compound',
        completedSets: countCompletedSets(templateExercise, completedSetIds),
        exerciseId: templateExercise.exerciseId,
        id: templateExercise.exerciseId,
        name: exercise?.name ?? 'Unknown Exercise',
        reps: templateExercise.reps,
        sets: buildActiveWorkoutSets(templateExercise, completedSetIds),
        targetSets: templateExercise.sets,
      };
    });

    return {
      exercises,
      id: section.type,
      title: section.title,
      type: section.type,
    };
  });

  const flatExercises = sections.flatMap((section) => section.exercises);
  const totalSets = flatExercises.reduce((count, exercise) => count + exercise.targetSets, 0);
  const completedSets = flatExercises.reduce((count, exercise) => count + exercise.completedSets, 0);
  const currentExerciseIndex = flatExercises.findIndex(
    (exercise) => exercise.completedSets < exercise.targetSets,
  );

  return {
    completedSets,
    currentExercise:
      currentExerciseIndex === -1 ? Math.max(flatExercises.length, 1) : currentExerciseIndex + 1,
    currentExerciseId:
      currentExerciseIndex === -1 ? flatExercises.at(-1)?.id ?? null : flatExercises[currentExerciseIndex]?.id ?? null,
    sections,
    totalExercises: flatExercises.length,
    totalSets,
    workoutName: template.name,
  };
}

function countCompletedSets(
  templateExercise: WorkoutTemplateExercise,
  completedSetIds: ReadonlySet<string>,
) {
  return buildActiveWorkoutSets(templateExercise, completedSetIds).filter((set) => set.completed).length;
}

function buildActiveWorkoutSets(
  templateExercise: WorkoutTemplateExercise,
  completedSetIds: ReadonlySet<string>,
): ActiveWorkoutSet[] {
  return Array.from({ length: templateExercise.sets }, (_, index) => {
    const number = index + 1;
    const id = createWorkoutSetId(templateExercise.exerciseId, number);

    return {
      id,
      completed: completedSetIds.has(id),
      label: templateExercise.reps,
      number,
    };
  });
}

import {
  mockExercises,
  type WorkoutSession,
  type WorkoutTemplate,
  type WorkoutTemplateExercise,
} from '@/lib/mock-data/workouts';

import type {
  ActiveWorkoutEnhancedExercise,
  ActiveWorkoutExercise,
  ActiveWorkoutLastPerformance,
  ActiveWorkoutSection,
  ActiveWorkoutSessionData,
  ActiveWorkoutSet,
  ActiveWorkoutSetDrafts,
} from '../types';
import { workoutEnhancedExercises } from './mock-data';

const exerciseById = new Map(mockExercises.map((exercise) => [exercise.id, exercise]));
const sampleWeightByExerciseId = new Map<string, number>([
  ['incline-dumbbell-press', 60],
  ['seated-dumbbell-shoulder-press', 40],
  ['seated-machine-chest-press', 120],
  ['cable-lateral-raise', 15],
  ['rope-triceps-pushdown', 42.5],
  ['high-bar-back-squat', 205],
  ['leg-press', 270],
  ['leg-extension', 95],
  ['romanian-deadlift', 185],
  ['lat-pulldown', 130],
  ['chest-supported-row', 110],
]);
const enhancedExerciseById = new Map<string, ActiveWorkoutEnhancedExercise>(
  workoutEnhancedExercises.map((exercise) => [exercise.exerciseId, exercise]),
);

export function createWorkoutSetId(exerciseId: string, setNumber: number) {
  return `${exerciseId}:set-${setNumber}`;
}

type BuildActiveWorkoutSessionOptions = {
  exerciseNotes?: Record<string, string>;
  sessionStartedAt?: Date | string;
  sessions?: WorkoutSession[];
};

export function buildActiveWorkoutSession(
  template: WorkoutTemplate,
  setDrafts: ActiveWorkoutSetDrafts,
  options: BuildActiveWorkoutSessionOptions = {},
): ActiveWorkoutSessionData {
  const { exerciseNotes = {}, sessionStartedAt = new Date().toISOString(), sessions } = options;
  const sections = template.sections.map((section): ActiveWorkoutSection => {
    const exercises = section.exercises.map((templateExercise): ActiveWorkoutExercise => {
      const exercise = exerciseById.get(templateExercise.exerciseId);
      const enhancedExercise = enhancedExerciseById.get(templateExercise.exerciseId);
      const sets = getWorkoutSets(templateExercise, setDrafts);
      const completedSets = sets.filter((set) => set.completed).length;

      return {
        badges: templateExercise.badges,
        category: exercise?.category ?? 'compound',
        completedSets,
        formCues: enhancedExercise?.formCues ?? null,
        id: templateExercise.exerciseId,
        injuryCues: enhancedExercise?.injuryCues ?? [],
        lastPerformance: sessions
          ? getLastPerformance(templateExercise.exerciseId, sessionStartedAt, sessions)
          : (enhancedExercise?.lastPerformance ?? null),
        name: exercise?.name ?? 'Unknown Exercise',
        notes: exerciseNotes[templateExercise.exerciseId] ?? '',
        phaseBadge: enhancedExercise?.phaseBadge ?? 'moderate',
        prescribedReps: templateExercise.reps,
        priority: enhancedExercise?.priority ?? 'required',
        restSeconds: templateExercise.restSeconds,
        reversePyramid: enhancedExercise?.reversePyramid ?? [],
        sets,
        supersetGroup: enhancedExercise?.supersetGroup ?? null,
        targetSets: sets.length,
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
  const completedSets = flatExercises.reduce(
    (count, exercise) => count + exercise.completedSets,
    0,
  );
  const currentExerciseIndex = flatExercises.findIndex(
    (exercise) => exercise.completedSets < exercise.targetSets,
  );

  return {
    completedSets,
    currentExercise:
      currentExerciseIndex === -1 ? Math.max(flatExercises.length, 1) : currentExerciseIndex + 1,
    currentExerciseId:
      currentExerciseIndex === -1
        ? (flatExercises.at(-1)?.id ?? null)
        : (flatExercises[currentExerciseIndex]?.id ?? null),
    sections,
    totalExercises: flatExercises.length,
    totalSets,
    workoutName: template.name,
  };
}

export function createInitialWorkoutSetDrafts(
  template: WorkoutTemplate,
  completedSetIds: ReadonlySet<string>,
): ActiveWorkoutSetDrafts {
  return Object.fromEntries(
    template.sections.flatMap((section) =>
      section.exercises.map((templateExercise) => [
        templateExercise.exerciseId,
        Array.from({ length: templateExercise.sets }, (_, index) =>
          createWorkoutSetDraft(
            templateExercise,
            index + 1,
            completedSetIds.has(createWorkoutSetId(templateExercise.exerciseId, index + 1)),
          ),
        ),
      ]),
    ),
  );
}

export function createWorkoutSetDraft(
  templateExercise: WorkoutTemplateExercise,
  setNumber: number,
  completed = false,
): ActiveWorkoutSet {
  const exerciseId = templateExercise.exerciseId;

  return {
    id: createWorkoutSetId(exerciseId, setNumber),
    completed,
    number: setNumber,
    reps: completed ? getInitialRepsValue(templateExercise.reps) : null,
    weight: completed ? (sampleWeightByExerciseId.get(exerciseId) ?? null) : null,
  };
}

function getWorkoutSets(
  templateExercise: WorkoutTemplateExercise,
  setDrafts: ActiveWorkoutSetDrafts,
) {
  return [...(setDrafts[templateExercise.exerciseId] ?? [])].sort(
    (left, right) => left.number - right.number,
  );
}

function getLastPerformance(
  exerciseId: string,
  sessionStartedAt: Date | string,
  sessions: WorkoutSession[],
): ActiveWorkoutLastPerformance | null {
  const parsedStartTime = new Date(sessionStartedAt).getTime();
  const currentStartedAt = Number.isNaN(parsedStartTime)
    ? Number.POSITIVE_INFINITY
    : parsedStartTime;

  const previousSession = [...sessions]
    .sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime())
    .find(
      (session) =>
        session.status === 'completed' &&
        new Date(session.startedAt).getTime() < currentStartedAt &&
        session.exercises.some((exercise) => exercise.exerciseId === exerciseId),
    );

  if (!previousSession) {
    return null;
  }

  const exerciseLog = previousSession.exercises.find(
    (exercise) => exercise.exerciseId === exerciseId,
  );

  if (!exerciseLog) {
    return null;
  }

  return {
    date: previousSession.startedAt.slice(0, 10),
    sessionId: previousSession.id,
    sets: exerciseLog.sets.map((set) => ({
      completed: set.completed,
      reps: set.reps,
      setNumber: set.setNumber,
      weight: set.weight ?? null,
    })),
  };
}

function getInitialRepsValue(reps: string) {
  const match = reps.match(/\d+/);

  return match ? Number(match[0]) : null;
}

export function countCompletedReps(setDrafts: ActiveWorkoutSetDrafts) {
  return Object.values(setDrafts)
    .flat()
    .reduce((total, set) => total + (set.completed ? (set.reps ?? 0) : 0), 0);
}

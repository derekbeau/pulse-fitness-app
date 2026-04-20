import type { ExerciseTrackingType } from '@pulse/shared';

import type {
  ActiveWorkoutEnhancedExercise,
  ActiveWorkoutExercise,
  ActiveWorkoutHistoricalSession,
  ActiveWorkoutLastPerformance,
  ActiveWorkoutSection,
  ActiveWorkoutSessionData,
  ActiveWorkoutSet,
  ActiveWorkoutSetDrafts,
  ActiveWorkoutTemplate,
  ActiveWorkoutTemplateExercise,
} from '../types';
import { startCase } from './start-case';
import { isWeightedTrackingType, parsePrescribedRepsValue, resolveTrackingType } from './tracking';
import { workoutEnhancedExercises } from './mock-data';

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
  exerciseSupersetOverrides?: Record<string, string | null>;
  exerciseOrderBySection?: Partial<Record<ActiveWorkoutSection['type'], string[]>>;
  exerciseNotes?: Record<string, string>;
  sessionStartedAt?: Date | string;
  sessions?: ActiveWorkoutHistoricalSession[];
};

type TemplateExerciseMetadata = {
  formCues?: string[] | null;
  coachingNotes?: string | null;
  instructions?: string | null;
};

type WorkoutTemplateExerciseWithMetadata = ActiveWorkoutTemplateExercise & {
  agentNotes?: string | null;
  agentNotesMeta?: ActiveWorkoutTemplateExercise['agentNotesMeta'];
  exercise?: TemplateExerciseMetadata | null;
  programmingNotes?: string | null;
};

export function buildActiveWorkoutSession(
  template: ActiveWorkoutTemplate,
  setDrafts: ActiveWorkoutSetDrafts,
  options: BuildActiveWorkoutSessionOptions = {},
): ActiveWorkoutSessionData {
  const {
    exerciseSupersetOverrides = {},
    exerciseOrderBySection,
    exerciseNotes = {},
    sessionStartedAt = new Date().toISOString(),
    sessions,
  } = options;
  const sections = template.sections.map((section): ActiveWorkoutSection => {
    const orderedTemplateExercises = sortTemplateExercisesByOrder(
      section.exercises,
      exerciseOrderBySection?.[section.type],
    );
    const exercises = orderedTemplateExercises.map((templateExercise): ActiveWorkoutExercise => {
      const templateExerciseWithMetadata = templateExercise as WorkoutTemplateExerciseWithMetadata;
      const enhancedExercise = enhancedExerciseById.get(templateExercise.exerciseId);
      const fallbackExerciseName =
        templateExercise.exerciseName ?? startCase(templateExercise.exerciseId);
      const trackingType = resolveTrackingType({
        category: enhancedExercise?.category,
        exerciseId: templateExercise.exerciseId,
        exerciseName: enhancedExercise?.name ?? fallbackExerciseName,
        prescribedReps: templateExercise.reps,
        trackingType: templateExercise.trackingType,
      });
      const sets = getWorkoutSets(templateExercise, setDrafts);
      const completedSets = sets.filter((set) => set.completed).length;

      return {
        badges: templateExercise.badges,
        agentNotes: templateExerciseWithMetadata.agentNotes ?? null,
        agentNotesMeta: templateExerciseWithMetadata.agentNotesMeta ?? null,
        category: enhancedExercise?.category ?? 'compound',
        coachingNotes: templateExerciseWithMetadata.exercise?.coachingNotes ?? null,
        completedSets,
        formCues:
          templateExerciseWithMetadata.exercise?.formCues ?? templateExercise.formCues ?? [],
        templateCues: templateExercise.templateCues ?? [],
        id: templateExercise.exerciseId,
        injuryCues: enhancedExercise?.injuryCues ?? [],
        instructions: templateExerciseWithMetadata.exercise?.instructions ?? null,
        lastPerformance: sessions
          ? getLastPerformance(templateExercise.exerciseId, sessionStartedAt, sessions)
          : (enhancedExercise?.lastPerformance ?? null),
        name: enhancedExercise?.name ?? fallbackExerciseName,
        notes: exerciseNotes[templateExercise.exerciseId] ?? '',
        phaseBadge: enhancedExercise?.phaseBadge ?? 'moderate',
        programmingNotes: templateExerciseWithMetadata.programmingNotes ?? null,
        prescribedReps: templateExercise.reps,
        prescribedSets: templateExercise.sets,
        priority: enhancedExercise?.priority ?? 'required',
        restSeconds: templateExercise.restSeconds,
        reversePyramid: enhancedExercise?.reversePyramid ?? [],
        sets,
        supersetGroup:
          exerciseSupersetOverrides[templateExercise.exerciseId] ??
          templateExercise.supersetGroup ??
          enhancedExercise?.supersetGroup ??
          null,
        tempo: templateExercise.tempo ?? null,
        targetSets: sets.length,
        trackingType,
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

function sortTemplateExercisesByOrder(
  exercises: ActiveWorkoutTemplate['sections'][number]['exercises'],
  orderedExerciseIds: string[] | undefined,
) {
  if (!orderedExerciseIds || orderedExerciseIds.length === 0) {
    return exercises;
  }

  const orderIndexByExerciseId = new Map(
    orderedExerciseIds.map((exerciseId, index) => [exerciseId, index]),
  );

  return [...exercises].sort((left, right) => {
    const leftIndex = orderIndexByExerciseId.get(left.exerciseId) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = orderIndexByExerciseId.get(right.exerciseId) ?? Number.MAX_SAFE_INTEGER;

    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }

    return left.exerciseId.localeCompare(right.exerciseId);
  });
}

export function createInitialWorkoutSetDrafts(
  template: ActiveWorkoutTemplate,
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
  templateExercise: ActiveWorkoutTemplateExercise,
  setNumber: number,
  completed = false,
): ActiveWorkoutSet {
  const exerciseId = templateExercise.exerciseId;
  const enhancedExercise = enhancedExerciseById.get(exerciseId);
  const fallbackExerciseName = templateExercise.exerciseName ?? startCase(exerciseId);
  const trackingType = resolveTrackingType({
    category: enhancedExercise?.category,
    exerciseId,
    exerciseName: enhancedExercise?.name ?? fallbackExerciseName,
    prescribedReps: templateExercise.reps,
    trackingType: templateExercise.trackingType,
  });
  const initialValue = completed ? parsePrescribedRepsValue(templateExercise.reps) : null;

  return {
    id: createWorkoutSetId(exerciseId, setNumber),
    completed,
    distance: trackingType === 'distance' ? initialValue : null,
    number: setNumber,
    reps: shouldSeedReps(trackingType) ? initialValue : null,
    seconds: shouldSeedSeconds(trackingType) ? initialValue : null,
    targetDistance: null,
    targetSeconds: null,
    targetWeight: null,
    targetWeightMax: null,
    targetWeightMin: null,
    weight:
      completed && isWeightedTrackingType(trackingType)
        ? (sampleWeightByExerciseId.get(exerciseId) ?? null)
        : null,
  };
}

function getWorkoutSets(
  templateExercise: ActiveWorkoutTemplateExercise,
  setDrafts: ActiveWorkoutSetDrafts,
) {
  return [...(setDrafts[templateExercise.exerciseId] ?? [])].sort(
    (left, right) => left.number - right.number,
  );
}

function getLastPerformance(
  exerciseId: string,
  sessionStartedAt: Date | string,
  sessions: ActiveWorkoutHistoricalSession[],
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

export function countCompletedReps(setDrafts: ActiveWorkoutSetDrafts) {
  // Note: For time-based exercises, `set.reps` may contain bridged seconds data
  // (see getSetSeconds fallback). This aggregate is only used for progress UI.
  return Object.values(setDrafts)
    .flat()
    .reduce((total, set) => total + (set.completed ? (set.reps ?? 0) : 0), 0);
}

function shouldSeedReps(trackingType: ExerciseTrackingType) {
  return (
    trackingType === 'weight_reps' ||
    trackingType === 'bodyweight_reps' ||
    trackingType === 'reps_only' ||
    trackingType === 'reps_seconds'
  );
}

function shouldSeedSeconds(trackingType: ExerciseTrackingType) {
  return (
    trackingType === 'weight_seconds' ||
    trackingType === 'reps_seconds' ||
    trackingType === 'seconds_only' ||
    trackingType === 'cardio'
  );
}

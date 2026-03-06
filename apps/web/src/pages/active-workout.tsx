import { useRef, useState } from 'react';

import {
  SessionExerciseList,
  SessionHeader,
  buildActiveWorkoutSession,
  createInitialWorkoutSetDrafts,
  createWorkoutSetDraft,
  createWorkoutSetId,
  type ActiveWorkoutSetDrafts,
} from '@/features/workouts';
import { mockTemplates } from '@/lib/mock-data/workouts';

const activeTemplate = mockTemplates.find((template) => template.id === 'upper-push');
const completedSetIds = [
  createWorkoutSetId('row-erg', 1),
  createWorkoutSetId('banded-shoulder-external-rotation', 1),
  createWorkoutSetId('banded-shoulder-external-rotation', 2),
  createWorkoutSetId('incline-dumbbell-press', 1),
  createWorkoutSetId('incline-dumbbell-press', 2),
];
const templateExerciseById = activeTemplate
  ? new Map(
      activeTemplate.sections.flatMap((section) =>
        section.exercises.map((exercise) => [exercise.exerciseId, exercise]),
      ),
    )
  : new Map();

type RestTimerState = {
  duration: number;
  exerciseName: string;
  setNumber: number;
  token: number;
};

export function ActiveWorkoutPage() {
  const [startTime] = useState(() => new Date(Date.now() - 16 * 60_000 - 23_000).toISOString());
  const [setDrafts, setSetDrafts] = useState<ActiveWorkoutSetDrafts>(() =>
    activeTemplate
      ? createInitialWorkoutSetDrafts(activeTemplate, new Set(completedSetIds))
      : {},
  );
  const [restTimer, setRestTimer] = useState<RestTimerState | null>(null);
  const [restTimerTargetSetId, setRestTimerTargetSetId] = useState<string | null>(null);
  const [focusSetId, setFocusSetId] = useState<string | null>(null);
  const restTimerTokenRef = useRef(0);

  if (!activeTemplate) {
    return null;
  }

  const template = activeTemplate;
  const session = buildActiveWorkoutSession(template, setDrafts);

  return (
    <section className="space-y-5 pb-8">
      <SessionHeader
        className="sticky top-4 z-20"
        completedSets={session.completedSets}
        currentExercise={session.currentExercise}
        startTime={startTime}
        totalExercises={session.totalExercises}
        totalSets={session.totalSets}
        workoutName={session.workoutName}
      />

      <SessionExerciseList
        focusSetId={focusSetId}
        onAddSet={handleAddSet}
        onFocusSetHandled={() => setFocusSetId(null)}
        onRestTimerComplete={() => {
          setRestTimer(null);
          setFocusSetId(restTimerTargetSetId);
          setRestTimerTargetSetId(null);
        }}
        onSetUpdate={handleSetUpdate}
        restTimer={restTimer}
        session={session}
      />
    </section>
  );

  function handleAddSet(exerciseId: string) {
    const templateExercise = templateExerciseById.get(exerciseId);

    if (!templateExercise) {
      return;
    }

    let nextSetId: string | null = null;

    setSetDrafts((current) => {
      const exerciseSets = current[exerciseId] ?? [];
      const nextSet = createWorkoutSetDraft(templateExercise, exerciseSets.length + 1);
      nextSetId = nextSet.id;

      return {
        ...current,
        [exerciseId]: [...exerciseSets, nextSet],
      };
    });

    setRestTimer(null);
    setRestTimerTargetSetId(null);
    setFocusSetId(nextSetId);
  }

  function handleSetUpdate(
    exerciseId: string,
    setId: string,
    update: { completed?: boolean; reps?: number | null; weight?: number | null },
  ) {
    let nextDrafts: ActiveWorkoutSetDrafts | null = null;
    let nextRestTimer: RestTimerState | null = null;
    let nextTargetSetId: string | null = null;
    let shouldClearTimer = false;

    setSetDrafts((current) => {
      const exerciseSets = current[exerciseId] ?? [];
      const updatedSets = exerciseSets.map((set) =>
        set.id === setId
          ? {
              ...set,
              ...update,
            }
          : set,
      );

      nextDrafts = {
        ...current,
        [exerciseId]: updatedSets,
      };

      const previousSet = exerciseSets.find((set) => set.id === setId);
      const updatedSet = updatedSets.find((set) => set.id === setId);
      const templateExercise = templateExerciseById.get(exerciseId);

      if (!previousSet || !updatedSet || !templateExercise) {
        return nextDrafts;
      }

      if (update.completed === false) {
        shouldClearTimer = true;
        return nextDrafts;
      }

      if (previousSet.completed || !updatedSet.completed) {
        return nextDrafts;
      }

      const updatedSession = buildActiveWorkoutSession(template, nextDrafts);
      nextTargetSetId = findNextPendingSetId(updatedSession);

      if (!nextTargetSetId) {
        shouldClearTimer = true;
        return nextDrafts;
      }

      nextRestTimer = {
        duration: templateExercise.restSeconds,
        exerciseName:
          updatedSession.sections
            .flatMap((section) => section.exercises)
            .find((exercise) => exercise.id === exerciseId)?.name ?? 'Next set',
        setNumber: updatedSet.number,
        token: ++restTimerTokenRef.current,
      };

      return nextDrafts;
    });

    if (!nextDrafts || shouldClearTimer) {
      setRestTimer(null);
      setRestTimerTargetSetId(null);
      setFocusSetId(null);
      return;
    }

    if (nextRestTimer) {
      setRestTimer(nextRestTimer);
      setRestTimerTargetSetId(nextTargetSetId);
      setFocusSetId(null);
    }
  }
}

function findNextPendingSetId(session: ReturnType<typeof buildActiveWorkoutSession>) {
  for (const section of session.sections) {
    for (const exercise of section.exercises) {
      const nextSet = exercise.sets.find((set) => !set.completed);

      if (nextSet) {
        return nextSet.id;
      }
    }
  }

  return null;
}

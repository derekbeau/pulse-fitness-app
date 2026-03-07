import { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import {
  SessionContext,
  SessionExerciseList,
  SessionFeedback,
  SessionHeader,
  SessionSummary,
  SupplementalMenu,
  buildActiveWorkoutSession,
  countCompletedReps,
  createInitialWorkoutSetDrafts,
  createWorkoutSetDraft,
  createWorkoutSetId,
  workoutCompletedSessions,
  workoutFeedbackFields,
  workoutSessionContext,
  workoutSupplementalExercises,
  type ActiveWorkoutFeedbackDraft,
  type ActiveWorkoutSetDrafts,
} from '@/features/workouts';
import { mockTemplates } from '@/lib/mock-data/workouts';

const defaultTemplate =
  mockTemplates.find((template) => template.id === 'upper-push') ??
  (() => {
    throw new Error('Expected upper-push template in mock data.');
  })();

const completedSetIds = [
  createWorkoutSetId('row-erg', 1),
  createWorkoutSetId('banded-shoulder-external-rotation', 1),
  createWorkoutSetId('banded-shoulder-external-rotation', 2),
  createWorkoutSetId('incline-dumbbell-press', 1),
  createWorkoutSetId('incline-dumbbell-press', 2),
];

type RestTimerState = {
  duration: number;
  exerciseName: string;
  setNumber: number;
  token: number;
};

export function ActiveWorkoutPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selectedTemplate = mockTemplates.find(
    (template) => template.id === searchParams.get('template'),
  );
  const template = selectedTemplate ?? defaultTemplate;
  const [startTime] = useState(() => new Date(Date.now() - 16 * 60_000 - 23_000).toISOString());
  const [setDrafts, setSetDrafts] = useState<ActiveWorkoutSetDrafts>(() =>
    createInitialWorkoutSetDrafts(
      template,
      selectedTemplate ? new Set<string>() : new Set(completedSetIds),
    ),
  );
  const [exerciseNotes, setExerciseNotes] = useState<Record<string, string>>({});
  const [stage, setStage] = useState<'active' | 'feedback' | 'summary'>('active');
  const [sessionCompletedAt, setSessionCompletedAt] = useState<string | null>(null);
  const [sessionFeedback, setSessionFeedback] = useState<ActiveWorkoutFeedbackDraft>([]);
  const [restTimer, setRestTimer] = useState<RestTimerState | null>(null);
  const [restTimerTargetSetId, setRestTimerTargetSetId] = useState<string | null>(null);
  const [focusSetId, setFocusSetId] = useState<string | null>(null);
  const [supplementalChecks, setSupplementalChecks] = useState<Record<string, boolean>>({});
  const restTimerTokenRef = useRef(0);
  const supplementalExercises =
    workoutCompletedSessions.find((session) => session.templateId === template.id)?.supplemental ??
    workoutSupplementalExercises;

  const templateExerciseById = useMemo(
    () =>
      new Map(
        template.sections.flatMap((section) =>
          section.exercises.map((exercise) => [exercise.exerciseId, exercise]),
        ),
      ),
    [template],
  );
  const session = useMemo(
    () =>
      buildActiveWorkoutSession(template, setDrafts, {
        exerciseNotes,
        sessionStartedAt: startTime,
      }),
    [exerciseNotes, setDrafts, startTime, template],
  );
  const totalCompletedReps = useMemo(() => countCompletedReps(setDrafts), [setDrafts]);
  const summaryDuration = sessionCompletedAt
    ? formatElapsedTime(getElapsedSeconds(startTime, new Date(sessionCompletedAt).getTime()))
    : formatElapsedTime(getElapsedSeconds(startTime, Date.now()));

  return (
    <section className="space-y-5 pb-8">
      {stage === 'active' ? (
        <>
          <SessionHeader
            className="sticky top-4 z-20"
            completedSets={session.completedSets}
            currentExercise={session.currentExercise}
            startTime={startTime}
            totalExercises={session.totalExercises}
            totalSets={session.totalSets}
            workoutName={session.workoutName}
          />

          <SessionContext context={workoutSessionContext} />

          <SessionExerciseList
            focusSetId={focusSetId}
            onAddSet={handleAddSet}
            onExerciseNotesChange={(exerciseId, notes) =>
              setExerciseNotes((current) => ({
                ...current,
                [exerciseId]: notes,
              }))
            }
            onFocusSetHandled={() => setFocusSetId(null)}
            onRestTimerComplete={handleRestTimerComplete}
            onSetUpdate={handleSetUpdate}
            restTimer={restTimer}
            session={session}
          />

          <SupplementalMenu
            checkedByExerciseId={supplementalChecks}
            exercises={supplementalExercises}
            onCheckedChange={(exerciseId, checked) =>
              setSupplementalChecks((current) => ({
                ...current,
                [exerciseId]: checked,
              }))
            }
          />
        </>
      ) : null}

      {stage === 'feedback' ? (
        <SessionFeedback
          fields={workoutFeedbackFields}
          onSubmit={(feedback) => {
            setSessionFeedback(feedback);
            setStage('summary');
          }}
        />
      ) : null}

      {stage === 'summary' ? (
        <SessionSummary
          defaultDescription={template.description}
          defaultTags={template.tags}
          duration={summaryDuration}
          exercisesCompleted={session.totalExercises}
          feedback={sessionFeedback}
          onDone={() => navigate('/workouts')}
          totalReps={totalCompletedReps}
          totalSets={session.completedSets}
          workoutName={session.workoutName}
        />
      ) : null}
    </section>
  );

  function handleAddSet(exerciseId: string) {
    const templateExercise = templateExerciseById.get(exerciseId);

    if (!templateExercise) {
      return;
    }

    const exerciseSets = setDrafts[exerciseId] ?? [];
    const nextSet = createWorkoutSetDraft(templateExercise, exerciseSets.length + 1);

    setSetDrafts({
      ...setDrafts,
      [exerciseId]: [...exerciseSets, nextSet],
    });

    setRestTimer(null);
    setRestTimerTargetSetId(null);
    setFocusSetId(nextSet.id);
  }

  function handleSetUpdate(
    exerciseId: string,
    setId: string,
    update: { completed?: boolean; reps?: number | null; weight?: number | null },
  ) {
    const exerciseSets = setDrafts[exerciseId] ?? [];
    const updatedSets = exerciseSets.map((set) =>
      set.id === setId
        ? {
            ...set,
            ...update,
          }
        : set,
    );
    const nextDrafts = {
      ...setDrafts,
      [exerciseId]: updatedSets,
    };

    setSetDrafts(nextDrafts);

    const previousSet = exerciseSets.find((set) => set.id === setId);
    const updatedSet = updatedSets.find((set) => set.id === setId);
    const templateExercise = templateExerciseById.get(exerciseId);

    if (!previousSet || !updatedSet || !templateExercise) {
      return;
    }

    if (update.completed === false) {
      setRestTimer(null);
      setRestTimerTargetSetId(null);
      setFocusSetId(null);
      return;
    }

    if (previousSet.completed || !updatedSet.completed) {
      return;
    }

    const updatedSession = buildActiveWorkoutSession(template, nextDrafts, {
      exerciseNotes,
      sessionStartedAt: startTime,
    });

    if (updatedSession.completedSets === updatedSession.totalSets) {
      setRestTimer(null);
      setRestTimerTargetSetId(null);
      setFocusSetId(null);
      setSessionCompletedAt((current) => current ?? new Date().toISOString());
      setStage('feedback');
      return;
    }

    const nextTargetSetId = findNextPendingSetId(updatedSession);

    if (!nextTargetSetId) {
      setRestTimer(null);
      setRestTimerTargetSetId(null);
      setFocusSetId(null);
      return;
    }

    restTimerTokenRef.current += 1;
    setRestTimer({
      duration: templateExercise.restSeconds,
      exerciseName:
        updatedSession.sections
          .flatMap((section) => section.exercises)
          .find((exercise) => exercise.id === exerciseId)?.name ?? 'Next set',
      setNumber: updatedSet.number,
      token: restTimerTokenRef.current,
    });
    setRestTimerTargetSetId(nextTargetSetId);
    setFocusSetId(null);
  }

  function handleRestTimerComplete() {
    setRestTimer(null);
    setFocusSetId(restTimerTargetSetId);
    setRestTimerTargetSetId(null);
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

function getElapsedSeconds(startTime: Date | string, currentTime: number) {
  const startedAt = new Date(startTime).getTime();
  const elapsedMilliseconds = currentTime - startedAt;

  return Math.max(0, Math.floor(elapsedMilliseconds / 1000));
}

function formatElapsedTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${`${minutes}`.padStart(2, '0')}:${`${seconds}`.padStart(2, '0')}`;
}

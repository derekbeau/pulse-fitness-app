import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import type {
  SessionSet,
  WorkoutSessionFeedback,
  WorkoutTemplate as ApiWorkoutTemplate,
  WorkoutTemplateSectionType,
} from '@pulse/shared';

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
  workoutFeedbackFields,
  workoutSessionContext,
  workoutSupplementalExercises,
  type ActiveWorkoutFeedbackDraft,
  type ActiveWorkoutSetDrafts,
} from '@/features/workouts';
import { useWorkoutTemplate } from '@/features/workouts/api/workouts';
import { useCompleteSession } from '@/hooks/use-complete-session';
import { useLogSet, useUpdateSet } from '@/hooks/use-session-sets';
import { useWeightUnit } from '@/hooks/use-weight-unit';
import { useWorkoutSession } from '@/hooks/use-workout-session';
import {
  WORKOUT_SESSION_COMPLETED_NOTICE,
  WORKOUT_SESSION_NOTICE_QUERY_KEY,
  clearStoredActiveWorkoutSessionId,
  setStoredActiveWorkoutSessionId,
} from '@/features/workouts/lib/session-persistence';
import { ApiError } from '@/lib/api-client';
import {
  mockExercises,
  mockTemplates,
  type WorkoutBadgeType as MockWorkoutBadgeType,
  type WorkoutTemplate as MockWorkoutTemplate,
} from '@/lib/mock-data/workouts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const defaultTemplate =
  mockTemplates.find((template) => template.id === 'upper-push') ??
  (() => {
    throw new Error('Expected upper-push template in mock data.');
  })();

const sectionTitleByType: Record<WorkoutTemplateSectionType, string> = {
  warmup: 'Warmup',
  main: 'Main',
  cooldown: 'Cooldown',
};

const categoryBadgeByExerciseId = new Map(
  mockExercises.map((exercise) => [exercise.id, exercise.category as MockWorkoutBadgeType]),
);

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
  const sessionId = searchParams.get('sessionId');
  const requestedTemplateId = searchParams.get('template');
  const sessionQuery = useWorkoutSession(sessionId);
  const { weightUnit } = useWeightUnit();
  const logSetMutation = useLogSet(sessionId);
  const updateSetMutation = useUpdateSet(sessionId);
  const completeSessionMutation = useCompleteSession(sessionId);
  const resolvedTemplateId = requestedTemplateId ?? sessionQuery.data?.templateId ?? '';
  const shouldLoadApiTemplate = UUID_PATTERN.test(resolvedTemplateId);
  const templateQuery = useWorkoutTemplate(shouldLoadApiTemplate ? resolvedTemplateId : '');

  const selectedMockTemplate = mockTemplates.find((template) => template.id === resolvedTemplateId);
  const apiTemplate = useMemo(
    () => (templateQuery.data ? toMockWorkoutTemplate(templateQuery.data) : null),
    [templateQuery.data],
  );
  const template = apiTemplate ?? selectedMockTemplate ?? defaultTemplate;

  const [fallbackStartTime] = useState(() =>
    new Date(Date.now() - 16 * 60_000 - 23_000).toISOString(),
  );
  const [setDrafts, setSetDrafts] = useState<ActiveWorkoutSetDrafts>(() =>
    createInitialWorkoutSetDrafts(
      template,
      requestedTemplateId || sessionId ? new Set<string>() : new Set(completedSetIds),
    ),
  );
  const [exerciseNotes, setExerciseNotes] = useState<Record<string, string>>({});
  const [stage, setStage] = useState<'active' | 'feedback' | 'summary'>('active');
  const [sessionCompletedAt, setSessionCompletedAt] = useState<string | null>(null);
  const [sessionFeedback, setSessionFeedback] = useState<ActiveWorkoutFeedbackDraft>([]);
  const [restTimer, setRestTimer] = useState<RestTimerState | null>(null);
  const [restTimerTargetSetId, setRestTimerTargetSetId] = useState<string | null>(null);
  const [focusSetId, setFocusSetId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [supplementalChecks, setSupplementalChecks] = useState<Record<string, boolean>>({});
  const restTimerTokenRef = useRef(0);
  const hydratedSessionIdRef = useRef<string | null>(null);
  const supplementalExercises = workoutSupplementalExercises;

  const activeSession = sessionQuery.data;
  const activeSessionId = activeSession?.id ?? null;
  const startTime = activeSession
    ? new Date(activeSession.startedAt).toISOString()
    : fallbackStartTime;
  const redirectToCompletedSessionNotice = useCallback(() => {
    clearStoredActiveWorkoutSessionId();
    navigate(`/workouts?${WORKOUT_SESSION_NOTICE_QUERY_KEY}=${WORKOUT_SESSION_COMPLETED_NOTICE}`, {
      replace: true,
    });
  }, [navigate]);

  const templateExerciseById = useMemo(
    () =>
      new Map(
        template.sections.flatMap((section) =>
          section.exercises.map((exercise) => [
            exercise.exerciseId,
            {
              exercise,
              section: section.type,
            },
          ]),
        ),
      ),
    [template],
  );

  useEffect(() => {
    if (!activeSession) {
      return;
    }

    if (hydratedSessionIdRef.current === activeSession.id) {
      return;
    }

    setSetDrafts(createSessionSetDrafts(template, activeSession.sets));
    hydratedSessionIdRef.current = activeSession.id;
  }, [activeSession, template]);

  useEffect(() => {
    if (activeSession) {
      return;
    }

    setSetDrafts(
      createInitialWorkoutSetDrafts(
        template,
        requestedTemplateId || sessionId ? new Set<string>() : new Set(completedSetIds),
      ),
    );
  }, [activeSession, requestedTemplateId, sessionId, template]);

  useEffect(() => {
    if (!activeSession || !sessionId) {
      return;
    }

    if (activeSession.status === 'in-progress') {
      setStoredActiveWorkoutSessionId(activeSession.id);
      return;
    }

    clearStoredActiveWorkoutSessionId();

    if (activeSession.status === 'completed' && stage === 'active') {
      redirectToCompletedSessionNotice();
    }
  }, [activeSession, redirectToCompletedSessionNotice, sessionId, stage]);

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

  if (sessionId && sessionQuery.isPending) {
    return (
      <section className="space-y-3 pb-8">
        <h1 className="text-2xl font-semibold text-foreground">Loading active session</h1>
        <p className="text-sm text-muted">Fetching workout session details...</p>
      </section>
    );
  }

  if (shouldLoadApiTemplate && templateQuery.isPending) {
    return (
      <section className="space-y-3 pb-8">
        <h1 className="text-2xl font-semibold text-foreground">Loading workout template</h1>
        <p className="text-sm text-muted">Fetching template details...</p>
      </section>
    );
  }

  if (sessionId && sessionQuery.isError) {
    return (
      <section className="space-y-3 pb-8">
        <h1 className="text-2xl font-semibold text-foreground">Unable to load session</h1>
        <p className="text-sm text-muted">Refresh and try again.</p>
      </section>
    );
  }

  if (shouldLoadApiTemplate && templateQuery.isError) {
    return (
      <section className="space-y-3 pb-8">
        <h1 className="text-2xl font-semibold text-foreground">Unable to load template</h1>
        <p className="text-sm text-muted">Refresh and try again.</p>
      </section>
    );
  }

  return (
    <section className="space-y-5 pb-8">
      {sessionError ? <p className="text-sm text-destructive">{sessionError}</p> : null}

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
            enableApiLastPerformance={Boolean(activeSessionId)}
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
            weightUnit={weightUnit}
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
            if (completeSessionMutation.isPending) {
              return;
            }

            const completedAt = Date.now();
            const completedAtIso = new Date(completedAt).toISOString();
            const duration = Math.floor(getElapsedSeconds(startTime, completedAt) / 60);
            const notes = extractFeedbackNotes(feedback);

            if (!activeSessionId) {
              setSessionFeedback(feedback);
              setSessionCompletedAt(completedAtIso);
              setStage('summary');
              return;
            }

            setSessionError(null);
            completeSessionMutation.mutate(
              {
                completedAt,
                duration,
                feedback: {
                  ...mapFeedbackDraftToSessionFeedback(feedback),
                  notes: notes ?? undefined,
                },
                notes,
              },
              {
                onError: (error) => {
                  if (isSessionNotActiveError(error)) {
                    redirectToCompletedSessionNotice();
                    return;
                  }

                  setSessionError('Unable to complete this workout. Try again.');
                },
                onSuccess: () => {
                  setSessionFeedback(feedback);
                  setSessionCompletedAt(completedAtIso);
                  setStage('summary');
                },
              },
            );
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
          sessionId={activeSessionId}
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
    const nextSetNumber = exerciseSets.length + 1;

    if (activeSessionId) {
      setSessionError(null);
      logSetMutation.mutate(
        {
          exerciseId,
          reps: null,
          section: templateExercise.section,
          setNumber: nextSetNumber,
          weight: null,
        },
        {
          onError: (error) => {
            if (isSessionNotActiveError(error)) {
              redirectToCompletedSessionNotice();
              return;
            }

            setSessionError('Unable to add set. Try again.');
          },
          onSuccess: (createdSet) => {
            setSetDrafts((current) => {
              const currentExerciseSets = current[exerciseId] ?? [];

              return {
                ...current,
                [exerciseId]: [
                  ...currentExerciseSets,
                  {
                    completed: createdSet.completed,
                    id: createdSet.id,
                    number: createdSet.setNumber,
                    reps: createdSet.reps,
                    weight: createdSet.weight,
                  },
                ].sort((left, right) => left.number - right.number),
              };
            });

            setRestTimer(null);
            setRestTimerTargetSetId(null);
            setFocusSetId(createdSet.id);
          },
        },
      );

      return;
    }

    const nextSet = createWorkoutSetDraft(templateExercise.exercise, nextSetNumber);

    setSetDrafts((current) => ({
      ...current,
      [exerciseId]: [...(current[exerciseId] ?? []), nextSet],
    }));

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

    if (activeSessionId) {
      setSessionError(null);
      updateSetMutation.mutate(
        {
          setId,
          update,
        },
        {
          onError: (error) => {
            if (isSessionNotActiveError(error)) {
              redirectToCompletedSessionNotice();
              return;
            }

            setSessionError('Unable to sync set update. Try again.');
          },
        },
      );
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
      duration: templateExercise.exercise.restSeconds,
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

function createSessionSetDrafts(template: MockWorkoutTemplate, sessionSets: SessionSet[]) {
  const drafts = createInitialWorkoutSetDrafts(template, new Set<string>());

  for (const sessionSet of sessionSets) {
    const nextSet = {
      completed: sessionSet.completed,
      id: sessionSet.id,
      number: sessionSet.setNumber,
      reps: sessionSet.reps,
      weight: sessionSet.weight,
    };
    const existingSets = drafts[sessionSet.exerciseId] ?? [];
    const existingSetIndex = existingSets.findIndex((set) => set.number === sessionSet.setNumber);

    if (existingSetIndex === -1) {
      drafts[sessionSet.exerciseId] = [...existingSets, nextSet].sort(
        (left, right) => left.number - right.number,
      );
      continue;
    }

    const nextExerciseSets = [...existingSets];
    nextExerciseSets[existingSetIndex] = nextSet;
    drafts[sessionSet.exerciseId] = nextExerciseSets;
  }

  return drafts;
}

function mapFeedbackDraftToSessionFeedback(draft: ActiveWorkoutFeedbackDraft): WorkoutSessionFeedback {
  const scaleEntries = draft.filter(
    (
      field,
    ): field is Extract<ActiveWorkoutFeedbackDraft[number], { type: 'scale'; value?: number | null }> =>
      field.type === 'scale',
  );

  return {
    energy: toFeedbackScore(
      scaleEntries.find((field) => field.id.toLowerCase().includes('energy'))?.value ??
        scaleEntries.at(2)?.value ??
        scaleEntries.at(0)?.value,
    ),
    recovery: toFeedbackScore(
      scaleEntries.find((field) => field.id.toLowerCase().includes('recovery'))?.value ??
        scaleEntries.at(0)?.value,
    ),
    technique: toFeedbackScore(
      scaleEntries.find((field) => field.id.toLowerCase().includes('technique'))?.value ??
        scaleEntries.at(1)?.value ??
        scaleEntries.at(0)?.value,
    ),
  };
}

function toFeedbackScore(value: number | null | undefined): 1 | 2 | 3 | 4 | 5 {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 3;
  }

  const rounded = Math.round(value);

  if (rounded <= 1) {
    return 1;
  }

  if (rounded >= 5) {
    return 5;
  }

  return rounded as 1 | 2 | 3 | 4 | 5;
}

function extractFeedbackNotes(draft: ActiveWorkoutFeedbackDraft) {
  const textField = draft.find(
    (
      field,
    ): field is Extract<ActiveWorkoutFeedbackDraft[number], { type: 'text'; value?: string }> =>
      field.type === 'text' && (field.value ?? '').trim().length > 0,
  );

  if (textField) {
    return textField.value?.trim() ?? null;
  }

  const scaleFieldWithNotes = draft.find(
    (
      field,
    ): field is Extract<ActiveWorkoutFeedbackDraft[number], { type: 'scale'; notes?: string }> =>
      field.type === 'scale' && (field.notes ?? '').trim().length > 0,
  );

  return scaleFieldWithNotes?.notes?.trim() ?? null;
}

function isSessionNotActiveError(error: unknown) {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    error.code === 'WORKOUT_SESSION_NOT_ACTIVE'
  );
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

function toMockWorkoutTemplate(template: ApiWorkoutTemplate): MockWorkoutTemplate {
  return {
    id: template.id,
    name: template.name,
    description: template.description ?? '',
    tags: template.tags,
    sections: template.sections.map((section) => ({
      type: section.type,
      title: sectionTitleByType[section.type],
      exercises: section.exercises.map((exercise) => ({
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.exerciseName,
        sets: exercise.sets ?? 1,
        reps: formatTemplateExerciseReps(exercise.repsMin, exercise.repsMax),
        tempo: exercise.tempo ?? '2111',
        restSeconds: exercise.restSeconds ?? 60,
        formCues: exercise.cues,
        badges: getDefaultExerciseBadges(exercise.exerciseId),
      })),
    })),
  };
}

function formatTemplateExerciseReps(repsMin: number | null, repsMax: number | null) {
  if (repsMin !== null && repsMax !== null) {
    return repsMin === repsMax ? String(repsMin) : `${repsMin}-${repsMax}`;
  }

  if (repsMin !== null) {
    return String(repsMin);
  }

  if (repsMax !== null) {
    return String(repsMax);
  }

  return '';
}

function getDefaultExerciseBadges(exerciseId: string): MockWorkoutBadgeType[] {
  const categoryBadge = categoryBadgeByExerciseId.get(exerciseId);
  return categoryBadge ? [categoryBadge] : [];
}

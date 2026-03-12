import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { MoreVertical, Pause, Play } from 'lucide-react';
import { z } from 'zod';

import {
  createWorkoutSessionInputSchema,
  updateWorkoutSessionTimeSegmentsInputSchema,
  updateWorkoutSessionInputSchema,
  type ExerciseTrackingType,
  type SessionSet,
  type WorkoutSessionTimeSegment,
  workoutSessionSchema,
  type WorkoutSessionFeedback,
  type WorkoutSessionFeedbackResponse,
  WorkoutTemplate as ApiWorkoutTemplate,
  type WorkoutTemplateSectionType,
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
  workoutFeedbackFields,
  workoutSessionContext,
  workoutSupplementalExercises,
  type ActiveWorkoutCustomFeedbackField,
  type ActiveWorkoutFeedbackDraft,
  type ActiveWorkoutSetDrafts,
} from '@/features/workouts';
import {
  estimateRemainingTime,
  estimateTotalTime,
} from '@/features/workouts/lib/time-estimates';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { workoutQueryKeys, useWorkoutTemplate } from '@/features/workouts/api/workouts';
import {
  isSetCompleteForTrackingType,
  resolveTrackingType,
} from '@/features/workouts/lib/tracking';
import { useCompleteSession } from '@/hooks/use-complete-session';
import { useLogSet, useUpdateSet } from '@/hooks/use-session-sets';
import { useWeightUnit } from '@/hooks/use-weight-unit';
import {
  useUpdateSessionStatus,
  useUpdateSessionStartTime,
  useUpdateSessionTimeSegments,
  useWorkoutSession,
  workoutSessionQueryKeys,
} from '@/hooks/use-workout-session';
import {
  WORKOUT_SESSION_COMPLETED_NOTICE,
  WORKOUT_SESSION_NOTICE_QUERY_KEY,
  clearStoredActiveWorkoutDraft,
  clearStoredActiveWorkoutSessionId,
  getStoredActiveWorkoutSessionId,
  getStoredActiveWorkoutDraft,
  setStoredActiveWorkoutSessionId,
  setStoredActiveWorkoutDraft,
} from '@/features/workouts/lib/session-persistence';
import {
  buildSessionSetInputs,
  extractExerciseNotes,
} from '@/features/workouts/lib/session-notes';
import { ApiError, apiRequest } from '@/lib/api-client';
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
const mockExerciseById = new Map(mockExercises.map((exercise) => [exercise.id, exercise]));

type RestTimerState = {
  duration: number;
  exerciseId: string;
  exerciseName: string;
  setId: string;
  setNumber: number;
  token: number;
};

export function ActiveWorkoutPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedSessionId = searchParams.get('sessionId');
  const sessionId = requestedSessionId ?? getStoredActiveWorkoutSessionId();
  const requestedTemplateId = searchParams.get('template');
  const shouldRenderEmptyState = !sessionId && !requestedTemplateId;
  const sessionQuery = useWorkoutSession(sessionId);
  const { weightUnit } = useWeightUnit();
  const logSetMutation = useLogSet(sessionId);
  const updateSetMutation = useUpdateSet(sessionId);
  const updateSessionStartTimeMutation = useUpdateSessionStartTime(sessionId);
  const updateSessionStatusMutation = useUpdateSessionStatus(sessionId);
  const updateSessionTimeSegmentsMutation = useUpdateSessionTimeSegments(sessionId);
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

  const [fallbackStartTime] = useState(() => new Date().toISOString());
  const [startTimeOverride, setStartTimeOverride] = useState<string | null>(null);
  const [setDrafts, setSetDrafts] = useState<ActiveWorkoutSetDrafts>(() =>
    createInitialWorkoutSetDrafts(template, new Set<string>()),
  );
  const [exerciseNotes, setExerciseNotes] = useState<Record<string, string>>({});
  const [sessionCuesByExercise, setSessionCuesByExercise] = useState<Record<string, string[]>>({});
  const [stage, setStage] = useState<'active' | 'feedback' | 'summary'>('active');
  const [sessionCompletedAt, setSessionCompletedAt] = useState<string | null>(null);
  const [sessionFeedback, setSessionFeedback] = useState<ActiveWorkoutFeedbackDraft>([]);
  const [sessionNotes, setSessionNotes] = useState('');
  const [completedSessionId, setCompletedSessionId] = useState<string | null>(null);
  const [summarySaving, setSummarySaving] = useState(false);
  const [restTimer, setRestTimer] = useState<RestTimerState | null>(null);
  const [restTimerTargetSetId, setRestTimerTargetSetId] = useState<string | null>(null);
  const [focusSetId, setFocusSetId] = useState<string | null>(null);
  const [isFinishDialogOpen, setIsFinishDialogOpen] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [isEditTimeDialogOpen, setIsEditTimeDialogOpen] = useState(false);
  const [editableTimeSegments, setEditableTimeSegments] = useState<WorkoutSessionTimeSegment[]>([]);
  const [timeSegmentError, setTimeSegmentError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [supplementalChecks, setSupplementalChecks] = useState<Record<string, boolean>>({});
  const restTimerTokenRef = useRef(0);
  const hydratedSessionIdRef = useRef<string | null>(null);
  const hydratedDraftKeyRef = useRef<string | null>(null);
  const supplementalExercises = workoutSupplementalExercises;

  const activeSession = sessionQuery.data;
  const activeSessionId = activeSession?.id ?? null;
  const activeSessionStatus = activeSession?.status ?? null;
  const isPaused = activeSessionStatus === 'paused';
  const activeWorkoutDraftId = activeSessionId ?? sessionId ?? template.id;
  const startTime =
    startTimeOverride ??
    (activeSession ? new Date(activeSession.startedAt).toISOString() : fallbackStartTime);
  const redirectToCompletedSessionNotice = useCallback(() => {
    clearStoredActiveWorkoutDraft(activeWorkoutDraftId);
    clearStoredActiveWorkoutSessionId();
    navigate(`/workouts?${WORKOUT_SESSION_NOTICE_QUERY_KEY}=${WORKOUT_SESSION_COMPLETED_NOTICE}`, {
      replace: true,
    });
  }, [activeWorkoutDraftId, navigate]);

  const templateExerciseById = useMemo(
    () =>
      new Map(
        template.sections.flatMap((section) =>
          section.exercises.map((exercise) => [
            exercise.exerciseId,
            {
              exercise,
              section: section.type,
              trackingType: resolveTrackingType({
                category: mockExerciseById.get(exercise.exerciseId)?.category,
                exerciseId: exercise.exerciseId,
                exerciseName: exercise.exerciseName,
                prescribedReps: exercise.reps,
              }),
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

    const serverSetDrafts = createSessionSetDrafts(
      template,
      activeSession.sets,
      templateExerciseById,
    );
    const serverExerciseNotes = extractExerciseNotes(activeSession.sets);
    const autosavedDraft = getStoredActiveWorkoutDraft(activeSession.id);
    const previousDraftKey = hydratedDraftKeyRef.current;

    setSetDrafts(autosavedDraft?.setDrafts ?? serverSetDrafts);
    setExerciseNotes(autosavedDraft?.exerciseNotes ?? serverExerciseNotes);
    setSessionCuesByExercise(autosavedDraft?.sessionCuesByExercise ?? {});
    hydratedSessionIdRef.current = activeSession.id;
    hydratedDraftKeyRef.current = activeSession.id;

    if (previousDraftKey && previousDraftKey !== activeSession.id) {
      clearStoredActiveWorkoutDraft(previousDraftKey);
    }

    if (template.id !== activeSession.id) {
      clearStoredActiveWorkoutDraft(template.id);
    }
  }, [activeSession, template, templateExerciseById]);

  useEffect(() => {
    if (activeSession) {
      return;
    }

    const initialSetDrafts = createInitialWorkoutSetDrafts(template, new Set<string>());
    const autosavedDraft = getStoredActiveWorkoutDraft(activeWorkoutDraftId);

    setSetDrafts(autosavedDraft?.setDrafts ?? initialSetDrafts);
    setExerciseNotes(autosavedDraft?.exerciseNotes ?? {});
    setSessionCuesByExercise(autosavedDraft?.sessionCuesByExercise ?? {});
    hydratedDraftKeyRef.current = activeWorkoutDraftId;
  }, [activeSession, activeWorkoutDraftId, requestedTemplateId, sessionId, template]);

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

  useEffect(() => {
    if (stage !== 'active') {
      return;
    }

    if (hydratedDraftKeyRef.current !== activeWorkoutDraftId) {
      return;
    }

    setStoredActiveWorkoutDraft(activeWorkoutDraftId, {
      exerciseNotes,
      sessionCuesByExercise,
      setDrafts,
    });
  }, [activeWorkoutDraftId, exerciseNotes, sessionCuesByExercise, setDrafts, stage]);

  const session = useMemo(
    () =>
      buildActiveWorkoutSession(template, setDrafts, {
        exerciseNotes,
        sessionStartedAt: startTime,
      }),
    [exerciseNotes, setDrafts, startTime, template],
  );
  const remainingSetCount = useMemo(
    () => session.totalSets - session.completedSets,
    [session.completedSets, session.totalSets],
  );
  const completedSetsSummary = useMemo(
    () => `${session.completedSets}/${session.totalSets}`,
    [session.completedSets, session.totalSets],
  );
  const totalCompletedReps = useMemo(() => countCompletedReps(setDrafts), [setDrafts]);
  const estimatedTotalSeconds = useMemo(() => estimateTotalTime(session), [session]);
  const remainingEstimatedSeconds = useMemo(() => estimateRemainingTime(session), [session]);
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

  if (shouldRenderEmptyState) {
    return (
      <section className="space-y-4 pb-8">
        <h1 className="text-2xl font-semibold text-foreground">No active workout</h1>
        <p className="text-sm text-muted">
          Start a session from one of your existing templates to begin logging sets.
        </p>
        <Button asChild type="button">
          <Link to="/workouts?view=templates">Browse templates</Link>
        </Button>
      </section>
    );
  }

  return (
    <section className="space-y-5 pb-8">
      {sessionError ? <p className="text-sm text-destructive">{sessionError}</p> : null}

      {stage === 'active' ? (
        <>
          <SessionHeader
            completedSets={session.completedSets}
            currentExercise={session.currentExercise}
            estimatedTotalSeconds={estimatedTotalSeconds}
            isUpdatingStartTime={updateSessionStartTimeMutation.isPending}
            onStartTimeChange={handleStartTimeChange}
            remainingSeconds={remainingEstimatedSeconds}
            startTime={startTime}
            timeSegments={activeSession?.timeSegments}
            totalExercises={session.totalExercises}
            totalSets={session.totalSets}
            workoutName={session.workoutName}
          />

          {activeSessionId && (activeSessionStatus === 'paused' || activeSessionStatus === 'in-progress') ? (
            <div className="flex items-center justify-between gap-3">
              <Button
                className="min-w-32"
                disabled={updateSessionStatusMutation.isPending}
                onClick={handlePauseResumeToggle}
                type="button"
                variant={isPaused ? 'default' : 'secondary'}
              >
                {isPaused ? (
                  <Play aria-hidden="true" className="size-4" />
                ) : (
                  <Pause aria-hidden="true" className="size-4" />
                )}
                {isPaused ? 'Resume' : 'Pause'}
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-label="Workout session options"
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <MoreVertical aria-hidden="true" className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={openEditTimeDialog}>Edit time</DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setIsCancelDialogOpen(true)}
                    variant="destructive"
                  >
                    Cancel workout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}

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
            onRemoveSet={handleRemoveSet}
            onRestTimerComplete={handleRestTimerComplete}
            onSessionCuesChange={(exerciseId, cues) =>
              setSessionCuesByExercise((current) => ({
                ...current,
                [exerciseId]: cues,
              }))
            }
            onSetUpdate={handleSetUpdate}
            restTimer={restTimer}
            session={session}
            sessionCuesByExercise={sessionCuesByExercise}
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

          <div className="pt-2">
            <Button className="w-full sm:w-auto" onClick={handleFinishWorkout} type="button">
              Finish Workout
            </Button>
            <p className="mt-2 text-sm text-muted">{`${completedSetsSummary} sets completed`}</p>
          </div>
        </>
      ) : null}

      {stage === 'feedback' ? (
        <SessionFeedback
          fields={workoutFeedbackFields}
          onSubmit={async (feedback) => {
            if (completeSessionMutation.isPending) {
              return;
            }

            const completedAt = Date.now();
            const completedAtIso = new Date(completedAt).toISOString();
            const duration = Math.floor(getElapsedSeconds(startTime, completedAt) / 60);
            const feedbackNotes = extractFeedbackNotes(feedback);
            const sessionSetInputs = buildSessionSetInputs(
              setDrafts,
              templateExerciseById,
              exerciseNotes,
            );

            if (!activeSessionId) {
              setSessionError(null);
              try {
                const createdSession = await createCompletedWorkoutSession({
                  completedAt,
                  date: completedAtIso.slice(0, 10),
                  duration,
                  feedback: {
                    ...mapFeedbackDraftToSessionFeedback(feedback),
                    notes: feedbackNotes ?? undefined,
                  },
                  name: session.workoutName,
                  sets: sessionSetInputs,
                  startedAt: new Date(startTime).getTime(),
                  templateId: shouldLoadApiTemplate ? template.id : null,
                });
                setCompletedSessionId(createdSession.id);
              } catch {
                setSessionError('Unable to complete this workout. Try again.');
                return;
              }

              void queryClient.invalidateQueries({ queryKey: workoutQueryKeys.all });

              clearStoredActiveWorkoutDraft(activeWorkoutDraftId);
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
                  notes: feedbackNotes ?? undefined,
                },
                exerciseNotes,
                notes: null,
                sets: sessionSetInputs,
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
                  clearStoredActiveWorkoutDraft(activeWorkoutDraftId);
                  setCompletedSessionId(activeSessionId);
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
          onDone={async () => {
            if (summarySaving) {
              return;
            }

            const persistedSessionId = activeSessionId ?? completedSessionId;
            if (persistedSessionId) {
              const trimmedSessionNotes = sessionNotes.trim();
              if (trimmedSessionNotes.length > 0) {
                setSessionError(null);
                setSummarySaving(true);
                try {
                  await persistCompletedSessionNotes({
                    notes: trimmedSessionNotes,
                    sessionId: persistedSessionId,
                  });
                  await Promise.all([
                    queryClient.invalidateQueries({
                      queryKey: workoutSessionQueryKeys.detail(persistedSessionId),
                    }),
                    queryClient.invalidateQueries({
                      queryKey: workoutQueryKeys.session(persistedSessionId),
                    }),
                  ]);
                } catch {
                  setSessionError('Unable to save session notes. Try again.');
                  setSummarySaving(false);
                  return;
                }
                setSummarySaving(false);
              }
            }

            clearStoredActiveWorkoutDraft(activeWorkoutDraftId);
            navigate('/workouts');
          }}
          onNotesChange={setSessionNotes}
          sessionNotes={sessionNotes}
          sessionId={activeSessionId}
          summarySaving={summarySaving}
          totalReps={totalCompletedReps}
          completedSets={session.completedSets}
          totalSets={session.totalSets}
          workoutName={session.workoutName}
        />
      ) : null}

      <AlertDialog onOpenChange={setIsFinishDialogOpen} open={isFinishDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finish workout early?</AlertDialogTitle>
            <AlertDialogDescription>
              {`End workout with ${remainingSetCount} sets remaining?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmFinishWorkout} type="button">
              Finish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog onOpenChange={setIsCancelDialogOpen} open={isCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this workout?</AlertDialogTitle>
            <AlertDialogDescription>
              This marks the current session as cancelled and keeps it in your history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Keep session</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancelWorkout} type="button">
              Cancel workout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        onOpenChange={(open) => {
          setIsEditTimeDialogOpen(open);
          if (!open) {
            setTimeSegmentError(null);
          }
        }}
        open={isEditTimeDialogOpen}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit workout time</DialogTitle>
            <DialogDescription>
              Adjust segment start/end times to correct pauses or missed pauses.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {editableTimeSegments.map((segment, index) => (
              <div className="grid grid-cols-1 gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1fr_auto]" key={`${segment.start}-${index}`}>
                <Input
                  aria-label={`Segment ${index + 1} start`}
                  onChange={(event) => updateEditableSegment(index, 'start', event.target.value)}
                  type="datetime-local"
                  value={toDateTimeLocalValue(segment.start)}
                />
                <Input
                  aria-label={`Segment ${index + 1} end`}
                  onChange={(event) =>
                    updateEditableSegment(index, 'end', event.target.value.trim().length ? event.target.value : null)
                  }
                  placeholder="Now (open)"
                  type="datetime-local"
                  value={segment.end ? toDateTimeLocalValue(segment.end) : ''}
                />
                <Button
                  aria-label={`Delete segment ${index + 1}`}
                  onClick={() => removeEditableSegment(index)}
                  type="button"
                  variant="outline"
                >
                  Delete
                </Button>
              </div>
            ))}

            <Button onClick={addEditableSegment} type="button" variant="secondary">
              Add segment
            </Button>
          </div>

          {timeSegmentError ? <p className="text-sm text-destructive">{timeSegmentError}</p> : null}

          <DialogFooter>
            <Button onClick={saveEditedTimeSegments} type="button">
              Save time
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
                    distance: null,
                    id: createdSet.id,
                    number: createdSet.setNumber,
                    reps: createdSet.reps,
                    seconds: null,
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

  function handleRemoveSet(exerciseId: string) {
    const exerciseSets = setDrafts[exerciseId] ?? [];

    if (exerciseSets.length <= 1) {
      return;
    }

    const sortedSets = [...exerciseSets].sort((left, right) => left.number - right.number);
    const removedSet = sortedSets[sortedSets.length - 1];
    const nextExerciseSets = sortedSets.slice(0, -1);

    if (!removedSet) {
      return;
    }

    if (activeSessionId) {
      // API does not yet expose set deletion for active sessions.
      setSessionError('Removing sets is local-only right now and may not sync across devices.');
    }

    setSetDrafts((current) => ({
      ...current,
      [exerciseId]: nextExerciseSets,
    }));

    if (restTimer?.setId === removedSet.id) {
      setRestTimer(null);
    }

    if (restTimerTargetSetId === removedSet.id) {
      setRestTimerTargetSetId(null);
    }

    if (focusSetId === removedSet.id) {
      setFocusSetId(null);
    }
  }

  function handleSetUpdate(
    exerciseId: string,
    setId: string,
    update: {
      completed?: boolean;
      distance?: number | null;
      reps?: number | null;
      seconds?: number | null;
      weight?: number | null;
    },
  ) {
    const exerciseSets = setDrafts[exerciseId] ?? [];
    const templateExercise = templateExerciseById.get(exerciseId);
    const previousSet = exerciseSets.find((set) => set.id === setId);

    if (!previousSet || !templateExercise) {
      return;
    }

    const mergedSet = {
      ...previousSet,
      ...update,
    };
    const normalizedUpdate =
      update.completed === undefined
        ? {
            ...update,
            completed: isSetCompleteForTrackingType(templateExercise.trackingType, mergedSet),
          }
        : update;
    const updatedSets = exerciseSets.map((set) =>
      set.id === setId
        ? {
            ...set,
            ...normalizedUpdate,
          }
        : set,
    );
    const nextDrafts = {
      ...setDrafts,
      [exerciseId]: updatedSets,
    };

    setSetDrafts(nextDrafts);

    const updatedSet = updatedSets.find((set) => set.id === setId);
    if (!updatedSet) {
      return;
    }

    if (activeSessionId) {
      setSessionError(null);
      const isTimeBased = ['weight_seconds', 'reps_seconds', 'seconds_only', 'cardio'].includes(
        templateExercise.trackingType,
      );
      const persistedUpdate = {
        completed: updatedSet.completed,
        // Bridge for time-based exercises: store seconds in the `reps` column until DB support lands.
        reps: isTimeBased ? updatedSet.seconds : updatedSet.reps,
        weight: updatedSet.weight,
      };
      updateSetMutation.mutate(
        {
          setId,
          update: persistedUpdate,
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

    if (normalizedUpdate.completed === false) {
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
      transitionToFeedbackStage();
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
      exerciseId,
      exerciseName:
        updatedSession.sections
          .flatMap((section) => section.exercises)
          .find((exercise) => exercise.id === exerciseId)?.name ?? 'Next set',
      setId: updatedSet.id,
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

  function handleFinishWorkout() {
    if (remainingSetCount > 0) {
      setIsFinishDialogOpen(true);
      return;
    }

    transitionToFeedbackStage();
  }

  function confirmFinishWorkout() {
    setIsFinishDialogOpen(false);
    transitionToFeedbackStage();
  }

  function transitionToFeedbackStage() {
    setRestTimer(null);
    setRestTimerTargetSetId(null);
    setFocusSetId(null);
    setSessionCompletedAt((current) => current ?? new Date().toISOString());
    setStage('feedback');
  }

  function handleStartTimeChange(nextStartTimeIso: string) {
    setStartTimeOverride(nextStartTimeIso);
    const persistedStartTime = activeSession ? new Date(activeSession.startedAt).toISOString() : null;

    if (!activeSessionId) {
      return;
    }

    setSessionError(null);
    updateSessionStartTimeMutation.mutate(
      {
        startedAt: new Date(nextStartTimeIso).getTime(),
      },
      {
        onError: (error) => {
          if (isSessionNotActiveError(error)) {
            redirectToCompletedSessionNotice();
            return;
          }

          setSessionError('Unable to update session start time. Try again.');
          setStartTimeOverride(persistedStartTime);
        },
        onSuccess: (updatedSession) => {
          setStartTimeOverride(new Date(updatedSession.startedAt).toISOString());
        },
      },
    );
  }

  function handlePauseResumeToggle() {
    if (!activeSessionId || !activeSessionStatus) {
      return;
    }

    const nextStatus = activeSessionStatus === 'paused' ? 'in-progress' : 'paused';

    setSessionError(null);
    updateSessionStatusMutation.mutate(
      {
        status: nextStatus,
      },
      {
        onError: () => {
          setSessionError(`Unable to ${nextStatus === 'paused' ? 'pause' : 'resume'} workout.`);
        },
      },
    );
  }

  function confirmCancelWorkout() {
    if (!activeSessionId) {
      return;
    }

    setSessionError(null);
    updateSessionStatusMutation.mutate(
      {
        status: 'cancelled',
      },
      {
        onError: () => {
          setSessionError('Unable to cancel workout. Try again.');
        },
        onSettled: () => {
          setIsCancelDialogOpen(false);
        },
        onSuccess: () => {
          clearStoredActiveWorkoutDraft(activeWorkoutDraftId);
          clearStoredActiveWorkoutSessionId();
          navigate('/workouts', { replace: true });
        },
      },
    );
  }

  function openEditTimeDialog() {
    if (!activeSession) {
      return;
    }

    setTimeSegmentError(null);
    setEditableTimeSegments(activeSession.timeSegments);
    setIsEditTimeDialogOpen(true);
  }

  function addEditableSegment() {
    setEditableTimeSegments((current) => [
      ...current,
      {
        start: new Date().toISOString(),
        end: null,
      },
    ]);
  }

  function removeEditableSegment(index: number) {
    setEditableTimeSegments((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  function updateEditableSegment(
    index: number,
    field: 'start' | 'end',
    value: string | null,
  ) {
    setEditableTimeSegments((current) =>
      current.map((segment, currentIndex) => {
        if (currentIndex !== index) {
          return segment;
        }

        if (field === 'start') {
          const nextStartIso = toIsoStringFromDateTimeLocal(value ?? '');
          return {
            ...segment,
            start: nextStartIso ?? segment.start,
          };
        }

        return {
          ...segment,
          end: value === null ? null : (toIsoStringFromDateTimeLocal(value) ?? segment.end),
        };
      }),
    );
  }

  function saveEditedTimeSegments() {
    if (!activeSessionId) {
      return;
    }

    const parsed = parseEditableTimeSegments(editableTimeSegments);
    if (!parsed.success) {
      setTimeSegmentError(parsed.error);
      return;
    }

    setTimeSegmentError(null);
    setSessionError(null);
    updateSessionTimeSegmentsMutation.mutate(
      {
        timeSegments: parsed.data,
      },
      {
        onError: () => {
          setTimeSegmentError('Unable to save time segments. Fix any invalid values and try again.');
        },
        onSuccess: () => {
          setIsEditTimeDialogOpen(false);
        },
      },
    );
  }
}

function createSessionSetDrafts(
  template: MockWorkoutTemplate,
  sessionSets: SessionSet[],
  templateExerciseById: Map<
    string,
    {
      exercise: MockWorkoutTemplate['sections'][number]['exercises'][number];
      section: WorkoutTemplateSectionType;
      trackingType: ExerciseTrackingType;
    }
  >,
) {
  const drafts = createInitialWorkoutSetDrafts(template, new Set<string>());

  for (const sessionSet of sessionSets) {
    const trackingType =
      templateExerciseById.get(sessionSet.exerciseId)?.trackingType ?? 'weight_reps';
    const nextSeconds =
      trackingType === 'weight_seconds' ||
      trackingType === 'reps_seconds' ||
      trackingType === 'seconds_only' ||
      trackingType === 'cardio'
        ? sessionSet.reps
        : null;
    const nextReps =
      trackingType === 'weight_seconds' ||
      trackingType === 'reps_seconds' ||
      trackingType === 'seconds_only' ||
      trackingType === 'cardio'
        ? null
        : sessionSet.reps;
    const nextSet = {
      completed: sessionSet.completed,
      distance: null,
      id: sessionSet.id,
      number: sessionSet.setNumber,
      reps: nextReps,
      seconds: nextSeconds,
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

function mapFeedbackDraftToSessionFeedback(
  draft: ActiveWorkoutFeedbackDraft,
): WorkoutSessionFeedback {
  const sessionRpeField = draft.find(
    (field): field is Extract<ActiveWorkoutFeedbackDraft[number], { type: 'scale' }> =>
      field.id === 'session-rpe' && field.type === 'scale',
  );
  const energyEmojiField = draft.find(
    (field): field is Extract<ActiveWorkoutFeedbackDraft[number], { type: 'emoji' }> =>
      field.id === 'energy-post-workout' && field.type === 'emoji',
  );
  const painField = draft.find(
    (field): field is Extract<ActiveWorkoutFeedbackDraft[number], { type: 'yes_no' }> =>
      field.id === 'pain-discomfort' && field.type === 'yes_no',
  );
  const scaleEntries = draft.filter(
    (
      field,
    ): field is Extract<
      ActiveWorkoutFeedbackDraft[number],
      { type: 'scale'; value?: number | null }
    > => field.type === 'scale',
  );

  return {
    energy: toFeedbackScore(
      toEmojiFeedbackScore(energyEmojiField?.value) ??
        scaleEntries.find((field) => field.id.toLowerCase().includes('energy'))?.value ??
        scaleEntries.at(2)?.value ??
        scaleEntries.at(0)?.value,
    ),
    recovery: toFeedbackScore(
      toPainFeedbackScore(painField?.value) ??
        scaleEntries.find((field) => field.id.toLowerCase().includes('recovery'))?.value ??
        scaleEntries.at(0)?.value,
    ),
    technique: toFeedbackScore(
      toRpeFeedbackScore(sessionRpeField?.value) ??
        scaleEntries.find((field) => field.id.toLowerCase().includes('technique'))?.value ??
        scaleEntries.at(1)?.value ??
        scaleEntries.at(0)?.value,
    ),
    responses: draft
      .map(toWorkoutSessionFeedbackResponse)
      .filter((response): response is WorkoutSessionFeedbackResponse => response !== null),
  };
}

function toWorkoutSessionFeedbackResponse(
  field: ActiveWorkoutCustomFeedbackField,
): WorkoutSessionFeedbackResponse | null {
  const notes = field.notes?.trim();
  const base = {
    id: field.id,
    label: field.label,
    ...(notes ? { notes } : {}),
  };

  switch (field.type) {
    case 'scale':
      if (field.value === null || field.value === undefined) {
        return field.optional ? null : { ...base, type: 'scale', value: field.min };
      }
      return {
        ...base,
        type: 'scale',
        value: field.value,
      };
    case 'slider':
      if (field.value === null || field.value === undefined) {
        return field.optional ? null : { ...base, type: 'slider', value: field.min };
      }
      return {
        ...base,
        type: 'slider',
        value: field.value,
      };
    case 'text':
      return {
        ...base,
        type: 'text',
        value: field.value?.trim() ? field.value.trim() : null,
      };
    case 'yes_no':
      if (field.value === null || field.value === undefined) {
        return field.optional ? null : { ...base, type: 'yes_no', value: false };
      }
      return {
        ...base,
        type: 'yes_no',
        value: field.value,
      };
    case 'emoji':
      if (!field.value?.trim()) {
        return field.optional ? null : { ...base, type: 'emoji', value: field.options[0] ?? '😐' };
      }
      return {
        ...base,
        type: 'emoji',
        value: field.value.trim(),
      };
    case 'multi_select':
      if ((field.value ?? []).length === 0) {
        return field.optional ? null : { ...base, type: 'multi_select', value: [] };
      }
      return {
        ...base,
        type: 'multi_select',
        value: field.value ?? [],
      };
    default:
      return null;
  }
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

function toRpeFeedbackScore(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }

  return Math.max(1, Math.min(5, Math.round(value / 2)));
}

function toEmojiFeedbackScore(value: string | null | undefined) {
  switch (value) {
    case '😫':
      return 1;
    case '😕':
      return 2;
    case '😐':
      return 3;
    case '🙂':
      return 4;
    case '💪':
      return 5;
    default:
      return null;
  }
}

function toPainFeedbackScore(value: boolean | null | undefined) {
  if (value === true) {
    return 2;
  }

  if (value === false) {
    return 4;
  }

  return null;
}

function extractFeedbackNotes(draft: ActiveWorkoutFeedbackDraft) {
  const painDetailsField = draft.find(
    (field) =>
      field.id === 'pain-discomfort' &&
      field.type === 'yes_no' &&
      field.value === true &&
      (field.notes ?? '').trim().length > 0,
  );

  if (painDetailsField) {
    return painDetailsField.notes?.trim() ?? null;
  }

  const textField = draft.find(
    (
      field,
    ): field is Extract<ActiveWorkoutFeedbackDraft[number], { type: 'text'; value?: string }> =>
      field.type === 'text' && (field.value ?? '').trim().length > 0,
  );

  if (textField) {
    return textField.value?.trim() ?? null;
  }

  const fieldWithNotes = draft.find((field) => (field.notes ?? '').trim().length > 0);

  return fieldWithNotes?.notes?.trim() ?? null;
}

async function persistCompletedSessionNotes({
  sessionId,
  notes,
}: {
  sessionId: string;
  notes: string;
}) {
  const payload = updateWorkoutSessionInputSchema.parse({
    notes,
  });

  await apiRequest(`/api/v1/workout-sessions/${sessionId}`, {
    body: JSON.stringify(payload),
    method: 'PATCH',
  });
}

async function createCompletedWorkoutSession(
  input: z.input<typeof createWorkoutSessionInputSchema>,
) {
  const payload = createWorkoutSessionInputSchema.parse({
    ...input,
    status: 'completed',
  });
  const data = await apiRequest<unknown>('/api/v1/workout-sessions', {
    body: JSON.stringify(payload),
    method: 'POST',
  });

  return workoutSessionSchema.parse(data);
}

function isSessionNotActiveError(error: unknown) {
  return (
    error instanceof ApiError && error.status === 409 && error.code === 'WORKOUT_SESSION_NOT_ACTIVE'
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

function toDateTimeLocalValue(isoString: string) {
  const date = new Date(isoString);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function toIsoStringFromDateTimeLocal(value: string) {
  if (value.trim().length === 0) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function parseEditableTimeSegments(timeSegments: WorkoutSessionTimeSegment[]) {
  try {
    const parsed = updateWorkoutSessionTimeSegmentsInputSchema.parse({
      timeSegments,
    });

    return {
      success: true as const,
      data: parsed.timeSegments,
    };
  } catch {
    return {
      success: false as const,
      error: 'Time segments must be ordered, non-overlapping, and each end must be after start.',
    };
  }
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
        formCues: exercise.formCues ?? [],
        templateCues: exercise.cues,
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

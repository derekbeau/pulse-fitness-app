import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { MoreVertical, Pause, Play } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

import {
  createWorkoutSessionInputSchema,
  updateWorkoutSessionTimeSegmentsInputSchema,
  updateWorkoutSessionInputSchema,
  type ExerciseTrackingType,
  type WorkoutSession as ApiWorkoutSession,
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
  buildActiveWorkoutSession,
  createInitialWorkoutSetDrafts,
  createWorkoutSetDraft,
  workoutFeedbackFields,
  workoutSessionContext,
  type ActiveWorkoutCustomFeedbackField,
  type ActiveWorkoutFeedbackDraft,
  type ActiveWorkoutSetDrafts,
} from '@/features/workouts';
import { estimateRemainingTime, estimateTotalTime } from '@/features/workouts/lib/time-estimates';
import { Button } from '@/components/ui/button';
import { useConfirmation } from '@/components/ui/confirmation-dialog';
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
import {
  workoutQueryKeys,
  useWorkoutSessions,
  useWorkoutTemplate,
} from '@/features/workouts/api/workouts';
import {
  formatTrackingMetricBreakdown,
  getSetSummaryMetricValue,
  getTrackingSummaryMetricLabel,
  isRepTrackingType,
  isTimeBasedTrackingType,
  isWeightedTrackingType,
  resolveTrackingType,
  type TrackingSummaryMetricLabel,
} from '@/features/workouts/lib/tracking';
import { useCompleteSession } from '@/hooks/use-complete-session';
import { useLogSet, useUpdateSet } from '@/hooks/use-session-sets';
import { useWeightUnit } from '@/hooks/use-weight-unit';
import {
  useCancelAndRevertSession,
  useUpdateSessionStatus,
  useUpdateSessionStartTime,
  useUpdateSessionTimeSegments,
  useReorderSessionExercises,
  useWorkoutSession,
  workoutSessionQueryKeys,
} from '@/hooks/use-workout-session';
import {
  WORKOUT_SESSION_COMPLETED_NOTICE,
  WORKOUT_SESSION_NOTICE_QUERY_KEY,
  clearStoredActiveWorkoutDraft,
  clearStoredActiveWorkoutSessionId,
  clearStoredWorkoutSessionUiState,
  getStoredActiveWorkoutDraft,
  setStoredActiveWorkoutSessionId,
  setStoredActiveWorkoutDraft,
} from '@/features/workouts/lib/session-persistence';
import { buildSessionSetInputs, extractExerciseNotes } from '@/features/workouts/lib/session-notes';
import { ApiError, apiRequest } from '@/lib/api-client';
import { crossFeatureInvalidationMap, invalidateQueryKeys } from '@/lib/query-invalidation';
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
  supplemental: 'Supplemental',
};

const categoryBadgeByExerciseId = new Map(
  mockExercises.map((exercise) => [exercise.id, exercise.category as MockWorkoutBadgeType]),
);
const mockExerciseById = new Map(mockExercises.map((exercise) => [exercise.id, exercise]));
type ExerciseOrderBySection = Record<WorkoutTemplateSectionType, string[]>;

type RestTimerState = {
  duration: number;
  exerciseId: string;
  exerciseName: string;
  setId: string;
  setNumber: number;
  token: number;
};

const ACTIVE_WORKOUT_POLL_INTERVAL_MS = 10_000;

export function ActiveWorkoutPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnView = searchParams.get('view');
  const returnToActiveListHref = returnView
    ? `/workouts/active?${new URLSearchParams({ view: returnView }).toString()}`
    : '/workouts/active';
  const requestedSessionId = searchParams.get('sessionId');
  const requestedTemplateId = searchParams.get('template');
  const activeSessionsQuery = useWorkoutSessions(
    { status: ['in-progress', 'paused'] },
    { enabled: !requestedTemplateId },
  );
  const completedSessionsQuery = useWorkoutSessions(
    { status: ['completed'], limit: 3 },
    { enabled: !requestedTemplateId },
  );
  const activeSessions = activeSessionsQuery.data ?? [];
  const sessionId =
    requestedSessionId ??
    (!requestedTemplateId && !requestedSessionId && activeSessions.length === 1
      ? (activeSessions[0]?.id ?? null)
      : null);
  const shouldRenderEmptyState =
    !requestedTemplateId &&
    !requestedSessionId &&
    activeSessionsQuery.isSuccess &&
    activeSessions.length === 0;
  const shouldRenderSessionPicker =
    !requestedTemplateId &&
    !requestedSessionId &&
    activeSessionsQuery.isSuccess &&
    activeSessions.length > 1;
  const showBackToSessionList = Boolean(requestedSessionId) && activeSessions.length > 1;
  const [stage, setStage] = useState<'active' | 'feedback' | 'summary'>('active');
  const sessionQuery = useWorkoutSession(sessionId, {
    refetchInterval:
      stage === 'active' && sessionId != null ? ACTIVE_WORKOUT_POLL_INTERVAL_MS : false,
  });
  const { weightUnit } = useWeightUnit();
  const logSetMutation = useLogSet(sessionId);
  const updateSetMutation = useUpdateSet(sessionId);
  const updateSessionStartTimeMutation = useUpdateSessionStartTime(sessionId);
  const updateSessionStatusMutation = useUpdateSessionStatus(sessionId);
  const cancelAndRevertSessionMutation = useCancelAndRevertSession(sessionId);
  const updateSessionTimeSegmentsMutation = useUpdateSessionTimeSegments(sessionId);
  const reorderSessionExercisesMutation = useReorderSessionExercises(sessionId);
  const completeSessionMutation = useCompleteSession(sessionId);
  const resolvedTemplateId = requestedTemplateId ?? sessionQuery.data?.templateId ?? '';
  const shouldLoadApiTemplate = UUID_PATTERN.test(resolvedTemplateId);
  const templateQuery = useWorkoutTemplate(shouldLoadApiTemplate ? resolvedTemplateId : '');

  const selectedMockTemplate = mockTemplates.find((template) => template.id === resolvedTemplateId);
  const apiTemplate = useMemo(
    () => (templateQuery.data ? toMockWorkoutTemplate(templateQuery.data) : null),
    [templateQuery.data],
  );
  const fallbackTemplate = apiTemplate ?? selectedMockTemplate ?? defaultTemplate;
  const activeSession = sessionQuery.data;
  const template = useMemo(
    () => buildTemplateFromSession(activeSession, fallbackTemplate),
    [activeSession, fallbackTemplate],
  );

  const [fallbackStartTime] = useState(() => new Date().toISOString());
  const [startTimeOverride, setStartTimeOverride] = useState<string | null>(null);
  const [exerciseOrderBySection, setExerciseOrderBySection] = useState<ExerciseOrderBySection>(() =>
    buildExerciseOrderFromTemplate(template),
  );
  const [setDrafts, setSetDrafts] = useState<ActiveWorkoutSetDrafts>(() =>
    createInitialWorkoutSetDrafts(template, new Set<string>()),
  );
  const [exerciseNotes, setExerciseNotes] = useState<Record<string, string>>({});
  const [sessionCuesByExercise, setSessionCuesByExercise] = useState<Record<string, string[]>>({});
  const [sessionCompletedAt, setSessionCompletedAt] = useState<string | null>(null);
  const [sessionFeedback, setSessionFeedback] = useState<ActiveWorkoutFeedbackDraft>([]);
  const [sessionNotes, setSessionNotes] = useState('');
  const [completedSessionId, setCompletedSessionId] = useState<string | null>(null);
  const [summarySaving, setSummarySaving] = useState(false);
  const [restTimer, setRestTimer] = useState<RestTimerState | null>(null);
  const [restTimerTargetSetId, setRestTimerTargetSetId] = useState<string | null>(null);
  const [focusSetId, setFocusSetId] = useState<string | null>(null);
  const [showDragHandles, setShowDragHandles] = useState(false);
  const [exerciseSupersetOverrides, setExerciseSupersetOverrides] = useState<
    Record<string, string | null>
  >({});
  const [supersetUpdatePending, setSupersetUpdatePending] = useState(false);
  const { confirm, dialog } = useConfirmation();
  const [isEditTimeDialogOpen, setIsEditTimeDialogOpen] = useState(false);
  const [editableTimeSegments, setEditableTimeSegments] = useState<WorkoutSessionTimeSegment[]>([]);
  const [timeSegmentError, setTimeSegmentError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const restTimerTokenRef = useRef(0);
  const hydratedSessionIdRef = useRef<string | null>(null);
  const hydratedDraftKeyRef = useRef<string | null>(null);
  const lastServerUpdateRef = useRef<number | null>(null);
  const lastSessionStructureRef = useRef<string | null>(null);
  const suppressStructureToastRef = useRef(false);

  const activeSessionId = activeSession?.id ?? null;
  const activeSessionStatus = activeSession?.status ?? null;
  const isPaused = activeSessionStatus === 'paused';
  const activeWorkoutDraftId = activeSessionId ?? sessionId ?? template.id;
  const startTime =
    startTimeOverride ??
    (activeSession ? new Date(activeSession.startedAt).toISOString() : fallbackStartTime);
  const sessionContext = useMemo(() => {
    const recentSessions = (completedSessionsQuery.data ?? []).slice(0, 3).map((session) => ({
      date: session.date,
      id: session.id,
      name: session.name,
      volume: 0,
    }));

    return {
      ...workoutSessionContext,
      recentSessions,
    };
  }, [completedSessionsQuery.data]);
  const redirectToCompletedSessionNotice = useCallback(() => {
    clearStoredActiveWorkoutDraft(activeWorkoutDraftId);
    if (activeSessionId) {
      clearStoredWorkoutSessionUiState(activeSessionId);
    }
    clearStoredActiveWorkoutSessionId();
    navigate(`/workouts?${WORKOUT_SESSION_NOTICE_QUERY_KEY}=${WORKOUT_SESSION_COMPLETED_NOTICE}`, {
      replace: true,
    });
  }, [activeSessionId, activeWorkoutDraftId, navigate]);

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
                trackingType: exercise.trackingType,
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
  const exerciseOrderIndexById = useMemo(
    () => buildExerciseOrderIndexById(template, exerciseOrderBySection),
    [exerciseOrderBySection, template],
  );

  useEffect(() => {
    if (!activeSession) {
      return;
    }

    const serverSetDrafts = createSessionSetDrafts(
      template,
      activeSession.sets,
      templateExerciseById,
    );
    const serverExerciseNotes = extractExerciseNotes(activeSession.sets);
    const serverExerciseOrder = buildExerciseOrderFromSessionSets(template, activeSession.sets);
    const sessionStructureSignature = buildSessionStructureSignature(activeSession);
    const isSessionSwitch = hydratedSessionIdRef.current !== activeSession.id;

    if (!isSessionSwitch && lastServerUpdateRef.current === activeSession.updatedAt) {
      return;
    }

    const previousDraftKey = hydratedDraftKeyRef.current;

    if (isSessionSwitch) {
      const autosavedDraft = getStoredActiveWorkoutDraft(activeSession.id);
      setSetDrafts(autosavedDraft?.setDrafts ?? serverSetDrafts);
      setExerciseNotes(autosavedDraft?.exerciseNotes ?? serverExerciseNotes);
      setSessionCuesByExercise(autosavedDraft?.sessionCuesByExercise ?? {});
      setExerciseOrderBySection(serverExerciseOrder);
      hydratedSessionIdRef.current = activeSession.id;
      hydratedDraftKeyRef.current = activeSession.id;

      if (previousDraftKey && previousDraftKey !== activeSession.id) {
        clearStoredActiveWorkoutDraft(previousDraftKey);
      }

      if (template.id !== activeSession.id) {
        clearStoredActiveWorkoutDraft(template.id);
      }
    } else {
      setSetDrafts((current) => mergeServerSetDrafts(current, serverSetDrafts));
      setExerciseOrderBySection(serverExerciseOrder);
      setExerciseNotes((current) => {
        const nextNotes: Record<string, string> = {};
        const activeExerciseIds = new Set(activeSession.sets.map((set) => set.exerciseId));

        for (const exerciseId of activeExerciseIds) {
          const currentNote = current[exerciseId];
          if (currentNote !== undefined) {
            nextNotes[exerciseId] = currentNote;
            continue;
          }
          const serverNote = serverExerciseNotes[exerciseId];
          if (serverNote !== undefined) {
            nextNotes[exerciseId] = serverNote;
          }
        }

        return nextNotes;
      });

      if (
        lastSessionStructureRef.current &&
        lastSessionStructureRef.current !== sessionStructureSignature
      ) {
        if (suppressStructureToastRef.current) {
          suppressStructureToastRef.current = false;
        } else {
          toast('Workout updated by agent');
        }
      }
    }

    lastServerUpdateRef.current = activeSession.updatedAt;
    lastSessionStructureRef.current = sessionStructureSignature;
  }, [activeSession, template, templateExerciseById]);

  useEffect(() => {
    setExerciseSupersetOverrides({});
  }, [activeSession?.id, activeSession?.updatedAt, template.id]);

  useEffect(() => {
    if (activeSession) {
      return;
    }

    const initialSetDrafts = createInitialWorkoutSetDrafts(template, new Set<string>());
    const autosavedDraft = getStoredActiveWorkoutDraft(activeWorkoutDraftId);

    setSetDrafts(autosavedDraft?.setDrafts ?? initialSetDrafts);
    setExerciseNotes(autosavedDraft?.exerciseNotes ?? {});
    setSessionCuesByExercise(autosavedDraft?.sessionCuesByExercise ?? {});
    setExerciseOrderBySection(buildExerciseOrderFromTemplate(template));
    hydratedSessionIdRef.current = null;
    hydratedDraftKeyRef.current = activeWorkoutDraftId;
    lastServerUpdateRef.current = null;
    lastSessionStructureRef.current = null;
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
        exerciseSupersetOverrides,
        exerciseOrderBySection,
        exerciseNotes,
        sessionStartedAt: startTime,
      }),
    [
      exerciseOrderBySection,
      exerciseNotes,
      exerciseSupersetOverrides,
      setDrafts,
      startTime,
      template,
    ],
  );
  const remainingSetCount = useMemo(
    () => session.totalSets - session.completedSets,
    [session.completedSets, session.totalSets],
  );
  const completedSetsSummary = useMemo(
    () => `${session.completedSets}/${session.totalSets}`,
    [session.completedSets, session.totalSets],
  );
  const summaryExerciseResults = useMemo(
    () =>
      session.sections.flatMap((section) =>
        section.exercises
          .filter((exercise) => section.type !== 'supplemental' || exercise.completedSets > 0)
          .map((exercise) => {
            const completedSets = exercise.sets.filter((set) => set.completed);
            const metricLabel = getTrackingSummaryMetricLabel(exercise.trackingType);
            return {
              id: exercise.id,
              metricLabel,
              metricValue: completedSets.reduce(
                (total, set) => total + getSetSummaryMetricValue(exercise.trackingType, set),
                0,
              ),
              name: exercise.name,
              notes: exercise.notes,
              reps: isRepTrackingType(exercise.trackingType)
                ? completedSets.reduce((total, set) => total + (set.reps ?? 0), 0)
                : 0,
              setsCompleted: exercise.completedSets,
              totalSets: exercise.targetSets,
            };
          }),
      ),
    [session.sections],
  );
  const totalCompletedReps = useMemo(
    () => summaryExerciseResults.reduce((total, exercise) => total + exercise.reps, 0),
    [summaryExerciseResults],
  );
  const summaryMetrics = useMemo(() => {
    const totals: Record<TrackingSummaryMetricLabel, number> = {
      distance: 0,
      reps: 0,
      seconds: 0,
      volume: 0,
    };
    const labels = new Set<TrackingSummaryMetricLabel>();

    summaryExerciseResults.forEach((exercise) => {
      totals[exercise.metricLabel] += exercise.metricValue;
      labels.add(exercise.metricLabel);
    });

    return {
      metricLabel:
        labels.size > 1
          ? 'mixed'
          : (([...labels][0] ?? 'volume') as TrackingSummaryMetricLabel | 'mixed'),
      totals,
    };
  }, [summaryExerciseResults]);
  const totalSessionVolume = useMemo(
    () => summaryMetrics.totals.volume,
    [summaryMetrics.totals.volume],
  );
  const summaryMetricValue =
    summaryMetrics.metricLabel === 'mixed'
      ? null
      : summaryMetrics.totals[summaryMetrics.metricLabel];
  const summaryMetricMixedValue = useMemo(
    () => formatTrackingMetricBreakdown(summaryMetrics.totals, weightUnit),
    [summaryMetrics.totals, weightUnit],
  );
  const estimatedTotalSeconds = useMemo(() => estimateTotalTime(session), [session]);
  const remainingEstimatedSeconds = useMemo(() => estimateRemainingTime(session), [session]);
  const summaryDuration = sessionCompletedAt
    ? formatElapsedTime(getElapsedSeconds(startTime, new Date(sessionCompletedAt).getTime()))
    : formatElapsedTime(getElapsedSeconds(startTime, Date.now()));

  if (!requestedTemplateId && !requestedSessionId && activeSessionsQuery.isPending) {
    return (
      <section className="space-y-3 pb-8">
        <h1 className="text-2xl font-semibold text-foreground">Loading active workouts</h1>
        <p className="text-sm text-muted">Fetching in-progress and paused sessions...</p>
      </section>
    );
  }

  if (!requestedTemplateId && !requestedSessionId && activeSessionsQuery.isError) {
    return (
      <section className="space-y-3 pb-8">
        <h1 className="text-2xl font-semibold text-foreground">Unable to load active workouts</h1>
        <p className="text-sm text-muted">Refresh and try again.</p>
      </section>
    );
  }

  if (sessionId && sessionQuery.isPending) {
    return (
      <section className="space-y-3 pb-8">
        <h1 className="text-2xl font-semibold text-foreground">Loading active session</h1>
        <p className="text-sm text-muted">Fetching workout session details...</p>
      </section>
    );
  }

  if (shouldLoadApiTemplate && templateQuery.isPending && !activeSession) {
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

  if (shouldLoadApiTemplate && templateQuery.isError && !activeSession) {
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

  if (shouldRenderSessionPicker) {
    return (
      <section className="space-y-4 pb-8">
        <h1 className="text-2xl font-semibold text-foreground">Choose an active workout</h1>
        <p className="text-sm text-muted">
          You have multiple sessions in progress. Select one to continue logging.
        </p>
        <div className="grid gap-3">
          {activeSessions.map((activeWorkoutSession) => (
            <Link
              className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50"
              key={activeWorkoutSession.id}
              to={buildActiveWorkoutSessionHref(activeWorkoutSession.id, returnView)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="text-base font-semibold text-foreground">
                    {activeWorkoutSession.templateName ?? activeWorkoutSession.name}
                  </h2>
                  <p className="text-sm text-muted">
                    {`Started ${formatStartedRelativeTime(activeWorkoutSession.startedAt)}`}
                  </p>
                </div>
                <span
                  className={
                    activeWorkoutSession.status === 'paused'
                      ? 'inline-flex items-center rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                      : 'inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                  }
                >
                  {activeWorkoutSession.status === 'paused' ? 'Paused' : 'Active'}
                </span>
              </div>
              <p className="mt-3 text-sm text-muted">
                {`${activeWorkoutSession.exerciseCount} exercise${
                  activeWorkoutSession.exerciseCount === 1 ? '' : 's'
                }`}
              </p>
            </Link>
          ))}
        </div>
        <Button asChild type="button">
          <Link to="/workouts?view=templates">Start from template</Link>
        </Button>
      </section>
    );
  }

  return (
    <section className="space-y-5 pb-8">
      {showBackToSessionList ? (
        <Button asChild size="sm" type="button" variant="ghost">
          <Link to={returnToActiveListHref}>Back to session list</Link>
        </Button>
      ) : null}
      {sessionError ? <p className="text-sm text-destructive">{sessionError}</p> : null}

      {stage === 'active' ? (
        <>
          <SessionHeader
            completedSets={session.completedSets}
            currentExercise={session.currentExercise}
            estimatedTotalSeconds={estimatedTotalSeconds}
            isUpdatingStartTime={updateSessionStartTimeMutation.isPending}
            onRestTimerComplete={handleRestTimerComplete}
            onStartTimeChange={handleStartTimeChange}
            remainingSeconds={remainingEstimatedSeconds}
            restTimer={restTimer}
            startTime={startTime}
            timeSegments={activeSession?.timeSegments}
            totalExercises={session.totalExercises}
            totalSets={session.totalSets}
            workoutName={session.workoutName}
          />

          {activeSessionId &&
          (activeSessionStatus === 'paused' || activeSessionStatus === 'in-progress') ? (
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
                  <DropdownMenuItem onClick={() => setShowDragHandles((current) => !current)}>
                    {showDragHandles ? 'Hide reorder handles' : 'Show reorder handles'}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      confirm({
                        title: 'Cancel workout?',
                        description:
                          'This will cancel the workout and discard all progress. If started from a scheduled workout, it will return to your schedule.',
                        confirmLabel: 'Cancel workout',
                        cancelLabel: 'Keep going',
                        variant: 'destructive',
                        onConfirm: confirmCancelWorkout,
                      })
                    }
                    variant="destructive"
                  >
                    Cancel workout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}

          <SessionContext context={sessionContext} />

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
            onReorderExercises={handleReorderExercises}
            onRemoveSet={handleRemoveSet}
            onSetUpdate={handleSetUpdate}
            onUpdateSupersetGroup={handleUpdateSupersetGroup}
            session={session}
            sessionId={activeSessionId}
            sessionCuesByExercise={sessionCuesByExercise}
            showDragHandles={showDragHandles}
            supersetUpdatePending={supersetUpdatePending}
            weightUnit={weightUnit}
          />

          <div className="pt-2">
            <Button className="w-full sm:w-auto" onClick={handleCompleteWorkout} type="button">
              Complete Workout
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
              exerciseOrderIndexById,
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

              void Promise.all([
                queryClient.invalidateQueries({ queryKey: workoutQueryKeys.all }),
                invalidateQueryKeys(
                  queryClient,
                  crossFeatureInvalidationMap.workoutSessionChange(),
                ),
              ]);

              clearStoredActiveWorkoutDraft(activeWorkoutDraftId);
              if (activeSessionId) {
                clearStoredWorkoutSessionUiState(activeSessionId);
              }
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
          exerciseResults={summaryExerciseResults}
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
            if (persistedSessionId) {
              clearStoredWorkoutSessionUiState(persistedSessionId);
            }
            navigate('/workouts');
          }}
          onNotesChange={setSessionNotes}
          sessionNotes={sessionNotes}
          sessionId={activeSessionId}
          summaryMetricLabel={summaryMetrics.metricLabel}
          summaryMetricMixedValue={summaryMetricMixedValue}
          summaryMetricValue={summaryMetricValue}
          summarySaving={summarySaving}
          totalVolume={totalSessionVolume}
          totalReps={totalCompletedReps}
          completedSets={session.completedSets}
          totalSets={session.totalSets}
          weightUnit={weightUnit}
          workoutName={session.workoutName}
        />
      ) : null}

      {dialog}

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
              <div
                className="grid grid-cols-1 gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1fr_auto]"
                key={`${segment.start}-${index}`}
              >
                <Input
                  aria-label={`Segment ${index + 1} start`}
                  onChange={(event) => updateEditableSegment(index, 'start', event.target.value)}
                  type="datetime-local"
                  value={toDateTimeLocalValue(segment.start)}
                />
                <Input
                  aria-label={`Segment ${index + 1} end`}
                  onChange={(event) =>
                    updateEditableSegment(
                      index,
                      'end',
                      event.target.value.trim().length ? event.target.value : null,
                    )
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
    const serverMaxSetNumber = (activeSession?.sets ?? [])
      .filter((s) => s.exerciseId === exerciseId)
      .reduce((max, s) => Math.max(max, s.setNumber), 0);
    const nextSetNumber = Math.max(exerciseSets.length, serverMaxSetNumber) + 1;

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
                    targetDistance: null,
                    targetSeconds: null,
                    targetWeight: null,
                    targetWeightMax: null,
                    targetWeightMin: null,
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

    const updatedSets = exerciseSets.map((set) =>
      set.id === setId
        ? {
            ...normalizeSetDraftForTrackingType(
              {
                ...set,
                ...update,
              },
              templateExercise.trackingType,
            ),
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
      const isTimeBased = isTimeBasedTrackingType(templateExercise.trackingType);
      const persistedUpdate = {
        completed: updatedSet.completed,
        // Bridge for time-based exercises: store seconds in the `reps` column until DB support lands.
        reps: isTimeBased ? updatedSet.seconds : updatedSet.reps,
        weight: isWeightedTrackingType(templateExercise.trackingType) ? updatedSet.weight : null,
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

    if (update.completed === false) {
      setRestTimer(null);
      setRestTimerTargetSetId(null);
      setFocusSetId(null);
      return;
    }

    if (update.completed !== true || previousSet.completed || !updatedSet.completed) {
      return;
    }

    const updatedSession = buildActiveWorkoutSession(template, nextDrafts, {
      exerciseSupersetOverrides,
      exerciseOrderBySection,
      exerciseNotes,
      sessionStartedAt: startTime,
    });

    const nextTargetSetId = findNextPendingSetId(updatedSession);

    if (!nextTargetSetId) {
      setRestTimer(null);
      setRestTimerTargetSetId(null);
      setFocusSetId(null);
      return;
    }

    const completedSetSectionId = findSetSectionId(updatedSession, updatedSet.id);
    const nextSetSectionId = findSetSectionId(updatedSession, nextTargetSetId);
    const shouldFocusNextSet =
      completedSetSectionId !== null &&
      nextSetSectionId !== null &&
      completedSetSectionId === nextSetSectionId;

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
    setRestTimerTargetSetId(shouldFocusNextSet ? nextTargetSetId : null);
    setFocusSetId(null);
  }

  function handleReorderExercises(section: WorkoutTemplateSectionType, exerciseIds: string[]) {
    suppressStructureToastRef.current = true;
    setExerciseOrderBySection((current) => ({
      ...current,
      [section]: exerciseIds,
    }));

    if (!activeSessionId) {
      return;
    }

    setSessionError(null);
    reorderSessionExercisesMutation.mutate(
      {
        section,
        exerciseIds,
      },
      {
        onError: (error) => {
          if (isSessionNotActiveError(error)) {
            redirectToCompletedSessionNotice();
            return;
          }

          setSessionError('Unable to reorder exercises. Try again.');
        },
      },
    );
  }

  async function handleUpdateSupersetGroup(
    section: WorkoutTemplateSectionType,
    exerciseIds: string[],
    supersetGroup: string | null,
  ) {
    if (exerciseIds.length === 0) {
      return;
    }

    const targetSection = session.sections.find(
      (sessionSection) => sessionSection.type === section,
    );
    if (!targetSection) {
      return;
    }

    const targetSectionExerciseIds = new Set(
      targetSection.exercises.map((exercise) => exercise.id),
    );
    const scopedExerciseIds = exerciseIds.filter((exerciseId) =>
      targetSectionExerciseIds.has(exerciseId),
    );
    if (scopedExerciseIds.length === 0) {
      return;
    }

    suppressStructureToastRef.current = true;

    // When creating a superset, reorder exercises so the selected ones are adjacent.
    // Move all selected exercises to be directly after the first selected exercise.
    if (supersetGroup !== null && scopedExerciseIds.length > 1) {
      const currentOrder = targetSection.exercises.map((exercise) => exercise.id);
      const selectedSet = new Set(scopedExerciseIds);
      const firstSelectedIndex = currentOrder.findIndex((id) => selectedSet.has(id));

      if (firstSelectedIndex !== -1) {
        const unselected = currentOrder.filter((id) => !selectedSet.has(id));
        // Preserve the relative order of selected exercises as they appear in the section
        const selectedInOrder = currentOrder.filter((id) => selectedSet.has(id));
        // Insert selected exercises at the position of the first selected one
        const insertIndex = unselected.findIndex((_, i) => i >= firstSelectedIndex);
        const newOrder =
          insertIndex === -1
            ? [...unselected, ...selectedInOrder]
            : [
                ...unselected.slice(0, insertIndex),
                ...selectedInOrder,
                ...unselected.slice(insertIndex),
              ];

        const orderChanged = newOrder.some((id, i) => id !== currentOrder[i]);
        if (orderChanged) {
          handleReorderExercises(section, newOrder);
        }
      }
    }

    const allExercises = session.sections.flatMap((sessionSection) => sessionSection.exercises);
    const previousSupersetByExerciseId = new Map(
      allExercises.map((exercise) => [exercise.id, exercise.supersetGroup] as const),
    );
    const previousValues = new Map(
      scopedExerciseIds.map((exerciseId) => [
        exerciseId,
        previousSupersetByExerciseId.get(exerciseId) ?? null,
      ]),
    );
    const nextOverrides = Object.fromEntries(
      scopedExerciseIds.map((exerciseId) => [exerciseId, supersetGroup]),
    );

    setExerciseSupersetOverrides((current) => ({
      ...current,
      ...nextOverrides,
    }));

    if (!activeSessionId) {
      return;
    }

    setSupersetUpdatePending(true);
    setSessionError(null);
    try {
      const updatedSession = await persistSessionSupersetGroups({
        exerciseUpdates: scopedExerciseIds.map((exerciseId) => ({
          exerciseId,
          supersetGroup,
        })),
        sessionId: activeSessionId,
      });

      queryClient.setQueryData(workoutSessionQueryKeys.detail(activeSessionId), updatedSession);
      queryClient.setQueryData(workoutQueryKeys.session(activeSessionId), updatedSession);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: workoutSessionQueryKeys.detail(activeSessionId),
        }),
        queryClient.invalidateQueries({
          queryKey: workoutQueryKeys.session(activeSessionId),
        }),
      ]);
    } catch (error) {
      if (isSessionNotActiveError(error)) {
        redirectToCompletedSessionNotice();
        return;
      }

      setExerciseSupersetOverrides((current) => {
        const reverted = { ...current };
        for (const [exerciseId, previousSupersetGroup] of previousValues.entries()) {
          reverted[exerciseId] = previousSupersetGroup;
        }

        return reverted;
      });
      setSessionError('Unable to update superset. Try again.');
    } finally {
      setSupersetUpdatePending(false);
    }
  }

  function handleRestTimerComplete() {
    setRestTimer(null);
    setFocusSetId(restTimerTargetSetId);
    setRestTimerTargetSetId(null);
  }

  function handleCompleteWorkout() {
    confirm({
      title: 'Complete this workout?',
      description:
        remainingSetCount > 0
          ? `End workout with ${remainingSetCount} sets remaining?`
          : 'You can review, add notes, and enter feedback before finalizing.',
      confirmLabel: 'Complete',
      onConfirm: transitionToFeedbackStage,
      variant: 'default',
    });
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
    const persistedStartTime = activeSession
      ? new Date(activeSession.startedAt).toISOString()
      : null;

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
    cancelAndRevertSessionMutation.mutate(undefined, {
      onError: () => {
        setSessionError('Unable to cancel workout. Try again.');
      },
      onSuccess: () => {
        clearStoredActiveWorkoutDraft(activeWorkoutDraftId);
        clearStoredWorkoutSessionUiState(activeSessionId);
        clearStoredActiveWorkoutSessionId();
        navigate('/workouts', { replace: true });
      },
    });
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
    setEditableTimeSegments((current) =>
      current.filter((_, currentIndex) => currentIndex !== index),
    );
  }

  function updateEditableSegment(index: number, field: 'start' | 'end', value: string | null) {
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
          setTimeSegmentError(
            'Unable to save time segments. Fix any invalid values and try again.',
          );
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
    const isTimeBased = isTimeBasedTrackingType(trackingType);
    const nextSeconds = isTimeBased ? sessionSet.reps : null;
    const nextReps = isTimeBased ? null : sessionSet.reps;
    const nextSet = {
      completed: sessionSet.completed,
      distance: null,
      id: sessionSet.id,
      number: sessionSet.setNumber,
      reps: nextReps,
      seconds: nextSeconds,
      targetDistance: sessionSet.targetDistance ?? null,
      targetSeconds: sessionSet.targetSeconds ?? null,
      targetWeight: sessionSet.targetWeight ?? null,
      targetWeightMax: sessionSet.targetWeightMax ?? null,
      targetWeightMin: sessionSet.targetWeightMin ?? null,
      weight: isWeightedTrackingType(trackingType) ? sessionSet.weight : null,
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

function mergeServerSetDrafts(
  currentSetDrafts: ActiveWorkoutSetDrafts,
  serverSetDrafts: ActiveWorkoutSetDrafts,
) {
  const nextDrafts: ActiveWorkoutSetDrafts = {};

  for (const [exerciseId, serverExerciseDrafts] of Object.entries(serverSetDrafts)) {
    const currentExerciseDrafts = currentSetDrafts[exerciseId] ?? [];

    nextDrafts[exerciseId] = serverExerciseDrafts.map((serverSetDraft) => {
      const currentDraft = currentExerciseDrafts.find(
        (set) => set.number === serverSetDraft.number,
      );

      if (!currentDraft) {
        return serverSetDraft;
      }

      if (currentDraft.completed || serverSetDraft.completed) {
        // Completed sets are server-authoritative; this may replace uncommitted local input if
        // an external actor completed the set between poll intervals.
        return serverSetDraft;
      }

      return {
        ...serverSetDraft,
        distance: currentDraft.distance,
        reps: currentDraft.reps,
        seconds: currentDraft.seconds,
        targetDistance: currentDraft.targetDistance,
        targetSeconds: currentDraft.targetSeconds,
        targetWeight: currentDraft.targetWeight,
        targetWeightMax: currentDraft.targetWeightMax,
        targetWeightMin: currentDraft.targetWeightMin,
        weight: currentDraft.weight,
      };
    });
  }

  return nextDrafts;
}

function buildSessionStructureSignature(session: ApiWorkoutSession) {
  const sortedSets = [...session.sets].sort((left, right) => {
    const leftSection = left.section ?? 'main';
    const rightSection = right.section ?? 'main';
    if (leftSection !== rightSection) {
      return leftSection.localeCompare(rightSection);
    }

    if ((left.orderIndex ?? 0) !== (right.orderIndex ?? 0)) {
      return (left.orderIndex ?? 0) - (right.orderIndex ?? 0);
    }

    if (left.exerciseId !== right.exerciseId) {
      return left.exerciseId.localeCompare(right.exerciseId);
    }

    return left.setNumber - right.setNumber;
  });

  return sortedSets
    .map(
      (set) => `${set.section ?? 'main'}:${set.exerciseId}:${set.orderIndex ?? 0}:${set.setNumber}`,
    )
    .join('|');
}

function buildExerciseOrderFromTemplate(template: MockWorkoutTemplate): ExerciseOrderBySection {
  return {
    warmup:
      template.sections
        .find((section) => section.type === 'warmup')
        ?.exercises.map((exercise) => exercise.exerciseId) ?? [],
    main:
      template.sections
        .find((section) => section.type === 'main')
        ?.exercises.map((exercise) => exercise.exerciseId) ?? [],
    cooldown:
      template.sections
        .find((section) => section.type === 'cooldown')
        ?.exercises.map((exercise) => exercise.exerciseId) ?? [],
    supplemental:
      template.sections
        .find((section) => section.type === 'supplemental')
        ?.exercises.map((exercise) => exercise.exerciseId) ?? [],
  };
}

function buildExerciseOrderFromSessionSets(
  template: MockWorkoutTemplate,
  sessionSets: SessionSet[],
): ExerciseOrderBySection {
  const templateOrder = buildExerciseOrderFromTemplate(template);
  const sectionOrder = {
    warmup: [] as string[],
    main: [] as string[],
    cooldown: [] as string[],
    supplemental: [] as string[],
  };

  const sortedSets = [...sessionSets].sort((left, right) => {
    if ((left.orderIndex ?? 0) !== (right.orderIndex ?? 0)) {
      return (left.orderIndex ?? 0) - (right.orderIndex ?? 0);
    }

    if (left.exerciseId !== right.exerciseId) {
      return left.exerciseId.localeCompare(right.exerciseId);
    }

    return left.setNumber - right.setNumber;
  });

  for (const set of sortedSets) {
    if (
      set.section !== 'warmup' &&
      set.section !== 'main' &&
      set.section !== 'cooldown' &&
      set.section !== 'supplemental'
    ) {
      continue;
    }

    if (sectionOrder[set.section].includes(set.exerciseId)) {
      continue;
    }

    sectionOrder[set.section].push(set.exerciseId);
  }

  return {
    warmup: mergeExerciseOrder(sectionOrder.warmup, templateOrder.warmup),
    main: mergeExerciseOrder(sectionOrder.main, templateOrder.main),
    cooldown: mergeExerciseOrder(sectionOrder.cooldown, templateOrder.cooldown),
    supplemental: mergeExerciseOrder(sectionOrder.supplemental, templateOrder.supplemental),
  };
}

function mergeExerciseOrder(primary: string[], fallback: string[]) {
  return Array.from(new Set([...primary, ...fallback]));
}

function buildExerciseOrderIndexById(
  template: MockWorkoutTemplate,
  exerciseOrderBySection: ExerciseOrderBySection,
) {
  const fallbackOrder = buildExerciseOrderFromTemplate(template);
  const orderIndexById: Record<string, number> = {};
  const sections: WorkoutTemplateSectionType[] = ['warmup', 'main', 'cooldown'];

  for (const section of sections) {
    const mergedOrder = mergeExerciseOrder(exerciseOrderBySection[section], fallbackOrder[section]);
    mergedOrder.forEach((exerciseId, index) => {
      orderIndexById[exerciseId] = index;
    });
  }

  return orderIndexById;
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

async function persistSessionSupersetGroups({
  exerciseUpdates,
  sessionId,
}: {
  exerciseUpdates: Array<{ exerciseId: string; supersetGroup: string | null }>;
  sessionId: string;
}) {
  const payload = updateWorkoutSessionInputSchema.parse({
    exercises: exerciseUpdates,
  });
  const data = await apiRequest<unknown>(`/api/v1/workout-sessions/${sessionId}`, {
    body: JSON.stringify(payload),
    method: 'PATCH',
  });

  return workoutSessionSchema.parse(data);
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

function findSetSectionId(session: ReturnType<typeof buildActiveWorkoutSession>, setId: string) {
  for (const section of session.sections) {
    for (const exercise of section.exercises) {
      if (exercise.sets.some((set) => set.id === setId)) {
        return section.id;
      }
    }
  }

  return null;
}

function normalizeSetDraftForTrackingType<T extends { weight: number | null }>(
  setDraft: T,
  trackingType: ExerciseTrackingType,
) {
  if (!isWeightedTrackingType(trackingType)) {
    return {
      ...setDraft,
      weight: null,
    };
  }

  return setDraft;
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

function buildActiveWorkoutSessionHref(sessionId: string, view: string | null) {
  const searchParams = new URLSearchParams();
  searchParams.set('sessionId', sessionId);

  if (view) {
    searchParams.set('view', view);
  }

  return `/workouts/active?${searchParams.toString()}`;
}

function formatStartedRelativeTime(startedAt: number) {
  const elapsedMs = Date.now() - startedAt;
  const elapsedMinutes = Math.max(0, Math.round(elapsedMs / 60_000));

  if (elapsedMinutes < 1) {
    return 'just now';
  }

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes} min ago`;
  }

  const elapsedHours = Math.round(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours} hr ago`;
  }

  const elapsedDays = Math.round(elapsedHours / 24);
  return `${elapsedDays} day${elapsedDays === 1 ? '' : 's'} ago`;
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
        trackingType: exercise.trackingType,
        supersetGroup: exercise.supersetGroup,
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

function buildTemplateFromSession(
  activeSession: ApiWorkoutSession | undefined,
  fallbackTemplate: MockWorkoutTemplate,
): MockWorkoutTemplate {
  if (!activeSession) {
    return fallbackTemplate;
  }

  const sectionOrder: WorkoutTemplateSectionType[] = ['warmup', 'main', 'cooldown', 'supplemental'];
  const fallbackExerciseById = new Map(
    fallbackTemplate.sections.flatMap((section) =>
      section.exercises.map((exercise) => [
        exercise.exerciseId,
        { exercise, section: section.type },
      ]),
    ),
  );
  const fallbackExerciseNameById = new Map(
    fallbackTemplate.sections.flatMap((section) =>
      section.exercises.map((exercise) => [exercise.exerciseId, exercise.exerciseName]),
    ),
  );
  const sessionExercises =
    activeSession.exercises && activeSession.exercises.length > 0
      ? activeSession.exercises
      : buildSessionExercisesFromSets(activeSession);
  const sectionsByType = new Map<
    WorkoutTemplateSectionType,
    MockWorkoutTemplate['sections'][number]
  >(sectionOrder.map((type) => [type, { type, title: sectionTitleByType[type], exercises: [] }]));

  for (const sessionExercise of sessionExercises) {
    const sectionType = sessionExercise.section ?? 'main';
    const targetSection = sectionsByType.get(sectionType);
    if (!targetSection) {
      continue;
    }

    const fallbackExercise = fallbackExerciseById.get(sessionExercise.exerciseId)?.exercise;
    const defaultReps = fallbackExercise?.reps ?? inferExerciseRepsFromSets(sessionExercise.sets);

    targetSection.exercises.push({
      exerciseId: sessionExercise.exerciseId,
      exerciseName:
        sessionExercise.exerciseName ||
        fallbackExerciseNameById.get(sessionExercise.exerciseId) ||
        'Unknown Exercise',
      trackingType: fallbackExercise?.trackingType ?? sessionExercise.trackingType ?? undefined,
      supersetGroup: sessionExercise.supersetGroup ?? fallbackExercise?.supersetGroup ?? null,
      sets: Math.max(
        fallbackExercise?.sets ?? 0,
        sessionExercise.sets.reduce((maxValue, set) => Math.max(maxValue, set.setNumber), 0),
      ),
      reps: defaultReps,
      tempo: fallbackExercise?.tempo ?? '2111',
      restSeconds: fallbackExercise?.restSeconds ?? 60,
      formCues: fallbackExercise?.formCues ?? [],
      templateCues: fallbackExercise?.templateCues ?? [],
      badges: fallbackExercise?.badges ?? getDefaultExerciseBadges(sessionExercise.exerciseId),
    });
  }

  for (const section of sectionsByType.values()) {
    section.exercises.sort((left, right) => {
      const leftOrder = sessionExercises.find(
        (exercise) => exercise.exerciseId === left.exerciseId,
      )?.orderIndex;
      const rightOrder = sessionExercises.find(
        (exercise) => exercise.exerciseId === right.exerciseId,
      )?.orderIndex;
      if ((leftOrder ?? 0) !== (rightOrder ?? 0)) {
        return (leftOrder ?? 0) - (rightOrder ?? 0);
      }
      return (left.exerciseName ?? '').localeCompare(right.exerciseName ?? '');
    });
  }

  return {
    ...fallbackTemplate,
    id: activeSession.templateId ?? fallbackTemplate.id,
    name: activeSession.name,
    sections: sectionOrder
      .map((type) => sectionsByType.get(type))
      .filter((section): section is MockWorkoutTemplate['sections'][number] =>
        Boolean(section && section.exercises.length > 0),
      ),
  };
}

function buildSessionExercisesFromSets(session: ApiWorkoutSession) {
  const namesById = new Map(
    session.sets.map((set) => [
      set.exerciseId,
      mockExerciseById.get(set.exerciseId)?.name ?? 'Unknown Exercise',
    ]),
  );
  const grouped = new Map<
    string,
    {
      exerciseId: string;
      exerciseName: string;
      orderIndex: number;
      trackingType: ExerciseTrackingType | null;
      section: WorkoutTemplateSectionType | null;
      supersetGroup: string | null;
      sets: SessionSet[];
    }
  >();

  for (const set of session.sets) {
    const existing = grouped.get(set.exerciseId);
    if (existing) {
      existing.orderIndex = Math.min(existing.orderIndex, set.orderIndex ?? 0);
      existing.sets.push(set);
      continue;
    }

    grouped.set(set.exerciseId, {
      exerciseId: set.exerciseId,
      exerciseName: namesById.get(set.exerciseId) ?? 'Unknown Exercise',
      orderIndex: set.orderIndex ?? 0,
      trackingType: null,
      section: set.section,
      supersetGroup: null,
      sets: [set],
    });
  }

  return Array.from(grouped.values()).sort((left, right) => {
    const leftSection = left.section ?? 'main';
    const rightSection = right.section ?? 'main';
    if (leftSection !== rightSection) {
      return leftSection.localeCompare(rightSection);
    }

    if (left.orderIndex !== right.orderIndex) {
      return left.orderIndex - right.orderIndex;
    }

    return left.exerciseName.localeCompare(right.exerciseName);
  });
}

function inferExerciseRepsFromSets(sets: SessionSet[]) {
  const defaultReps = sets.find((set) => !set.completed && set.reps !== null)?.reps;
  if (defaultReps !== undefined && defaultReps !== null) {
    return String(defaultReps);
  }

  return '';
}

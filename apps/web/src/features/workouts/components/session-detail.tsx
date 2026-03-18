import { useId, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  ArrowLeft,
  ChevronDown,
  Dumbbell,
  ListChecks,
  NotebookPen,
  Repeat2,
  Scale,
  TrendingUp,
} from 'lucide-react';
import {
  type ExerciseTrackingType,
  type SessionSet,
  type WeightUnit,
  type WorkoutSession,
  type WorkoutSessionFeedbackResponse,
  type WorkoutTemplate,
  type WorkoutTemplateSectionType,
} from '@pulse/shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useConfirmation } from '@/components/ui/confirmation-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatCard } from '@/components/ui/stat-card';
import { useStartSession } from '@/hooks/use-workout-session';
import { useWeightUnit } from '@/hooks/use-weight-unit';
import { toDateKey } from '@/lib/date-utils';
import {
  formatDuration,
  formatServing,
  formatWeight as formatWeightValue,
} from '@/lib/format-utils';
import { cn } from '@/lib/utils';

import {
  useCompletedSessions,
  useCorrectSessionSets,
  useWorkoutSession,
  useWorkoutSessions,
  useWorkoutTemplate,
} from '../api/workouts';
import { buildInitialSessionSets } from '../lib/workout-session-sets';
import {
  formatTrackingMetricBreakdown,
  formatSetSummary,
  getDistanceUnit,
  getSetDistance,
  getSetSeconds,
  getSetSummaryMetricValue,
  getTrackingSummaryMetricLabel,
  isRepTrackingType,
  type TrackingSummaryMetricLabel,
  resolveTrackingType,
} from '../lib/tracking';
import { findPreviousTemplateSession } from '../lib/session-comparison';
import type { ActiveWorkoutExerciseHistoryPoint } from '../types';
import { ExerciseTrendChart } from './exercise-trend-chart';
import { MarkdownNote } from './markdown-note';
import { SessionComparison, SessionExerciseComparison } from './session-comparison';

type SessionDetailProps = {
  sessionId: string;
};

type SessionDetailSectionType = WorkoutTemplateSectionType | 'supplemental';

type SessionDetailExercise = {
  exerciseId: string;
  name: string;
  notes: string | null;
  phaseBadge: 'moderate' | 'rebuild' | 'recovery' | 'test';
  sets: SessionSet[];
  trackingType: ExerciseTrackingType;
};

type SessionDetailSection = {
  exercises: SessionDetailExercise[];
  subtitle: string;
  type: SessionDetailSectionType;
};

type SessionSetDraft = {
  reps: string;
  weight: string;
};

type SessionSetDraftKey = keyof SessionSetDraft;

type SessionSetEditorField = {
  inputMode: 'decimal' | 'numeric';
  key: SessionSetDraftKey;
  label: string;
  step: string;
  suffix?: string;
};

type SessionMetricLabel = TrackingSummaryMetricLabel | 'mixed';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
});

const integerFormatter = new Intl.NumberFormat('en-US');
const decimalFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

const sectionLabels: Record<SessionDetailSectionType, string> = {
  warmup: 'Warmup',
  main: 'Main',
  cooldown: 'Cooldown',
  supplemental: 'Supplemental',
};

const phaseBadgeStyles = {
  rebuild:
    'border-transparent bg-[var(--color-accent-mint)] text-on-mint dark:bg-emerald-500/20 dark:text-emerald-400',
  recovery:
    'border-transparent bg-[var(--color-accent-cream)] text-on-cream dark:bg-amber-500/20 dark:text-amber-400',
  moderate:
    'border-transparent bg-secondary text-secondary-foreground dark:bg-secondary/80 dark:text-foreground',
  test: 'border-transparent bg-[var(--color-accent-pink)] text-on-pink dark:bg-pink-500/20 dark:text-pink-400',
} as const;

export function SessionDetail({ sessionId }: SessionDetailProps) {
  const { weightUnit } = useWeightUnit();
  const comparisonToggleId = useId();
  const [showComparison, setShowComparison] = useState(false);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [setDrafts, setSetDrafts] = useState<Record<string, SessionSetDraft>>({});
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { confirm, dialog: confirmDialog } = useConfirmation();
  const sessionQuery = useWorkoutSession(sessionId);
  const completedSessionsQuery = useCompletedSessions();
  const activeSessionsQuery = useWorkoutSessions({ status: ['in-progress', 'paused'] });
  const session = sessionQuery.data;
  const correctSessionSetsMutation = useCorrectSessionSets(sessionId);
  const startSessionMutation = useStartSession();
  const templateQuery = useWorkoutTemplate(session?.templateId ?? '');
  const template = templateQuery.data;
  const viewParam = searchParams.get('view');
  const backView = viewParam === 'list' || viewParam === 'calendar' ? viewParam : 'calendar';
  const backToWorkoutsHref = `/workouts?view=${backView}`;

  const previousSessionItem = useMemo(() => {
    if (!session || !completedSessionsQuery.data) {
      return null;
    }

    return findPreviousTemplateSession(session, completedSessionsQuery.data);
  }, [completedSessionsQuery.data, session]);

  const previousSessionQuery = useWorkoutSession(previousSessionItem?.id ?? '', {
    enabled: showComparison && previousSessionItem != null,
  });
  const previousSession = previousSessionQuery.data ?? null;
  const comparisonToggleDisabled = completedSessionsQuery.isLoading;

  if (sessionQuery.isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted">Loading session…</p>
        </CardContent>
      </Card>
    );
  }

  if (!session) {
    return (
      <Card>
        <CardHeader className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">Session not found</h1>
          <p className="text-sm text-muted">
            The requested completed workout session could not be loaded.
          </p>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full sm:w-auto">
            <Link to={backToWorkoutsHref}>Back to Workouts</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const sessionDate = new Date(session.startedAt);
  const durationLabel = formatDuration(session.duration);
  const summary = getSessionSummary(session, template ?? null);
  const shouldShowRepsStat = summary.metricTotals.reps > 0 && summary.metricLabel !== 'reps';
  const sections = buildSections(session, template);
  const selectedExercise = sections
    .flatMap((section) => section.exercises)
    .find((exercise) => exercise.exerciseId === selectedExerciseId);
  const selectedExerciseHistory =
    selectedExercise != null
      ? buildExerciseHistory({
          currentSession: session,
          exerciseId: selectedExercise.exerciseId,
          previousSession,
          trackingType: selectedExercise.trackingType,
        })
      : [];

  const startEditing = () => {
    setSetDrafts(buildSessionSetDrafts(session.sets));
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setSetDrafts({});
  };

  const updateSetDraft = (set: SessionSet, key: SessionSetDraftKey, value: string) => {
    setSetDrafts((current) => ({
      ...current,
      [set.id]: {
        ...(current[set.id] ?? createSessionSetDraft(set)),
        [key]: value,
      },
    }));
  };

  const saveCorrections = async () => {
    const corrections = buildChangedSetCorrections(session.sets, setDrafts);

    if (corrections.length === 0) {
      cancelEditing();
      return;
    }

    await correctSessionSetsMutation.mutateAsync(corrections);
    cancelEditing();
  };

  return (
    <section className="space-y-6">
      <Button asChild className="gap-2" size="sm" variant="ghost">
        <Link to={backToWorkoutsHref}>
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to Workouts
        </Link>
      </Button>

      <Card className="gap-0 overflow-hidden border-transparent bg-card/80 py-0">
        <div
          className={cn(
            'space-y-4 bg-[var(--color-accent-mint)] px-6 py-6 text-on-mint dark:border-b dark:border-border dark:bg-card dark:text-foreground',
            isEditing && 'bg-[color-mix(in_srgb,var(--color-accent-mint)_72%,white)]',
          )}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] opacity-70 dark:text-muted dark:opacity-100">
                  Workout receipt
                </p>
                <Badge
                  className="border-transparent bg-white/55 text-on-accent dark:bg-secondary"
                  variant="outline"
                >
                  Completed
                </Badge>
              </div>
              <h1 className="text-3xl font-semibold tracking-tight">
                {session.name || template?.name || 'Workout Session'}
              </h1>
              <p className="max-w-3xl text-sm opacity-80 sm:text-base dark:text-muted dark:opacity-100">
                {dateFormatter.format(sessionDate)}
                {' · '}
                {durationLabel === '-' ? 'Duration not tracked' : durationLabel}
                {' · '}
                {`Started ${timeFormatter.format(sessionDate)}`}
              </p>
            </div>

            <div className="flex flex-col gap-3 lg:items-end">
              {session.status === 'completed' ? (
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {isEditing ? (
                    <>
                      <Button
                        disabled={correctSessionSetsMutation.isPending}
                        onClick={cancelEditing}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Cancel
                      </Button>
                      <Button
                        disabled={correctSessionSetsMutation.isPending}
                        onClick={() => {
                          void saveCorrections();
                        }}
                        size="sm"
                        type="button"
                      >
                        {correctSessionSetsMutation.isPending ? 'Saving…' : 'Save'}
                      </Button>
                    </>
                  ) : (
                    <Button onClick={startEditing} size="sm" type="button" variant="secondary">
                      Edit
                    </Button>
                  )}
                </div>
              ) : null}

              {template?.tags?.length ? (
                <div className="flex flex-wrap gap-2 lg:max-w-sm lg:justify-end">
                  {template.tags.map((tag) => (
                    <Badge
                      className="border-white/45 bg-white/55 dark:border-border dark:bg-secondary"
                      key={tag}
                      variant="outline"
                    >
                      {formatLabel(tag)}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </Card>

      {isEditing ? (
        <div className="rounded-3xl border border-[color-mix(in_srgb,var(--color-accent-mint)_55%,transparent)] bg-[color-mix(in_srgb,var(--color-accent-mint)_18%,transparent)] px-4 py-3 text-sm text-foreground shadow-sm">
          Adjust set values inline, then save the receipt. Weight plus rep or time values are
          supported here today.
        </div>
      ) : null}

      <div
        className={cn(
          'grid gap-2.5 sm:grid-cols-2',
          shouldShowRepsStat ? 'xl:grid-cols-4' : 'xl:grid-cols-3',
        )}
      >
        <StatCard
          accentTextClassName="text-blue-900 dark:text-blue-200"
          className="border-blue-200/70 bg-blue-500/10 dark:border-blue-400/30 dark:bg-blue-500/15"
          icon={<Dumbbell aria-hidden="true" className="size-4" />}
          label="Exercises"
          value={`${summary.totalExercises}`}
        />
        <StatCard
          accentTextClassName="text-fuchsia-900 dark:text-fuchsia-200"
          className="border-fuchsia-200/70 bg-fuchsia-500/10 dark:border-fuchsia-400/30 dark:bg-fuchsia-500/15"
          icon={<ListChecks aria-hidden="true" className="size-4" />}
          label="Sets"
          value={`${summary.totalSets}`}
        />
        {shouldShowRepsStat ? (
          <StatCard
            accentTextClassName="text-fuchsia-900 dark:text-fuchsia-200"
            className="border-fuchsia-200/70 bg-fuchsia-500/10 dark:border-fuchsia-400/30 dark:bg-fuchsia-500/15"
            icon={<Repeat2 aria-hidden="true" className="size-4" />}
            label="Reps"
            value={integerFormatter.format(summary.metricTotals.reps)}
          />
        ) : null}
        <StatCard
          accentTextClassName="text-emerald-900 dark:text-emerald-200"
          className="border-emerald-200/70 bg-emerald-500/10 dark:border-emerald-400/30 dark:bg-emerald-500/15"
          icon={<Scale aria-hidden="true" className="size-4" />}
          label={formatSummaryMetricLabel(summary.metricLabel)}
          value={formatSummaryMetric(summary.metricTotals, summary.metricLabel, weightUnit)}
        />
      </div>

      {session.notes ? (
        <Card>
          <CardHeader className="gap-2">
            <CardTitle className="flex items-center gap-2">
              <NotebookPen aria-hidden="true" className="size-5 text-primary" />
              Session Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-2xl border border-border bg-secondary/35 px-4 py-3">
              <MarkdownNote className="text-sm text-foreground" content={session.notes} />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">Session comparison</h2>
            <p className="text-sm text-muted">
              Compare this workout against the previous session on the same template.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Checkbox
              checked={showComparison}
              disabled={comparisonToggleDisabled}
              id={comparisonToggleId}
              onCheckedChange={(checked) => setShowComparison(checked === true)}
            />
            <Label className="cursor-pointer" htmlFor={comparisonToggleId}>
              Show comparison
            </Label>
          </div>
        </CardContent>
      </Card>

      {showComparison && !comparisonToggleDisabled ? (
        <SessionComparison
          currentSession={session}
          previousSession={previousSession}
          weightUnit={weightUnit}
        />
      ) : null}

      <div className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-foreground">Section breakdown</h2>
          <p className="text-sm text-muted">Review each phase exactly as it was logged.</p>
        </div>

        {sections.map((section) => (
          // Keep note-bearing sections expanded so logged notes are immediately visible.
          // This avoids hiding notes behind collapsed warmup/cooldown groups.
          // Main remains expanded by default even when it has no notes.
          // Users can still collapse sections manually after first render.
          <details
            className="group overflow-hidden rounded-3xl border border-border bg-card shadow-sm"
            key={section.type}
            open={
              section.type === 'main' ||
              section.exercises.some((exercise) => Boolean(exercise.notes))
            }
          >
            <summary className="cursor-pointer list-none px-4 py-3 sm:px-5 sm:py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold text-foreground">
                    {sectionLabels[section.type]}
                  </h3>
                  <p className="text-sm text-muted">{section.subtitle}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge className="border-border bg-secondary/70" variant="outline">
                    {`${section.exercises.length} exercise${section.exercises.length === 1 ? '' : 's'}`}
                  </Badge>
                  <ChevronDown
                    aria-hidden="true"
                    className="size-4 text-muted transition-transform duration-200 group-open:rotate-180"
                  />
                </div>
              </div>
            </summary>

            <div className="space-y-2.5 border-t border-border px-3 py-3 sm:px-5 sm:py-4">
              {section.exercises.map((exercise) => (
                <Card
                  className={cn(
                    'gap-3 py-0',
                    isEditing &&
                      'border-[color-mix(in_srgb,var(--color-accent-mint)_55%,transparent)] bg-[color-mix(in_srgb,var(--color-accent-mint)_10%,transparent)]',
                  )}
                  key={`${section.type}-${exercise.exerciseId}`}
                >
                  <CardHeader className="gap-2.5 py-3">
                    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <CardTitle>{exercise.name}</CardTitle>
                          <Badge
                            className={cn(
                              'border-transparent',
                              phaseBadgeStyles[exercise.phaseBadge],
                            )}
                            variant="outline"
                          >
                            {formatLabel(exercise.phaseBadge)}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted">
                          {`${exercise.sets.length} logged set${exercise.sets.length === 1 ? '' : 's'}`}
                        </p>
                      </div>

                      <Button
                        aria-label={`Open ${exercise.name} trend chart`}
                        className="size-11 min-h-11 min-w-11 self-start"
                        onClick={() => setSelectedExerciseId(exercise.exerciseId)}
                        size="icon-sm"
                        type="button"
                        variant="outline"
                      >
                        <TrendingUp aria-hidden="true" className="size-4" />
                      </Button>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3 pb-3">
                    {isEditing ? (
                      <div className="space-y-2.5 rounded-2xl border border-[color-mix(in_srgb,var(--color-accent-mint)_55%,transparent)] bg-[color-mix(in_srgb,var(--color-accent-mint)_10%,transparent)] p-2.5">
                        {exercise.sets.map((set) => (
                          <SessionSetEditor
                            draft={setDrafts[set.id] ?? createSessionSetDraft(set)}
                            key={set.id}
                            onChange={(key, value) => updateSetDraft(set, key, value)}
                            set={set}
                            trackingType={exercise.trackingType}
                            weightUnit={weightUnit}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {exercise.sets.map((set) => (
                          <span
                            className="inline-flex rounded-full border border-border bg-secondary/55 px-2.5 py-1 text-[13px] text-foreground"
                            key={set.id}
                          >
                            {formatSetLabel(set, exercise.trackingType, weightUnit)}
                          </span>
                        ))}
                      </div>
                    )}

                    {showComparison ? (
                      <SessionExerciseComparison
                        currentSession={session}
                        exerciseId={exercise.exerciseId}
                        previousSession={previousSession}
                        trackingType={exercise.trackingType}
                        weightUnit={weightUnit}
                      />
                    ) : null}

                    {exercise.notes ? (
                      <div className="rounded-2xl border border-border bg-secondary/35 px-3 py-2.5 text-sm text-foreground">
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                          Exercise notes
                        </p>
                        <MarkdownNote
                          className="text-sm text-foreground"
                          content={exercise.notes}
                        />
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          </details>
        ))}
      </div>

      <Card>
        <CardHeader className="gap-2">
          <CardTitle>Feedback</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {session.feedback ? (
            <>
              {session.feedback.responses && session.feedback.responses.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {session.feedback.responses.map((response) => (
                    <div
                      className="rounded-2xl border border-border bg-secondary/35 p-4"
                      key={response.id}
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                        {response.label}
                      </p>
                      <p className="mt-2 text-base font-semibold text-foreground">
                        {formatFeedbackResponseValue(response)}
                      </p>
                      {response.notes?.trim() ? (
                        <MarkdownNote
                          className="mt-2 text-sm text-muted"
                          content={response.notes.trim()}
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  <FeedbackScore label="Energy" score={session.feedback.energy} />
                  <FeedbackScore label="Recovery" score={session.feedback.recovery} />
                  <FeedbackScore label="Technique" score={session.feedback.technique} />
                </div>
              )}

              {session.feedback.notes ? (
                <div className="rounded-2xl border border-border bg-secondary/35 px-4 py-3 text-sm text-foreground">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                    Reflection
                  </p>
                  <MarkdownNote
                    className="text-sm text-foreground"
                    content={session.feedback.notes}
                  />
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted">No feedback captured for this session.</p>
          )}
        </CardContent>
      </Card>

      {session.templateId && template ? (
        <Button
          className="w-full sm:w-auto"
          disabled={startSessionMutation.isPending}
          onClick={() => handleRepeatWorkout()}
          size="lg"
          type="button"
        >
          Repeat Workout
        </Button>
      ) : null}

      <Dialog
        onOpenChange={(open) => (!open ? setSelectedExerciseId(null) : null)}
        open={selectedExercise != null}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-t-3xl border-border p-0 sm:max-w-4xl sm:rounded-3xl">
          {selectedExercise ? (
            <div className="space-y-0">
              <DialogHeader className="px-6 pt-6">
                <DialogTitle>{`${selectedExercise.name} trends`}</DialogTitle>
                <DialogDescription>
                  Review weight and rep progression for this exercise.
                </DialogDescription>
              </DialogHeader>
              <div className="px-4 pb-4 pt-2 sm:px-6 sm:pb-6">
                <ExerciseTrendChart
                  exerciseName={selectedExercise.name}
                  history={selectedExerciseHistory}
                  trackingType={selectedExercise.trackingType}
                  weightUnit={weightUnit}
                />
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </section>
  );

  async function doRepeatStart() {
    if (!session?.templateId || !template) {
      return;
    }

    const startedAt = Date.now();
    const createdSession = await startSessionMutation.mutateAsync({
      date: toDateKey(new Date(startedAt)),
      name: template.name,
      sets: buildInitialSessionSets(template),
      startedAt,
      templateId: session.templateId,
    });
    navigate(`/workouts/active?template=${session.templateId}&sessionId=${createdSession.id}`);
  }

  function handleRepeatWorkout() {
    if (!session?.templateId || !template) {
      return;
    }

    const activeSessions = activeSessionsQuery.data ?? [];
    if (activeSessions.length > 0) {
      const activeNames = activeSessions
        .map((s) => s.templateName ?? s.name)
        .slice(0, 2)
        .join(', ');
      const suffix = activeSessions.length > 2 ? `, and ${activeSessions.length - 2} more` : '';
      confirm({
        title: 'You already have an active workout',
        description: `${activeNames}${suffix} ${activeSessions.length === 1 ? 'is' : 'are'} currently in progress. Starting a new workout will create an additional session for today.`,
        confirmLabel: 'Start anyway',
        cancelLabel: 'Go back',
        onConfirm: () => {
          void doRepeatStart();
        },
      });
      return;
    }

    void doRepeatStart();
  }
}

function SessionSetEditor({
  draft,
  onChange,
  set,
  trackingType,
  weightUnit,
}: {
  draft: SessionSetDraft;
  onChange: (key: SessionSetDraftKey, value: string) => void;
  set: SessionSet;
  trackingType: ExerciseTrackingType;
  weightUnit: WeightUnit;
}) {
  const fields = getSessionSetEditorFields(trackingType, weightUnit);
  const readOnlySummary = getReadOnlyCorrectionSummary(set, trackingType, weightUnit);

  return (
    <div className="rounded-2xl border border-border/70 bg-background/70 p-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">{`Set ${set.setNumber}`}</p>
          <p className="text-xs text-muted">{formatSetLabel(set, trackingType, weightUnit)}</p>
        </div>
        {set.skipped ? (
          <Badge className="border-border bg-secondary/70" variant="outline">
            Skipped
          </Badge>
        ) : null}
      </div>

      {fields.length > 0 ? (
        <div
          className={cn(
            'mt-2.5 grid gap-2',
            fields.length === 1 ? 'sm:grid-cols-[minmax(0,11rem)]' : 'sm:grid-cols-2',
          )}
        >
          {fields.map((field) => {
            const inputId = `${set.id}-${field.key}`;

            return (
              <div className="space-y-2" key={field.key}>
                <Label
                  className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted"
                  htmlFor={inputId}
                >
                  {field.label}
                </Label>
                <div className="relative">
                  <Input
                    aria-label={`${field.label} for set ${set.setNumber}`}
                    className={cn('h-10 pr-10', field.suffix ? 'pr-12' : '')}
                    id={inputId}
                    inputMode={field.inputMode}
                    min={0}
                    onChange={(event) => onChange(field.key, event.currentTarget.value)}
                    step={field.step}
                    type="number"
                    value={draft[field.key]}
                  />
                  {field.suffix ? (
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] font-semibold uppercase text-muted">
                      {field.suffix}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-2.5 text-sm text-muted">
          No editable set values are available for this entry.
        </p>
      )}

      {readOnlySummary ? <p className="mt-2.5 text-xs text-muted">{readOnlySummary}</p> : null}
    </div>
  );
}

function buildSessionSetDrafts(sets: SessionSet[]) {
  return Object.fromEntries(sets.map((set) => [set.id, createSessionSetDraft(set)]));
}

function createSessionSetDraft(set: SessionSet): SessionSetDraft {
  return {
    reps: set.reps != null ? `${set.reps}` : '',
    weight: set.weight != null ? `${set.weight}` : '',
  };
}

function buildChangedSetCorrections(
  sets: SessionSet[],
  drafts: Record<string, SessionSetDraft>,
): { setId: string; reps?: number; weight?: number }[] {
  return sets.flatMap((set) => {
    const draft = drafts[set.id];

    if (!draft) {
      return [];
    }

    const nextWeight = resolveCorrectionMetric(draft.weight, set.weight);
    const nextReps = resolveCorrectionMetric(draft.reps, set.reps);
    const correction = {
      setId: set.id,
      ...(nextWeight !== set.weight && nextWeight !== null ? { weight: nextWeight } : {}),
      ...(nextReps !== set.reps && nextReps !== null ? { reps: nextReps } : {}),
    };

    return Object.keys(correction).length > 1 ? [correction] : [];
  });
}

function resolveCorrectionMetric(value: string, fallback: number | null) {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return fallback;
  }

  const parsedValue = Number(trimmedValue);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

function getSessionSetEditorFields(
  trackingType: ExerciseTrackingType,
  weightUnit: WeightUnit,
): SessionSetEditorField[] {
  const weightField: SessionSetEditorField = {
    inputMode: 'decimal',
    key: 'weight',
    label: 'Weight',
    step: '0.5',
    suffix: weightUnit,
  };

  const repsField: SessionSetEditorField = {
    inputMode: 'numeric',
    key: 'reps',
    label: 'Reps',
    step: '1',
  };

  const secondsField: SessionSetEditorField = {
    inputMode: 'numeric',
    key: 'reps', // seconds are stored in the reps column for time-based tracking types
    label: 'Seconds',
    step: '1',
    suffix: 'sec',
  };

  switch (trackingType) {
    case 'weight_reps':
      return [weightField, repsField];
    case 'weight_seconds':
      return [weightField, secondsField];
    case 'bodyweight_reps':
    case 'reps_only':
    case 'reps_seconds':
      return [repsField];
    case 'seconds_only':
    case 'cardio':
      return [secondsField];
    case 'distance':
    default:
      return [];
  }
}

function getReadOnlyCorrectionSummary(
  set: SessionSet,
  trackingType: ExerciseTrackingType,
  weightUnit: WeightUnit,
) {
  const distance = getSetDistance(set);

  if ((trackingType === 'cardio' || trackingType === 'distance') && distance != null) {
    return `Logged distance remains ${formatNumber(distance)} ${getDistanceUnit(weightUnit)}.`;
  }

  if (trackingType === 'reps_seconds') {
    return 'Time corrections are not persisted separately yet, so only reps can be adjusted here.';
  }

  return null;
}

function buildSections(
  session: WorkoutSession,
  template?: WorkoutTemplate,
): SessionDetailSection[] {
  const templateSectionByExerciseId = new Map<string, WorkoutTemplateSectionType>();
  const templateExerciseNameById = new Map<string, string>();
  const templateTrackingTypeById = new Map<string, ExerciseTrackingType>();
  const sessionTrackingTypeById = new Map(
    (session.exercises ?? []).map((exercise) => [exercise.exerciseId, exercise.trackingType]),
  );

  template?.sections.forEach((section) => {
    section.exercises.forEach((exercise) => {
      templateSectionByExerciseId.set(exercise.exerciseId, section.type);
      templateExerciseNameById.set(exercise.exerciseId, exercise.exerciseName);
      if (exercise.trackingType) {
        templateTrackingTypeById.set(exercise.exerciseId, exercise.trackingType);
      }
    });
  });

  const sectionBuckets = new Map<SessionDetailSectionType, Map<string, SessionSet[]>>([
    ['warmup', new Map()],
    ['main', new Map()],
    ['cooldown', new Map()],
    ['supplemental', new Map()],
  ]);
  const sortedSets = [...session.sets].sort(
    (left, right) => left.setNumber - right.setNumber || left.createdAt - right.createdAt,
  );

  for (const set of sortedSets) {
    const derivedSection =
      set.section ?? templateSectionByExerciseId.get(set.exerciseId) ?? 'supplemental';
    const sectionMap = sectionBuckets.get(derivedSection) ?? new Map<string, SessionSet[]>();
    const exerciseSets = sectionMap.get(set.exerciseId) ?? [];

    exerciseSets.push(set);
    sectionMap.set(set.exerciseId, exerciseSets);
    sectionBuckets.set(derivedSection, sectionMap);
  }

  return (['warmup', 'main', 'cooldown', 'supplemental'] as const)
    .map((sectionType) => {
      const groupedExercises = sectionBuckets.get(sectionType) ?? new Map<string, SessionSet[]>();
      const exercises = [...groupedExercises.entries()].map(([exerciseId, sets]) => {
        const name = templateExerciseNameById.get(exerciseId) ?? formatLabel(exerciseId);
        return {
          exerciseId,
          name,
          notes: sets.find((set) => set.notes)?.notes ?? null,
          phaseBadge: inferPhaseBadge(sectionType),
          sets: [...sets].sort((left, right) => left.setNumber - right.setNumber),
          trackingType: resolveTrackingType({
            trackingType:
              sessionTrackingTypeById.get(exerciseId) ??
              templateTrackingTypeById.get(exerciseId) ??
              undefined,
            exerciseId,
            exerciseName: name,
          }),
        };
      });

      return {
        exercises,
        subtitle: buildSectionSubtitle(sectionType, exercises.length),
        type: sectionType,
      };
    })
    .filter((section) => section.exercises.length > 0);
}

function buildSectionSubtitle(sectionType: SessionDetailSectionType, count: number) {
  if (sectionType === 'supplemental') {
    return `${count} logged add-on${count === 1 ? '' : 's'}`;
  }

  return `${count} exercise${count === 1 ? '' : 's'} logged`;
}

function getSessionSummary(session: WorkoutSession, template: WorkoutTemplate | null) {
  const exerciseIds = new Set<string>();
  const sessionTrackingTypeById = new Map(
    (session.exercises ?? []).map((exercise) => [exercise.exerciseId, exercise.trackingType]),
  );
  const templateTrackingTypeById = new Map<string, ExerciseTrackingType>();
  template?.sections.forEach((section) => {
    section.exercises.forEach((exercise) => {
      if (exercise.trackingType) {
        templateTrackingTypeById.set(exercise.exerciseId, exercise.trackingType);
      }
    });
  });
  const metricLabels = new Set<TrackingSummaryMetricLabel>();

  return session.sets.reduce(
    (summary, set) => {
      exerciseIds.add(set.exerciseId);
      summary.totalSets += 1;
      summary.totalExercises = exerciseIds.size;
      const trackingType = resolveTrackingType({
        trackingType:
          sessionTrackingTypeById.get(set.exerciseId) ??
          templateTrackingTypeById.get(set.exerciseId) ??
          undefined,
        exerciseId: set.exerciseId,
      });
      const metricLabel = getTrackingSummaryMetricLabel(trackingType);
      if (metricLabel !== 'reps') {
        summary.metricTotals[metricLabel] += getSetSummaryMetricValue(trackingType, set);
      }
      if (isRepTrackingType(trackingType) && set.reps != null) {
        summary.metricTotals.reps += set.reps;
      }
      metricLabels.add(metricLabel);
      summary.metricLabel =
        metricLabels.size > 1
          ? 'mixed'
          : (([...metricLabels][0] ?? 'volume') as SessionMetricLabel);

      return summary;
    },
    {
      metricLabel: 'volume' as SessionMetricLabel,
      metricTotals: {
        distance: 0,
        reps: 0,
        seconds: 0,
        volume: 0,
      },
      totalExercises: 0,
      totalSets: 0,
    },
  );
}

function FeedbackScore({ label, score }: { label: string; score: number }) {
  return (
    <div className="rounded-2xl border border-border bg-secondary/35 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">{label}</p>
      <p className="mt-2 text-base font-semibold text-foreground">{`${score}/5`}</p>
    </div>
  );
}

function formatFeedbackResponseValue(response: WorkoutSessionFeedbackResponse) {
  if (response.value === null) {
    return '-';
  }

  if (typeof response.value === 'boolean') {
    return response.value ? 'Yes' : 'No';
  }

  if (typeof response.value === 'number') {
    return Number.isInteger(response.value)
      ? `${response.value}`
      : decimalFormatter.format(response.value);
  }

  if (typeof response.value === 'string') {
    return response.value.trim().length > 0 ? response.value : '-';
  }

  if (Array.isArray(response.value)) {
    return response.value.length > 0 ? response.value.join(', ') : '-';
  }

  return '-';
}

function inferPhaseBadge(
  sectionType: SessionDetailSectionType,
): SessionDetailExercise['phaseBadge'] {
  switch (sectionType) {
    case 'warmup':
    case 'cooldown':
      return 'recovery';
    case 'supplemental':
      return 'rebuild';
    default:
      return 'moderate';
  }
}

function buildExerciseHistory({
  currentSession,
  exerciseId,
  previousSession,
  trackingType,
}: {
  currentSession: WorkoutSession;
  exerciseId: string;
  previousSession: WorkoutSession | null;
  trackingType: ExerciseTrackingType;
}): ActiveWorkoutExerciseHistoryPoint[] {
  const history: ActiveWorkoutExerciseHistoryPoint[] = [];

  const previousPoint =
    previousSession != null ? buildHistoryPoint(previousSession, exerciseId, trackingType) : null;
  const currentPoint = buildHistoryPoint(currentSession, exerciseId, trackingType);

  if (previousPoint) {
    history.push(previousPoint);
  }

  if (currentPoint) {
    history.push(currentPoint);
  }

  return history;
}

function buildHistoryPoint(
  session: WorkoutSession,
  exerciseId: string,
  trackingType: ExerciseTrackingType,
): ActiveWorkoutExerciseHistoryPoint | null {
  const sets = session.sets.filter((set) => {
    if (set.exerciseId !== exerciseId) {
      return false;
    }

    if (
      trackingType === 'seconds_only' ||
      trackingType === 'cardio' ||
      trackingType === 'weight_seconds'
    ) {
      // Time-based sets currently come back via `reps` until session-set seconds persistence lands.
      return getSetSeconds(set) != null;
    }

    return set.reps != null;
  });

  if (sets.length === 0) {
    return null;
  }

  const topSet = sets.reduce<SessionSet>((best, current) => {
    if (
      trackingType === 'seconds_only' ||
      trackingType === 'cardio' ||
      trackingType === 'weight_seconds'
    ) {
      return (getSetSeconds(current) ?? 0) > (getSetSeconds(best) ?? 0) ? current : best;
    }

    if (trackingType === 'bodyweight_reps' || trackingType === 'reps_only') {
      return (current.reps ?? 0) > (best.reps ?? 0) ? current : best;
    }

    const bestWeight = best.weight ?? 0;
    const currentWeight = current.weight ?? 0;

    if (currentWeight > bestWeight) {
      return current;
    }

    if (currentWeight === bestWeight && (current.reps ?? 0) > (best.reps ?? 0)) {
      return current;
    }

    return best;
  }, sets[0]);

  return {
    date: session.date,
    reps: topSet.reps ?? 0,
    seconds: getSetSeconds(topSet),
    trackingType,
    weight: topSet.weight ?? 0,
  };
}

function formatSetLabel(
  set: SessionSet,
  trackingType: ExerciseTrackingType,
  weightUnit: WeightUnit,
) {
  return formatSetSummary(set, trackingType, {
    includeSetNumber: true,
    weightUnit,
  });
}

function formatSummaryMetric(
  totals: Record<TrackingSummaryMetricLabel, number>,
  label: SessionMetricLabel,
  weightUnit: WeightUnit,
) {
  switch (label) {
    case 'volume':
      return `${formatWeightValue(totals.volume)} ${weightUnit}`;
    case 'reps':
      return integerFormatter.format(totals.reps);
    case 'seconds':
      return `${formatServing(totals.seconds)} sec`;
    case 'distance':
      return `${formatServing(totals.distance)} ${getDistanceUnit(weightUnit)}`;
    case 'mixed':
      return formatTrackingMetricBreakdown(totals, weightUnit);
    default:
      return '-';
  }
}

function formatSummaryMetricLabel(label: SessionMetricLabel) {
  if (label === 'mixed') {
    return 'Mixed metrics';
  }

  if (label === 'seconds') {
    return 'Seconds';
  }

  if (label === 'distance') {
    return 'Distance';
  }

  if (label === 'reps') {
    return 'Reps';
  }

  return 'Volume';
}

function formatLabel(value: string) {
  return value
    .split(/[- ]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatNumber(value: number) {
  if (Number.isInteger(value)) {
    return integerFormatter.format(value);
  }

  return formatServing(value);
}

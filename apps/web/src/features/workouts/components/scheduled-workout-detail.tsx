import { type ReactNode, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { AlertTriangle, History, Info, TriangleAlert } from 'lucide-react';
import type {
  ExerciseTrackingType,
  WorkoutTemplate,
  WorkoutTemplateExercise,
  WorkoutTemplateSectionType,
  WeightUnit,
} from '@pulse/shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useConfirmation } from '@/components/ui/confirmation-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useStartSession } from '@/hooks/use-workout-session';
import { useWeightUnit } from '@/hooks/use-weight-unit';
import { ApiError } from '@/lib/api-client';
import { toDateKey } from '@/lib/date-utils';
import { cn } from '@/lib/utils';

import {
  type ScheduledWorkoutDetail,
  useRescheduleWorkout,
  useScheduledWorkoutDetail,
  useSwapScheduledWorkoutExercise,
  useUnscheduleWorkout,
  useWorkoutSessions,
} from '../api/workouts';
import { ScheduleWorkoutDialog } from './schedule-workout-dialog';
import { ScheduledWorkoutHeader } from './scheduled-workout-header';
import { SwapExerciseDialog } from './swap-exercise-dialog';
import { ExerciseDetailModal } from './exercise-detail-modal';
import {
  WorkoutExerciseCard,
  type WorkoutExerciseCardScheduledExercise,
  type WorkoutExerciseSetTarget,
} from './workout-exercise-card';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

const sectionLabels: Record<WorkoutTemplateSectionType, string> = {
  warmup: 'Warmup',
  main: 'Main',
  cooldown: 'Cooldown',
  supplemental: 'Supplemental',
};

const sectionAccentStyles: Record<WorkoutTemplateSectionType, string> = {
  warmup: 'border-l-[var(--color-accent-mint)]',
  main: 'border-l-[var(--color-accent-pink)]',
  cooldown: 'border-l-[var(--color-accent-cream)]',
  supplemental: 'border-l-[var(--color-accent-cream)]',
};

type ScheduledWorkoutDetailProps = {
  bannerSlot?: ReactNode;
  id: string;
};

type SnapshotExercise = ScheduledWorkoutDetail['exercises'][number];

type TemplateExerciseLookup = {
  byExerciseIdBySection: Map<string, WorkoutTemplateExercise>;
  bySnapshotOrderKey: Map<string, WorkoutTemplateExercise>;
};

export function ScheduledWorkoutDetail({ bannerSlot, id }: ScheduledWorkoutDetailProps) {
  const navigate = useNavigate();
  const { weightUnit } = useWeightUnit();
  const { data: scheduledWorkout, isLoading, isError } = useScheduledWorkoutDetail(id);
  const startSessionMutation = useStartSession();
  const rescheduleWorkoutMutation = useRescheduleWorkout();
  const unscheduleWorkoutMutation = useUnscheduleWorkout();
  const swapScheduledExerciseMutation = useSwapScheduledWorkoutExercise();
  const { confirm, dialog: confirmDialog } = useConfirmation();
  const activeSessionsQuery = useWorkoutSessions({ status: ['in-progress', 'paused'] });
  const [isRescheduleDialogOpen, setIsRescheduleDialogOpen] = useState(false);
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<{
    exerciseId: string;
    exerciseName: string;
  } | null>(null);
  const [swapTarget, setSwapTarget] = useState<{
    exerciseId: string;
    snapshotName: string;
  } | null>(null);

  const template = scheduledWorkout?.template ?? null;
  const staleExercises = useMemo(
    () => scheduledWorkout?.staleExercises ?? [],
    [scheduledWorkout?.staleExercises],
  );
  const staleExerciseNameById = useMemo(
    () => new Map(staleExercises.map((exercise) => [exercise.exerciseId, exercise.snapshotName])),
    [staleExercises],
  );
  const templateExerciseLookup = useMemo(
    () => buildTemplateExerciseLookup(template),
    [template],
  );
  const canStartFromSnapshot = scheduledWorkout !== undefined && scheduledWorkout !== null;
  const isMutating =
    startSessionMutation.isPending ||
    rescheduleWorkoutMutation.isPending ||
    unscheduleWorkoutMutation.isPending ||
    swapScheduledExerciseMutation.isPending;

  async function doStart(options?: { force?: boolean }) {
    if (!scheduledWorkout) {
      return;
    }

    const startedAt = Date.now();

    try {
      const session = await startSessionMutation.mutateAsync({
        date: toDateKey(new Date(startedAt)),
        ...(options?.force ? { force: true } : {}),
        ...(template?.name ? { name: template.name } : {}),
        scheduledWorkoutId: scheduledWorkout.id,
        startedAt,
      });

      const searchParams = new URLSearchParams({ sessionId: session.id });
      const templateId = session.templateId ?? scheduledWorkout.templateId;
      if (templateId) {
        searchParams.set('template', templateId);
      }

      navigate(`/workouts/active?${searchParams.toString()}`);
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        error.code === 'STALE_SNAPSHOT_EXERCISES'
      ) {
        setIsRecoveryModalOpen(true);
        return;
      }

      throw error;
    }
  }

  function handleStart() {
    if (!scheduledWorkout) {
      return;
    }

    const todayKey = toDateKey(new Date());
    const activeSessions = activeSessionsQuery.data ?? [];

    if (scheduledWorkout.date !== todayKey) {
      confirm({
        title: 'Start workout early?',
        description: `This workout is scheduled for ${dateFormatter.format(new Date(`${scheduledWorkout.date}T12:00:00`))}. Starting now will begin it today instead.`,
        confirmLabel: 'Start now',
        onConfirm: () => {
          void doStart();
        },
      });
      return;
    }

    if (activeSessions.length > 0) {
      confirm({
        title: 'You already have an active workout',
        description: `You have ${activeSessions.length === 1 ? 'a workout' : `${activeSessions.length} workouts`} in progress. Starting another will create an additional session for today.`,
        confirmLabel: 'Start anyway',
        cancelLabel: 'Go back',
        onConfirm: () => {
          void doStart();
        },
      });
      return;
    }

    void doStart();
  }

  async function handleReschedule(requestedDate: string) {
    if (!scheduledWorkout) {
      return;
    }

    await rescheduleWorkoutMutation.mutateAsync({
      date: requestedDate,
      id: scheduledWorkout.id,
    });
  }

  async function handleCancel() {
    if (!scheduledWorkout) {
      return;
    }

    await unscheduleWorkoutMutation.mutateAsync({ id: scheduledWorkout.id });
    navigate('/workouts');
  }

  async function handleRemoveStaleExercise(exerciseId: string) {
    if (!scheduledWorkout) {
      return;
    }

    await swapScheduledExerciseMutation.mutateAsync({
      id: scheduledWorkout.id,
      input: {
        fromExerciseId: exerciseId,
        toExerciseId: null,
      },
    });
  }

  async function handleStartAnyway() {
    await doStart({ force: true });
  }

  function confirmCancel() {
    confirm({
      title: 'Cancel this scheduled workout?',
      description:
        'This scheduled workout will be removed. Your template and exercise library are not affected.',
      confirmLabel: 'Cancel workout',
      variant: 'destructive',
      onConfirm: async () => {
        await handleCancel();
      },
    });
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted">Loading scheduled workout…</p>
        </CardContent>
      </Card>
    );
  }

  if (isError || !scheduledWorkout) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted">Scheduled workout not found.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {bannerSlot}

      <ScheduledWorkoutBanners
        onReviewStale={() => setIsRecoveryModalOpen(true)}
        scheduledWorkout={scheduledWorkout}
      />

      <ScheduledWorkoutHeader
        isMutating={isMutating}
        isTemplateAvailable={canStartFromSnapshot}
        onCancel={confirmCancel}
        onReschedule={() => setIsRescheduleDialogOpen(true)}
        onStart={handleStart}
        scheduledDateLabel={dateFormatter.format(new Date(`${scheduledWorkout.date}T12:00:00`))}
        templateId={scheduledWorkout.templateDeleted ? null : scheduledWorkout.templateId}
        templateName={template?.name ?? null}
      />

      <ScheduledWorkoutSections
        onOpenHistory={(exercise) =>
          setHistoryTarget({
            exerciseId: exercise.exerciseId,
            exerciseName: exercise.exerciseName,
          })
        }
        scheduledWorkout={scheduledWorkout}
        staleExerciseNameById={staleExerciseNameById}
        templateExerciseLookup={templateExerciseLookup}
        weightUnit={weightUnit}
      />

      <ScheduleWorkoutDialog
        description={`Move ${template?.name ?? 'this workout'} to a new date.`}
        disallowDateKey={scheduledWorkout.date}
        disallowDateMessage="Pick a different date to reschedule."
        initialDate={scheduledWorkout.date}
        isPending={rescheduleWorkoutMutation.isPending}
        onOpenChange={setIsRescheduleDialogOpen}
        onSubmitDate={handleReschedule}
        open={isRescheduleDialogOpen}
        submitLabel="Save"
        title="Reschedule workout"
      />

      <StaleExerciseRecoveryDialog
        onClose={() => {
          setIsRecoveryModalOpen(false);
          setSwapTarget(null);
        }}
        onRemoveExercise={handleRemoveStaleExercise}
        onStartAnyway={handleStartAnyway}
        onSwapExercise={(exerciseId, snapshotName) => setSwapTarget({ exerciseId, snapshotName })}
        open={isRecoveryModalOpen && staleExercises.length > 0}
        pendingExerciseId={
          swapScheduledExerciseMutation.isPending
            ? swapScheduledExerciseMutation.variables?.input.fromExerciseId
            : null
        }
        scheduledWorkout={scheduledWorkout}
        startAnywayPending={startSessionMutation.isPending}
      />

      {swapTarget ? (
        <SwapExerciseDialog
          contextId={scheduledWorkout.id}
          mode="scheduled"
          onOpenChange={(open) => {
            if (!open) {
              setSwapTarget(null);
            }
          }}
          open
          sourceExerciseId={swapTarget.exerciseId}
          sourceExerciseName={swapTarget.snapshotName}
          sourceLabel="this scheduled workout"
        />
      ) : null}

      {historyTarget ? (
        <ExerciseDetailModal
          context="receipt"
          exerciseId={historyTarget.exerciseId}
          onOpenChange={(open) => {
            if (!open) {
              setHistoryTarget(null);
            }
          }}
          open={historyTarget != null}
        />
      ) : null}
      {confirmDialog}
    </div>
  );
}

function ScheduledWorkoutSections({
  onOpenHistory,
  scheduledWorkout,
  staleExerciseNameById,
  templateExerciseLookup,
  weightUnit,
}: {
  onOpenHistory: (exercise: { exerciseId: string; exerciseName: string }) => void;
  scheduledWorkout: ScheduledWorkoutDetail;
  staleExerciseNameById: Map<string, string>;
  templateExerciseLookup: TemplateExerciseLookup;
  weightUnit: WeightUnit;
}) {
  const nonEmptySections = buildSnapshotSections(scheduledWorkout.exercises);

  if (nonEmptySections.length === 0) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted">No exercises in this scheduled workout.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {nonEmptySections.map((section) => (
        <details
          className={cn(
            'overflow-hidden rounded-3xl border border-border border-l-4 bg-card shadow-sm',
            sectionAccentStyles[section.type],
          )}
          key={section.type}
          open={section.type === 'main'}
        >
          <summary className="cursor-pointer list-outside px-4 py-3">
            <div className="flex flex-col gap-1.5 pr-6 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-bold tracking-wide text-foreground">
                {sectionLabels[section.type]}
              </h2>
              <Badge className="border-transparent bg-secondary text-secondary-foreground" variant="outline">
                {`${section.exercises.length} exercise${section.exercises.length === 1 ? '' : 's'}`}
              </Badge>
            </div>
          </summary>

          <div className="space-y-1.5 border-t border-border/80 px-3 py-3 sm:px-4 sm:py-3">
            {section.exercises.map((exercise, index) => {
              const templateExercise = resolveTemplateExercise(exercise, templateExerciseLookup);
              const resolvedName =
                templateExercise?.exerciseName ??
                staleExerciseNameById.get(exercise.exerciseId) ??
                formatExerciseLabel(exercise.exerciseId);

              return (
                <ScheduledExerciseCard
                  exercise={exercise}
                  exerciseName={resolvedName}
                  index={index}
                  key={`${section.type}-${exercise.orderIndex}-${exercise.exerciseId}`}
                  onOpenHistory={() =>
                    onOpenHistory({
                      exerciseId: exercise.exerciseId,
                      exerciseName: resolvedName,
                    })
                  }
                  templateExercise={templateExercise}
                  weightUnit={weightUnit}
                />
              );
            })}
          </div>
        </details>
      ))}
    </div>
  );
}

function ScheduledExerciseCard({
  exercise,
  exerciseName,
  index,
  onOpenHistory,
  templateExercise,
  weightUnit,
}: {
  exercise: SnapshotExercise;
  exerciseName: string;
  index: number;
  onOpenHistory: () => void;
  templateExercise: WorkoutTemplateExercise | undefined;
  weightUnit: WeightUnit;
}) {
  return (
    <WorkoutExerciseCard
      exercise={toWorkoutExerciseCardScheduledExercise(exercise, exerciseName, templateExercise)}
      footerSlot={
        <p className="text-[10px] font-semibold tracking-[0.14em] text-muted uppercase">{`Exercise #${index + 1}`}</p>
      }
      headerSlot={
        <Button
          aria-label={`Open ${exerciseName} history`}
          className="size-11 min-h-11 min-w-11"
          onClick={onOpenHistory}
          size="icon"
          type="button"
          variant="ghost"
        >
          <History aria-hidden="true" className="size-4" />
        </Button>
      }
      mode="readonly-scheduled"
      onOpenDetails={onOpenHistory}
      weightUnit={weightUnit}
    />
  );
}

function ScheduledWorkoutBanners({
  onReviewStale,
  scheduledWorkout,
}: {
  onReviewStale: () => void;
  scheduledWorkout: ScheduledWorkoutDetail;
}) {
  const hasAnyBanner =
    scheduledWorkout.templateDrift != null ||
    scheduledWorkout.staleExercises.length > 0 ||
    scheduledWorkout.templateDeleted;

  if (!hasAnyBanner) {
    return null;
  }

  return (
    <div className="space-y-2" data-testid="scheduled-workout-banners">
      {scheduledWorkout.templateDrift ? (
        <BannerCard
          className="border-amber-500/30 bg-amber-500/12"
          description="This template has been updated since you scheduled this workout."
          icon={<TriangleAlert aria-hidden="true" className="size-4 text-amber-700 dark:text-amber-200" />}
          testId="scheduled-template-drift-banner"
          title="Template drift"
        />
      ) : null}

      {scheduledWorkout.staleExercises.length > 0 ? (
        <BannerCard
          action={
            <Button onClick={onReviewStale} size="sm" type="button" variant="outline">
              Review
            </Button>
          }
          className="border-amber-500/30 bg-amber-500/10"
          description="Some exercises have been removed from your library."
          icon={<AlertTriangle aria-hidden="true" className="size-4 text-amber-700 dark:text-amber-200" />}
          testId="scheduled-stale-exercises-banner"
          title="Exercise availability"
        />
      ) : null}

      {scheduledWorkout.templateDeleted ? (
        <BannerCard
          className="border-border/80 bg-secondary/35"
          description="Source template was deleted. This snapshot is preserved."
          icon={<Info aria-hidden="true" className="size-4 text-muted" />}
          testId="scheduled-template-deleted-banner"
          title="Template deleted"
        />
      ) : null}
    </div>
  );
}

function BannerCard({
  action,
  className,
  description,
  icon,
  testId,
  title,
}: {
  action?: ReactNode;
  className: string;
  description: string;
  icon: ReactNode;
  testId: string;
  title: string;
}) {
  return (
    <div className={cn('rounded-2xl border px-3 py-2.5', className)} data-testid={testId} role="status">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5">{icon}</span>
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-muted uppercase">{title}</p>
            <p className="text-sm text-foreground">{description}</p>
          </div>
        </div>

        {action}
      </div>
    </div>
  );
}

function StaleExerciseRecoveryDialog({
  onClose,
  onRemoveExercise,
  onStartAnyway,
  onSwapExercise,
  open,
  pendingExerciseId,
  scheduledWorkout,
  startAnywayPending,
}: {
  onClose: () => void;
  onRemoveExercise: (exerciseId: string) => Promise<void>;
  onStartAnyway: () => Promise<void>;
  onSwapExercise: (exerciseId: string, snapshotName: string) => void;
  open: boolean;
  pendingExerciseId: string | null | undefined;
  scheduledWorkout: ScheduledWorkoutDetail;
  startAnywayPending: boolean;
}) {
  const staleExercises = scheduledWorkout.staleExercises;

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
      open={open}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolve unavailable exercises</DialogTitle>
          <DialogDescription>
            Some exercises in this snapshot were removed from your library. Swap or remove each one,
            or start anyway and skip them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {staleExercises.map((staleExercise) => {
            const isRemoving = pendingExerciseId === staleExercise.exerciseId;

            return (
              <div
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/20 px-3 py-2"
                key={staleExercise.exerciseId}
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{staleExercise.snapshotName}</p>
                </div>

                <div className="flex gap-2">
                  <Button
                    disabled={startAnywayPending || isRemoving}
                    onClick={() => onSwapExercise(staleExercise.exerciseId, staleExercise.snapshotName)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Swap
                  </Button>
                  <Button
                    disabled={startAnywayPending || isRemoving}
                    onClick={() => {
                      void onRemoveExercise(staleExercise.exerciseId);
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {isRemoving ? 'Removing…' : 'Remove'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button disabled={startAnywayPending} onClick={onClose} type="button" variant="ghost">
            Close
          </Button>
          <Button
            disabled={startAnywayPending || staleExercises.length === 0}
            onClick={() => {
              void onStartAnyway();
            }}
            type="button"
          >
            {startAnywayPending ? 'Starting…' : 'Start anyway'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function toWorkoutExerciseCardScheduledExercise(
  exercise: SnapshotExercise,
  exerciseName: string,
  templateExercise: WorkoutTemplateExercise | undefined,
): WorkoutExerciseCardScheduledExercise {
  const repsMin = minOrNull(exercise.sets.map((set) => set.repsMin));
  const repsMax = maxOrNull(exercise.sets.map((set) => set.repsMax));

  return {
    agentNotes: exercise.agentNotes ?? null,
    agentNotesMeta: exercise.agentNotesMeta ?? null,
    coachingNotes: templateExercise?.exercise?.coachingNotes ?? null,
    equipment: null,
    exerciseId: exercise.exerciseId,
    formCues: templateExercise?.exercise?.formCues ?? [],
    id: `snapshot-${exercise.section}-${exercise.orderIndex}-${exercise.exerciseId}`,
    instructions: templateExercise?.exercise?.instructions ?? null,
    muscleGroups: [],
    name: exerciseName,
    notes: null,
    programmingNotes: exercise.programmingNotes ?? null,
    repsMax,
    repsMin,
    restSeconds: exercise.restSeconds,
    setTargets: toSetTargets(exercise.sets),
    sets: exercise.sets.length,
    sessionCues: [],
    tempo: exercise.tempo,
    templateCues: exercise.templateCues ?? [],
    trackingType: templateExercise?.trackingType ?? inferTrackingType(exercise.sets),
  };
}

function buildSnapshotSections(snapshotExercises: SnapshotExercise[]) {
  const grouped = new Map<WorkoutTemplateSectionType, SnapshotExercise[]>([
    ['warmup', []],
    ['main', []],
    ['cooldown', []],
    ['supplemental', []],
  ]);

  for (const exercise of snapshotExercises) {
    const sectionExercises = grouped.get(exercise.section);
    if (!sectionExercises) {
      continue;
    }

    sectionExercises.push(exercise);
  }

  return (['warmup', 'main', 'cooldown', 'supplemental'] as const)
    .map((sectionType) => ({
      type: sectionType,
      exercises: [...(grouped.get(sectionType) ?? [])].sort(
        (left, right) => left.orderIndex - right.orderIndex,
      ),
    }))
    .filter((section) => section.exercises.length > 0);
}

function buildTemplateExerciseLookup(template: WorkoutTemplate | null): TemplateExerciseLookup {
  const byExerciseIdBySection = new Map<string, WorkoutTemplateExercise>();
  const bySnapshotOrderKey = new Map<string, WorkoutTemplateExercise>();

  if (!template) {
    return {
      byExerciseIdBySection,
      bySnapshotOrderKey,
    };
  }

  for (const section of template.sections) {
    section.exercises.forEach((exercise, index) => {
      byExerciseIdBySection.set(`${section.type}::${exercise.exerciseId}`, exercise);
      bySnapshotOrderKey.set(`${section.type}::${index}::${exercise.exerciseId}`, exercise);
    });
  }

  return {
    byExerciseIdBySection,
    bySnapshotOrderKey,
  };
}

function resolveTemplateExercise(
  snapshotExercise: SnapshotExercise,
  lookup: TemplateExerciseLookup,
): WorkoutTemplateExercise | undefined {
  const exactKey = `${snapshotExercise.section}::${snapshotExercise.orderIndex}::${snapshotExercise.exerciseId}`;
  const sectionKey = `${snapshotExercise.section}::${snapshotExercise.exerciseId}`;

  return lookup.bySnapshotOrderKey.get(exactKey) ?? lookup.byExerciseIdBySection.get(sectionKey);
}

function toSetTargets(snapshotSets: SnapshotExercise['sets']): WorkoutExerciseSetTarget[] {
  return snapshotSets.map((set) => ({
    setNumber: set.setNumber,
    targetDistance: set.targetDistance,
    targetSeconds: set.targetSeconds,
    targetWeight: set.targetWeight,
    targetWeightMax: set.targetWeightMax,
    targetWeightMin: set.targetWeightMin,
  }));
}

function maxOrNull(values: Array<number | null>) {
  const numbers = values.filter((value): value is number => value !== null);
  if (numbers.length === 0) {
    return null;
  }

  return Math.max(...numbers);
}

function minOrNull(values: Array<number | null>) {
  const numbers = values.filter((value): value is number => value !== null);
  if (numbers.length === 0) {
    return null;
  }

  return Math.min(...numbers);
}

function inferTrackingType(snapshotSets: SnapshotExercise['sets']): ExerciseTrackingType {
  if (snapshotSets.some((set) => set.targetDistance != null)) {
    return 'distance';
  }

  if (snapshotSets.some((set) => set.targetSeconds != null)) {
    return 'seconds_only';
  }

  if (
    snapshotSets.some(
      (set) => set.targetWeight != null || set.targetWeightMin != null || set.targetWeightMax != null,
    )
  ) {
    return 'weight_reps';
  }

  if (snapshotSets.some((set) => set.reps != null || set.repsMin != null || set.repsMax != null)) {
    return 'reps_only';
  }

  return 'weight_reps';
}

function formatExerciseLabel(value: string) {
  return value
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  GripVertical,
  History,
  Info,
  Plus,
  TriangleAlert,
} from 'lucide-react';
import type {
  ExerciseTrackingType,
  UpdateScheduledWorkoutExerciseSetsInput,
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useStartSession } from '@/hooks/use-workout-session';
import { useWeightUnit } from '@/hooks/use-weight-unit';
import { ApiError } from '@/lib/api-client';
import { toDateKey } from '@/lib/date-utils';
import { useDebouncedCallback } from '@/lib/use-debounced-callback';
import { cn } from '@/lib/utils';

import {
  type ScheduledWorkoutDetail,
  useReorderScheduledWorkout,
  useRescheduleWorkout,
  useScheduledWorkoutDetail,
  useSwapScheduledWorkoutExercise,
  useUpdateScheduledWorkoutExercises,
  useUpdateScheduledWorkoutExerciseSets,
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

const sectionOrder: WorkoutTemplateSectionType[] = ['warmup', 'main', 'cooldown', 'supplemental'];
const supersetOptions = ['A', 'B', 'C'] as const;

type EditableSetFieldDefinition = {
  inputMode: 'decimal' | 'numeric';
  key: Exclude<keyof UpdateScheduledWorkoutExerciseSetsInput['sets'][number], 'setNumber' | 'remove'>;
  label: string;
  step: string;
  suffix?: string;
};

const editableSetFields: EditableSetFieldDefinition[] = [
  {
    inputMode: 'decimal',
    key: 'targetWeight',
    label: 'Target weight',
    step: '0.5',
  },
  {
    inputMode: 'decimal',
    key: 'targetWeightMin',
    label: 'Target weight min',
    step: '0.5',
  },
  {
    inputMode: 'decimal',
    key: 'targetWeightMax',
    label: 'Target weight max',
    step: '0.5',
  },
  {
    inputMode: 'numeric',
    key: 'targetSeconds',
    label: 'Target seconds',
    step: '1',
    suffix: 'sec',
  },
  {
    inputMode: 'decimal',
    key: 'targetDistance',
    label: 'Target distance',
    step: '0.1',
  },
  {
    inputMode: 'numeric',
    key: 'repsMin',
    label: 'Reps min',
    step: '1',
  },
  {
    inputMode: 'numeric',
    key: 'repsMax',
    label: 'Reps max',
    step: '1',
  },
  {
    inputMode: 'numeric',
    key: 'reps',
    label: 'Reps',
    step: '1',
  },
];

type ScheduledWorkoutDetailProps = {
  bannerSlot?: ReactNode;
  id: string;
};

type SnapshotExercise = ScheduledWorkoutDetail['exercises'][number];
type SnapshotExerciseSet = SnapshotExercise['sets'][number];

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
  const reorderScheduledWorkoutMutation = useReorderScheduledWorkout();
  const updateScheduledWorkoutExercisesMutation = useUpdateScheduledWorkoutExercises();
  const updateScheduledWorkoutExerciseSetsMutation = useUpdateScheduledWorkoutExerciseSets();
  const { confirm, dialog: confirmDialog } = useConfirmation();
  const activeSessionsQuery = useWorkoutSessions({ status: ['in-progress', 'paused'] });
  const [isRescheduleDialogOpen, setIsRescheduleDialogOpen] = useState(false);
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const [mutationErrorMessage, setMutationErrorMessage] = useState<string | null>(null);
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
  const templateExerciseLookup = useMemo(() => buildTemplateExerciseLookup(template), [template]);
  const canStartFromSnapshot = scheduledWorkout !== undefined && scheduledWorkout !== null;
  const isPlanLocked = scheduledWorkout?.sessionId != null;
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const queueReorderMutation = useDebouncedCallback((order: string[]) => {
    if (!scheduledWorkout || isPlanLocked) {
      return;
    }

    setMutationErrorMessage(null);
    reorderScheduledWorkoutMutation.mutate(
      {
        id: scheduledWorkout.id,
        input: { order },
      },
      {
        onError: (error) => {
          setMutationErrorMessage(getMutationErrorMessage(error, 'Unable to reorder exercises.'));
        },
      },
    );
  }, 250);
  const isMutating =
    startSessionMutation.isPending ||
    rescheduleWorkoutMutation.isPending ||
    unscheduleWorkoutMutation.isPending ||
    swapScheduledExerciseMutation.isPending ||
    reorderScheduledWorkoutMutation.isPending ||
    updateScheduledWorkoutExercisesMutation.isPending ||
    updateScheduledWorkoutExerciseSetsMutation.isPending;

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

  async function handleUpdateSupersetGroup(exerciseId: string, supersetGroup: string | null) {
    if (!scheduledWorkout || isPlanLocked) {
      return;
    }

    setMutationErrorMessage(null);

    try {
      await updateScheduledWorkoutExercisesMutation.mutateAsync({
        id: scheduledWorkout.id,
        input: {
          updates: [{ exerciseId, supersetGroup }],
        },
      });
    } catch (error) {
      setMutationErrorMessage(getMutationErrorMessage(error, 'Unable to update superset group.'));
    }
  }

  async function handleUpdateSet(
    exerciseId: string,
    setUpdate: UpdateScheduledWorkoutExerciseSetsInput['sets'][number],
  ) {
    if (!scheduledWorkout || isPlanLocked) {
      return;
    }

    setMutationErrorMessage(null);

    try {
      await updateScheduledWorkoutExerciseSetsMutation.mutateAsync({
        id: scheduledWorkout.id,
        input: {
          exerciseId,
          sets: [setUpdate],
        },
      });
    } catch (error) {
      setMutationErrorMessage(
        getMutationErrorMessage(error, 'Unable to update scheduled workout set targets.'),
      );
    }
  }

  async function handleRemoveSet(exerciseId: string, setNumber: number) {
    await handleUpdateSet(exerciseId, {
      remove: true,
      setNumber,
    });
  }

  async function handleAddSet(exerciseId: string, setNumber: number) {
    await handleUpdateSet(exerciseId, {
      setNumber,
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

      {mutationErrorMessage ? (
        <BannerCard
          className="border-destructive/35 bg-destructive/10"
          description={mutationErrorMessage}
          icon={<AlertTriangle aria-hidden="true" className="size-4 text-destructive" />}
          testId="scheduled-workout-structure-error-banner"
          title="Unable to apply edit"
        />
      ) : null}

      {isPlanLocked ? (
        <BannerCard
          className="border-border/80 bg-secondary/40"
          description="This workout already has a started session. Structural edits are read-only here."
          icon={<Info aria-hidden="true" className="size-4 text-muted" />}
          testId="scheduled-workout-readonly-banner"
          title="Session in progress"
        />
      ) : null}

      <ScheduledWorkoutSections
        isEditLocked={isPlanLocked}
        isMutating={isMutating}
        onAddSet={handleAddSet}
        onOpenHistory={(exercise) =>
          setHistoryTarget({
            exerciseId: exercise.exerciseId,
            exerciseName: exercise.exerciseName,
          })
        }
        onRemoveSet={handleRemoveSet}
        onReorder={(order) => queueReorderMutation.run(order)}
        onReorderImmediate={(order) => {
          queueReorderMutation.run(order);
          queueReorderMutation.flush();
        }}
        onUpdateSet={handleUpdateSet}
        onUpdateSupersetGroup={handleUpdateSupersetGroup}
        scheduledWorkout={scheduledWorkout}
        sensors={sensors}
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
  isEditLocked,
  isMutating,
  onAddSet,
  onOpenHistory,
  onRemoveSet,
  onReorder,
  onReorderImmediate,
  onUpdateSet,
  onUpdateSupersetGroup,
  scheduledWorkout,
  sensors,
  templateExerciseLookup,
  weightUnit,
}: {
  isEditLocked: boolean;
  isMutating: boolean;
  onAddSet: (exerciseId: string, setNumber: number) => Promise<void>;
  onOpenHistory: (exercise: { exerciseId: string; exerciseName: string }) => void;
  onRemoveSet: (exerciseId: string, setNumber: number) => Promise<void>;
  onReorder: (order: string[]) => void;
  onReorderImmediate: (order: string[]) => void;
  onUpdateSet: (
    exerciseId: string,
    setUpdate: UpdateScheduledWorkoutExerciseSetsInput['sets'][number],
  ) => Promise<void>;
  onUpdateSupersetGroup: (exerciseId: string, supersetGroup: string | null) => Promise<void>;
  scheduledWorkout: ScheduledWorkoutDetail;
  sensors: ReturnType<typeof useSensors>;
  templateExerciseLookup: TemplateExerciseLookup;
  weightUnit: WeightUnit;
}) {
  const nonEmptySections = buildSnapshotSections(scheduledWorkout.exercises);
  const isInteractionDisabled = isEditLocked || isMutating;

  if (nonEmptySections.length === 0) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted">No exercises in this scheduled workout.</p>
        </CardContent>
      </Card>
    );
  }

  const buildReorderPayload = (
    sectionType: WorkoutTemplateSectionType,
    reorderedSectionExerciseIds: string[],
  ) =>
    sectionOrder.flatMap((candidateSectionType) => {
      const section = nonEmptySections.find((entry) => entry.type === candidateSectionType);
      if (!section) {
        return [];
      }

      if (candidateSectionType === sectionType) {
        return reorderedSectionExerciseIds;
      }

      return section.exercises.map((exercise) => exercise.exerciseId);
    });

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
              <Badge
                className="border-transparent bg-secondary text-secondary-foreground"
                variant="outline"
              >
                {`${section.exercises.length} exercise${section.exercises.length === 1 ? '' : 's'}`}
              </Badge>
            </div>
          </summary>

          <div className="space-y-1.5 border-t border-border/80 px-3 py-3 sm:px-4 sm:py-3">
            <DndContext
              collisionDetection={closestCenter}
              onDragEnd={({ active, over }) => {
                if (isInteractionDisabled || !over || active.id === over.id) {
                  return;
                }

                const exerciseIds = section.exercises.map((exercise) => exercise.exerciseId);
                const currentIndex = exerciseIds.findIndex((exerciseId) => exerciseId === active.id);
                const nextIndex = exerciseIds.findIndex((exerciseId) => exerciseId === over.id);

                if (currentIndex === -1 || nextIndex === -1) {
                  return;
                }

                const reorderedExerciseIds = arrayMove(exerciseIds, currentIndex, nextIndex);
                onReorder(buildReorderPayload(section.type, reorderedExerciseIds));
              }}
              sensors={sensors}
            >
              <SortableContext
                items={section.exercises.map((exercise) => exercise.exerciseId)}
                strategy={verticalListSortingStrategy}
              >
                {section.exercises.map((exercise, index) => {
                  const templateExercise = resolveTemplateExercise(exercise, templateExerciseLookup);
                  const resolvedName = exercise.exerciseName;

                  return (
                    <ScheduledExerciseCard
                      exercise={exercise}
                      exerciseName={resolvedName}
                      index={index}
                      isEditLocked={isEditLocked}
                      isMoveDownDisabled={
                        index === section.exercises.length - 1 || isInteractionDisabled
                      }
                      isMoveUpDisabled={index === 0 || isInteractionDisabled}
                      isMutating={isMutating}
                      key={`${section.type}-${exercise.orderIndex}-${exercise.exerciseId}`}
                      onAddSet={onAddSet}
                      onMoveDown={() => {
                        if (index >= section.exercises.length - 1 || isInteractionDisabled) {
                          return;
                        }

                        const reorderedExerciseIds = arrayMove(
                          section.exercises.map((entry) => entry.exerciseId),
                          index,
                          index + 1,
                        );
                        onReorderImmediate(buildReorderPayload(section.type, reorderedExerciseIds));
                      }}
                      onMoveUp={() => {
                        if (index <= 0 || isInteractionDisabled) {
                          return;
                        }

                        const reorderedExerciseIds = arrayMove(
                          section.exercises.map((entry) => entry.exerciseId),
                          index,
                          index - 1,
                        );
                        onReorderImmediate(buildReorderPayload(section.type, reorderedExerciseIds));
                      }}
                      onOpenHistory={() =>
                        onOpenHistory({
                          exerciseId: exercise.exerciseId,
                          exerciseName: resolvedName,
                        })
                      }
                      onRemoveSet={onRemoveSet}
                      onUpdateSet={onUpdateSet}
                      onUpdateSupersetGroup={onUpdateSupersetGroup}
                      templateExercise={templateExercise}
                      weightUnit={weightUnit}
                    />
                  );
                })}
              </SortableContext>
            </DndContext>
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
  isEditLocked,
  isMoveDownDisabled,
  isMoveUpDisabled,
  isMutating,
  onAddSet,
  onMoveDown,
  onMoveUp,
  onOpenHistory,
  onRemoveSet,
  onUpdateSet,
  onUpdateSupersetGroup,
  templateExercise,
  weightUnit,
}: {
  exercise: SnapshotExercise;
  exerciseName: string;
  index: number;
  isEditLocked: boolean;
  isMoveDownDisabled: boolean;
  isMoveUpDisabled: boolean;
  isMutating: boolean;
  onAddSet: (exerciseId: string, setNumber: number) => Promise<void>;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onOpenHistory: () => void;
  onRemoveSet: (exerciseId: string, setNumber: number) => Promise<void>;
  onUpdateSet: (
    exerciseId: string,
    setUpdate: UpdateScheduledWorkoutExerciseSetsInput['sets'][number],
  ) => Promise<void>;
  onUpdateSupersetGroup: (exerciseId: string, supersetGroup: string | null) => Promise<void>;
  templateExercise: WorkoutTemplateExercise | undefined;
  weightUnit: WeightUnit;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: exercise.exerciseId,
    disabled: isEditLocked || isMutating,
  });
  const [setEditTarget, setSetEditTarget] = useState<SnapshotExerciseSet | null>(null);
  const nextSetNumber = exercise.sets.reduce((maxValue, set) => Math.max(maxValue, set.setNumber), 0) + 1;
  const supersetLabel = formatSupersetGroupLabel(exercise.supersetGroup);

  return (
    <>
      <WorkoutExerciseCard
        cardRef={setNodeRef}
        exercise={toWorkoutExerciseCardScheduledExercise(exercise, exerciseName, templateExercise)}
        footerSlot={
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-muted uppercase">{`Exercise #${index + 1}`}</p>
            {isEditLocked ? (
              <Badge className="border-border/80 bg-secondary/60" variant="outline">
                {`Superset ${supersetLabel}`}
              </Badge>
            ) : (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    className="h-7 rounded-full px-2 text-[11px]"
                    disabled={isMutating}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {`Superset ${supersetLabel}`}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-40 p-2">
                  <div className="space-y-1">
                    {supersetOptions.map((option) => (
                      <Button
                        className="w-full justify-start"
                        key={option}
                        onClick={() => {
                          void onUpdateSupersetGroup(exercise.exerciseId, option);
                        }}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        {`Superset ${option}`}
                      </Button>
                    ))}
                    <Button
                      className="w-full justify-start"
                      onClick={() => {
                        void onUpdateSupersetGroup(exercise.exerciseId, null);
                      }}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Clear grouping
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>

          <div className="space-y-1.5 rounded-xl border border-border/80 bg-secondary/20 p-2.5">
            {exercise.sets
              .slice()
              .sort((left, right) => left.setNumber - right.setNumber)
              .map((set) => (
                <div className="flex items-center justify-between gap-2" key={set.setNumber}>
                  <Button
                    className="h-auto min-h-9 flex-1 justify-start px-2 py-1.5 text-left"
                    disabled={isEditLocked || isMutating}
                    onClick={() => setSetEditTarget(set)}
                    type="button"
                    variant="ghost"
                  >
                    <span className="text-xs text-foreground">
                      {`Set ${set.setNumber}: ${formatSetTargetSummary(set)}`}
                    </span>
                  </Button>
                  {!isEditLocked ? (
                    <Button
                      className="h-8 px-2 text-xs"
                      disabled={isMutating}
                      onClick={() => {
                        void onRemoveSet(exercise.exerciseId, set.setNumber);
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {`Remove set ${set.setNumber}`}
                    </Button>
                  ) : null}
                </div>
              ))}

            {!isEditLocked ? (
              <Button
                className="w-full justify-center"
                disabled={isMutating}
                onClick={() => {
                  void onAddSet(exercise.exerciseId, nextSetNumber);
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                <Plus aria-hidden="true" className="size-4" />
                Add set
              </Button>
            ) : null}
          </div>
        </div>
        }
        headerSlot={
        <>
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
          <Button
            aria-label={`Move ${exerciseName} up`}
            className="size-11 min-h-11 min-w-11"
            disabled={isMoveUpDisabled}
            onClick={onMoveUp}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ArrowUp aria-hidden="true" className="size-4" />
          </Button>
          <Button
            aria-label={`Move ${exerciseName} down`}
            className="size-11 min-h-11 min-w-11"
            disabled={isMoveDownDisabled}
            onClick={onMoveDown}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ArrowDown aria-hidden="true" className="size-4" />
          </Button>
        </>
        }
        leadingSlot={
        <Button
          aria-label={`Drag handle for ${exerciseName}`}
          className="-ml-1 mt-0.5 size-11 min-h-11 min-w-11 touch-none"
          disabled={isEditLocked || isMutating}
          size="icon"
          type="button"
          variant="ghost"
          {...attributes}
          {...listeners}
        >
          <GripVertical aria-hidden="true" className="size-4" />
        </Button>
        }
        mode="editable-scheduled"
        onOpenDetails={onOpenHistory}
        showSetList={false}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
        }}
        weightUnit={weightUnit}
      />
      {setEditTarget ? (
        <EditScheduledSetDialog
          exerciseName={exerciseName}
          isPending={isMutating}
          onClose={() => setSetEditTarget(null)}
          onSave={async (setUpdate) => {
            await onUpdateSet(exercise.exerciseId, setUpdate);
            setSetEditTarget(null);
          }}
          set={setEditTarget}
        />
      ) : null}
    </>
  );
}

type ScheduledSetEditorDraft = Record<EditableSetFieldDefinition['key'], string>;

const integerSetFieldKeys = new Set<EditableSetFieldDefinition['key']>([
  'targetSeconds',
  'repsMin',
  'repsMax',
  'reps',
]);

function EditScheduledSetDialog({
  exerciseName,
  isPending,
  onClose,
  onSave,
  set,
}: {
  exerciseName: string;
  isPending: boolean;
  onClose: () => void;
  onSave: (setUpdate: UpdateScheduledWorkoutExerciseSetsInput['sets'][number]) => Promise<void>;
  set: SnapshotExerciseSet;
}) {
  const [fieldDraft, setFieldDraft] = useState<ScheduledSetEditorDraft>(() => createSetEditorDraft(set));
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSave = async () => {
    const parsed = parseSetEditorDraft({
      draft: fieldDraft,
      set,
    });

    if (parsed.error) {
      setValidationError(parsed.error);
      return;
    }

    if (Object.keys(parsed.setUpdate).length === 1) {
      onClose();
      return;
    }

    await onSave(parsed.setUpdate);
  };

  return (
    <Dialog onOpenChange={(open) => (!open ? onClose() : undefined)} open>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{`Edit ${exerciseName} set ${set.setNumber}`}</DialogTitle>
          <DialogDescription>
            Update target values for this set. Leave a field blank to clear it.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          {editableSetFields.map((field) => {
            const inputId = `${exerciseName}-${set.setNumber}-${field.key}`;

            return (
              <div className="space-y-1.5" key={field.key}>
                <Label className="text-xs font-semibold text-muted" htmlFor={inputId}>
                  {field.label}
                </Label>
                <div className="relative">
                  <Input
                    className={field.suffix ? 'pr-12' : undefined}
                    id={inputId}
                    inputMode={field.inputMode}
                    min={0}
                    onChange={(event) => {
                      setValidationError(null);
                      setFieldDraft((current) => ({
                        ...current,
                        [field.key]: event.currentTarget.value,
                      }));
                    }}
                    step={field.step}
                    type="number"
                    value={fieldDraft[field.key]}
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

        {validationError ? <p className="text-sm text-destructive">{validationError}</p> : null}

        <DialogFooter>
          <Button disabled={isPending} onClick={onClose} type="button" variant="ghost">
            Cancel
          </Button>
          <Button
            disabled={isPending}
            onClick={() => {
              void handleSave();
            }}
            type="button"
          >
            {isPending ? 'Saving…' : 'Save set'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
          icon={
            <TriangleAlert
              aria-hidden="true"
              className="size-4 text-amber-700 dark:text-amber-200"
            />
          }
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
          icon={
            <AlertTriangle
              aria-hidden="true"
              className="size-4 text-amber-700 dark:text-amber-200"
            />
          }
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
    <div
      className={cn('rounded-2xl border px-3 py-2.5', className)}
      data-testid={testId}
      role="status"
    >
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

function createSetEditorDraft(set: SnapshotExerciseSet): ScheduledSetEditorDraft {
  return editableSetFields.reduce((draft, field) => {
    const value = set[field.key];

    return {
      ...draft,
      [field.key]: value == null ? '' : `${value}`,
    };
  }, {} as ScheduledSetEditorDraft);
}

function parseSetEditorDraft({
  draft,
  set,
}: {
  draft: ScheduledSetEditorDraft;
  set: SnapshotExerciseSet;
}) {
  const setUpdate: UpdateScheduledWorkoutExerciseSetsInput['sets'][number] = {
    setNumber: set.setNumber,
  };

  for (const field of editableSetFields) {
    const rawValue = draft[field.key].trim();
    const currentValue = set[field.key] ?? null;
    let nextValue: number | null;

    if (rawValue.length === 0) {
      nextValue = null;
    } else {
      const parsedValue = Number(rawValue);
      if (!Number.isFinite(parsedValue)) {
        return {
          error: `${field.label} must be a valid number.`,
          setUpdate,
        };
      }

      if (parsedValue < 0) {
        return {
          error: `${field.label} must be zero or greater.`,
          setUpdate,
        };
      }

      if (integerSetFieldKeys.has(field.key) && !Number.isInteger(parsedValue)) {
        return {
          error: `${field.label} must be a whole number.`,
          setUpdate,
        };
      }

      nextValue = parsedValue;
    }

    if (nextValue !== currentValue) {
      assignSetUpdateField(setUpdate, field.key, nextValue);
    }
  }

  return {
    setUpdate,
  };
}

function assignSetUpdateField(
  setUpdate: UpdateScheduledWorkoutExerciseSetsInput['sets'][number],
  key: EditableSetFieldDefinition['key'],
  value: number | null,
) {
  switch (key) {
    case 'targetWeight':
      setUpdate.targetWeight = value;
      break;
    case 'targetWeightMin':
      setUpdate.targetWeightMin = value;
      break;
    case 'targetWeightMax':
      setUpdate.targetWeightMax = value;
      break;
    case 'targetSeconds':
      setUpdate.targetSeconds = value;
      break;
    case 'targetDistance':
      setUpdate.targetDistance = value;
      break;
    case 'repsMin':
      setUpdate.repsMin = value;
      break;
    case 'repsMax':
      setUpdate.repsMax = value;
      break;
    case 'reps':
      setUpdate.reps = value;
      break;
  }
}

function formatSetTargetSummary(set: SnapshotExerciseSet) {
  const values: string[] = [];

  if (set.targetWeight != null) {
    values.push(`wt ${set.targetWeight}`);
  } else if (set.targetWeightMin != null || set.targetWeightMax != null) {
    values.push(`wt ${set.targetWeightMin ?? '—'}-${set.targetWeightMax ?? '—'}`);
  }

  if (set.targetSeconds != null) {
    values.push(`${set.targetSeconds} sec`);
  }

  if (set.targetDistance != null) {
    values.push(`dist ${set.targetDistance}`);
  }

  if (set.reps != null) {
    values.push(`${set.reps} reps`);
  } else if (set.repsMin != null || set.repsMax != null) {
    values.push(`reps ${set.repsMin ?? '—'}-${set.repsMax ?? '—'}`);
  }

  return values.length > 0 ? values.join(' • ') : 'No targets';
}

function formatSupersetGroupLabel(value: string | null) {
  if (!value) {
    return '—';
  }

  const normalized = value
    .replace(/^superset[-\s]*/i, '')
    .trim()
    .toUpperCase();

  return normalized.length > 0 ? normalized : '—';
}

function getMutationErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof ApiError) {
    return error.message;
  }

  return fallbackMessage;
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
                  <p className="text-sm font-medium text-foreground">
                    {staleExercise.snapshotName}
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    disabled={startAnywayPending || isRemoving}
                    onClick={() =>
                      onSwapExercise(staleExercise.exerciseId, staleExercise.snapshotName)
                    }
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

  return sectionOrder
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
      (set) =>
        set.targetWeight != null || set.targetWeightMin != null || set.targetWeightMax != null,
    )
  ) {
    return 'weight_reps';
  }

  if (snapshotSets.some((set) => set.reps != null || set.repsMin != null || set.repsMax != null)) {
    return 'reps_only';
  }

  return 'weight_reps';
}

import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
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
import { ArrowDown, ArrowUp, GripVertical, MoreVertical } from 'lucide-react';

import type { ExerciseTrackingType, WeightUnit, WorkoutTemplateExercise } from '@pulse/shared';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useConfirmation } from '@/components/ui/confirmation-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useWeightUnit } from '@/hooks/use-weight-unit';
import { useStartSession } from '@/hooks/use-workout-session';
import { ApiError } from '@/lib/api-client';
import { toDateKey } from '@/lib/date-utils';

import {
  useScheduleWorkout,
  useRenameExercise,
  useReorderTemplateExercises,
  useWorkoutTemplate,
} from '../api/workouts';
import { getDistanceUnit } from '../lib/tracking';
import { buildInitialSessionSets } from '../lib/workout-session-sets';
import {
  formatWorkoutConflictDescription,
  getDayWorkoutConflicts,
} from '../lib/day-workout-conflicts';
import { FormCueChips } from './form-cue-chips';
import { RenameExerciseDialog } from './rename-exercise-dialog';
import { ScheduleWorkoutDialog } from './schedule-workout-dialog';

type WorkoutTemplateDetailProps = {
  templateId: string;
};

const sectionLabels = {
  warmup: 'Warmup',
  main: 'Main',
  cooldown: 'Cooldown',
} as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function WorkoutTemplateDetail({ templateId }: WorkoutTemplateDetailProps) {
  const { weightUnit } = useWeightUnit();
  const navigate = useNavigate();
  const { confirm, dialog } = useConfirmation();
  const templateQuery = useWorkoutTemplate(templateId);
  const startWorkoutMutation = useStartSession();
  const scheduleWorkoutMutation = useScheduleWorkout();
  const renameExerciseMutation = useRenameExercise();
  const reorderExercisesMutation = useReorderTemplateExercises();
  const [renameTarget, setRenameTarget] = useState<{
    exerciseId: string;
    exerciseName: string;
  } | null>(null);
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
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

  async function confirmDuplicateDayWorkouts(dateKey: string) {
    const conflicts = await getDayWorkoutConflicts(dateKey);

    if (conflicts.length === 0) {
      return true;
    }

    return await new Promise<boolean>((resolve) => {
      confirm({
        title: 'This day already has a workout',
        description: formatWorkoutConflictDescription(conflicts),
        cancelLabel: 'Cancel',
        confirmLabel: 'Create another anyway',
        variant: 'default',
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  }

  if (templateQuery.isPending) {
    return <TemplateDetailSkeleton />;
  }

  if (templateQuery.isError) {
    const isLegacyMockTemplate = !UUID_PATTERN.test(templateId);
    const isNotFound =
      isLegacyMockTemplate ||
      (templateQuery.error instanceof ApiError && templateQuery.error.status === 404);

    return (
      <Card>
        <CardHeader className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">
            {isNotFound ? 'Template not found' : 'Unable to load template'}
          </h1>
          <p className="text-sm text-muted">
            {isNotFound
              ? 'The requested workout template could not be found.'
              : 'Try reloading this page in a moment.'}
          </p>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full sm:w-auto">
            <Link to="/workouts">Back to Workouts</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const template = templateQuery.data;

  return (
    <section className="space-y-6">
      <Card className="gap-4 overflow-hidden border-transparent bg-card/80 py-0">
        <div className="space-y-4 bg-[var(--color-accent-cream)] px-6 py-6 text-on-cream dark:border-b dark:border-border dark:bg-card dark:text-foreground">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] opacity-70 dark:text-muted dark:opacity-100">
              Workout template
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">{template.name}</h1>
            {template.description ? (
              <p className="max-w-3xl text-sm opacity-80 sm:text-base dark:text-muted dark:opacity-100">
                {template.description}
              </p>
            ) : null}
          </div>

          {template.tags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
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
      </Card>

      <div className="space-y-4">
        {template.sections.map((section) => (
          <details
            className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm"
            key={section.type}
            open={section.type === 'main'}
          >
            <summary className="cursor-pointer list-outside px-6 py-5">
              <div className="flex flex-col gap-2 pr-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <h2 className="text-xl font-semibold text-foreground">
                    {sectionLabels[section.type]}
                  </h2>
                  <p className="text-sm text-muted">
                    {`${section.exercises.length} exercise${section.exercises.length === 1 ? '' : 's'}`}
                  </p>
                </div>
                <Badge
                  className="border-transparent bg-secondary text-secondary-foreground"
                  variant="outline"
                >
                  {`${section.exercises.length} exercise${section.exercises.length === 1 ? '' : 's'}`}
                </Badge>
              </div>
            </summary>

            <div className="space-y-3 border-t border-border px-4 py-4 sm:px-6 sm:py-5">
              {section.exercises.length === 0 ? (
                <Card>
                  <CardContent className="py-5">
                    <p className="text-sm text-muted">
                      No exercises have been added to this section yet.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <DndContext
                  collisionDetection={closestCenter}
                  onDragEnd={({ active, over }) => {
                    if (!over || active.id === over.id) {
                      return;
                    }

                    const currentIndex = section.exercises.findIndex(
                      (item) => item.id === active.id,
                    );
                    const nextIndex = section.exercises.findIndex((item) => item.id === over.id);
                    if (currentIndex === -1 || nextIndex === -1) {
                      return;
                    }

                    const reordered = arrayMove(section.exercises, currentIndex, nextIndex);
                    reorderExercisesMutation.mutate({
                      templateId: template.id,
                      section: section.type,
                      exerciseIds: reordered.map((item) => item.id),
                    });
                  }}
                  sensors={sensors}
                >
                  <SortableContext
                    items={section.exercises.map((exercise) => exercise.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {section.exercises.map((exercise, index) => (
                      <TemplateExerciseCard
                        exercise={exercise}
                        index={index}
                        isMoveDownDisabled={index === section.exercises.length - 1}
                        isMoveUpDisabled={index === 0}
                        key={exercise.id}
                        weightUnit={weightUnit}
                        onMoveDown={() => {
                          if (index >= section.exercises.length - 1) {
                            return;
                          }

                          const reordered = arrayMove(section.exercises, index, index + 1);
                          reorderExercisesMutation.mutate({
                            templateId: template.id,
                            section: section.type,
                            exerciseIds: reordered.map((item) => item.id),
                          });
                        }}
                        onMoveUp={() => {
                          if (index <= 0) {
                            return;
                          }

                          const reordered = arrayMove(section.exercises, index, index - 1);
                          reorderExercisesMutation.mutate({
                            templateId: template.id,
                            section: section.type,
                            exerciseIds: reordered.map((item) => item.id),
                          });
                        }}
                        onRename={() =>
                          setRenameTarget({
                            exerciseId: exercise.exerciseId,
                            exerciseName: exercise.exerciseName,
                          })
                        }
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </details>
        ))}
      </div>

      <RenameExerciseDialog
        key={renameTarget ? `${renameTarget.exerciseId}-open` : 'rename-template-closed'}
        isPending={renameExerciseMutation.isPending}
        onOpenChange={(open) => {
          if (!open) {
            setRenameTarget(null);
          }
        }}
        onRename={(name) => {
          if (!renameTarget) {
            return;
          }

          renameExerciseMutation.mutate(
            {
              id: renameTarget.exerciseId,
              name,
            },
            {
              onError: (error) => {
                const message =
                  error instanceof ApiError
                    ? error.message
                    : 'Unable to rename exercise. Try again.';
                toast.error(message);
              },
              onSuccess: () => {
                setRenameTarget(null);
              },
            },
          );
        }}
        open={renameTarget != null}
        sourceLabel="this template"
        value={renameTarget?.exerciseName ?? ''}
      />

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button
            className="w-full sm:w-auto"
            disabled={startWorkoutMutation.isPending}
            onClick={() => {
              const todayDateKey = toDateKey(new Date());
              void (async () => {
                const shouldCreateAnother = await confirmDuplicateDayWorkouts(todayDateKey);
                if (!shouldCreateAnother) {
                  return;
                }

                const startedAt = Date.now();

                startWorkoutMutation.mutate(
                  {
                    date: toDateKey(new Date(startedAt)),
                    name: template.name,
                    sets: buildInitialSessionSets(template),
                    startedAt,
                    templateId: template.id,
                  },
                  {
                    onSuccess: (session) => {
                      navigate(`/workouts/active?template=${template.id}&sessionId=${session.id}`);
                    },
                  },
                );
              })();
            }}
            size="lg"
            type="button"
          >
            {startWorkoutMutation.isPending ? 'Starting workout...' : 'Start Workout'}
          </Button>
          <Button
            className="w-full sm:w-auto"
            onClick={() => setIsScheduleDialogOpen(true)}
            size="lg"
            type="button"
            variant="outline"
          >
            Schedule
          </Button>
        </div>

        {startWorkoutMutation.isError ? (
          <p className="text-sm text-destructive">Unable to start the workout. Try again.</p>
        ) : null}
      </div>
      <ScheduleWorkoutDialog
        description={`Pick a date for ${template.name}.`}
        initialDate={toDateKey(new Date())}
        isPending={scheduleWorkoutMutation.isPending}
        onOpenChange={setIsScheduleDialogOpen}
        onSubmitDate={async (date) => {
          const shouldCreateAnother = await confirmDuplicateDayWorkouts(date);
          if (!shouldCreateAnother) {
            return;
          }

          await scheduleWorkoutMutation.mutateAsync({
            date,
            templateId: template.id,
          });
        }}
        open={isScheduleDialogOpen}
        submitLabel="Schedule"
        title="Schedule workout"
      />
      {dialog}
    </section>
  );
}

function MetadataPill({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-full border border-border bg-secondary/55 px-3 py-1.5 text-foreground">
      {label}
    </span>
  );
}

function TemplateDetailSkeleton() {
  return (
    <section aria-label="Loading workout template" className="space-y-6">
      <Card className="py-0">
        <CardContent className="space-y-4 py-6">
          <div className="h-3 w-28 animate-pulse rounded-full bg-secondary" />
          <div className="h-10 w-64 animate-pulse rounded-2xl bg-secondary" />
          <div className="h-4 w-full animate-pulse rounded-full bg-secondary" />
          <div className="h-4 w-3/4 animate-pulse rounded-full bg-secondary" />
        </CardContent>
      </Card>

      {Array.from({ length: 3 }).map((_, index) => (
        <Card key={index}>
          <CardContent className="space-y-4 py-6">
            <div className="h-8 w-40 animate-pulse rounded-2xl bg-secondary" />
            <div className="h-24 w-full animate-pulse rounded-3xl bg-secondary/70" />
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function TemplateExerciseCard({
  exercise,
  index,
  isMoveDownDisabled,
  isMoveUpDisabled,
  weightUnit,
  onMoveDown,
  onMoveUp,
  onRename,
}: {
  exercise: WorkoutTemplateExercise;
  index: number;
  isMoveDownDisabled: boolean;
  isMoveUpDisabled: boolean;
  weightUnit: WeightUnit;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onRename: () => void;
}) {
  const prescription = formatPrescription(exercise, weightUnit);
  const targetBreakdown = formatSetTargetBreakdown(exercise, weightUnit);
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: exercise.id,
  });

  return (
    <Card
      className="gap-4 py-0"
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <CardHeader className="gap-3 py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <Button
              aria-label={`Drag handle for ${exercise.exerciseName}`}
              className="mt-1 size-9 touch-none"
              size="icon"
              type="button"
              variant="ghost"
              {...attributes}
              {...listeners}
            >
              <GripVertical aria-hidden="true" className="size-4" />
            </Button>
            <div className="space-y-2">
              <CardTitle>{exercise.exerciseName}</CardTitle>
              <p className="text-sm font-medium text-foreground">{prescription}</p>
              {targetBreakdown ? <p className="text-xs text-muted">{targetBreakdown}</p> : null}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={`Exercise actions for ${exercise.exerciseName}`}
                size="icon"
                type="button"
                variant="ghost"
              >
                <MoreVertical aria-hidden="true" className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={isMoveUpDisabled} onClick={onMoveUp}>
                <ArrowUp aria-hidden="true" className="size-4" />
                Move up
              </DropdownMenuItem>
              <DropdownMenuItem disabled={isMoveDownDisabled} onClick={onMoveDown}>
                <ArrowDown aria-hidden="true" className="size-4" />
                Move down
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onRename}>Rename exercise</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pb-5">
        <p className="text-xs font-medium tracking-[0.16em] text-muted uppercase">{`Exercise #${index + 1}`}</p>
        <div className="flex flex-wrap gap-2 text-sm">
          {exercise.restSeconds !== null ? (
            <MetadataPill label={`Rest: ${exercise.restSeconds}s`} />
          ) : null}
          {exercise.tempo ? <MetadataPill label={`Tempo: ${formatTempo(exercise.tempo)}`} /> : null}
        </div>

        {exercise.notes ? (
          <div className="space-y-1 rounded-2xl border border-border bg-secondary/35 px-4 py-3">
            <p className="text-sm font-medium text-foreground">Notes</p>
            <p className="text-sm text-muted">{exercise.notes}</p>
          </div>
        ) : null}
        {exercise.programmingNotes ? (
          <div className="space-y-1 rounded-2xl border border-border bg-secondary/35 px-4 py-3">
            <p className="text-sm font-medium text-foreground">Programming notes</p>
            <p className="text-sm text-muted">{exercise.programmingNotes}</p>
          </div>
        ) : null}

        {(exercise.formCues?.length ?? 0) > 0 || exercise.cues.length > 0 ? (
          <div className="rounded-2xl border border-border bg-secondary/35 px-4 py-3">
            <FormCueChips exerciseCues={exercise.formCues ?? []} templateCues={exercise.cues} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function formatLabel(value: string) {
  return value
    .split(/[- ]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatPrescription(exercise: WorkoutTemplateExercise, weightUnit: WeightUnit) {
  const repsTarget = formatRepTarget(exercise.repsMin, exercise.repsMax);
  const setTargetSummary = summarizeSetTargets(exercise, weightUnit);

  if (setTargetSummary) {
    if (exercise.sets !== null) {
      return `${exercise.sets} x ${setTargetSummary}`;
    }

    return setTargetSummary;
  }

  if (exercise.trackingType === 'seconds_only') {
    if (repsTarget) {
      if (exercise.sets !== null) {
        return `${exercise.sets} x ${repsTarget}s`;
      }

      return `${repsTarget}s`;
    }

    if (exercise.sets !== null) {
      return `${exercise.sets} timed set${exercise.sets === 1 ? '' : 's'}`;
    }
  }

  if (exercise.trackingType === 'distance') {
    if (repsTarget) {
      if (exercise.sets !== null) {
        return `${exercise.sets} x ${repsTarget} ${getDistanceUnit(weightUnit)}`;
      }

      return `${repsTarget} ${getDistanceUnit(weightUnit)}`;
    }

    if (exercise.sets !== null) {
      return `${exercise.sets} distance set${exercise.sets === 1 ? '' : 's'}`;
    }
  }

  if (exercise.sets !== null && repsTarget) {
    return `${exercise.sets} x ${repsTarget}`;
  }

  if (exercise.sets !== null) {
    return `${exercise.sets} set${exercise.sets === 1 ? '' : 's'}`;
  }

  if (repsTarget) {
    return repsTarget;
  }

  return 'Prescription not set';
}

function formatSetTargetBreakdown(exercise: WorkoutTemplateExercise, weightUnit: WeightUnit) {
  const targets = (exercise.setTargets ?? [])
    .map((setTarget) => {
      const label = formatTargetByTrackingType(exercise.trackingType, setTarget, weightUnit);

      if (!label) {
        return null;
      }

      return `Set ${setTarget.setNumber}: ${label}`;
    })
    .filter((value): value is string => value !== null);

  if (targets.length <= 1) {
    return null;
  }

  return targets.join(' • ');
}

function summarizeSetTargets(exercise: WorkoutTemplateExercise, weightUnit: WeightUnit) {
  if (!exercise.setTargets || exercise.setTargets.length === 0) {
    return null;
  }

  const labels = exercise.setTargets
    .map((setTarget) => formatTargetByTrackingType(exercise.trackingType, setTarget, weightUnit))
    .filter((value): value is string => value !== null);
  if (labels.length === 0) {
    return null;
  }

  const uniqueLabels = [...new Set(labels)];
  if (uniqueLabels.length === 1) {
    return uniqueLabels[0] ?? null;
  }

  return labels[0] ?? null;
}

function formatTargetByTrackingType(
  trackingType: ExerciseTrackingType,
  target: NonNullable<WorkoutTemplateExercise['setTargets']>[number],
  weightUnit: WeightUnit,
) {
  const weightLabel = formatTargetWeight(target, weightUnit);
  const secondsLabel = target?.targetSeconds != null ? `${target.targetSeconds}s` : null;
  const distanceLabel =
    target?.targetDistance != null ? `${target.targetDistance} ${getDistanceUnit(weightUnit)}` : null;

  switch (trackingType) {
    case 'seconds_only':
      return secondsLabel;
    case 'weight_seconds':
      if (weightLabel && secondsLabel) {
        return `${weightLabel} x ${secondsLabel}`;
      }

      return weightLabel ?? secondsLabel;
    case 'distance':
      return distanceLabel;
    case 'cardio':
      if (secondsLabel && distanceLabel) {
        return `${secondsLabel} + ${distanceLabel}`;
      }

      return secondsLabel ?? distanceLabel;
    case 'weight_reps':
      return weightLabel;
    default:
      return null;
  }
}

function formatTargetWeight(
  target: NonNullable<WorkoutTemplateExercise['setTargets']>[number],
  weightUnit: WeightUnit,
) {
  if (target?.targetWeight != null) {
    return `${target.targetWeight} ${weightUnit}`;
  }

  if (target?.targetWeightMin != null && target?.targetWeightMax != null) {
    return `${target.targetWeightMin}-${target.targetWeightMax} ${weightUnit}`;
  }

  return null;
}

function formatRepTarget(repsMin: number | null, repsMax: number | null) {
  if (repsMin !== null && repsMax !== null) {
    return repsMin === repsMax ? `${repsMin}` : `${repsMin}-${repsMax}`;
  }

  if (repsMin !== null) {
    return `${repsMin}+`;
  }

  if (repsMax !== null) {
    return `Up to ${repsMax}`;
  }

  return null;
}

function formatTempo(tempo: string) {
  return tempo.split('').join('-');
}

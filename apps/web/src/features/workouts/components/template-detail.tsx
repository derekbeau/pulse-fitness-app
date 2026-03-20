import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  ArrowDown,
  ArrowUp,
  Braces,
  GripVertical,
  History,
  Link2Off,
  MoreVertical,
  Plus,
} from 'lucide-react';

import type {
  Exercise,
  ExerciseTrackingType,
  UpdateWorkoutTemplateInput,
  WorkoutTemplate,
  WorkoutTemplateExercise,
  WorkoutTemplateSectionType,
  WeightUnit,
} from '@pulse/shared';
import { toast } from 'sonner';

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useLastPerformance } from '@/hooks/use-last-performance';
import { useWeightUnit } from '@/hooks/use-weight-unit';
import { useStartSession } from '@/hooks/use-workout-session';
import { ApiError } from '@/lib/api-client';
import { toDateKey } from '@/lib/date-utils';
import { useDebouncedCallback } from '@/lib/use-debounced-callback';
import { cn } from '@/lib/utils';

import {
  useExercise,
  useExercises,
  useRenameExercise,
  useReorderTemplateExercises,
  useScheduleWorkout,
  useUpdateExercise,
  useUpdateTemplate,
  useWorkoutTemplate,
} from '../api/workouts';
import {
  formatWorkoutConflictDescription,
  getDayWorkoutConflicts,
} from '../lib/day-workout-conflicts';
import { getSupersetAccentClass } from '../lib/superset-utils';
import { formatCompactSets, getDistanceUnit } from '../lib/tracking';
import { buildInitialSessionSets } from '../lib/workout-session-sets';
import { FormCueChips } from './form-cue-chips';
import { ExerciseHistoryModal } from './exercise-history-modal';
import { RenameExerciseDialog } from './rename-exercise-dialog';
import { ScheduleWorkoutDialog } from './schedule-workout-dialog';
import { SwapExerciseDialog } from './swap-exercise-dialog';

type WorkoutTemplateDetailProps = {
  templateId: string;
};

type EditableExerciseFields = {
  notes: string;
  reps: string;
  restSeconds: string;
  sets: string;
};

const sectionLabels = {
  warmup: 'Warmup',
  main: 'Main',
  cooldown: 'Cooldown',
  supplemental: 'Supplemental',
} as const;

const sectionAccentStyles: Record<WorkoutTemplateSectionType, string> = {
  warmup: 'border-l-[var(--color-accent-mint)]',
  main: 'border-l-[var(--color-accent-pink)]',
  cooldown: 'border-l-[var(--color-accent-cream)]',
  supplemental: 'border-l-[var(--color-accent-cream)]',
};

const supersetAccentStyles = [
  'border-l-[var(--color-accent-mint)] bg-[var(--color-accent-mint)]/5',
  'border-l-[var(--color-accent-blue)] bg-[var(--color-accent-blue)]/5',
  'border-l-[var(--color-accent-pink)] bg-[var(--color-accent-pink)]/5',
  'border-l-[var(--color-accent-cream)] bg-[var(--color-accent-cream)]/12',
] as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const historyDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

export function WorkoutTemplateDetail({ templateId }: WorkoutTemplateDetailProps) {
  const { weightUnit } = useWeightUnit();
  const navigate = useNavigate();
  const { confirm, dialog } = useConfirmation();
  const templateQuery = useWorkoutTemplate(templateId);
  const startWorkoutMutation = useStartSession();
  const scheduleWorkoutMutation = useScheduleWorkout();
  const renameExerciseMutation = useRenameExercise();
  const reorderExercisesMutation = useReorderTemplateExercises();
  const updateExerciseMutation = useUpdateExercise();
  const updateTemplateMutation = useUpdateTemplate();
  const template = templateQuery.data ?? null;

  const [renameTarget, setRenameTarget] = useState<{
    exerciseId: string;
    exerciseName: string;
  } | null>(null);
  const [swapTarget, setSwapTarget] = useState<{
    exerciseId: string;
    exerciseName: string;
  } | null>(null);
  const [addSectionTarget, setAddSectionTarget] = useState<WorkoutTemplateSectionType | null>(null);
  const [supersetSectionTarget, setSupersetSectionTarget] =
    useState<WorkoutTemplateSectionType | null>(null);
  const [exerciseDetailTarget, setExerciseDetailTarget] = useState<{
    exerciseId: string;
    templateExerciseId: string;
  } | null>(null);
  const [historyTarget, setHistoryTarget] = useState<{
    exerciseId: string;
    exerciseName: string;
    trackingType: ExerciseTrackingType;
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

  const updateQueueRef = useRef<Promise<void>>(Promise.resolve());
  const latestSectionsRef = useRef<NonNullable<UpdateWorkoutTemplateInput['sections']>>([]);

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

  useEffect(() => {
    if (!template) {
      latestSectionsRef.current = [];
      return;
    }

    if (updateTemplateMutation.isPending) {
      return;
    }

    latestSectionsRef.current = template.sections.map(toUpdateSection);
  }, [template, updateTemplateMutation.isPending]);

  const queueTemplateSectionsUpdate = useCallback(
    (
      buildNextSections: (
        currentSections: NonNullable<UpdateWorkoutTemplateInput['sections']>,
      ) => NonNullable<UpdateWorkoutTemplateInput['sections']>,
      options?: {
        onError?: () => void;
        onSuccess?: () => void;
      },
    ) => {
      if (!template) {
        return;
      }

      updateQueueRef.current = updateQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          try {
            const nextSections = buildNextSections(latestSectionsRef.current);
            latestSectionsRef.current = nextSections;

            const updatedTemplate = await updateTemplateMutation.mutateAsync({
              id: template.id,
              input: {
                sections: nextSections,
              },
            });

            latestSectionsRef.current = updatedTemplate.sections.map(toUpdateSection);
            options?.onSuccess?.();
          } catch {
            latestSectionsRef.current = template.sections.map(toUpdateSection);
            options?.onError?.();
          }
        });
    },
    [template, updateTemplateMutation],
  );

  if (templateQuery.isPending) {
    return <TemplateDetailSkeleton />;
  }

  if (templateQuery.isError || !template) {
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

  const saveExerciseEdits = (
    sectionType: WorkoutTemplateSectionType,
    exerciseId: string,
    fields: EditableExerciseFields,
  ) => {
    const parsedReps = parseRepsInput(fields.reps);
    if (!parsedReps.valid) {
      toast.error('Reps must be like 8, 8-10, or 8+');
      return;
    }

    const sets = parseNullablePositiveInt(fields.sets);
    const restSeconds = parseNullableNonNegativeInt(fields.restSeconds);
    if (sets === undefined || restSeconds === undefined) {
      toast.error('Sets and rest must be numbers');
      return;
    }

    const targetIndex = template.sections
      .find((section) => section.type === sectionType)
      ?.exercises.findIndex((exercise) => exercise.id === exerciseId);

    if (targetIndex == null || targetIndex < 0) {
      return;
    }

    queueTemplateSectionsUpdate((currentSections) =>
      currentSections.map((section) => {
        if (section.type !== sectionType) {
          return section;
        }

        return {
          ...section,
          exercises: section.exercises.map((exercise, index) =>
            index === targetIndex
              ? {
                  ...exercise,
                  notes: toNullableString(fields.notes),
                  repsMax: parsedReps.repsMax,
                  repsMin: parsedReps.repsMin,
                  restSeconds,
                  sets,
                }
              : exercise,
          ),
        };
      }),
    );
  };

  const addExerciseToSection = (sectionType: WorkoutTemplateSectionType, exerciseId: string) => {
    queueTemplateSectionsUpdate(
      (currentSections) =>
        currentSections.map((section) => ({
          ...section,
          exercises:
            section.type === sectionType
              ? [
                  ...section.exercises,
                  {
                    cues: [],
                    exerciseId,
                    notes: null,
                    repsMax: 10,
                    repsMin: 8,
                    restSeconds: 90,
                    sets: 3,
                    supersetGroup: null,
                    tempo: null,
                  },
                ]
              : section.exercises,
        })),
      {
        onError: () => {
          toast.error('Unable to add exercise. Try again.');
        },
        onSuccess: () => {
          setAddSectionTarget(null);
          toast.success('Exercise added');
        },
      },
    );
  };

  const updateSectionSupersetGroup = (
    sectionType: WorkoutTemplateSectionType,
    templateExerciseIds: string[],
    supersetGroup: string | null,
  ) => {
    if (!template || templateExerciseIds.length === 0) {
      return;
    }

    const section = template.sections.find((item) => item.type === sectionType);
    if (!section) {
      return;
    }

    const selectedIndexes = new Set<number>();
    section.exercises.forEach((exercise, index) => {
      if (templateExerciseIds.includes(exercise.id)) {
        selectedIndexes.add(index);
      }
    });

    if (selectedIndexes.size === 0) {
      return;
    }

    queueTemplateSectionsUpdate(
      (currentSections) =>
        currentSections.map((section) => {
          if (section.type !== sectionType) {
            return section;
          }

          return {
            ...section,
            exercises: section.exercises.map((exercise, index) =>
              selectedIndexes.has(index) ? { ...exercise, supersetGroup } : exercise,
            ),
          };
        }),
      {
        onError: () => toast.error('Unable to update superset. Try again.'),
      },
    );
  };

  const activeExerciseDetail = (() => {
    if (!template || !exerciseDetailTarget) {
      return null;
    }

    for (const section of template.sections) {
      const exercise = section.exercises.find(
        (item) => item.id === exerciseDetailTarget.templateExerciseId,
      );
      if (exercise) {
        return {
          sectionType: section.type,
          exercise,
        };
      }
    }

    return null;
  })();

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

      <div className="space-y-3">
        {template.sections.map((section) => (
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
                <div className="space-y-1">
                  <h2 className="text-lg font-bold tracking-wide text-foreground">
                    {sectionLabels[section.type]}
                  </h2>
                </div>
                <Badge
                  className="border-transparent bg-secondary text-secondary-foreground"
                  variant="outline"
                >
                  {`${section.exercises.length} exercise${section.exercises.length === 1 ? '' : 's'}`}
                </Badge>
              </div>
            </summary>

            <div className="space-y-1.5 border-t border-border/80 px-3 py-3 sm:px-4 sm:py-3">
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
                    {buildTemplateExerciseGroups(section.exercises).map((group) => {
                      if (group.type === 'single') {
                        const index = group.index;
                        const exercise = group.exercise;
                        return (
                          <TemplateExerciseCard
                            exercise={exercise}
                            index={index}
                            isMoveDownDisabled={index === section.exercises.length - 1}
                            isMoveUpDisabled={index === 0}
                            key={exercise.id}
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
                            onOpenDetails={() =>
                              setExerciseDetailTarget({
                                exerciseId: exercise.exerciseId,
                                templateExerciseId: exercise.id,
                              })
                            }
                            onOpenHistory={() =>
                              setHistoryTarget({
                                exerciseId: exercise.exerciseId,
                                exerciseName: exercise.exerciseName,
                                trackingType: exercise.trackingType,
                              })
                            }
                            onRename={() =>
                              setRenameTarget({
                                exerciseId: exercise.exerciseId,
                                exerciseName: exercise.exerciseName,
                              })
                            }
                            onSaveInline={(fields) =>
                              saveExerciseEdits(section.type, exercise.id, fields)
                            }
                            onSwap={() =>
                              setSwapTarget({
                                exerciseId: exercise.exerciseId,
                                exerciseName: exercise.exerciseName,
                              })
                            }
                            weightUnit={weightUnit}
                          />
                        );
                      }

                      const supersetAccentClass = getSupersetAccentClass(
                        group.groupId,
                        supersetAccentStyles,
                      );

                      return (
                        <div
                          className={cn(
                            'relative space-y-1.5 rounded-2xl border border-border/90 border-l-4 px-2.5 py-2.5',
                            supersetAccentClass,
                          )}
                          data-testid={`superset-group-${group.groupId}`}
                          key={`${group.groupId}-${group.exercises[0]?.id ?? 'group'}`}
                        >
                          <div className="flex items-center gap-2">
                            <Braces aria-hidden="true" className="size-4 text-muted" />
                            <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                              {formatSupersetLabel(group.groupId)}
                            </p>
                          </div>
                          <div className="space-y-1.5">
                            {group.exercises.map((exercise, exerciseIndex) => {
                              const index = group.startIndex + exerciseIndex;
                              return (
                                <TemplateExerciseCard
                                  exercise={exercise}
                                  index={index}
                                  isMoveDownDisabled={index === section.exercises.length - 1}
                                  isMoveUpDisabled={index === 0}
                                  key={exercise.id}
                                  onMoveDown={() => {
                                    if (index >= section.exercises.length - 1) {
                                      return;
                                    }

                                    const reordered = arrayMove(
                                      section.exercises,
                                      index,
                                      index + 1,
                                    );
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

                                    const reordered = arrayMove(
                                      section.exercises,
                                      index,
                                      index - 1,
                                    );
                                    reorderExercisesMutation.mutate({
                                      templateId: template.id,
                                      section: section.type,
                                      exerciseIds: reordered.map((item) => item.id),
                                    });
                                  }}
                                  onOpenDetails={() =>
                                    setExerciseDetailTarget({
                                      exerciseId: exercise.exerciseId,
                                      templateExerciseId: exercise.id,
                                    })
                                  }
                                  onOpenHistory={() =>
                                    setHistoryTarget({
                                      exerciseId: exercise.exerciseId,
                                      exerciseName: exercise.exerciseName,
                                      trackingType: exercise.trackingType,
                                    })
                                  }
                                  onRename={() =>
                                    setRenameTarget({
                                      exerciseId: exercise.exerciseId,
                                      exerciseName: exercise.exerciseName,
                                    })
                                  }
                                  onSaveInline={(fields) =>
                                    saveExerciseEdits(section.type, exercise.id, fields)
                                  }
                                  onSwap={() =>
                                    setSwapTarget({
                                      exerciseId: exercise.exerciseId,
                                      exerciseName: exercise.exerciseName,
                                    })
                                  }
                                  weightUnit={weightUnit}
                                />
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </SortableContext>
                </DndContext>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  aria-label={`Add exercise to ${sectionLabels[section.type]} section`}
                  className="w-full justify-center text-sm sm:w-auto"
                  onClick={() => setAddSectionTarget(section.type)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Plus aria-hidden="true" className="size-4" />
                  Add exercise
                </Button>
                {section.exercises.length >= 2 ? (
                  <Button
                    className="w-full justify-center text-sm sm:w-auto"
                    onClick={() => setSupersetSectionTarget(section.type)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Braces aria-hidden="true" className="size-4" />
                    Manage supersets
                  </Button>
                ) : null}
              </div>
            </div>
          </details>
        ))}
      </div>

      <AddExerciseDialog
        isPending={updateTemplateMutation.isPending}
        onOpenChange={(open) => {
          if (!open) {
            setAddSectionTarget(null);
          }
        }}
        onSelect={(exerciseId) => {
          if (!addSectionTarget) {
            return;
          }

          addExerciseToSection(addSectionTarget, exerciseId);
        }}
        open={addSectionTarget != null}
      />

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
      <SwapExerciseDialog
        contextId={template.id}
        mode="template"
        onOpenChange={(open) => {
          if (!open) {
            setSwapTarget(null);
          }
        }}
        open={swapTarget != null}
        sourceExerciseId={swapTarget?.exerciseId ?? ''}
        sourceExerciseName={swapTarget?.exerciseName ?? ''}
        sourceLabel="this template"
      />
      {supersetSectionTarget ? (
        <SupersetManagerDialog
          onApply={(exerciseIds, supersetGroup) => {
            updateSectionSupersetGroup(supersetSectionTarget, exerciseIds, supersetGroup);
          }}
          onOpenChange={(open) => {
            if (!open) {
              setSupersetSectionTarget(null);
            }
          }}
          section={
            template.sections.find((section) => section.type === supersetSectionTarget) ?? null
          }
        />
      ) : null}
      {exerciseDetailTarget && activeExerciseDetail ? (
        <ExerciseDetailModal
          key={exerciseDetailTarget.templateExerciseId}
          exercise={activeExerciseDetail.exercise}
          isPending={updateExerciseMutation.isPending}
          onOpenChange={(open) => {
            if (!open) {
              setExerciseDetailTarget(null);
            }
          }}
          onSaveCoachingNotes={(exerciseId, coachingNotes) =>
            updateExerciseMutation.mutateAsync({
              id: exerciseId,
              input: {
                coachingNotes,
              },
            })
          }
        />
      ) : null}
      {historyTarget ? (
        <ExerciseHistoryModal
          exerciseId={historyTarget.exerciseId}
          exerciseName={historyTarget.exerciseName}
          onOpenChange={(open) => {
            if (!open) {
              setHistoryTarget(null);
            }
          }}
          open={historyTarget != null}
          trackingType={historyTarget.trackingType}
          weightUnit={weightUnit}
        />
      ) : null}

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

function TemplateExerciseCard({
  exercise,
  index,
  isMoveDownDisabled,
  isMoveUpDisabled,
  onOpenHistory,
  onMoveDown,
  onMoveUp,
  onOpenDetails,
  onRename,
  onSaveInline,
  onSwap,
  weightUnit,
}: {
  exercise: WorkoutTemplateExercise;
  index: number;
  isMoveDownDisabled: boolean;
  isMoveUpDisabled: boolean;
  onOpenHistory: () => void;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onOpenDetails: () => void;
  onRename: () => void;
  onSaveInline: (fields: EditableExerciseFields) => void;
  onSwap: () => void;
  weightUnit: WeightUnit;
}) {
  const compactSummary = formatCompactSetSummary(exercise, weightUnit);
  const targetBreakdown = formatSetTargetBreakdown(exercise, weightUnit);
  const [fields, setFields] = useState<EditableExerciseFields>(() => toEditableFields(exercise));
  const focusedFieldCountRef = useRef(0);

  useEffect(() => {
    if (focusedFieldCountRef.current > 0) {
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- local editable state must resync to server snapshot when not actively editing
    setFields(toEditableFields(exercise));
  }, [exercise]);

  const debouncedInlineSave = useDebouncedCallback((nextFields: EditableExerciseFields) => {
    onSaveInline(nextFields);
  });

  useEffect(
    () => () => {
      debouncedInlineSave.flush();
    },
    [debouncedInlineSave],
  );

  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: exercise.id,
  });

  return (
    <Card
      className="gap-1.5 py-0"
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <CardHeader className="gap-1.5 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-1.5">
            <Button
              aria-label={`Drag handle for ${exercise.exerciseName}`}
              className="-ml-1 mt-0.5 size-11 min-h-11 min-w-11 touch-none"
              size="icon"
              type="button"
              variant="ghost"
              {...attributes}
              {...listeners}
            >
              <GripVertical aria-hidden="true" className="size-4" />
            </Button>
            <div className="min-w-0 space-y-0.5">
              <CardTitle className="truncate text-base font-semibold sm:text-lg">
                <button
                  className="cursor-pointer truncate text-left hover:text-primary hover:underline"
                  onClick={onOpenDetails}
                  type="button"
                >
                  {exercise.exerciseName}
                </button>
              </CardTitle>
              <p className="text-xs font-medium text-muted sm:text-sm">{compactSummary}</p>
              {exercise.notes ? (
                <p className="line-clamp-2 text-[11px] italic text-muted/85">{exercise.notes}</p>
              ) : null}
              {exercise.tempo || exercise.restSeconds !== null ? (
                <p className="text-[11px] text-muted">
                  {exercise.tempo ? `Tempo: ${formatTempo(exercise.tempo)}` : null}
                  {exercise.tempo && exercise.restSeconds !== null ? ' • ' : null}
                  {exercise.restSeconds !== null ? `Rest: ${exercise.restSeconds}s` : null}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              aria-label={`Open ${exercise.exerciseName} history`}
              className="size-11 min-h-11 min-w-11"
              onClick={onOpenHistory}
              size="icon"
              type="button"
              variant="ghost"
            >
              <History aria-hidden="true" className="size-4" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label={`Exercise actions for ${exercise.exerciseName}`}
                  className="-mr-1 size-11 min-h-11 min-w-11"
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <MoreVertical aria-hidden="true" className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onSwap}>Swap exercise</DropdownMenuItem>
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
        </div>
      </CardHeader>

      <CardContent className="space-y-1.5 pb-2.5">
        <p className="text-[10px] font-semibold tracking-[0.14em] text-muted uppercase">{`Exercise #${index + 1}`}</p>

        <div className="grid gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
          <InlineEditField
            ariaLabel={`Sets for ${exercise.exerciseName}`}
            label="Sets"
            onBlur={() => {
              debouncedInlineSave.run(fields);
              setTimeout(() => {
                focusedFieldCountRef.current = Math.max(0, focusedFieldCountRef.current - 1);
              }, 0);
            }}
            onFocus={() => {
              focusedFieldCountRef.current += 1;
            }}
            onChange={(nextValue) => setFields((current) => ({ ...current, sets: nextValue }))}
            placeholder="3"
            value={fields.sets}
          />
          <InlineEditField
            ariaLabel={`Reps for ${exercise.exerciseName}`}
            label="Reps"
            onBlur={() => {
              debouncedInlineSave.run(fields);
              setTimeout(() => {
                focusedFieldCountRef.current = Math.max(0, focusedFieldCountRef.current - 1);
              }, 0);
            }}
            onFocus={() => {
              focusedFieldCountRef.current += 1;
            }}
            onChange={(nextValue) => setFields((current) => ({ ...current, reps: nextValue }))}
            placeholder="8-10"
            value={fields.reps}
          />
          <InlineEditField
            ariaLabel={`Rest for ${exercise.exerciseName}`}
            label="Rest (s)"
            onBlur={() => {
              debouncedInlineSave.run(fields);
              setTimeout(() => {
                focusedFieldCountRef.current = Math.max(0, focusedFieldCountRef.current - 1);
              }, 0);
            }}
            onFocus={() => {
              focusedFieldCountRef.current += 1;
            }}
            onChange={(nextValue) =>
              setFields((current) => ({ ...current, restSeconds: nextValue }))
            }
            placeholder="90"
            value={fields.restSeconds}
          />
          <InlineEditField
            ariaLabel={`Notes for ${exercise.exerciseName}`}
            className="sm:col-span-3 lg:col-span-1"
            label="Notes"
            multiline
            onBlur={() => {
              debouncedInlineSave.run(fields);
              setTimeout(() => {
                focusedFieldCountRef.current = Math.max(0, focusedFieldCountRef.current - 1);
              }, 0);
            }}
            onFocus={() => {
              focusedFieldCountRef.current += 1;
            }}
            onChange={(nextValue) => setFields((current) => ({ ...current, notes: nextValue }))}
            placeholder="Optional note"
            value={fields.notes}
          />
        </div>

        <details className="rounded-xl border border-border/80 bg-secondary/20 px-3 py-2">
          <summary className="cursor-pointer text-xs font-semibold text-muted">
            Show full set detail
          </summary>
          <div className="mt-2 space-y-2">
            <p className="text-xs font-medium text-foreground">
              {formatPrescription(exercise, weightUnit)}
            </p>
            {targetBreakdown ? <p className="text-xs text-muted">{targetBreakdown}</p> : null}
            {exercise.tempo ? (
              <p className="text-xs text-muted">Tempo: {formatTempo(exercise.tempo)}</p>
            ) : null}

            {(exercise.exercise?.formCues?.length ?? exercise.formCues?.length ?? 0) > 0 ||
            exercise.cues.length > 0 ||
            Boolean(exercise.exercise?.coachingNotes) ||
            Boolean(exercise.programmingNotes) ? (
              <div className="rounded-lg border border-border bg-card px-3 py-2">
                <FormCueChips
                  exerciseCoachingNotes={exercise.exercise?.coachingNotes ?? null}
                  exerciseCues={exercise.exercise?.formCues ?? exercise.formCues ?? []}
                  templateCues={exercise.cues}
                  templateProgrammingNotes={exercise.programmingNotes ?? null}
                />
              </div>
            ) : null}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

function SupersetManagerDialog({
  onApply,
  onOpenChange,
  section,
}: {
  onApply: (templateExerciseIds: string[], supersetGroup: string | null) => void;
  onOpenChange: (open: boolean) => void;
  section: WorkoutTemplate['sections'][number] | null;
}) {
  const supersetGroups = useMemo(() => {
    if (!section) {
      return [];
    }

    return [
      ...new Set(
        section.exercises
          .map((exercise) => exercise.supersetGroup)
          .filter((group): group is string => typeof group === 'string' && group.length > 0),
      ),
    ];
  }, [section]);
  const [newSupersetName, setNewSupersetName] = useState(() => getNextSupersetName(supersetGroups));
  const [selectedGroup, setSelectedGroup] = useState(() => supersetGroups[0] ?? '');
  const [selectedExerciseIds, setSelectedExerciseIds] = useState<string[]>([]);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Manage supersets</DialogTitle>
          <DialogDescription>
            Select exercises to create a new superset, edit an existing group, or remove grouping.
          </DialogDescription>
        </DialogHeader>

        {!section ? null : (
          <div className="space-y-4">
            <div className="space-y-2 rounded-xl border border-border bg-secondary/20 p-3">
              <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                Exercises
              </p>
              <div className="space-y-2">
                {section.exercises.map((exercise, index) => (
                  <label
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2"
                    key={exercise.id}
                  >
                    <span className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedExerciseIds.includes(exercise.id)}
                        onCheckedChange={(checked) => {
                          setSelectedExerciseIds((current) => {
                            if (checked !== true) {
                              return current.filter((value) => value !== exercise.id);
                            }

                            if (current.includes(exercise.id)) {
                              return current;
                            }

                            return [...current, exercise.id];
                          });
                        }}
                      />
                      <span className="text-sm text-foreground">
                        {index + 1}. {exercise.exerciseName}
                      </span>
                    </span>
                    {exercise.supersetGroup ? (
                      <Badge variant="secondary">
                        {formatSupersetLabel(exercise.supersetGroup)}
                      </Badge>
                    ) : (
                      <Badge variant="outline">Ungrouped</Badge>
                    )}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-2 rounded-xl border border-border bg-card p-3">
                <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                  Create superset
                </p>
                <Input
                  aria-label="Superset name"
                  onChange={(event) => setNewSupersetName(event.currentTarget.value)}
                  placeholder="Superset A"
                  value={newSupersetName}
                />
                <Button
                  className="w-full"
                  disabled={selectedExerciseIds.length < 2}
                  onClick={() => {
                    const supersetGroup = toSupersetGroupId(newSupersetName);
                    if (!supersetGroup) {
                      toast.error('Superset name is required');
                      return;
                    }

                    onApply(selectedExerciseIds, supersetGroup);
                    onOpenChange(false);
                  }}
                  type="button"
                >
                  Create superset
                </Button>
              </div>

              <div className="space-y-2 rounded-xl border border-border bg-card p-3">
                <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                  Edit superset
                </p>
                <select
                  aria-label="Existing superset"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  onChange={(event) => setSelectedGroup(event.currentTarget.value)}
                  value={selectedGroup}
                >
                  <option value="">Select superset</option>
                  {supersetGroups.map((group) => (
                    <option key={group} value={group}>
                      {formatSupersetLabel(group)}
                    </option>
                  ))}
                </select>
                <Button
                  className="w-full"
                  disabled={!selectedGroup || selectedExerciseIds.length === 0}
                  onClick={() => {
                    onApply(selectedExerciseIds, selectedGroup);
                    onOpenChange(false);
                  }}
                  type="button"
                  variant="outline"
                >
                  Add selected to superset
                </Button>
              </div>
            </div>

            <Button
              className="w-full"
              disabled={selectedExerciseIds.length === 0}
              onClick={() => {
                onApply(selectedExerciseIds, null);
                onOpenChange(false);
              }}
              type="button"
              variant="outline"
            >
              <Link2Off aria-hidden="true" className="size-4" />
              Remove superset
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ExerciseDetailModal({
  exercise,
  isPending,
  onOpenChange,
  onSaveCoachingNotes,
}: {
  exercise: WorkoutTemplateExercise;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveCoachingNotes: (exerciseId: string, coachingNotes: string | null) => Promise<unknown>;
}) {
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'related'>('overview');
  const [coachingNotes, setCoachingNotes] = useState(exercise.exercise?.coachingNotes ?? '');
  const [isSaving, setIsSaving] = useState(false);

  const exerciseQuery = useExercise(exercise.exerciseId, { enabled: true });
  const historyQuery = useLastPerformance(exercise.exerciseId, {
    enabled: true,
    includeRelated: true,
  });

  const matchedExercise = exerciseQuery.data ?? null;

  const formCues =
    matchedExercise?.formCues ?? exercise.exercise?.formCues ?? exercise.formCues ?? [];
  const instructionText = matchedExercise?.instructions ?? exercise.exercise?.instructions ?? null;
  const muscleGroups = matchedExercise?.muscleGroups ?? [];
  const trackingType = matchedExercise?.trackingType ?? exercise.trackingType;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{exercise.exerciseName}</DialogTitle>
          <DialogDescription>
            {formatTrackingTypeLabel(trackingType)} •{' '}
            {muscleGroups.length > 0 ? muscleGroups.join(', ') : 'Muscle groups not specified'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 border-b border-border pb-2">
          <Button
            onClick={() => setActiveTab('overview')}
            size="sm"
            type="button"
            variant={activeTab === 'overview' ? 'default' : 'outline'}
          >
            Overview
          </Button>
          <Button
            onClick={() => setActiveTab('history')}
            size="sm"
            type="button"
            variant={activeTab === 'history' ? 'default' : 'outline'}
          >
            History
          </Button>
          <Button
            onClick={() => setActiveTab('related')}
            size="sm"
            type="button"
            variant={activeTab === 'related' ? 'default' : 'outline'}
          >
            Related
          </Button>
        </div>

        {activeTab === 'overview' ? (
          <div className="space-y-4">
            {formCues.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                  Form cues
                </p>
                <div className="flex flex-wrap gap-2">
                  {formCues.map((cue) => (
                    <Badge key={cue} variant="secondary">
                      {cue}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            {instructionText ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                  Instructions
                </p>
                <p className="text-sm text-foreground">{instructionText}</p>
              </div>
            ) : null}

            <div className="space-y-2">
              <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                Coaching notes
              </p>
              <Textarea
                aria-label="Coaching notes"
                onChange={(event) => setCoachingNotes(event.currentTarget.value)}
                rows={4}
                value={coachingNotes}
              />
              <Button
                disabled={isPending || isSaving}
                onClick={() => {
                  setIsSaving(true);
                  onSaveCoachingNotes(exercise.exerciseId, toNullableString(coachingNotes))
                    .then(() => {
                      toast.success('Coaching notes saved');
                    })
                    .catch((error) => {
                      const message =
                        error instanceof Error ? error.message : 'Unable to save coaching notes';
                      toast.error(message);
                    })
                    .finally(() => {
                      setIsSaving(false);
                    });
                }}
                type="button"
              >
                Save coaching notes
              </Button>
            </div>
          </div>
        ) : null}

        {activeTab === 'history' ? (
          <div className="space-y-2">
            {historyQuery.isPending ? (
              <p className="text-sm text-muted">Loading recent performance...</p>
            ) : (
              <p className="text-sm text-foreground">
                {historyQuery.data?.history
                  ? formatLastPerformanceSummary(historyQuery.data.history, trackingType)
                  : 'No history available.'}
              </p>
            )}
          </div>
        ) : null}

        {activeTab === 'related' ? (
          <div className="space-y-2">
            {historyQuery.isPending ? (
              <p className="text-sm text-muted">Loading related exercises...</p>
            ) : historyQuery.data?.related.length ? (
              historyQuery.data.related.map((relatedExercise) => (
                <div
                  className="space-y-1 rounded-lg border border-border bg-card px-3 py-2"
                  key={relatedExercise.exerciseId}
                >
                  <p className="text-sm font-semibold text-foreground">
                    {relatedExercise.exerciseName}
                  </p>
                  <p className="text-xs text-muted">
                    {formatTrackingTypeLabel(relatedExercise.trackingType)}
                  </p>
                  <p className="text-xs text-muted">
                    {formatLastPerformanceSummary(
                      relatedExercise.history,
                      relatedExercise.trackingType,
                    )}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted">No related exercises configured.</p>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AddExerciseDialog({
  isPending,
  onOpenChange,
  onSelect,
  open,
}: {
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (exerciseId: string) => void;
  open: boolean;
}) {
  const [query, setQuery] = useState('');

  const exercisesQuery = useExercises(
    {
      limit: 8,
      page: 1,
      q: query.trim() || undefined,
    },
    { enabled: open },
  );

  const exerciseOptions = exercisesQuery.data?.data ?? [];

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setQuery('');
        }
        onOpenChange(nextOpen);
      }}
      open={open}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add exercise</DialogTitle>
          <DialogDescription>Select an exercise to add to this section.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            aria-label="Search exercise to add"
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search exercises"
            value={query}
          />

          <div className="max-h-72 space-y-2 overflow-y-auto">
            {exercisesQuery.isPending ? (
              <p className="text-sm text-muted">Loading exercises...</p>
            ) : null}

            {!exercisesQuery.isPending && exerciseOptions.length === 0 ? (
              <p className="text-sm text-muted">No exercises found.</p>
            ) : null}

            {exerciseOptions.map((exercise) => (
              <AddExerciseOption
                exercise={exercise}
                isPending={isPending}
                key={exercise.id}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddExerciseOption({
  exercise,
  isPending,
  onSelect,
}: {
  exercise: Exercise;
  isPending: boolean;
  onSelect: (exerciseId: string) => void;
}) {
  return (
    <Button
      className="h-auto w-full items-start justify-start px-3 py-2 text-left"
      disabled={isPending}
      onClick={() => onSelect(exercise.id)}
      type="button"
      variant="outline"
    >
      <span className="w-full">
        <span className="block text-sm font-semibold text-foreground">{exercise.name}</span>
        <span className="block text-xs text-muted">
          {exercise.trackingType.replaceAll('_', ' ')}
        </span>
      </span>
    </Button>
  );
}

function InlineEditField({
  ariaLabel,
  className,
  label,
  multiline = false,
  onBlur,
  onFocus,
  onChange,
  placeholder,
  value,
}: {
  ariaLabel: string;
  className?: string;
  label: string;
  multiline?: boolean;
  onBlur: () => void;
  onFocus: () => void;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className={cn('space-y-1', className)}>
      <span className="text-[10px] font-semibold tracking-[0.08em] text-muted uppercase">
        {label}
      </span>
      {multiline ? (
        <Textarea
          aria-label={ariaLabel}
          className="min-h-9 px-2 py-1 text-xs focus-visible:border-primary focus-visible:bg-card"
          onBlur={onBlur}
          onFocus={onFocus}
          onChange={(event) => onChange(event.currentTarget.value)}
          placeholder={placeholder}
          rows={2}
          value={value}
        />
      ) : (
        <Input
          aria-label={ariaLabel}
          className="h-8 text-xs focus-visible:border-primary focus-visible:bg-card"
          onBlur={onBlur}
          onFocus={onFocus}
          onChange={(event) => onChange(event.currentTarget.value)}
          placeholder={placeholder}
          value={value}
        />
      )}
    </label>
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

function buildTemplateExerciseGroups(exercises: WorkoutTemplateExercise[]) {
  const groups: Array<
    | { type: 'single'; exercise: WorkoutTemplateExercise; index: number }
    | {
        type: 'superset';
        groupId: string;
        exercises: WorkoutTemplateExercise[];
        startIndex: number;
      }
  > = [];

  let index = 0;
  while (index < exercises.length) {
    const currentExercise = exercises[index];
    if (!currentExercise) {
      break;
    }

    if (!currentExercise.supersetGroup) {
      groups.push({
        type: 'single',
        exercise: currentExercise,
        index,
      });
      index += 1;
      continue;
    }

    const groupedExercises = [currentExercise];
    let nextIndex = index + 1;
    while (
      nextIndex < exercises.length &&
      exercises[nextIndex]?.supersetGroup === currentExercise.supersetGroup
    ) {
      const nextExercise = exercises[nextIndex];
      if (nextExercise) {
        groupedExercises.push(nextExercise);
      }
      nextIndex += 1;
    }

    if (groupedExercises.length >= 2) {
      groups.push({
        type: 'superset',
        groupId: currentExercise.supersetGroup,
        exercises: groupedExercises,
        startIndex: index,
      });
      index = nextIndex;
      continue;
    }

    groups.push({
      type: 'single',
      exercise: currentExercise,
      index,
    });
    index += 1;
  }

  return groups;
}

function formatSupersetLabel(groupId: string) {
  return groupId
    .replace(/^superset-?/i, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim()
    .replace(/^/, 'Superset ');
}

function getNextSupersetName(existingGroups: string[]) {
  const used = new Set(
    existingGroups
      .map((group) =>
        group
          .replace(/^superset-?/i, '')
          .trim()
          .toUpperCase(),
      )
      .filter(Boolean),
  );

  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const letter of letters) {
    if (!used.has(letter)) {
      return `Superset ${letter}`;
    }
  }

  return `Superset ${existingGroups.length + 1}`;
}

function toSupersetGroupId(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/^superset\s+/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!normalized) {
    return null;
  }

  return `superset-${normalized}`.slice(0, 255);
}

function formatTrackingTypeLabel(trackingType: ExerciseTrackingType) {
  return trackingType.replaceAll('_', ' ');
}

function formatLastPerformanceSummary(
  history: { date: string; sets: Array<{ reps: number; weight: number | null }> } | null,
  trackingType: ExerciseTrackingType,
) {
  if (!history || history.sets.length === 0) {
    return 'No history yet.';
  }

  const setSummary = formatCompactSets(
    history.sets.map((set) =>
      trackingType === 'distance'
        ? { distance: set.reps, weight: set.weight }
        : { reps: set.reps, weight: set.weight },
    ),
    trackingType,
    {
      useLegacySecondsFallback: trackingType !== 'reps_seconds',
    },
  );

  return `${historyDateFormatter.format(new Date(`${history.date}T12:00:00`))} • ${setSummary}`;
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
  const trackingTypeLabel = exercise.trackingType === 'bodyweight_reps' ? ' (bodyweight)' : '';

  if (setTargetSummary) {
    if (exercise.sets !== null) {
      return `${exercise.sets} x ${setTargetSummary}${trackingTypeLabel}`;
    }

    return `${setTargetSummary}${trackingTypeLabel}`;
  }

  if (exercise.trackingType === 'seconds_only') {
    if (repsTarget) {
      if (exercise.sets !== null) {
        return `${exercise.sets} x ${repsTarget} sec`;
      }

      return `${repsTarget} sec`;
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
    return `${exercise.sets} x ${repsTarget}${trackingTypeLabel}`;
  }

  if (exercise.sets !== null) {
    return `${exercise.sets} set${exercise.sets === 1 ? '' : 's'}`;
  }

  if (repsTarget) {
    return `${repsTarget}${trackingTypeLabel}`;
  }

  return 'Prescription not set';
}

function formatCompactSetSummary(exercise: WorkoutTemplateExercise, weightUnit: WeightUnit) {
  const setTargetSummary = summarizeSetTargets(exercise, weightUnit);
  const repsTarget = formatRepTarget(exercise.repsMin, exercise.repsMax);

  if (exercise.sets !== null && setTargetSummary) {
    return `${exercise.sets}×${setTargetSummary}`;
  }

  if (exercise.sets !== null && repsTarget) {
    return `${exercise.sets}×${repsTarget}`;
  }

  if (exercise.sets !== null) {
    return `${exercise.sets} set${exercise.sets === 1 ? '' : 's'}`;
  }

  return formatPrescription(exercise, weightUnit);
}

function formatSetTargetBreakdown(exercise: WorkoutTemplateExercise, weightUnit: WeightUnit) {
  const repsTarget = formatRepTarget(exercise.repsMin, exercise.repsMax);
  const targets = (exercise.setTargets ?? [])
    .map((setTarget) => {
      const label = formatTargetByTrackingType(
        exercise.trackingType,
        setTarget,
        weightUnit,
        repsTarget,
      );

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

  const repsTarget = formatRepTarget(exercise.repsMin, exercise.repsMax);
  const labels = exercise.setTargets
    .map((setTarget) =>
      formatTargetByTrackingType(exercise.trackingType, setTarget, weightUnit, repsTarget),
    )
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
  repsTarget: string | null,
) {
  const weightLabel = formatTargetWeight(target, weightUnit);
  const secondsLabel = target?.targetSeconds != null ? `${target.targetSeconds} sec` : null;
  const distanceLabel =
    target?.targetDistance != null
      ? `${target.targetDistance} ${getDistanceUnit(weightUnit)}`
      : null;

  switch (trackingType) {
    case 'seconds_only':
      return secondsLabel;
    case 'weight_seconds':
      if (weightLabel && secondsLabel) {
        return `${weightLabel} x ${secondsLabel}`;
      }

      return weightLabel ?? secondsLabel;
    case 'reps_seconds':
      if (repsTarget && secondsLabel) {
        return `${repsTarget} x ${secondsLabel}`;
      }

      return secondsLabel;
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

function toUpdateSection(
  section: WorkoutTemplate['sections'][number],
): NonNullable<UpdateWorkoutTemplateInput['sections']>[number] {
  return {
    type: section.type,
    exercises: section.exercises.map(toUpdateExercise),
  };
}

function toUpdateExercise(
  exercise: WorkoutTemplate['sections'][number]['exercises'][number],
): NonNullable<NonNullable<UpdateWorkoutTemplateInput['sections']>[number]['exercises']>[number] {
  return {
    exerciseId: exercise.exerciseId,
    cues: exercise.cues,
    notes: exercise.notes,
    programmingNotes: exercise.programmingNotes ?? null,
    repsMax: exercise.repsMax,
    repsMin: exercise.repsMin,
    restSeconds: exercise.restSeconds,
    setTargets: exercise.setTargets,
    sets: exercise.sets,
    supersetGroup: exercise.supersetGroup,
    tempo: exercise.tempo,
  };
}

function toNullableString(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseNullablePositiveInt(value: string) {
  const normalized = value.trim();
  if (normalized.length === 0) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return undefined;
  }

  return parsed;
}

function parseNullableNonNegativeInt(value: string) {
  const normalized = value.trim();
  if (normalized.length === 0) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return undefined;
  }

  return parsed;
}

function parseRepsInput(
  value: string,
): { valid: true; repsMax: number | null; repsMin: number | null } | { valid: false } {
  const normalized = value.trim();
  if (normalized.length === 0) {
    return {
      valid: true,
      repsMax: null,
      repsMin: null,
    };
  }

  if (/^\d+$/.test(normalized)) {
    const parsed = Number.parseInt(normalized, 10);
    return {
      valid: true,
      repsMax: parsed,
      repsMin: parsed,
    };
  }

  const rangeMatch = normalized.match(/^(\d+)\s*-\s*(\d+)$/);
  if (rangeMatch) {
    const min = Number.parseInt(rangeMatch[1] ?? '', 10);
    const max = Number.parseInt(rangeMatch[2] ?? '', 10);

    if (min <= max) {
      return {
        valid: true,
        repsMax: max,
        repsMin: min,
      };
    }

    return { valid: false };
  }

  const plusMatch = normalized.match(/^(\d+)\+$/);
  if (plusMatch) {
    const min = Number.parseInt(plusMatch[1] ?? '', 10);
    return {
      valid: true,
      repsMax: null,
      repsMin: min,
    };
  }

  return { valid: false };
}

function toEditableFields(exercise: WorkoutTemplateExercise): EditableExerciseFields {
  return {
    notes: exercise.notes ?? '',
    reps: formatEditableReps(exercise.repsMin, exercise.repsMax),
    restSeconds: exercise.restSeconds?.toString() ?? '',
    sets: exercise.sets?.toString() ?? '',
  };
}

function formatEditableReps(repsMin: number | null, repsMax: number | null) {
  if (repsMin !== null && repsMax !== null) {
    return repsMin === repsMax ? `${repsMin}` : `${repsMin}-${repsMax}`;
  }

  if (repsMin !== null) {
    return `${repsMin}+`;
  }

  if (repsMax !== null) {
    return `${repsMax}`;
  }

  return '';
}

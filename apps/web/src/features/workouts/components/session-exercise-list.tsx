import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
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
  Braces,
  ChevronDown,
  Check,
  Circle,
  Dot,
  GripVertical,
  BarChart3,
  Link2Off,
  MoreVertical,
} from 'lucide-react';
import type { ExerciseTrackingType, WeightUnit } from '@pulse/shared';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { NotesIndicator } from '@/components/ui/notes-indicator';
import { useLastPerformance } from '@/hooks/use-last-performance';
import { usePersistedState } from '@/hooks/usePersistedState';
import { ApiError } from '@/lib/api-client';
import { useDebouncedCallback } from '@/lib/use-debounced-callback';
import { formatWeight as formatWeightValue } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

import { useRenameExercise } from '../api/workouts';
import {
  getWorkoutExerciseStorageKey,
  getWorkoutSectionStorageKey,
} from '../lib/session-persistence';
import type {
  ActiveWorkoutExercise,
  ActiveWorkoutExerciseHistorySummary,
  ActiveWorkoutPhaseBadge,
  ActiveWorkoutSessionData,
} from '../types';
import {
  estimateExerciseTime,
  estimateSectionTime,
  formatEstimateMinuteRange,
  formatRestDuration,
  formatTempo,
} from '../lib/time-estimates';
import { getSupersetAccentClass } from '../lib/superset-utils';
import { formatCompactSets, getDistanceUnit } from '../lib/tracking';
import { FormCueChips } from './form-cue-chips';
import { ExerciseDetailModal } from './exercise-detail-modal';
import { RenameExerciseDialog } from './rename-exercise-dialog';
import { SetRow, type SetRowUpdate } from './set-row';
import { SwapExerciseDialog } from './swap-exercise-dialog';

type SessionExerciseListProps = {
  enableApiLastPerformance?: boolean;
  focusSetId?: string | null;
  onAddSet: (exerciseId: string) => void;
  onExerciseNotesChange: (exerciseId: string, notes: string) => void;
  onFocusSetHandled?: () => void;
  onReorderExercises?: (
    section: 'warmup' | 'main' | 'cooldown' | 'supplemental',
    exerciseIds: string[],
  ) => void | Promise<void>;
  onUpdateSupersetGroup?: (
    section: 'warmup' | 'main' | 'cooldown' | 'supplemental',
    exerciseIds: string[],
    supersetGroup: string | null,
  ) => void | Promise<void>;
  onRemoveExercise?: (
    exerciseId: string,
    section: ActiveWorkoutSessionData['sections'][number]['type'],
  ) => void | Promise<void>;
  onRemoveSet: (exerciseId: string) => void;
  onSetUpdate: (exerciseId: string, setId: string, update: SetRowUpdate) => void;
  showDragHandles?: boolean;
  supersetUpdatePending?: boolean;
  session: ActiveWorkoutSessionData;
  sessionId?: string | null;
  sessionCuesByExercise?: Record<string, string[]>;
  weightUnit?: WeightUnit;
};

const sectionLabels = {
  warmup: 'Warmup',
  main: 'Main',
  cooldown: 'Cooldown',
  supplemental: 'Supplemental',
} as const;

const phaseBadgeStyles: Record<ActiveWorkoutPhaseBadge, string> = {
  rebuild:
    'border-transparent bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  recovery: 'border-transparent bg-sky-500/15 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  test: 'border-transparent bg-violet-500/15 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
  moderate:
    'border-transparent bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
};

const historyDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

const supersetAccentStyles = [
  'border-l-sky-500',
  'border-l-emerald-500',
  'border-l-amber-500',
  'border-l-rose-500',
] as const;

function createInitialOpenSections(session: ActiveWorkoutSessionData) {
  return Object.fromEntries(session.sections.map((section) => [section.id, true]));
}

export function SessionExerciseList({
  enableApiLastPerformance = false,
  focusSetId = null,
  onAddSet,
  onExerciseNotesChange,
  onFocusSetHandled,
  onReorderExercises,
  onRemoveExercise,
  onUpdateSupersetGroup,
  onRemoveSet,
  onSetUpdate,
  showDragHandles = false,
  supersetUpdatePending = false,
  session,
  sessionId = null,
  sessionCuesByExercise,
  weightUnit = 'lbs',
}: SessionExerciseListProps) {
  const sectionStorageKey = useMemo(
    () => (sessionId ? (getWorkoutSectionStorageKey(sessionId) ?? '') : ''),
    [sessionId],
  );
  const exerciseStorageKey = useMemo(
    () => (sessionId ? (getWorkoutExerciseStorageKey(sessionId) ?? '') : ''),
    [sessionId],
  );
  const [openSections, setOpenSections] = usePersistedState<Record<string, boolean>>(
    sectionStorageKey,
    () => createInitialOpenSections(session),
  );
  const [expandedExercises, setExpandedExercises] = usePersistedState<Record<string, boolean>>(
    exerciseStorageKey,
    {},
  );
  const [renameTarget, setRenameTarget] = useState<{
    exerciseId: string;
    exerciseName: string;
  } | null>(null);
  const [swapTarget, setSwapTarget] = useState<{
    exerciseId: string;
    exerciseName: string;
  } | null>(null);
  const [historyTarget, setHistoryTarget] = useState<{
    exerciseId: string;
    exerciseName: string;
  } | null>(null);
  const [supersetSectionTarget, setSupersetSectionTarget] = useState<{
    sectionType: ActiveWorkoutSessionData['sections'][number]['type'];
    initialExerciseId?: string;
  } | null>(null);
  const repsInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const focusTarget = focusSetId ? findSetContext(session, focusSetId) : null;
  const renameExerciseMutation = useRenameExercise();
  const resolvedSessionCuesByExercise = sessionCuesByExercise ?? {};
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: {
      distance: 6,
    },
  });
  const keyboardSensor = useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  });
  const activeSensors = useSensors(pointerSensor, keyboardSensor);
  const disabledSensors = useSensors();
  const sensors = showDragHandles ? activeSensors : disabledSensors;

  const exerciseNumberMap = new Map<string, number>();
  let exerciseCounter = 1;
  for (const section of session.sections) {
    for (const exercise of section.exercises) {
      exerciseNumberMap.set(exercise.id, exerciseCounter++);
    }
  }

  useEffect(() => {
    if (!focusSetId) {
      return;
    }

    if (!focusTarget) {
      onFocusSetHandled?.();
      return;
    }

    const input = repsInputRefs.current[focusSetId];

    if (!input) {
      onFocusSetHandled?.();
      return;
    }

    input.focus();
    input.select();
    onFocusSetHandled?.();
  }, [focusSetId, focusTarget, onFocusSetHandled]);

  return (
    <div className="space-y-4">
      {session.sections.map((section) => {
        const completedExercises = section.exercises.filter(
          (exercise) => exercise.completedSets >= exercise.targetSets,
        ).length;
        const totalExercises = section.exercises.length;
        const isSectionCompleted = totalExercises > 0 && completedExercises === totalExercises;
        const isSectionInProgress = completedExercises > 0 && !isSectionCompleted;
        const exerciseIndexById = new Map(
          section.exercises.map((exercise, index) => [exercise.id, index]),
        );
        const sectionLabel = sectionLabels[section.type];
        const sectionEstimate = formatEstimateMinuteRange(estimateSectionTime(section));
        const isOpen = openSections[section.id] ?? true;
        const reorderSectionExercises = (currentIndex: number, nextIndex: number) => {
          if (!onReorderExercises) {
            return;
          }

          if (
            currentIndex < 0 ||
            nextIndex < 0 ||
            currentIndex >= section.exercises.length ||
            nextIndex >= section.exercises.length
          ) {
            return;
          }

          const reordered = arrayMove(section.exercises, currentIndex, nextIndex);
          void onReorderExercises(
            section.type,
            reordered.map((exercise) => exercise.id),
          );
        };

        return (
          <section
            className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm"
            key={section.id}
          >
            <button
              aria-controls={`section-panel-${section.id}`}
              aria-expanded={isOpen}
              className="flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-5 text-left sm:px-6"
              onClick={() =>
                setOpenSections((current) => ({
                  ...current,
                  [section.id]: !(current[section.id] ?? true),
                }))
              }
              type="button"
            >
              <div>
                <h2 className="flex items-baseline gap-2 text-lg font-semibold text-foreground">
                  {sectionLabel}
                  <span className="text-xs font-medium text-muted">{sectionEstimate}</span>
                </h2>
              </div>

              <div className="flex items-center gap-3">
                <Badge
                  className={cn(
                    isSectionCompleted
                      ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                      : isSectionInProgress
                        ? 'border-transparent bg-secondary text-secondary-foreground'
                        : 'border-transparent bg-secondary text-secondary-foreground',
                  )}
                  variant="outline"
                >
                  {isSectionCompleted ? <Check aria-hidden="true" className="size-3.5" /> : null}
                  {isSectionCompleted ? <span className="sr-only">Section complete</span> : null}
                  {`${completedExercises}/${totalExercises}`}
                </Badge>
                <ChevronDown
                  aria-hidden="true"
                  className={cn('size-4 text-muted transition-transform', isOpen && 'rotate-180')}
                />
              </div>
            </button>

            <div
              className="border-t border-border px-4 py-4 sm:px-6 sm:py-5"
              hidden={!isOpen}
              id={`section-panel-${section.id}`}
            >
              <DndContext
                collisionDetection={closestCenter}
                onDragEnd={({ active, over }) => {
                  if (!over || active.id === over.id) {
                    return;
                  }

                  const currentIndex = exerciseIndexById.get(String(active.id)) ?? -1;
                  const nextIndex = exerciseIndexById.get(String(over.id)) ?? -1;
                  reorderSectionExercises(currentIndex, nextIndex);
                }}
                sensors={sensors}
              >
                <SortableContext
                  items={section.exercises.map((exercise) => exercise.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-3">
                    {groupExercises(section.exercises).map((item) => {
                      if (item.type === 'single') {
                        const exerciseIndex = exerciseIndexById.get(item.exercise.id) ?? -1;
                        return (
                          <ExerciseCardItem
                            exercise={item.exercise}
                            exerciseNumber={exerciseNumberMap.get(item.exercise.id) ?? 0}
                            enableApiLastPerformance={enableApiLastPerformance}
                            expandedExercises={expandedExercises}
                            focusTargetExerciseId={focusTarget?.exerciseId ?? null}
                            isMoveDownDisabled={exerciseIndex >= section.exercises.length - 1}
                            isMoveUpDisabled={exerciseIndex <= 0}
                            onAddSet={onAddSet}
                            onConfigureSuperset={
                              onUpdateSupersetGroup && section.exercises.length >= 2
                                ? () =>
                                    setSupersetSectionTarget({
                                      sectionType: section.type,
                                      initialExerciseId: item.exercise.id,
                                    })
                                : undefined
                            }
                            onExerciseNotesChange={onExerciseNotesChange}
                            onMoveDown={() =>
                              reorderSectionExercises(exerciseIndex, exerciseIndex + 1)
                            }
                            onMoveUp={() =>
                              reorderSectionExercises(exerciseIndex, exerciseIndex - 1)
                            }
                            onRenameExercise={() =>
                              setRenameTarget({
                                exerciseId: item.exercise.id,
                                exerciseName: item.exercise.name,
                              })
                            }
                            onOpenHistory={() =>
                              setHistoryTarget({
                                exerciseId: item.exercise.id,
                                exerciseName: item.exercise.name,
                              })
                            }
                            sectionType={section.type}
                            onSwapExercise={() =>
                              setSwapTarget({
                                exerciseId: item.exercise.id,
                                exerciseName: item.exercise.name,
                              })
                            }
                            onRemoveExercise={onRemoveExercise}
                            onRemoveSet={onRemoveSet}
                            onSetUpdate={onSetUpdate}
                            repsInputRefs={repsInputRefs}
                            sessionCurrentExerciseId={session.currentExerciseId}
                            setExpandedExercises={setExpandedExercises}
                            sessionCues={resolvedSessionCuesByExercise[item.exercise.id] ?? []}
                            showDragHandle={showDragHandles}
                            weightUnit={weightUnit}
                            key={item.exercise.id}
                          />
                        );
                      }

                      const supersetAccentClass = getSupersetAccentClass(
                        item.groupId,
                        supersetAccentStyles,
                      );
                      const isGroupFocused = item.exercises.some(
                        (exercise) => exercise.id === (focusTarget?.exerciseId ?? null),
                      );
                      const sharedRestSeconds = Math.max(
                        ...item.exercises.map((exercise) => exercise.restSeconds),
                      );
                      const isGroupCompleted = item.exercises.every(
                        (exercise) => exercise.completedSets >= exercise.targetSets,
                      );

                      return (
                        <div
                          aria-label={`Superset ${formatSupersetGroupLabel(item.groupId)}`}
                          className={cn(
                            'overflow-hidden rounded-[1.75rem] border border-border/70 border-l-4 bg-secondary/20 pt-2 pb-0 px-0 sm:pt-2.5',
                            supersetAccentClass,
                            isGroupCompleted && 'border-l-emerald-500/50 bg-emerald-500/5',
                          )}
                          key={`${section.id}-${item.groupId}`}
                        >
                          <div className="mb-1 flex flex-wrap items-center gap-2 px-3 sm:px-4">
                            <Badge
                              className="border-transparent bg-primary/12 text-primary"
                              variant="outline"
                            >
                              Superset
                            </Badge>
                            <p className="text-sm text-muted">
                              {`Alternate exercises, then rest ${sharedRestSeconds}s after each round.`}
                            </p>
                            {onUpdateSupersetGroup ? (
                              <Button
                                className="ml-auto"
                                disabled={supersetUpdatePending}
                                onClick={() =>
                                  void onUpdateSupersetGroup(
                                    section.type,
                                    item.exercises.map((exercise) => exercise.id),
                                    null,
                                  )
                                }
                                size="sm"
                                type="button"
                                variant="ghost"
                              >
                                <Link2Off aria-hidden="true" className="size-4" />
                                Ungroup
                              </Button>
                            ) : null}
                          </div>

                          <div className="space-y-3">
                            {item.exercises.map((exercise) => {
                              const itemIndex = exerciseIndexById.get(exercise.id) ?? -1;

                              return (
                                <ExerciseCardItem
                                  key={exercise.id}
                                  exercise={exercise}
                                  exerciseNumber={exerciseNumberMap.get(exercise.id) ?? 0}
                                  enableApiLastPerformance={enableApiLastPerformance}
                                  expandedExercises={expandedExercises}
                                  focusTargetExerciseId={focusTarget?.exerciseId ?? null}
                                  isMoveDownDisabled={itemIndex >= section.exercises.length - 1}
                                  isMoveUpDisabled={itemIndex <= 0}
                                  onAddSet={onAddSet}
                                  onConfigureSuperset={
                                    onUpdateSupersetGroup && section.exercises.length >= 2
                                      ? () =>
                                          setSupersetSectionTarget({
                                            sectionType: section.type,
                                            initialExerciseId: exercise.id,
                                          })
                                      : undefined
                                  }
                                  onExerciseNotesChange={onExerciseNotesChange}
                                  onMoveDown={() =>
                                    reorderSectionExercises(itemIndex, itemIndex + 1)
                                  }
                                  onMoveUp={() => reorderSectionExercises(itemIndex, itemIndex - 1)}
                                  onRenameExercise={() =>
                                    setRenameTarget({
                                      exerciseId: exercise.id,
                                      exerciseName: exercise.name,
                                    })
                                  }
                                  onOpenHistory={() =>
                                    setHistoryTarget({
                                      exerciseId: exercise.id,
                                      exerciseName: exercise.name,
                                    })
                                  }
                                  sectionType={section.type}
                                  onSwapExercise={() =>
                                    setSwapTarget({
                                      exerciseId: exercise.id,
                                      exerciseName: exercise.name,
                                    })
                                  }
                                  onRemoveExercise={onRemoveExercise}
                                  onRemoveSet={onRemoveSet}
                                  onSetUpdate={onSetUpdate}
                                  repsInputRefs={repsInputRefs}
                                  sessionCurrentExerciseId={session.currentExerciseId}
                                  setExpandedExercises={setExpandedExercises}
                                  sessionCues={resolvedSessionCuesByExercise[exercise.id] ?? []}
                                  embeddedInSuperset
                                  forceExpanded={isGroupFocused}
                                  showDragHandle={showDragHandles}
                                  weightUnit={weightUnit}
                                />
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          </section>
        );
      })}

      {supersetSectionTarget && onUpdateSupersetGroup ? (
        <SessionSupersetManagerDialog
          initialSelectedExerciseId={supersetSectionTarget.initialExerciseId}
          isPending={supersetUpdatePending}
          onApply={(exerciseIds, supersetGroup) =>
            onUpdateSupersetGroup(supersetSectionTarget.sectionType, exerciseIds, supersetGroup)
          }
          onOpenChange={(open) => {
            if (!open) {
              setSupersetSectionTarget(null);
            }
          }}
          section={
            session.sections.find(
              (section) => section.type === supersetSectionTarget.sectionType,
            ) ?? null
          }
        />
      ) : null}

      <RenameExerciseDialog
        key={renameTarget ? `${renameTarget.exerciseId}-open` : 'rename-session-closed'}
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
        sourceLabel="the active workout"
        value={renameTarget?.exerciseName ?? ''}
      />
      {sessionId ? (
        <SwapExerciseDialog
          contextId={sessionId}
          mode="session"
          onOpenChange={(open) => {
            if (!open) {
              setSwapTarget(null);
            }
          }}
          open={swapTarget != null}
          sourceExerciseId={swapTarget?.exerciseId ?? ''}
          sourceExerciseName={swapTarget?.exerciseName ?? ''}
          sourceLabel="this workout"
        />
      ) : null}
      {historyTarget ? (
        <ExerciseDetailModal
          context="session"
          exerciseId={historyTarget.exerciseId}
          onSwapExercise={() =>
            setSwapTarget({
              exerciseId: historyTarget.exerciseId,
              exerciseName: historyTarget.exerciseName,
            })
          }
          onOpenChange={(open) => {
            if (!open) {
              setHistoryTarget(null);
            }
          }}
          open={historyTarget != null}
        />
      ) : null}
    </div>
  );
}

type ExerciseCardItemProps = {
  collapseKey?: string;
  embeddedInSuperset?: boolean;
  exercise: ActiveWorkoutExercise;
  exerciseNumber: number;
  enableApiLastPerformance: boolean;
  expandedExercises: Record<string, boolean>;
  forceExpanded?: boolean;
  focusTargetExerciseId: string | null;
  isMoveDownDisabled: boolean;
  isMoveUpDisabled: boolean;
  onAddSet: (exerciseId: string) => void;
  onConfigureSuperset?: () => void;
  onExerciseNotesChange: (exerciseId: string, notes: string) => void;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onOpenHistory: () => void;
  onRemoveExercise?: (
    exerciseId: string,
    section: ActiveWorkoutSessionData['sections'][number]['type'],
  ) => void | Promise<void>;
  onRenameExercise: () => void;
  onSwapExercise: () => void;
  onRemoveSet: (exerciseId: string) => void;
  onSetUpdate: (exerciseId: string, setId: string, update: SetRowUpdate) => void;
  repsInputRefs: RefObject<Record<string, HTMLInputElement | null>>;
  sessionCues: string[];
  sessionCurrentExerciseId: string | null;
  sectionType: ActiveWorkoutSessionData['sections'][number]['type'];
  setExpandedExercises: Dispatch<SetStateAction<Record<string, boolean>>>;
  showDragHandle?: boolean;
  weightUnit: WeightUnit;
};

function ExerciseCardItem({
  collapseKey,
  embeddedInSuperset = false,
  exercise,
  exerciseNumber,
  enableApiLastPerformance,
  expandedExercises,
  forceExpanded = false,
  focusTargetExerciseId,
  isMoveDownDisabled,
  isMoveUpDisabled,
  onAddSet,
  onConfigureSuperset,
  onExerciseNotesChange,
  onMoveDown,
  onMoveUp,
  onOpenHistory,
  onRemoveExercise,
  onRenameExercise,
  onSwapExercise,
  onRemoveSet,
  onSetUpdate,
  repsInputRefs,
  sectionType,
  sessionCues,
  sessionCurrentExerciseId,
  setExpandedExercises,
  showDragHandle = false,
  weightUnit,
}: ExerciseCardItemProps) {
  const [localExerciseNotes, setLocalExerciseNotes] = useState<string | undefined>(undefined);
  const resolvedExerciseNotes =
    localExerciseNotes === undefined ? exercise.notes : localExerciseNotes;
  const debouncedExerciseNotesChange = useDebouncedCallback(
    (notes: string) => onExerciseNotesChange(exercise.id, notes),
    500,
  );
  const resolvedCollapseKey = collapseKey ?? exercise.id;
  const isExpanded =
    forceExpanded ||
    focusTargetExerciseId === exercise.id ||
    (expandedExercises[resolvedCollapseKey] ?? false);

  const historyEntriesQuery = useLastPerformance(exercise.id, {
    enabled: enableApiLastPerformance,
    includeRelated: false,
    limit: 3,
  });
  const relatedHistoryQuery = useLastPerformance(exercise.id, {
    enabled: enableApiLastPerformance && isExpanded,
    includeRelated: true,
  });
  const historySummary: ActiveWorkoutExerciseHistorySummary = enableApiLastPerformance
    ? {
        history: historyEntriesQuery.data?.history ?? null,
        historyEntries: historyEntriesQuery.data?.historyEntries ?? [],
        related: relatedHistoryQuery.data?.related ?? [],
      }
    : {
        history: exercise.lastPerformance,
        historyEntries: exercise.lastPerformance ? [exercise.lastPerformance] : [],
        related: [],
      };
  const state = getExerciseState(exercise, sessionCurrentExerciseId);
  const isExerciseComplete = state === 'completed';
  const formCues = exercise.formCues;
  const templateCues = exercise.templateCues;
  const hasInjuryCues = exercise.injuryCues.length > 0;
  const priorityAccentClass = embeddedInSuperset
    ? ''
    : exercise.priority === 'required'
      ? 'border-l-4 border-l-primary'
      : 'border-l-4 border-dashed border-l-border';
  const canRemoveSet = exercise.sets.length > 1;
  const exercisePanelId = `exercise-panel-${exercise.id}`;
  const toggleExpanded = () => {
    setExpandedExercises((current) => ({
      ...current,
      [resolvedCollapseKey]: !(current[resolvedCollapseKey] ?? false),
    }));
  };
  const handleMenuAction = (action: () => void) => (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    action();
  };
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: exercise.id,
  });

  return (
    <Card
      className={cn(
        'gap-0 overflow-hidden py-0 transition-colors',
        embeddedInSuperset && 'rounded-none border-none bg-transparent shadow-none',
        priorityAccentClass,
        !embeddedInSuperset && state === 'completed' && 'border-emerald-500/25 bg-emerald-500/5',
        !embeddedInSuperset && state === 'in-progress' && 'border-primary/50 shadow-md',
      )}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <div
        aria-controls={exercisePanelId}
        aria-expanded={isExpanded}
        className="flex cursor-pointer items-center gap-1.5 px-3 py-3 transition-colors hover:bg-muted/50 sm:gap-2 sm:px-5 sm:py-5"
        onClick={toggleExpanded}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleExpanded();
          }
        }}
        role="button"
        tabIndex={0}
      >
        {showDragHandle ? (
          <Button
            aria-label={`Drag handle for ${exercise.name}`}
            className="size-7 touch-none shrink-0 sm:size-9"
            onClick={(event) => event.stopPropagation()}
            size="icon"
            type="button"
            variant="ghost"
            {...attributes}
            {...listeners}
          >
            <GripVertical aria-hidden="true" className="size-4" />
          </Button>
        ) : null}
        <div className="flex min-w-0 flex-1 items-center justify-between gap-4 text-left">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <ExerciseStatusIndicator priority={exercise.priority} state={state} />
            <div className="min-w-0">
              <h3
                className={cn(
                  'text-sm font-semibold text-foreground sm:text-lg',
                  isExerciseComplete && 'text-muted line-through',
                )}
              >
                <span className="truncate">
                  {exercise.name}
                </span>
              </h3>
              <p className="text-xs text-muted sm:text-sm">
                {`${exercise.completedSets}/${exercise.targetSets} sets`}
                <span className="ml-1.5 opacity-70">{`· ${formatEstimateMinuteRange(estimateExerciseTime(exercise))}`}</span>
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <span className="text-xs font-medium text-muted sm:text-sm">{`#${exerciseNumber}`}</span>
            <ChevronDown
              aria-hidden="true"
              className={cn('size-4 text-muted transition-transform', isExpanded && 'rotate-180')}
            />
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`Exercise actions for ${exercise.name}`}
              className="mt-0.5 size-8 shrink-0"
              onClick={(event) => event.stopPropagation()}
              size="icon"
              type="button"
              variant="ghost"
            >
              <MoreVertical aria-hidden="true" className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
            <DropdownMenuItem onClick={handleMenuAction(onSwapExercise)}>Swap exercise</DropdownMenuItem>
            <DropdownMenuItem onClick={handleMenuAction(onOpenHistory)}>
              Exercise Details
            </DropdownMenuItem>
            <DropdownMenuItem disabled={isMoveUpDisabled} onClick={handleMenuAction(onMoveUp)}>
              <ArrowUp aria-hidden="true" className="size-4" />
              Move up
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isMoveDownDisabled}
              onClick={handleMenuAction(onMoveDown)}
            >
              <ArrowDown aria-hidden="true" className="size-4" />
              Move down
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleMenuAction(onRenameExercise)}>
              Rename exercise
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleMenuAction(() => onAddSet(exercise.id))}>
              Add Set
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!canRemoveSet}
              onClick={handleMenuAction(() => onRemoveSet(exercise.id))}
            >
              Remove Last Set
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!onRemoveExercise}
              onClick={handleMenuAction(() => {
                if (!onRemoveExercise) {
                  return;
                }
                void onRemoveExercise(exercise.id, sectionType);
              })}
              variant="destructive"
            >
              <Link2Off aria-hidden="true" className="size-4" />
              Remove exercise
            </DropdownMenuItem>
            {onConfigureSuperset ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleMenuAction(onConfigureSuperset)}>
                  <Braces aria-hidden="true" className="size-4" />
                  Configure superset
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CardContent
        className="border-t border-border bg-secondary/25 px-4 py-4 sm:px-5"
        hidden={!isExpanded}
        id={exercisePanelId}
      >
        <div className="space-y-4">
          <div className="space-y-3">
            <p className="text-sm text-muted">
              {formatExerciseSubtitle({
                exercise,
                weightUnit,
              })}
            </p>

            <div className="flex flex-wrap items-center gap-1.5">
              {exercise.phaseBadge !== 'moderate' ? (
                <Badge
                  className={cn(
                    'border-transparent capitalize',
                    phaseBadgeStyles[exercise.phaseBadge],
                  )}
                  variant="outline"
                >
                  {formatPhaseBadge(exercise.phaseBadge)}
                </Badge>
              ) : null}
              <MetadataPill label={exercise.category.replace(/\b\w/g, (c) => c.toUpperCase())} />
              {exercise.priority === 'optional' ? <MetadataPill label="Optional" /> : null}
              {exercise.tempo ? (
                <MetadataPill label={`Tempo: ${formatTempo(exercise.tempo)}`} />
              ) : null}
              {exercise.restSeconds > 0 ? (
                <MetadataPill label={`Rest: ${formatRestDuration(exercise.restSeconds)}`} />
              ) : null}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="space-y-2 rounded-2xl border border-border bg-background/80 p-4 sm:flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold tracking-[0.18em] text-muted uppercase">
                    History
                  </p>
                  <button
                    className="flex cursor-pointer items-center gap-1 text-xs text-primary hover:underline"
                    onClick={onOpenHistory}
                    type="button"
                  >
                    <BarChart3 aria-hidden="true" className="size-3.5" />
                    View all
                  </button>
                </div>
                {(() => {
                  const previewEntries = formatHistoryPreviewEntries({
                    historyEntries: historySummary.historyEntries,
                    trackingType: exercise.trackingType,
                    weightUnit,
                  });

                  if (previewEntries.length === 0) {
                    return <p className="text-sm text-foreground">No completed history yet.</p>;
                  }

                  return (
                    <div className="space-y-1">
                      {previewEntries.map((entry) => (
                        <div className="flex items-center gap-1.5" key={entry.key}>
                          <p className="text-sm text-foreground">{entry.text}</p>
                          {entry.notes?.trim() ? (
                            <NotesIndicator className="h-6 w-6" notes={entry.notes} />
                          ) : null}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              <div className="rounded-2xl border border-border bg-background/80 p-4 sm:flex-1">
                <FormCueChips
                  exerciseCoachingNotes={exercise.coachingNotes}
                  exerciseCues={formCues}
                  sessionCues={sessionCues}
                  templateCues={templateCues}
                  templateProgrammingNotes={exercise.programmingNotes}
                />
              </div>
            </div>

            {historySummary.related.length > 0 ? (
              <details className="group rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Badge className="border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-200">
                      Related
                    </Badge>
                    <p className="text-sm font-semibold text-foreground">Related history</p>
                  </div>
                  <ChevronDown
                    aria-hidden="true"
                    className="size-4 text-muted transition-transform duration-200 group-open:rotate-180"
                  />
                </summary>

                <div className="mt-3 space-y-2">
                  {historySummary.related.map((relatedExercise) => (
                    <div
                      className="rounded-xl border border-emerald-500/20 bg-background/70 px-3 py-2"
                      key={relatedExercise.exerciseId}
                    >
                      <p className="text-xs font-semibold tracking-[0.14em] text-muted uppercase">
                        {relatedExercise.exerciseName}
                      </p>
                      <p className="mt-1 text-sm text-foreground">
                        {(() => {
                          const previewEntries = formatHistoryPreviewEntries({
                            historyEntries: relatedExercise.history
                              ? [relatedExercise.history]
                              : [],
                            maxEntries: 1,
                            trackingType: relatedExercise.trackingType,
                            weightUnit,
                          });

                          if (previewEntries.length === 0) {
                            return 'No completed sets yet.';
                          }

                          return previewEntries[0]?.text;
                        })()}
                      </p>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}

            {hasInjuryCues ? (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/12 p-4 text-amber-950 dark:text-amber-100">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-500/18 text-amber-700 dark:text-amber-200">
                    <AlertTriangle aria-hidden="true" className="size-4" />
                  </span>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold tracking-[0.18em] uppercase text-amber-700 dark:text-amber-200">
                      Injury-aware cues
                    </p>
                    <ul className="space-y-2 text-sm">
                      {exercise.injuryCues.map((cue) => (
                        <li className="flex items-start gap-2" key={cue}>
                          <span
                            aria-hidden="true"
                            className="mt-1 size-1.5 rounded-full bg-current"
                          />
                          <span>{cue}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div
            className="grid grid-cols-1 gap-2 sm:grid-cols-2"
            data-slot="set-grid"
            data-testid={`set-grid-${exercise.id}`}
          >
            {exercise.sets.map((set) => (
              <Fragment key={set.id}>
                <SetRow
                  completed={set.completed}
                  onUpdate={(update) => onSetUpdate(exercise.id, set.id, update)}
                  ref={(element) => {
                    repsInputRefs.current[set.id] = element;
                  }}
                  reps={set.reps}
                  setNumber={set.number}
                  trackingType={exercise.trackingType}
                  distance={set.distance}
                  targetDistance={set.targetDistance}
                  targetSeconds={set.targetSeconds}
                  targetWeight={set.targetWeight}
                  targetWeightMax={set.targetWeightMax}
                  targetWeightMin={set.targetWeightMin}
                  weight={set.weight}
                  weightUnit={weightUnit}
                  seconds={set.seconds}
                />
              </Fragment>
            ))}
          </div>

          <details className="group" id={`exercise-notes-${exercise.id}`}>
            <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold tracking-[0.18em] text-muted uppercase list-none">
              <ChevronDown
                aria-hidden="true"
                className="size-3.5 transition-transform group-open:rotate-180"
              />
              Session notes
            </summary>
            <div className="mt-2">
              <Textarea
                id={`exercise-note-${exercise.id}`}
                onBlur={() => {
                  debouncedExerciseNotesChange.flush();
                  setLocalExerciseNotes(undefined);
                }}
                onChange={(event) => {
                  const nextNotes = event.target.value;
                  setLocalExerciseNotes(nextNotes);
                  debouncedExerciseNotesChange.run(nextNotes);
                }}
                placeholder="Add any technique reminders, machine settings, or quick context."
                value={resolvedExerciseNotes}
              />
            </div>
          </details>
        </div>
      </CardContent>
    </Card>
  );
}

function MetadataPill({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-full border border-border bg-secondary/55 px-2.5 py-0.5 text-xs text-foreground">
      {label}
    </span>
  );
}

function ExerciseStatusIndicator({
  priority,
  state,
}: {
  priority: ActiveWorkoutExercise['priority'];
  state: 'completed' | 'in-progress' | 'upcoming';
}) {
  if (state === 'completed') {
    return (
      <span
        aria-label="Completed exercise"
        className="inline-flex size-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 sm:size-7"
      >
        <Check aria-hidden="true" className="size-3 sm:size-4" />
      </span>
    );
  }

  if (state === 'in-progress') {
    return (
      <span
        aria-label="In-progress exercise"
        className={cn(
          'inline-flex size-5 items-center justify-center rounded-full sm:size-7',
          priority === 'required'
            ? 'bg-primary/15 text-primary'
            : 'border border-dashed border-border text-muted',
        )}
      >
        {priority === 'required' ? (
          <Dot aria-hidden="true" className="size-5" />
        ) : (
          <Circle aria-hidden="true" className="size-4" />
        )}
      </span>
    );
  }

  return (
    <span
      aria-label="Upcoming exercise"
      className={cn(
        'inline-flex size-5 items-center justify-center rounded-full sm:size-7',
        priority === 'required'
          ? 'bg-secondary text-muted'
          : 'border border-dashed border-border text-muted',
      )}
    >
      {priority === 'required' ? (
        <Dot aria-hidden="true" className="size-5" />
      ) : (
        <Circle aria-hidden="true" className="size-4" />
      )}
    </span>
  );
}

function getExerciseState(
  exercise: ActiveWorkoutExercise,
  currentExerciseId: string | null,
): 'completed' | 'in-progress' | 'upcoming' {
  if (exercise.completedSets >= exercise.targetSets) {
    return 'completed';
  }

  if (exercise.id === currentExerciseId || exercise.completedSets > 0) {
    return 'in-progress';
  }

  return 'upcoming';
}

function findSetContext(session: ActiveWorkoutSessionData, setId: string) {
  for (const section of session.sections) {
    for (const exercise of section.exercises) {
      if (exercise.sets.some((set) => set.id === setId)) {
        return {
          exerciseId: exercise.id,
          sectionId: section.id,
        };
      }
    }
  }

  return null;
}

function formatExerciseSubtitle({
  exercise,
  weightUnit,
}: {
  exercise: ActiveWorkoutExercise;
  weightUnit: WeightUnit;
}) {
  const repTarget = parsePrescribedRepTarget(exercise.prescribedReps);
  const trackedTarget = formatTrackedRepTarget(repTarget, exercise.trackingType, weightUnit);
  const sets = exercise.prescribedSets;
  const hasWeightLadder =
    (exercise.trackingType === 'weight_reps' || exercise.trackingType === 'weight_seconds') &&
    exercise.reversePyramid.some((target) => target.targetWeight > 0);

  const hasPerSetWeightTargets = exercise.sets.some(
    (set) =>
      (set.targetWeight != null && set.targetWeight > 0) ||
      (set.targetWeightMin != null && set.targetWeightMax != null),
  );

  if (hasWeightLadder) {
    const weightLadder = exercise.reversePyramid
      .map((target) => formatWeight(target.targetWeight))
      .join(' → ');
    return `${sets} sets, ${trackedTarget}, ${weightLadder} ${weightUnit}`;
  }

  if (hasPerSetWeightTargets) {
    const uniqueWeights = new Set(
      exercise.sets
        .filter((set) => set.targetWeight != null && set.targetWeight > 0)
        .map((set) => set.targetWeight),
    );

    if (uniqueWeights.size === 1) {
      const weight = [...uniqueWeights][0] ?? 0;
      return `${sets} sets, ${formatWeight(weight)} ${weightUnit} × ${trackedTarget}`;
    }

    if (uniqueWeights.size > 1) {
      const weightLadder = exercise.sets
        .filter(
          (set): set is typeof set & { targetWeight: number } =>
            set.targetWeight != null && set.targetWeight > 0,
        )
        .map((set) => formatWeight(set.targetWeight))
        .join(' → ');
      return `${sets} sets, ${trackedTarget}, ${weightLadder} ${weightUnit}`;
    }

    const firstRange = exercise.sets.find(
      (set) => set.targetWeightMin != null && set.targetWeightMax != null,
    );
    if (firstRange && firstRange.targetWeightMin != null && firstRange.targetWeightMax != null) {
      return `${sets} sets, ${firstRange.targetWeightMin}-${firstRange.targetWeightMax} ${weightUnit} × ${trackedTarget}`;
    }
  }

  const hasExplicitUnit =
    repTarget.toLowerCase().includes('rep') ||
    repTarget.toLowerCase().includes('sec') ||
    repTarget.toLowerCase().includes('min') ||
    repTarget.toLowerCase().includes('mi') ||
    repTarget.toLowerCase().includes('km');

  return hasExplicitUnit ? `${sets} × ${trackedTarget}` : `${sets} sets × ${trackedTarget}`;
}

function formatHistoryPreviewEntries({
  historyEntries,
  maxEntries = 3,
  trackingType,
  weightUnit,
}: {
  historyEntries: ActiveWorkoutExerciseHistorySummary['historyEntries'];
  maxEntries?: number;
  trackingType: ExerciseTrackingType;
  weightUnit: WeightUnit;
}) {
  if (historyEntries.length === 0) {
    return [];
  }

  return historyEntries.slice(0, maxEntries).map((history) => {
    const setSummary = formatCompactSets(
      history.sets.map((set) =>
        trackingType === 'distance'
          ? { distance: set.reps, weight: set.weight }
          : { reps: set.reps, weight: set.weight },
      ),
      trackingType,
      {
        useLegacySecondsFallback: trackingType !== 'reps_seconds',
        weightUnit,
      },
    );

    return {
      key: history.sessionId,
      notes: history.notes ?? null,
      text: `${historyDateFormatter.format(new Date(`${history.date}T12:00:00`))} · ${setSummary}`,
    };
  });
}

function parsePrescribedRepTarget(prescribedReps: string) {
  const range = prescribedReps.match(/(\d+\s*-\s*\d+)/);

  if (range) {
    return range[1].replace(/\s+/g, '');
  }

  return prescribedReps;
}

function formatTrackedRepTarget(
  target: string,
  trackingType: ExerciseTrackingType,
  weightUnit: WeightUnit,
) {
  const lower = target.toLowerCase();

  if (
    trackingType === 'seconds_only' ||
    trackingType === 'weight_seconds' ||
    trackingType === 'cardio' ||
    trackingType === 'reps_seconds'
  ) {
    return lower.includes('sec') || lower.includes('min') ? target : `${target} sec`;
  }

  if (trackingType === 'distance') {
    const unit = getDistanceUnit(weightUnit);
    return lower.includes('km') || lower.includes('mi') ? target : `${target} ${unit}`;
  }

  if (lower.includes('rep') || lower.includes('sec') || lower.includes('min')) {
    return target;
  }

  return `${target} reps`;
}

function formatWeight(weight: number) {
  return formatWeightValue(weight);
}

function formatPhaseBadge(phaseBadge: ActiveWorkoutPhaseBadge) {
  return `${phaseBadge.charAt(0).toUpperCase()}${phaseBadge.slice(1)}`;
}

function SessionSupersetManagerDialog({
  initialSelectedExerciseId,
  isPending,
  onApply,
  onOpenChange,
  section,
}: {
  initialSelectedExerciseId?: string;
  isPending: boolean;
  onApply: (exerciseIds: string[], supersetGroup: string | null) => void;
  onOpenChange: (open: boolean) => void;
  section: ActiveWorkoutSessionData['sections'][number] | null;
}) {
  const supersetGroups = useMemo(
    () =>
      [
        ...new Set(
          (section?.exercises ?? [])
            .map((exercise) => exercise.supersetGroup)
            .filter((group): group is string => typeof group === 'string' && group.length > 0),
        ),
      ].sort((left, right) => left.localeCompare(right)),
    [section],
  );
  const [newSupersetName, setNewSupersetName] = useState(() => getNextSupersetName(supersetGroups));
  const [selectedExerciseIds, setSelectedExerciseIds] = useState<string[]>(
    initialSelectedExerciseId ? [initialSelectedExerciseId] : [],
  );

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Manage supersets</DialogTitle>
          <DialogDescription>
            Select 2+ exercises to group as a superset, or select grouped exercises to ungroup.
          </DialogDescription>
        </DialogHeader>

        {section ? (
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
                        onCheckedChange={(checked) =>
                          setSelectedExerciseIds((current) => {
                            if (checked !== true) {
                              return current.filter((value) => value !== exercise.id);
                            }

                            if (current.includes(exercise.id)) {
                              return current;
                            }

                            return [...current, exercise.id];
                          })
                        }
                      />
                      <span className="text-sm text-foreground">
                        {index + 1}. {exercise.name}
                      </span>
                    </span>
                    {exercise.supersetGroup ? (
                      <Badge variant="secondary">
                        {formatSupersetGroupLabel(exercise.supersetGroup)}
                      </Badge>
                    ) : (
                      <Badge variant="outline">Ungrouped</Badge>
                    )}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-border bg-card p-3">
              <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                Group as Superset
              </p>
              <Input
                aria-label="Superset name"
                disabled={isPending}
                onChange={(event) => setNewSupersetName(event.currentTarget.value)}
                placeholder="Superset A"
                value={newSupersetName}
              />
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  className="sm:flex-1"
                  disabled={isPending || selectedExerciseIds.length < 2}
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
                  Group as Superset
                </Button>
                <Button
                  className="sm:flex-1"
                  disabled={isPending || selectedExerciseIds.length === 0}
                  onClick={() => {
                    onApply(selectedExerciseIds, null);
                    onOpenChange(false);
                  }}
                  type="button"
                  variant="outline"
                >
                  <Link2Off aria-hidden="true" className="size-4" />
                  Ungroup Selected
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function formatSupersetGroupLabel(groupId: string) {
  return groupId.replace(/-/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function groupExercises(exercises: ActiveWorkoutExercise[]) {
  const groups: Array<
    | { exercise: ActiveWorkoutExercise; type: 'single' }
    | { exercises: ActiveWorkoutExercise[]; groupId: string; type: 'superset' }
  > = [];
  let index = 0;

  while (index < exercises.length) {
    const exercise = exercises[index];

    if (!exercise) {
      break;
    }

    if (!exercise.supersetGroup) {
      groups.push({ exercise, type: 'single' });
      index += 1;
      continue;
    }

    const run = [exercise];
    let nextIndex = index + 1;

    while (
      nextIndex < exercises.length &&
      exercises[nextIndex].supersetGroup === exercise.supersetGroup
    ) {
      run.push(exercises[nextIndex]);
      nextIndex += 1;
    }

    if (run.length > 1) {
      groups.push({
        exercises: run,
        groupId: exercise.supersetGroup,
        type: 'superset',
      });
    } else {
      groups.push({ exercise, type: 'single' });
    }

    index = nextIndex;
  }

  return groups;
}

function getNextSupersetName(groups: string[]) {
  const existingNames = new Set(
    groups
      .map((group) =>
        group
          .replace(/^superset-?/i, '')
          .trim()
          .toUpperCase(),
      )
      .filter((group) => group.length > 0),
  );
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  for (const letter of alphabet) {
    if (!existingNames.has(letter)) {
      return `Superset ${letter}`;
    }
  }

  let suffix = 1;
  while (existingNames.has(`A${suffix}`)) {
    suffix += 1;
  }

  return `Superset A${suffix}`;
}

function toSupersetGroupId(value: string) {
  const normalized = value
    .trim()
    .replace(/^superset[-\s]*/i, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-_]/g, '')
    .toLowerCase();

  if (!normalized) {
    return null;
  }

  return `superset-${normalized}`.slice(0, 255);
}

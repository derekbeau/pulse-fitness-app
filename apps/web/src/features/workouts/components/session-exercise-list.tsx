import {
  Fragment,
  useEffect,
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
  ChevronDown,
  Check,
  Circle,
  Dot,
  GripVertical,
  MoreVertical,
  Plus,
} from 'lucide-react';
import type { ExerciseTrackingType, WeightUnit } from '@pulse/shared';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { accentCardStyles } from '@/lib/accent-card-styles';
import { useLastPerformance } from '@/hooks/use-last-performance';
import { ApiError } from '@/lib/api-client';
import { useDebouncedCallback } from '@/lib/use-debounced-callback';
import { formatWeight as formatWeightValue } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

import { useRenameExercise } from '../api/workouts';
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
  formatEstimateMinutes,
  formatRestDuration,
  formatTempo,
} from '../lib/time-estimates';
import { getDistanceUnit } from '../lib/tracking';
import { FormCueChips } from './form-cue-chips';
import { RenameExerciseDialog } from './rename-exercise-dialog';
import { RestTimer } from './rest-timer';
import { SetRow, type SetRowUpdate } from './set-row';
import { SwapExerciseDialog } from './swap-exercise-dialog';

type RestTimerState = {
  duration: number;
  exerciseId: string;
  exerciseName: string;
  setId: string;
  setNumber: number;
  token: number;
};

type SessionExerciseListProps = {
  enableApiLastPerformance?: boolean;
  focusSetId?: string | null;
  onAddSet: (exerciseId: string) => void;
  onExerciseNotesChange: (exerciseId: string, notes: string) => void;
  onFocusSetHandled?: () => void;
  onReorderExercises?: (
    section: 'warmup' | 'main' | 'cooldown',
    exerciseIds: string[],
  ) => void | Promise<void>;
  onRemoveSet: (exerciseId: string) => void;
  onRestTimerComplete: () => void;
  onSessionCuesChange?: (exerciseId: string, cues: string[]) => void;
  onSetUpdate: (exerciseId: string, setId: string, update: SetRowUpdate) => void;
  restTimer?: RestTimerState | null;
  session: ActiveWorkoutSessionData;
  sessionId?: string | null;
  sessionCuesByExercise?: Record<string, string[]>;
  weightUnit?: WeightUnit;
};

const sectionLabels = {
  warmup: 'Warmup',
  main: 'Main',
  cooldown: 'Cooldown',
} as const;

const badgeStyles = {
  compound: 'bg-[var(--color-accent-pink)] text-on-pink dark:bg-pink-500/20 dark:text-pink-400',
  isolation:
    'bg-[var(--color-accent-cream)] text-on-cream dark:bg-amber-500/20 dark:text-amber-400',
  cardio: 'bg-[var(--color-accent-mint)] text-on-mint dark:bg-emerald-500/20 dark:text-emerald-400',
  mobility: 'bg-[var(--color-accent-cream)] text-on-cream dark:bg-amber-500/20 dark:text-amber-400',
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
  'border-l-sky-500 before:bg-sky-500',
  'border-l-emerald-500 before:bg-emerald-500',
  'border-l-amber-500 before:bg-amber-500',
  'border-l-rose-500 before:bg-rose-500',
] as const;

export function SessionExerciseList({
  enableApiLastPerformance = false,
  focusSetId = null,
  onAddSet,
  onExerciseNotesChange,
  onFocusSetHandled,
  onReorderExercises,
  onRemoveSet,
  onRestTimerComplete,
  onSessionCuesChange,
  onSetUpdate,
  restTimer = null,
  session,
  sessionId = null,
  sessionCuesByExercise,
  weightUnit = 'lbs',
}: SessionExerciseListProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [expandedExercises, setExpandedExercises] = useState<Record<string, boolean>>({});
  const [localSessionCuesByExercise, setLocalSessionCuesByExercise] = useState<
    Record<string, string[]>
  >({});
  const [visibleNotesPanels, setVisibleNotesPanels] = useState<Record<string, boolean>>({});
  const [renameTarget, setRenameTarget] = useState<{
    exerciseId: string;
    exerciseName: string;
  } | null>(null);
  const [swapTarget, setSwapTarget] = useState<{
    exerciseId: string;
    exerciseName: string;
  } | null>(null);
  const repsInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const focusTarget = focusSetId ? findSetContext(session, focusSetId) : null;
  const renameExerciseMutation = useRenameExercise();
  const resolvedSessionCuesByExercise = sessionCuesByExercise ?? localSessionCuesByExercise;
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
        const exerciseIndexById = new Map(
          section.exercises.map((exercise, index) => [exercise.id, index]),
        );
        const sectionLabel = sectionLabels[section.type];
        const sectionEstimate = formatEstimateMinuteRange(estimateSectionTime(section));
        const sectionSummary = `${completedExercises}/${section.exercises.length} exercises done`;
        const isOpen =
          focusTarget?.sectionId === section.id
            ? true
            : (openSections[section.id] ??
              section.exercises.some((exercise) => exercise.id === session.currentExerciseId));
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
                  [section.id]: !(
                    current[section.id] ??
                    section.exercises.some((exercise) => exercise.id === session.currentExerciseId)
                  ),
                }))
              }
              type="button"
            >
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-foreground">{`${sectionLabel} ${sectionEstimate}`}</h2>
                <p className="text-sm text-muted">{sectionSummary}</p>
              </div>

              <div className="flex items-center gap-3">
                <Badge
                  className="border-transparent bg-secondary text-secondary-foreground"
                  variant="outline"
                >
                  {`${completedExercises}/${section.exercises.length}`}
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
                            inlineRestTimer={
                              restTimer && restTimer.exerciseId === item.exercise.id
                                ? restTimer
                                : null
                            }
                            isMoveDownDisabled={exerciseIndex >= section.exercises.length - 1}
                            isMoveUpDisabled={exerciseIndex <= 0}
                            onAddSet={onAddSet}
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
                            onSwapExercise={() =>
                              setSwapTarget({
                                exerciseId: item.exercise.id,
                                exerciseName: item.exercise.name,
                              })
                            }
                            onRemoveSet={onRemoveSet}
                            onRestTimerComplete={onRestTimerComplete}
                            onSetUpdate={onSetUpdate}
                            repsInputRefs={repsInputRefs}
                            sessionCurrentExerciseId={session.currentExerciseId}
                            setExpandedExercises={setExpandedExercises}
                            setVisibleNotesPanels={setVisibleNotesPanels}
                            onAddSessionCue={(cue) =>
                              updateSessionCues(item.exercise.id, [
                                ...(resolvedSessionCuesByExercise[item.exercise.id] ?? []),
                                cue,
                              ])
                            }
                            sessionCues={resolvedSessionCuesByExercise[item.exercise.id] ?? []}
                            visibleNotesPanels={visibleNotesPanels}
                            weightUnit={weightUnit}
                            key={item.exercise.id}
                          />
                        );
                      }

                      const supersetAccentClass = getSupersetAccentClass(item.groupId);
                      const sharedRestSeconds = Math.max(
                        ...item.exercises.map((exercise) => exercise.restSeconds),
                      );

                      return (
                        <div
                          aria-label={`Superset ${formatSupersetGroupLabel(item.groupId)}`}
                          className={cn(
                            'relative rounded-[1.75rem] border border-border/70 bg-secondary/20 p-3 pl-5 sm:p-4 sm:pl-6',
                            "before:absolute before:top-4 before:bottom-4 before:left-3 before:w-1 before:rounded-full before:content-['']",
                            supersetAccentClass,
                          )}
                          key={`${section.id}-${item.groupId}`}
                        >
                          <div className="mb-3 flex flex-wrap items-center gap-2">
                            <Badge
                              className="border-transparent bg-primary/12 text-primary"
                              variant="outline"
                            >
                              Superset
                            </Badge>
                            <p className="text-sm text-muted">
                              {`Alternate exercises, then rest ${sharedRestSeconds}s after each round.`}
                            </p>
                          </div>

                          <div className="space-y-3">
                            {item.exercises.map((exercise, exerciseIndex) => {
                              const itemIndex = exerciseIndexById.get(exercise.id) ?? -1;

                              return (
                                <div className="space-y-3" key={exercise.id}>
                                  {exerciseIndex > 0 ? (
                                    <div className="flex items-center gap-3 pl-1 text-xs font-medium tracking-[0.16em] text-muted uppercase">
                                      <span className="h-px flex-1 bg-border/80" />
                                      <span>{`Shared rest ${sharedRestSeconds}s`}</span>
                                      <span className="h-px flex-1 bg-border/80" />
                                    </div>
                                  ) : null}

                                  <ExerciseCardItem
                                    exercise={exercise}
                                    exerciseNumber={exerciseNumberMap.get(exercise.id) ?? 0}
                                    enableApiLastPerformance={enableApiLastPerformance}
                                    expandedExercises={expandedExercises}
                                    focusTargetExerciseId={focusTarget?.exerciseId ?? null}
                                    inlineRestTimer={null}
                                    isMoveDownDisabled={itemIndex >= section.exercises.length - 1}
                                    isMoveUpDisabled={itemIndex <= 0}
                                    onAddSet={onAddSet}
                                    onExerciseNotesChange={onExerciseNotesChange}
                                    onMoveDown={() =>
                                      reorderSectionExercises(itemIndex, itemIndex + 1)
                                    }
                                    onMoveUp={() =>
                                      reorderSectionExercises(itemIndex, itemIndex - 1)
                                    }
                                    onRenameExercise={() =>
                                      setRenameTarget({
                                        exerciseId: exercise.id,
                                        exerciseName: exercise.name,
                                      })
                                    }
                                    onSwapExercise={() =>
                                      setSwapTarget({
                                        exerciseId: exercise.id,
                                        exerciseName: exercise.name,
                                      })
                                    }
                                    onRemoveSet={onRemoveSet}
                                    onRestTimerComplete={onRestTimerComplete}
                                    onSetUpdate={onSetUpdate}
                                    repsInputRefs={repsInputRefs}
                                    sessionCurrentExerciseId={session.currentExerciseId}
                                    setExpandedExercises={setExpandedExercises}
                                    setVisibleNotesPanels={setVisibleNotesPanels}
                                    onAddSessionCue={(cue) =>
                                      updateSessionCues(exercise.id, [
                                        ...(resolvedSessionCuesByExercise[exercise.id] ?? []),
                                        cue,
                                      ])
                                    }
                                    sessionCues={resolvedSessionCuesByExercise[exercise.id] ?? []}
                                    visibleNotesPanels={visibleNotesPanels}
                                    weightUnit={weightUnit}
                                  />
                                  {restTimer &&
                                  restTimer.exerciseId === exercise.id &&
                                  exercise.supersetGroup ? (
                                    <InlineRestTimer
                                      duration={restTimer.duration}
                                      exerciseName={restTimer.exerciseName}
                                      key={restTimer.token}
                                      onComplete={onRestTimerComplete}
                                      setNumber={restTimer.setNumber}
                                    />
                                  ) : null}
                                </div>
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
    </div>
  );

  function updateSessionCues(exerciseId: string, cues: string[]) {
    if (onSessionCuesChange) {
      onSessionCuesChange(exerciseId, cues);
      return;
    }

    setLocalSessionCuesByExercise((current) => ({
      ...current,
      [exerciseId]: cues,
    }));
  }
}

type ExerciseCardItemProps = {
  exercise: ActiveWorkoutExercise;
  exerciseNumber: number;
  enableApiLastPerformance: boolean;
  expandedExercises: Record<string, boolean>;
  focusTargetExerciseId: string | null;
  inlineRestTimer: RestTimerState | null;
  isMoveDownDisabled: boolean;
  isMoveUpDisabled: boolean;
  onAddSet: (exerciseId: string) => void;
  onExerciseNotesChange: (exerciseId: string, notes: string) => void;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onRenameExercise: () => void;
  onSwapExercise: () => void;
  onRemoveSet: (exerciseId: string) => void;
  onRestTimerComplete: () => void;
  onAddSessionCue: (cue: string) => void;
  onSetUpdate: (exerciseId: string, setId: string, update: SetRowUpdate) => void;
  repsInputRefs: RefObject<Record<string, HTMLInputElement | null>>;
  sessionCues: string[];
  sessionCurrentExerciseId: string | null;
  setExpandedExercises: Dispatch<SetStateAction<Record<string, boolean>>>;
  setVisibleNotesPanels: Dispatch<SetStateAction<Record<string, boolean>>>;
  visibleNotesPanels: Record<string, boolean>;
  weightUnit: WeightUnit;
};

function ExerciseCardItem({
  exercise,
  exerciseNumber,
  enableApiLastPerformance,
  expandedExercises,
  focusTargetExerciseId,
  inlineRestTimer,
  isMoveDownDisabled,
  isMoveUpDisabled,
  onAddSet,
  onExerciseNotesChange,
  onMoveDown,
  onMoveUp,
  onRenameExercise,
  onSwapExercise,
  onRemoveSet,
  onRestTimerComplete,
  onAddSessionCue,
  onSetUpdate,
  repsInputRefs,
  sessionCues,
  sessionCurrentExerciseId,
  setExpandedExercises,
  setVisibleNotesPanels,
  visibleNotesPanels,
  weightUnit,
}: ExerciseCardItemProps) {
  const [localExerciseNotes, setLocalExerciseNotes] = useState<string | undefined>(undefined);
  const resolvedExerciseNotes =
    localExerciseNotes === undefined ? exercise.notes : localExerciseNotes;
  const debouncedExerciseNotesChange = useDebouncedCallback(
    (notes: string) => onExerciseNotesChange(exercise.id, notes),
    500,
  );

  const lastPerformanceQuery = useLastPerformance(exercise.id, {
    enabled: enableApiLastPerformance,
  });
  const historySummary: ActiveWorkoutExerciseHistorySummary = enableApiLastPerformance
    ? (lastPerformanceQuery.data ?? { history: null, related: [] })
    : { history: exercise.lastPerformance, related: [] };
  const lastPerformance = historySummary.history;
  const state = getExerciseState(exercise, sessionCurrentExerciseId);
  const isExerciseComplete = state === 'completed';
  const isExpanded =
    focusTargetExerciseId === exercise.id ? true : (expandedExercises[exercise.id] ?? true);
  const formCues = exercise.formCues;
  const templateCues = exercise.templateCues;
  const hasInjuryCues = exercise.injuryCues.length > 0;
  const isNotesPanelOpen = visibleNotesPanels[exercise.id] ?? exercise.notes.length > 0;
  const priorityAccentClass =
    exercise.priority === 'required'
      ? 'border-l-4 border-l-primary'
      : 'border-l-4 border-dashed border-l-border';
  const exerciseEstimate = formatEstimateMinutes(estimateExerciseTime(exercise));
  const canRemoveSet = exercise.sets.length > 1;
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: exercise.id,
  });

  return (
    <Card
      className={cn(
        'gap-0 overflow-hidden py-0 transition-colors',
        priorityAccentClass,
        state === 'completed' && 'border-emerald-500/25 bg-emerald-500/5',
        state === 'in-progress' && 'border-primary/35 shadow-md',
      )}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <div className="flex items-start gap-2 px-4 py-5 sm:px-5">
        <Button
          aria-label={`Drag handle for ${exercise.name}`}
          className="mt-0.5 size-9 touch-none shrink-0"
          size="icon"
          type="button"
          variant="ghost"
          {...attributes}
          {...listeners}
        >
          <GripVertical aria-hidden="true" className="size-4" />
        </Button>
        <button
          aria-controls={`exercise-panel-${exercise.id}`}
          aria-expanded={isExpanded}
          className="flex min-w-0 flex-1 cursor-pointer items-start justify-between gap-4 text-left"
          onClick={() =>
            setExpandedExercises((current) => ({
              ...current,
              [exercise.id]: !(current[exercise.id] ?? true),
            }))
          }
          type="button"
        >
          <div className="flex min-w-0 items-start gap-3">
            <ExerciseStatusIndicator priority={exercise.priority} state={state} />
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3
                  className={cn(
                    'text-lg font-semibold text-foreground',
                    isExerciseComplete && 'text-muted line-through',
                  )}
                >
                  {exercise.name}
                </h3>
                {isExerciseComplete ? (
                  <Check aria-hidden="true" className="size-4 text-emerald-600" />
                ) : null}
                <Badge
                  className={cn(
                    'border-transparent capitalize',
                    phaseBadgeStyles[exercise.phaseBadge],
                  )}
                  variant="outline"
                >
                  {formatPhaseBadge(exercise.phaseBadge)}
                </Badge>
                <Badge
                  className={cn('border-transparent capitalize', badgeStyles[exercise.category])}
                  variant="outline"
                >
                  {exercise.category}
                </Badge>
                {exercise.priority === 'optional' ? (
                  <span className="text-sm font-medium text-muted">Optional</span>
                ) : null}
                {state === 'in-progress' ? (
                  <Badge className="border-primary/20 bg-primary/12 text-primary" variant="outline">
                    Current
                  </Badge>
                ) : null}
                <Badge
                  className="border-transparent bg-secondary text-secondary-foreground"
                  variant="outline"
                >
                  {exerciseEstimate}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                {exercise.tempo ? (
                  <MetadataPill label={`Tempo: ${formatTempo(exercise.tempo)}`} />
                ) : null}
                {exercise.restSeconds > 0 ? (
                  <MetadataPill label={`Rest: ${formatRestDuration(exercise.restSeconds)}`} />
                ) : null}
              </div>
              <p className="text-sm text-muted">{`${exercise.completedSets}/${exercise.targetSets} sets completed`}</p>
              <p className="text-sm text-muted">
                {formatExerciseSubtitle({
                  exercise,
                  lastPerformance,
                  weightUnit,
                })}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <span className="text-sm font-medium text-muted">{`#${exerciseNumber}`}</span>
            <ChevronDown
              aria-hidden="true"
              className={cn(
                'mt-1 size-4 text-muted transition-transform',
                isExpanded && 'rotate-180',
              )}
            />
          </div>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`Exercise actions for ${exercise.name}`}
              className="mt-0.5 size-8 shrink-0"
              size="icon"
              type="button"
              variant="ghost"
            >
              <MoreVertical aria-hidden="true" className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onSwapExercise}>Swap exercise</DropdownMenuItem>
            <DropdownMenuItem disabled={isMoveUpDisabled} onClick={onMoveUp}>
              <ArrowUp aria-hidden="true" className="size-4" />
              Move up
            </DropdownMenuItem>
            <DropdownMenuItem disabled={isMoveDownDisabled} onClick={onMoveDown}>
              <ArrowDown aria-hidden="true" className="size-4" />
              Move down
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onRenameExercise}>Rename exercise</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAddSet(exercise.id)}>Add Set</DropdownMenuItem>
            <DropdownMenuItem disabled={!canRemoveSet} onClick={() => onRemoveSet(exercise.id)}>
              Remove Last Set
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CardContent
        className="border-t border-border bg-secondary/25 px-4 py-4 sm:px-5"
        hidden={!isExpanded}
        id={`exercise-panel-${exercise.id}`}
      >
        <div className="space-y-4">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                aria-controls={`exercise-notes-${exercise.id}`}
                aria-expanded={isNotesPanelOpen}
                onClick={() =>
                  setVisibleNotesPanels((current) => ({
                    ...current,
                    [exercise.id]: !isNotesPanelOpen,
                  }))
                }
                size="xs"
                type="button"
                variant={isNotesPanelOpen ? 'secondary' : 'outline'}
              >
                Notes
              </Button>
            </div>

            <p className="text-sm text-muted">
              {formatSetPrescription(exercise.prescribedReps, exercise.restSeconds)}
            </p>

            <div className="space-y-2 rounded-2xl border border-border bg-background/80 p-4">
              <p className="text-xs font-semibold tracking-[0.18em] text-muted uppercase">
                History
              </p>
              <p className="text-sm text-foreground">
                {formatHistoryPreview({
                  history: lastPerformance,
                  prescribedReps: exercise.prescribedReps,
                  trackingType: exercise.trackingType,
                  weightUnit,
                })}
              </p>
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
                        {formatHistoryPreview({
                          history: relatedExercise.history,
                          prescribedReps: '',
                          trackingType: relatedExercise.trackingType,
                          weightUnit,
                          emptyLabel: 'No completed sets yet.',
                        })}
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

            <div className="rounded-2xl border border-border bg-background/80 p-4">
              <FormCueChips
                exerciseCoachingNotes={exercise.coachingNotes}
                exerciseCues={formCues}
                onAddSessionCue={onAddSessionCue}
                sessionCues={sessionCues}
                templateCues={templateCues}
                templateProgrammingNotes={exercise.programmingNotes}
              />
            </div>

            <div
              className="space-y-2"
              hidden={!isNotesPanelOpen}
              id={`exercise-notes-${exercise.id}`}
            >
              <label
                className="text-xs font-semibold tracking-[0.18em] text-muted uppercase"
                htmlFor={`exercise-note-${exercise.id}`}
              >
                Session notes
              </label>
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
          </div>

          <div
            className="grid grid-cols-2 gap-2"
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
                {inlineRestTimer && inlineRestTimer.setId === set.id && !exercise.supersetGroup ? (
                  <div className="col-span-2">
                    <InlineRestTimer
                      duration={inlineRestTimer.duration}
                      exerciseName={inlineRestTimer.exerciseName}
                      key={inlineRestTimer.token}
                      onComplete={onRestTimerComplete}
                      setNumber={inlineRestTimer.setNumber}
                    />
                  </div>
                ) : null}
              </Fragment>
            ))}
            <Button
              className="col-span-2 border-dashed"
              onClick={() => onAddSet(exercise.id)}
              size="xs"
              type="button"
              variant="outline"
            >
              <Plus aria-hidden="true" className="size-3.5" />
              Add Set
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MetadataPill({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-full border border-border bg-secondary/55 px-3 py-1.5 text-foreground">
      {label}
    </span>
  );
}

function InlineRestTimer({
  duration,
  exerciseName,
  onComplete,
  setNumber,
}: {
  duration: number;
  exerciseName: string;
  onComplete: () => void;
  setNumber: number;
}) {
  return (
    <div className={`space-y-2 rounded-2xl border px-3 py-2 ${accentCardStyles.mint}`}>
      <p className="text-xs text-muted">{`After ${exerciseName} set ${setNumber}`}</p>
      <RestTimer autoStart duration={duration} onComplete={onComplete} />
    </div>
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
        className="mt-1 inline-flex size-7 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600"
      >
        <Check aria-hidden="true" className="size-4" />
      </span>
    );
  }

  if (state === 'in-progress') {
    return (
      <span
        aria-label="In-progress exercise"
        className={cn(
          'mt-1 inline-flex size-7 items-center justify-center rounded-full',
          priority === 'required'
            ? 'bg-amber-500/15 text-amber-600'
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
        'mt-1 inline-flex size-7 items-center justify-center rounded-full',
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

function formatCompactPerformanceSetByTrackingType(
  trackingType: ExerciseTrackingType,
  weight: number | null,
  value: number,
  prescribedReps: string,
  weightUnit: WeightUnit,
) {
  const distanceUnit = getDistanceUnit(weightUnit);

  switch (trackingType) {
    case 'weight_reps':
      return weight != null ? `${formatWeight(weight)}x${value}` : `${value}`;
    case 'weight_seconds':
      return weight != null ? `${formatWeight(weight)}x${value} sec` : `${value} sec`;
    case 'bodyweight_reps':
    case 'reps_only':
      return formatPerformedReps(value, prescribedReps);
    case 'seconds_only':
      return `${value} sec`;
    case 'reps_seconds':
      return `${value} reps`;
    case 'distance':
      return `${value} ${distanceUnit}`;
    case 'cardio':
      return `${value} sec`;
    default:
      return weight != null ? `${formatWeight(weight)}x${value}` : `${value}`;
  }
}

function formatExerciseSubtitle({
  exercise,
  lastPerformance,
  weightUnit,
}: {
  exercise: ActiveWorkoutExercise;
  lastPerformance: ActiveWorkoutExercise['lastPerformance'];
  weightUnit: WeightUnit;
}) {
  const repTarget = parsePrescribedRepTarget(exercise.prescribedReps);
  const canShowWeightLadder =
    (exercise.trackingType === 'weight_reps' || exercise.trackingType === 'weight_seconds') &&
    exercise.reversePyramid.some((target) => target.targetWeight > 0);
  const targetText = canShowWeightLadder
    ? `${exercise.targetSets} × ${repTarget} | ${exercise.reversePyramid
        .map((target) => formatWeight(target.targetWeight))
        .join(' → ')} ${weightUnit}`
    : `${exercise.targetSets} × ${repTarget}`;

  if (!lastPerformance || lastPerformance.sets.length === 0) {
    return targetText;
  }

  const lastText = lastPerformance.sets
    .map((set) =>
      formatCompactPerformanceSetByTrackingType(
        exercise.trackingType,
        set.weight,
        set.reps,
        exercise.prescribedReps,
        weightUnit,
      ),
    )
    .join(', ');

  return `${targetText} • Last: ${lastText}`;
}

function formatHistoryPreview({
  history,
  prescribedReps,
  trackingType,
  weightUnit,
  emptyLabel = 'No completed history yet.',
}: {
  history: ActiveWorkoutExercise['lastPerformance'];
  prescribedReps: string;
  trackingType: ExerciseTrackingType;
  weightUnit: WeightUnit;
  emptyLabel?: string;
}) {
  if (!history || history.sets.length === 0) {
    return emptyLabel;
  }

  const setSummary = history.sets
    .map((set) =>
      formatCompactPerformanceSetByTrackingType(
        trackingType,
        set.weight,
        set.reps,
        prescribedReps,
        weightUnit,
      ),
    )
    .join(', ');

  return `${historyDateFormatter.format(new Date(`${history.date}T12:00:00`))} • ${setSummary}`;
}

function parsePrescribedRepTarget(prescribedReps: string) {
  const range = prescribedReps.match(/(\d+\s*-\s*\d+)/);

  if (range) {
    return range[1].replace(/\s+/g, '');
  }

  return prescribedReps;
}

function formatSetPrescription(prescribedReps: string, restSeconds: number) {
  return `Target ${prescribedReps} • Rest ${restSeconds}s`;
}

function formatPerformedReps(reps: number, prescribedReps: string) {
  if (prescribedReps.includes('min')) {
    const minutes = Math.floor(reps / 60);
    const seconds = reps % 60;

    if (seconds === 0) {
      return `${minutes} min`;
    }

    return `${minutes}:${`${seconds}`.padStart(2, '0')}`;
  }

  if (prescribedReps.includes('sec')) {
    return `${reps}s`;
  }

  return `${reps} reps`;
}

function formatWeight(weight: number) {
  return formatWeightValue(weight);
}

function formatPhaseBadge(phaseBadge: ActiveWorkoutPhaseBadge) {
  return `${phaseBadge.charAt(0).toUpperCase()}${phaseBadge.slice(1)}`;
}

function formatSupersetGroupLabel(groupId: string) {
  return groupId.replace(/-/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function getSupersetAccentClass(groupId: string) {
  let hash = 0;

  for (const character of groupId) {
    hash = (hash + character.charCodeAt(0)) % supersetAccentStyles.length;
  }

  return supersetAccentStyles[hash];
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

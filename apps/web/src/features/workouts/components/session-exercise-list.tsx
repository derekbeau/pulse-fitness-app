import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import { AlertTriangle, ArrowUpRight, ChevronDown, Check, Circle, Dot } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { accentCardStyles } from '@/lib/accent-card-styles';
import { useLastPerformance } from '@/hooks/use-last-performance';
import { cn } from '@/lib/utils';

import type {
  ActiveWorkoutExercise,
  ActiveWorkoutLastPerformance,
  ActiveWorkoutPhaseBadge,
  ActiveWorkoutReversePyramidTarget,
  ActiveWorkoutSessionData,
} from '../types';
import { RestTimer } from './rest-timer';
import { SetRow, type SetRowUpdate } from './set-row';

type RestTimerState = {
  duration: number;
  exerciseName: string;
  setNumber: number;
  token: number;
};

type SessionExerciseListProps = {
  enableApiLastPerformance?: boolean;
  focusSetId?: string | null;
  onAddSet: (exerciseId: string) => void;
  onExerciseNotesChange: (exerciseId: string, notes: string) => void;
  onFocusSetHandled?: () => void;
  onRestTimerComplete: () => void;
  onSetUpdate: (exerciseId: string, setId: string, update: SetRowUpdate) => void;
  restTimer?: RestTimerState | null;
  session: ActiveWorkoutSessionData;
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
  onRestTimerComplete,
  onSetUpdate,
  restTimer = null,
  session,
}: SessionExerciseListProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [expandedExercises, setExpandedExercises] = useState<Record<string, boolean>>({});
  const [visibleCuePanels, setVisibleCuePanels] = useState<Record<string, boolean>>({});
  const [visibleNotesPanels, setVisibleNotesPanels] = useState<Record<string, boolean>>({});
  const repsInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const focusTarget = focusSetId ? findSetContext(session, focusSetId) : null;

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
      {restTimer ? (
        <section
          className={`rounded-3xl border px-5 py-5 ${accentCardStyles.mint}`}
          data-slot="rest-timer-panel"
        >
          <div className="mb-4 space-y-1">
            <p className="text-xs font-semibold tracking-[0.22em] uppercase opacity-70 dark:text-muted dark:opacity-100">
              Rest Timer
            </p>
            <h2 className="text-xl font-semibold">{`After ${restTimer.exerciseName}`}</h2>
            <p className="text-sm opacity-75 dark:text-muted dark:opacity-100">{`Set ${restTimer.setNumber} logged. Start the next set when you're ready.`}</p>
          </div>

          <RestTimer
            autoStart
            duration={restTimer.duration}
            key={restTimer.token}
            onComplete={onRestTimerComplete}
          />
        </section>
      ) : null}

      {session.sections.map((section) => {
        const completedExercises = section.exercises.filter(
          (exercise) => exercise.completedSets === exercise.targetSets,
        ).length;
        const sectionLabel = sectionLabels[section.type];
        const sectionSummary = `${sectionLabel} (${completedExercises}/${section.exercises.length} exercises done)`;
        const isOpen =
          focusTarget?.sectionId === section.id
            ? true
            : (openSections[section.id] ??
              section.exercises.some((exercise) => exercise.id === session.currentExerciseId));

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
                <h2 className="text-xl font-semibold text-foreground">{sectionLabel}</h2>
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
              <div className="space-y-3">
                {groupExercises(section.exercises).map((item) => {
                  if (item.type === 'single') {
                    return (
                      <ExerciseCardItem
                        exercise={item.exercise}
                        exerciseNumber={exerciseNumberMap.get(item.exercise.id) ?? 0}
                        enableApiLastPerformance={enableApiLastPerformance}
                        expandedExercises={expandedExercises}
                        focusTargetExerciseId={focusTarget?.exerciseId ?? null}
                        onAddSet={onAddSet}
                        onExerciseNotesChange={onExerciseNotesChange}
                        onSetUpdate={onSetUpdate}
                        repsInputRefs={repsInputRefs}
                        sessionCurrentExerciseId={session.currentExerciseId}
                        setExpandedExercises={setExpandedExercises}
                        setVisibleCuePanels={setVisibleCuePanels}
                        setVisibleNotesPanels={setVisibleNotesPanels}
                        visibleCuePanels={visibleCuePanels}
                        visibleNotesPanels={visibleNotesPanels}
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
                        {item.exercises.map((exercise, exerciseIndex) => (
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
                              onAddSet={onAddSet}
                              onExerciseNotesChange={onExerciseNotesChange}
                              onSetUpdate={onSetUpdate}
                              repsInputRefs={repsInputRefs}
                              sessionCurrentExerciseId={session.currentExerciseId}
                              setExpandedExercises={setExpandedExercises}
                              setVisibleCuePanels={setVisibleCuePanels}
                              setVisibleNotesPanels={setVisibleNotesPanels}
                              visibleCuePanels={visibleCuePanels}
                              visibleNotesPanels={visibleNotesPanels}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

type ExerciseCardItemProps = {
  exercise: ActiveWorkoutExercise;
  exerciseNumber: number;
  enableApiLastPerformance: boolean;
  expandedExercises: Record<string, boolean>;
  focusTargetExerciseId: string | null;
  onAddSet: (exerciseId: string) => void;
  onExerciseNotesChange: (exerciseId: string, notes: string) => void;
  onSetUpdate: (exerciseId: string, setId: string, update: SetRowUpdate) => void;
  repsInputRefs: RefObject<Record<string, HTMLInputElement | null>>;
  sessionCurrentExerciseId: string | null;
  setExpandedExercises: Dispatch<SetStateAction<Record<string, boolean>>>;
  setVisibleCuePanels: Dispatch<SetStateAction<Record<string, boolean>>>;
  setVisibleNotesPanels: Dispatch<SetStateAction<Record<string, boolean>>>;
  visibleCuePanels: Record<string, boolean>;
  visibleNotesPanels: Record<string, boolean>;
};

function ExerciseCardItem({
  exercise,
  exerciseNumber,
  enableApiLastPerformance,
  expandedExercises,
  focusTargetExerciseId,
  onAddSet,
  onExerciseNotesChange,
  onSetUpdate,
  repsInputRefs,
  sessionCurrentExerciseId,
  setExpandedExercises,
  setVisibleCuePanels,
  setVisibleNotesPanels,
  visibleCuePanels,
  visibleNotesPanels,
}: ExerciseCardItemProps) {
  const lastPerformanceQuery = useLastPerformance(exercise.id, {
    enabled: enableApiLastPerformance,
  });
  const lastPerformance = enableApiLastPerformance ? (lastPerformanceQuery.data ?? null) : exercise.lastPerformance;
  const state = getExerciseState(exercise, sessionCurrentExerciseId);
  const isExpanded =
    focusTargetExerciseId === exercise.id
      ? true
      : (expandedExercises[exercise.id] ?? exercise.id === sessionCurrentExerciseId);
  const formCueDetails = exercise.formCues;
  const hasFormCues = formCueDetails !== null;
  const hasInjuryCues = exercise.injuryCues.length > 0;
  const isCuePanelOpen = hasFormCues && (visibleCuePanels[exercise.id] ?? false);
  const isNotesPanelOpen = visibleNotesPanels[exercise.id] ?? exercise.notes.length > 0;
  const priorityAccentClass =
    exercise.priority === 'required'
      ? 'border-l-4 border-l-primary'
      : 'border-l-4 border-dashed border-l-border';

  return (
    <Card
      className={cn(
        'gap-0 overflow-hidden py-0 transition-colors',
        priorityAccentClass,
        state === 'in-progress' && 'border-primary/35 shadow-md',
      )}
    >
      <button
        aria-controls={`exercise-panel-${exercise.id}`}
        aria-expanded={isExpanded}
        className="flex w-full cursor-pointer items-start justify-between gap-4 px-4 py-5 text-left sm:px-5"
        onClick={() =>
          setExpandedExercises((current) => ({
            ...current,
            [exercise.id]: !(current[exercise.id] ?? exercise.id === sessionCurrentExerciseId),
          }))
        }
        type="button"
      >
        <div className="flex min-w-0 items-start gap-3">
          <ExerciseStatusIndicator priority={exercise.priority} state={state} />
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-foreground">{exercise.name}</h3>
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
            </div>
            <p className="text-sm text-muted">{`${exercise.completedSets}/${exercise.targetSets} sets completed`}</p>
            <p className="text-sm text-muted">{`Target ${exercise.prescribedReps} • Rest ${exercise.restSeconds}s`}</p>
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

      <CardContent
        className="border-t border-border bg-secondary/25 px-4 py-4 sm:px-5"
        hidden={!isExpanded}
        id={`exercise-panel-${exercise.id}`}
      >
        <div className="space-y-4">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {hasFormCues ? (
                <Button
                  aria-controls={`exercise-cues-${exercise.id}`}
                  aria-expanded={isCuePanelOpen}
                  className="cursor-pointer gap-1.5"
                  onClick={() =>
                    setVisibleCuePanels((current) => ({
                      ...current,
                      [exercise.id]: !isCuePanelOpen,
                    }))
                  }
                  size="xs"
                  type="button"
                  variant={isCuePanelOpen ? 'secondary' : 'outline'}
                >
                  Form Cues
                  <ChevronDown
                    aria-hidden="true"
                    className={cn('size-3.5 transition-transform', isCuePanelOpen && 'rotate-180')}
                  />
                </Button>
              ) : null}
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

            {lastPerformance ? (
              <LastPerformanceSummary
                lastPerformance={lastPerformance}
                currentSets={exercise.sets}
                prescribedReps={exercise.prescribedReps}
              />
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

            {hasFormCues ? (
              <div
                aria-hidden={!isCuePanelOpen}
                className={cn(
                  'grid transition-all duration-300 ease-out',
                  isCuePanelOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
                )}
                id={`exercise-cues-${exercise.id}`}
              >
                <div className="overflow-hidden">
                  <div className="rounded-2xl border border-border bg-background/80 p-4">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-[0.18em] text-muted uppercase">
                          Technique
                        </p>
                        <p className="text-sm text-foreground">{formCueDetails?.technique}</p>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <CueList items={formCueDetails?.mentalCues ?? []} title="Mental Cues" />
                        <CueList
                          items={formCueDetails?.commonMistakes ?? []}
                          title="Common Mistakes"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

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
                onChange={(event) => onExerciseNotesChange(exercise.id, event.target.value)}
                placeholder="Add any technique reminders, machine settings, or quick context."
                value={exercise.notes}
              />
            </div>
          </div>

          {exercise.sets.map((set, setIndex) => (
            <SetRow
              completed={set.completed}
              isLast={setIndex === exercise.sets.length - 1}
              key={set.id}
              onAddSet={() => onAddSet(exercise.id)}
              onUpdate={(update) => onSetUpdate(exercise.id, set.id, update)}
              ref={(element) => {
                repsInputRefs.current[set.id] = element;
              }}
              reps={set.reps}
              setNumber={set.number}
              lastPerformance={lastPerformance?.sets.find(
                (previousSet) => previousSet.setNumber === set.number,
              )}
              target={getSetTarget(exercise.reversePyramid, set.number, exercise.prescribedReps)}
              weight={set.weight}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function LastPerformanceSummary({
  currentSets,
  lastPerformance,
  prescribedReps,
}: {
  currentSets: ActiveWorkoutExercise['sets'];
  lastPerformance: ActiveWorkoutLastPerformance;
  prescribedReps: ActiveWorkoutExercise['prescribedReps'];
}) {
  const formattedDate = new Date(`${lastPerformance.date}T12:00:00`).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
  });
  const exceededSetNumbers = new Set(
    currentSets
      .filter((set) =>
        exceedsPreviousSet(
          set,
          lastPerformance.sets.find((previousSet) => previousSet.setNumber === set.number) ?? null,
        ),
      )
      .map((set) => set.number),
  );

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
      <span className="font-medium">{`Last: ${formattedDate}`}</span>
      <span aria-hidden="true">•</span>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {lastPerformance.sets.map((set, index) => (
          <span className="inline-flex items-center gap-1" key={set.setNumber}>
            <span>
              {formatCompactPerformanceSet(set.weight, set.reps, prescribedReps)}
              {index < lastPerformance.sets.length - 1 ? ',' : ''}
            </span>
            {exceededSetNumbers.has(set.setNumber) ? (
              <span className="inline-flex items-center text-emerald-600 dark:text-emerald-400">
                <ArrowUpRight aria-hidden="true" className="size-3" />
              </span>
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
}

function CueList({ items, title }: { items: string[]; title: string }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold tracking-[0.18em] text-muted uppercase">{title}</p>
      <ul className="space-y-2 text-sm text-foreground">
        {items.map((item) => (
          <li className="flex items-start gap-2" key={item}>
            <span aria-hidden="true" className="mt-1 size-1.5 rounded-full bg-primary" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
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
  if (exercise.completedSets === exercise.targetSets) {
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

function formatCompactPerformanceSet(weight: number | null, reps: number, prescribedReps: string) {
  if (weight === null) {
    return formatPerformedReps(reps, prescribedReps);
  }

  if (prescribedReps.includes('min') || prescribedReps.includes('sec')) {
    return `${formatWeight(weight)}x${formatPerformedReps(reps, prescribedReps)}`;
  }

  return `${formatWeight(weight)}x${reps}`;
}

function getSetTarget(
  reversePyramid: ActiveWorkoutReversePyramidTarget[],
  setNumber: number,
  prescribedReps: string,
) {
  const currentTarget = reversePyramid.find((target) => target.setNumber === setNumber);

  if (!currentTarget) {
    return null;
  }

  const previousTarget = reversePyramid.find((target) => target.setNumber === setNumber - 1);
  const prescribedRange = parseRepRange(prescribedReps);
  const minReps =
    setNumber === 1 ? (prescribedRange?.min ?? currentTarget.targetReps) : currentTarget.targetReps;
  const maxReps =
    setNumber === 1
      ? (prescribedRange?.max ?? currentTarget.targetReps)
      : (previousTarget?.targetReps ?? currentTarget.targetReps);

  return {
    maxReps,
    minReps,
    weight: currentTarget.targetWeight,
  };
}

function parseRepRange(prescribedReps: string) {
  const match = prescribedReps.match(/(\d+)\s*-\s*(\d+)/);

  if (!match) {
    return null;
  }

  return {
    max: Number(match[2]),
    min: Number(match[1]),
  };
}

function exceedsPreviousSet(
  currentSet: ActiveWorkoutExercise['sets'][number],
  previousSet: ActiveWorkoutLastPerformance['sets'][number] | null,
) {
  if (!previousSet || currentSet.reps === null) {
    return false;
  }

  if (currentSet.weight !== null && previousSet.weight !== null) {
    return (
      currentSet.weight > previousSet.weight ||
      (currentSet.weight === previousSet.weight && currentSet.reps > previousSet.reps)
    );
  }

  if (currentSet.weight !== null && previousSet.weight === null) {
    return true;
  }

  return currentSet.reps > previousSet.reps;
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
  return Number.isInteger(weight) ? `${weight}` : weight.toFixed(1);
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

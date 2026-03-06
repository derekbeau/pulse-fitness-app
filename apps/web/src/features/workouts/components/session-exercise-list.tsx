import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check, Dot } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import type { ActiveWorkoutExercise, ActiveWorkoutSessionData } from '../types';
import { RestTimer } from './rest-timer';
import { SetRow, type SetRowUpdate } from './set-row';

type RestTimerState = {
  duration: number;
  exerciseName: string;
  setNumber: number;
  token: number;
};

type SessionExerciseListProps = {
  focusSetId?: string | null;
  onAddSet: (exerciseId: string) => void;
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
  compound: 'bg-[var(--color-accent-pink)] text-[var(--color-on-accent)]',
  isolation: 'bg-[var(--color-accent-cream)] text-[var(--color-on-accent)]',
  cardio: 'bg-[var(--color-accent-mint)] text-[var(--color-on-accent)]',
  mobility: 'bg-[var(--color-accent-cream)] text-[var(--color-on-accent)]',
} as const;

export function SessionExerciseList({
  focusSetId = null,
  onAddSet,
  onFocusSetHandled,
  onRestTimerComplete,
  onSetUpdate,
  restTimer = null,
  session,
}: SessionExerciseListProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [expandedExercises, setExpandedExercises] = useState<Record<string, boolean>>({});
  const repsInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const focusTarget = focusSetId ? findSetContext(session, focusSetId) : null;

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
          className="rounded-3xl border border-transparent bg-[var(--color-accent-mint)] px-5 py-5 text-[var(--color-on-accent)] shadow-sm"
          data-slot="rest-timer-panel"
        >
          <div className="mb-4 space-y-1">
            <p className="text-xs font-semibold tracking-[0.22em] text-[var(--color-on-accent)]/70 uppercase">
              Rest Timer
            </p>
            <h2 className="text-xl font-semibold">{`After ${restTimer.exerciseName}`}</h2>
            <p className="text-sm text-[var(--color-on-accent)]/75">{`Set ${restTimer.setNumber} logged. Start the next set when you're ready.`}</p>
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
            : openSections[section.id] ??
              section.exercises.some((exercise) => exercise.id === session.currentExerciseId);

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
                  [section.id]:
                    !(current[section.id] ??
                      section.exercises.some(
                        (exercise) => exercise.id === session.currentExerciseId,
                      )),
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
                {section.exercises.map((exercise, index) => {
                  const exerciseNumber =
                    session.sections
                      .slice(0, session.sections.findIndex((candidate) => candidate.id === section.id))
                      .reduce((count, candidate) => count + candidate.exercises.length, 0) +
                    index +
                    1;
                  const state = getExerciseState(exercise, session.currentExerciseId);
                  const isExpanded =
                    focusTarget?.exerciseId === exercise.id
                      ? true
                      : expandedExercises[exercise.id] ?? exercise.id === session.currentExerciseId;

                  return (
                    <Card
                      className={cn(
                        'gap-0 overflow-hidden py-0 transition-colors',
                        state === 'in-progress' && 'border-primary/35 shadow-md',
                      )}
                      key={exercise.id}
                    >
                      <button
                        aria-controls={`exercise-panel-${exercise.id}`}
                        aria-expanded={isExpanded}
                        className="flex w-full cursor-pointer items-start justify-between gap-4 px-5 py-5 text-left"
                        onClick={() =>
                          setExpandedExercises((current) => ({
                            ...current,
                            [exercise.id]:
                              !(current[exercise.id] ?? exercise.id === session.currentExerciseId),
                          }))
                        }
                        type="button"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <ExerciseStatusIndicator state={state} />
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-lg font-semibold text-foreground">{exercise.name}</h3>
                              <Badge
                                className={cn('border-transparent capitalize', badgeStyles[exercise.category])}
                                variant="outline"
                              >
                                {exercise.category}
                              </Badge>
                              {state === 'in-progress' ? (
                                <Badge
                                  className="border-primary/20 bg-primary/12 text-primary"
                                  variant="outline"
                                >
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
                        <div className="space-y-3">
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
                              weight={set.weight}
                            />
                          ))}
                        </div>
                      </CardContent>
                    </Card>
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

function ExerciseStatusIndicator({ state }: { state: 'completed' | 'in-progress' | 'upcoming' }) {
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
        className="mt-1 inline-flex size-7 items-center justify-center rounded-full bg-amber-500/15 text-amber-600"
      >
        <Dot aria-hidden="true" className="size-5" />
      </span>
    );
  }

  return (
    <span
      aria-label="Upcoming exercise"
      className="mt-1 inline-flex size-7 items-center justify-center rounded-full bg-secondary text-muted"
    >
      <Dot aria-hidden="true" className="size-5" />
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

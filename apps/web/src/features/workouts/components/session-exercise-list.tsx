import { useState } from 'react';
import { ChevronDown, Check, Dot } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import type { ActiveWorkoutExercise, ActiveWorkoutSessionData } from '../types';

type SessionExerciseListProps = {
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

export function SessionExerciseList({ session }: SessionExerciseListProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [expandedExercises, setExpandedExercises] = useState<Record<string, boolean>>({});

  return (
    <div className="space-y-4">
      {session.sections.map((section) => {
        const completedExercises = section.exercises.filter(
          (exercise) => exercise.completedSets === exercise.targetSets,
        ).length;
        const sectionLabel = sectionLabels[section.type];
        const sectionSummary = `${sectionLabel} (${completedExercises}/${section.exercises.length} exercises done)`;
        const isOpen =
          openSections[section.id] ??
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
                <Badge className="border-transparent bg-secondary text-secondary-foreground" variant="outline">
                  {`${completedExercises}/${section.exercises.length}`}
                </Badge>
                <ChevronDown
                  aria-hidden="true"
                  className={cn('size-4 text-muted transition-transform', isOpen && 'rotate-180')}
                />
              </div>
            </button>

            {isOpen ? (
              <div className="border-t border-border px-4 py-4 sm:px-6 sm:py-5" id={`section-panel-${section.id}`}>
                <div className="space-y-3">
                  {section.exercises.map((exercise, index) => {
                    const exerciseNumber =
                      session.sections
                        .slice(0, session.sections.findIndex((candidate) => candidate.id === section.id))
                        .reduce((count, candidate) => count + candidate.exercises.length, 0) +
                      index +
                      1;
                    const state = getExerciseState(exercise, session.currentExerciseId);
                    const isExpanded = expandedExercises[exercise.id] ?? exercise.id === session.currentExerciseId;

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
                              [exercise.id]: !(current[exercise.id] ?? exercise.id === session.currentExerciseId),
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
                                  <Badge className="border-primary/20 bg-primary/12 text-primary" variant="outline">
                                    Current
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="text-sm text-muted">{`${exercise.completedSets}/${exercise.targetSets} sets completed`}</p>
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

                        {isExpanded ? (
                          <CardContent
                            className="border-t border-border bg-secondary/25 px-4 py-4 sm:px-5"
                            id={`exercise-panel-${exercise.id}`}
                          >
                            <ul className="grid gap-2">
                              {exercise.sets.map((set) => (
                                <li
                                  className={cn(
                                    'flex items-center justify-between rounded-2xl border px-3 py-3 text-sm',
                                    set.completed
                                      ? 'border-emerald-500/20 bg-emerald-500/8 text-foreground'
                                      : 'border-border bg-background text-muted',
                                  )}
                                  key={set.id}
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="font-semibold text-foreground">{`Set ${set.number}`}</span>
                                    <span>{set.label}</span>
                                  </div>
                                  <span
                                    className={cn(
                                      'rounded-full px-2.5 py-1 text-xs font-semibold',
                                      set.completed
                                        ? 'bg-emerald-500/15 text-emerald-700'
                                        : 'bg-secondary text-secondary-foreground',
                                    )}
                                  >
                                    {set.completed ? 'Complete' : 'Pending'}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </CardContent>
                        ) : null}
                      </Card>
                    );
                  })}
                </div>
              </div>
            ) : null}
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

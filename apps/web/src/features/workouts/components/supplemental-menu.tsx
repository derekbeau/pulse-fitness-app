import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

import type {
  ActiveWorkoutSupplementalCategory,
  ActiveWorkoutSupplementalExercise,
} from '../types';

type SupplementalMenuProps = {
  checkedByExerciseId: Record<string, boolean>;
  className?: string;
  exercises: ActiveWorkoutSupplementalExercise[];
  onCheckedChange: (exerciseId: string, checked: boolean) => void;
};

const categoryOrder: ActiveWorkoutSupplementalCategory[] = [
  'core-spine',
  'atg',
  'strength-side',
  'optional',
];

const categoryLabels: Record<ActiveWorkoutSupplementalCategory, string> = {
  'core-spine': 'Core & Spine Health (pick at least 2)',
  atg: 'ATG Additions',
  'strength-side': 'Strength Side Additions',
  optional: 'Optional',
};

export function SupplementalMenu({
  checkedByExerciseId,
  className,
  exercises,
  onCheckedChange,
}: SupplementalMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();
  const groupedExercises = groupSupplementalExercises(exercises);
  const totalChecked = exercises.filter(
    (exercise) => checkedByExerciseId[exercise.exerciseId],
  ).length;

  return (
    <section
      className={cn(
        'overflow-hidden rounded-3xl border border-border bg-card shadow-sm',
        className,
      )}
    >
      <button
        aria-controls={panelId}
        aria-expanded={isOpen}
        className="flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-5 text-left sm:px-6"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">
            Post-Workout Supplemental (10-20 min)
          </h2>
          <p className="text-sm text-muted">{`${totalChecked}/${exercises.length} completed`}</p>
        </div>

        <div className="flex items-center gap-3">
          <Badge
            className="border-transparent bg-secondary text-secondary-foreground"
            variant="outline"
          >
            {`${totalChecked}/${exercises.length}`}
          </Badge>
          <ChevronDown
            aria-hidden="true"
            className={cn('size-4 text-muted transition-transform', isOpen && 'rotate-180')}
          />
        </div>
      </button>

      {isOpen ? (
        <div className="border-t border-border px-5 py-5 sm:px-6" id={panelId}>
          <div className="space-y-5">
            {categoryOrder.map((category) => {
              const categoryExercises = groupedExercises[category];

              if (categoryExercises.length === 0) {
                return null;
              }

              return (
                <section className="space-y-3" key={category}>
                  <div className="flex items-center gap-3">
                    <span className="h-px flex-1 bg-border/80" />
                    <h3 className="text-xs font-semibold tracking-[0.18em] text-muted uppercase">
                      {categoryLabels[category]}
                    </h3>
                    <span className="h-px flex-1 bg-border/80" />
                  </div>

                  <div className="space-y-2">
                    {categoryExercises.map((exercise) => {
                      const checked = checkedByExerciseId[exercise.exerciseId] ?? false;

                      return (
                        <label
                          className={cn(
                            'flex cursor-pointer items-start gap-3 rounded-2xl border border-border/70 bg-secondary/20 px-4 py-3 transition-colors hover:bg-secondary/35',
                            exercise.priority === 'required' &&
                              'border-primary/35 bg-primary/8 ring-1 ring-primary/12',
                          )}
                          htmlFor={`supplemental-${exercise.exerciseId}`}
                          key={exercise.exerciseId}
                        >
                          <Checkbox
                            aria-label={`Complete supplemental exercise ${exercise.name}`}
                            checked={checked}
                            className="mt-0.5 border-border bg-background"
                            id={`supplemental-${exercise.exerciseId}`}
                            onCheckedChange={(nextChecked) =>
                              onCheckedChange(exercise.exerciseId, nextChecked === true)
                            }
                          />

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                              <p
                                className={cn(
                                  'text-sm text-foreground',
                                  exercise.priority === 'required' && 'font-semibold text-primary',
                                  checked && 'text-muted line-through',
                                )}
                              >
                                {exercise.name}
                              </p>
                              <p className="text-sm text-muted">{`${exercise.sets} x ${exercise.reps}`}</p>
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function groupSupplementalExercises(exercises: ActiveWorkoutSupplementalExercise[]) {
  return categoryOrder.reduce<
    Record<ActiveWorkoutSupplementalCategory, ActiveWorkoutSupplementalExercise[]>
  >(
    (groups, category) => ({
      ...groups,
      [category]: exercises.filter((exercise) => exercise.category === category),
    }),
    {
      'core-spine': [],
      atg: [],
      'strength-side': [],
      optional: [],
    },
  );
}

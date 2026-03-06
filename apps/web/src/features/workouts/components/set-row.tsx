import { Plus } from 'lucide-react';

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { WorkoutSet } from '@/features/workouts/types';

type SetRowProps = {
  set: WorkoutSet;
  index: number;
  onChange: (nextSet: WorkoutSet) => void;
  onAddSet?: () => void;
};

function parseNumberInput(rawValue: string) {
  if (rawValue.trim() === '') {
    return null;
  }

  const numericValue = Number(rawValue);

  return Number.isFinite(numericValue) ? numericValue : null;
}

export function SetRow({ set, index, onChange, onAddSet }: SetRowProps) {
  const setNumber = index + 1;

  return (
    <div
      className={cn(
        'grid gap-3 rounded-2xl border border-border bg-card/90 p-4 shadow-sm',
        'sm:grid-cols-[auto_minmax(0,7rem)_minmax(0,7rem)_auto_auto] sm:items-end',
      )}
    >
      <div className="inline-flex h-11 items-center rounded-full bg-[var(--color-accent-mint)] px-4 text-sm font-semibold text-slate-950">
        Set {setNumber}
      </div>

      <label className="grid gap-2 text-sm font-medium text-foreground" htmlFor={`set-${set.id}-weight`}>
        Weight
        <Input
          id={`set-${set.id}-weight`}
          aria-label={`Set ${setNumber} weight`}
          className="h-11"
          inputMode="decimal"
          min="0"
          step="0.5"
          type="number"
          value={set.weight ?? ''}
          onChange={(event) => {
            onChange({
              ...set,
              weight: parseNumberInput(event.target.value),
            });
          }}
        />
      </label>

      <label className="grid gap-2 text-sm font-medium text-foreground" htmlFor={`set-${set.id}-reps`}>
        Reps
        <Input
          id={`set-${set.id}-reps`}
          aria-label={`Set ${setNumber} reps`}
          className="h-11"
          inputMode="numeric"
          min="0"
          step="1"
          type="number"
          value={set.reps ?? ''}
          onChange={(event) => {
            onChange({
              ...set,
              reps: parseNumberInput(event.target.value),
            });
          }}
        />
      </label>

      <label
        className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-secondary/60 px-4 py-3 text-sm font-medium text-foreground"
        htmlFor={`set-${set.id}-complete`}
      >
        <Checkbox
          id={`set-${set.id}-complete`}
          aria-label={`Complete set ${setNumber}`}
          checked={set.completed}
          onCheckedChange={(checked) => {
            onChange({
              ...set,
              completed: checked === true,
            });
          }}
        />
        <span>{set.completed ? 'Complete' : 'Mark complete'}</span>
      </label>

      <Button
        type="button"
        variant="outline"
        className="h-11 justify-self-start sm:justify-self-end"
        onClick={onAddSet}
      >
        <Plus />
        Add set
      </Button>
    </div>
  );
}

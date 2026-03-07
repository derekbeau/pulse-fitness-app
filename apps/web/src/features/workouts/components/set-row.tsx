import { forwardRef } from 'react';
import { ArrowUpRight, Check, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type SetRowUpdate = {
  completed?: boolean;
  reps?: number | null;
  weight?: number | null;
};

type SetRowProps = {
  completed: boolean;
  isLast: boolean;
  lastPerformance?: {
    reps: number;
    weight: number | null;
  } | null;
  onAddSet?: () => void;
  onUpdate: (update: SetRowUpdate) => void;
  reps: number | null;
  setNumber: number;
  target?: {
    maxReps?: number | null;
    minReps?: number | null;
    weight: number;
  } | null;
  weight?: number | null;
};

export const SetRow = forwardRef<HTMLInputElement, SetRowProps>(function SetRow(
  {
    completed,
    isLast,
    lastPerformance = null,
    onAddSet,
    onUpdate,
    reps,
    setNumber,
    target = null,
    weight = null,
  },
  ref,
) {
  const hasPr = exceedsLastPerformance({ reps, weight }, lastPerformance);

  return (
    <div className="space-y-2">
      <div
        className={cn(
          'grid gap-3 rounded-2xl border px-3 py-3 transition-colors sm:grid-cols-[minmax(0,5rem)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center',
          completed ? 'border-emerald-500/25 bg-emerald-500/10' : 'border-border bg-background',
        )}
        data-slot="set-row"
      >
        <div className="flex min-h-11 items-center">
          <span className="text-sm font-semibold text-foreground">{`Set ${setNumber}`}</span>
        </div>

        <label className="space-y-1">
          <span className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">
            Weight
          </span>
          <div className="relative">
            <Input
              aria-label={`Weight for set ${setNumber}`}
              className={cn(
                'h-11 rounded-xl border-border bg-card pr-12 text-base',
                completed && 'border-emerald-500/20 bg-background/80 opacity-80',
              )}
              inputMode="decimal"
              min={0}
              onChange={(event) =>
                onUpdate({
                  weight: parseNumberInput(event.currentTarget.value),
                })
              }
              placeholder="--"
              step="0.5"
              type="number"
              value={weight ?? ''}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-muted">
              kg
            </span>
          </div>
          {target ? (
            <p className="text-xs text-muted">{`Target: ${formatWeight(target.weight)} kg x ${formatTargetReps(target)}`}</p>
          ) : null}
        </label>

        <label className="space-y-1">
          <span className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">
            Reps
          </span>
          <Input
            aria-label={`Reps for set ${setNumber}`}
            className={cn(
              'h-11 rounded-xl border-border bg-card text-base',
              completed && 'border-emerald-500/20 bg-background/80 opacity-80',
            )}
            inputMode="numeric"
            min={0}
            onChange={(event) =>
              onUpdate({
                reps: parseNumberInput(event.currentTarget.value),
              })
            }
            placeholder="0"
            ref={ref}
            step="1"
            type="number"
            value={reps ?? ''}
          />
          {lastPerformance ? (
            <div className="flex min-h-4 items-center gap-1 text-xs text-muted">
              <span>{`Last: ${formatLastSet(lastPerformance)}`}</span>
              {hasPr ? (
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                  <ArrowUpRight aria-hidden="true" className="size-3" />
                  PR
                </span>
              ) : null}
            </div>
          ) : null}
        </label>

        <label className="flex min-h-11 cursor-pointer items-center justify-between rounded-2xl border border-border bg-card px-3 py-2 sm:min-w-28 sm:justify-center sm:gap-2">
          <span className="text-xs font-semibold tracking-[0.18em] text-muted uppercase sm:hidden">
            Done
          </span>
          <input
            aria-label={`Complete set ${setNumber}`}
            checked={completed}
            className="size-5 cursor-pointer accent-emerald-600"
            onChange={(event) => onUpdate({ completed: event.currentTarget.checked })}
            type="checkbox"
          />
          <span
            className={cn(
              'hidden text-sm font-semibold sm:inline',
              completed ? 'text-emerald-700' : 'text-muted',
            )}
          >
            {completed ? 'Done' : 'Mark'}
          </span>
          {completed ? (
            <Check aria-hidden="true" className="hidden size-4 text-emerald-700 sm:block" />
          ) : null}
        </label>
      </div>

      {isLast && onAddSet ? (
        <Button
          className="h-11 w-full cursor-pointer rounded-2xl border-dashed"
          onClick={onAddSet}
          type="button"
          variant="outline"
        >
          <Plus aria-hidden="true" className="size-4" />
          Add Set
        </Button>
      ) : null}
    </div>
  );
});

function parseNumberInput(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function exceedsLastPerformance(
  current: { reps: number | null; weight: number | null },
  previous: SetRowProps['lastPerformance'],
) {
  if (!previous || current.reps === null) {
    return false;
  }

  const currentWeight = current.weight;
  const previousWeight = previous.weight;

  if (previousWeight !== null && currentWeight !== null) {
    return (
      currentWeight > previousWeight ||
      (currentWeight === previousWeight && current.reps > previous.reps)
    );
  }

  if (previousWeight === null && currentWeight !== null) {
    return true;
  }

  return current.reps > previous.reps;
}

function formatLastSet(lastPerformance: NonNullable<SetRowProps['lastPerformance']>) {
  const repsLabel = `${lastPerformance.reps}`;

  if (lastPerformance.weight === null) {
    return repsLabel;
  }

  return `${formatWeight(lastPerformance.weight)}x${repsLabel}`;
}

function formatTargetReps(target: NonNullable<SetRowProps['target']>) {
  if (target.minReps && target.maxReps && target.minReps !== target.maxReps) {
    return `${target.minReps}-${target.maxReps}`;
  }

  return `${target.maxReps ?? target.minReps ?? ''}`;
}

function formatWeight(weight: number) {
  return Number.isInteger(weight) ? `${weight}` : weight.toFixed(1);
}

export type { SetRowProps, SetRowUpdate };

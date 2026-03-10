import { forwardRef } from 'react';
import { ArrowUpRight, Check, Plus } from 'lucide-react';
import {
  formatWeight as formatWeightWithUnit,
  type ExerciseTrackingType,
  type WeightUnit,
} from '@pulse/shared';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type SetRowUpdate = {
  completed?: boolean;
  distance?: number | null;
  reps?: number | null;
  seconds?: number | null;
  weight?: number | null;
};

type SetRowProps = {
  completed: boolean;
  distance?: number | null;
  isLast: boolean;
  lastPerformance?: {
    distance?: number | null;
    reps: number;
    seconds?: number | null;
    weight: number | null;
  } | null;
  onAddSet?: () => void;
  onUpdate: (update: SetRowUpdate) => void;
  reps?: number | null;
  seconds?: number | null;
  setNumber: number;
  target?: {
    maxReps?: number | null;
    minReps?: number | null;
    weight: number;
  } | null;
  trackingType: ExerciseTrackingType;
  weight?: number | null;
  weightUnit?: WeightUnit;
};

type MetricKey = 'distance' | 'reps' | 'seconds' | 'weight';

type MetricInputConfig = {
  key: MetricKey;
  label: string;
  placeholder: string;
  step: string;
  unitLabel: string | null;
};

export const SetRow = forwardRef<HTMLInputElement, SetRowProps>(function SetRow(
  {
    completed,
    distance = null,
    isLast,
    lastPerformance = null,
    onAddSet,
    onUpdate,
    reps = null,
    seconds = null,
    setNumber,
    target = null,
    trackingType,
    weight = null,
    weightUnit = 'lbs',
  },
  ref,
) {
  const hasPr = exceedsLastPerformance(
    {
      distance,
      reps,
      seconds,
      weight,
    },
    lastPerformance,
    trackingType,
  );

  const distanceUnit = weightUnit === 'lbs' ? 'mi' : 'm';
  const metricInputs = getMetricInputs(trackingType, distanceUnit, weightUnit);
  const separator = getSeparator(trackingType);
  const focusMetricKey = getFocusMetricKey(trackingType, metricInputs);

  return (
    <div className="space-y-2">
      <div
        className={cn(
          'grid gap-3 rounded-2xl border px-3 py-3 transition-colors sm:grid-cols-[minmax(0,5rem)_minmax(0,1fr)_auto]',
          completed ? 'border-emerald-500/25 bg-emerald-500/10' : 'border-border bg-background',
        )}
        data-slot="set-row"
      >
        <div className="flex min-h-11 items-center">
          <span className="text-sm font-semibold text-foreground">{`Set ${setNumber}`}</span>
        </div>

        <div
          className={cn(
            'grid gap-3',
            metricInputs.length === 2
              ? 'sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]'
              : 'sm:grid-cols-1',
          )}
        >
          <MetricInput
            completed={completed}
            config={metricInputs[0]}
            onUpdate={onUpdate}
            ref={metricInputs[0].key === focusMetricKey ? ref : undefined}
            setNumber={setNumber}
            value={getMetricValue(metricInputs[0].key, { distance, reps, seconds, weight })}
          />

          {metricInputs[1] ? (
            <>
              <span className="hidden items-center justify-center text-sm font-semibold text-muted sm:flex">
                {separator}
              </span>
              <MetricInput
                completed={completed}
                config={metricInputs[1]}
                onUpdate={onUpdate}
                ref={metricInputs[1].key === focusMetricKey ? ref : undefined}
                setNumber={setNumber}
                value={getMetricValue(metricInputs[1].key, { distance, reps, seconds, weight })}
              />
            </>
          ) : null}

          {trackingType === 'weight_reps' && target ? (
            <p className="text-xs text-muted sm:col-span-full">
              {`Target: ${formatWeightWithUnit(target.weight, weightUnit)} x ${formatTargetReps(target)}`}
            </p>
          ) : null}

          {lastPerformance ? (
            <div className="flex min-h-4 items-center gap-1 text-xs text-muted sm:col-span-full">
              <span>{`Last time: ${formatLastSet(lastPerformance, trackingType, weightUnit)}`}</span>
              {hasPr ? (
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                  <ArrowUpRight aria-hidden="true" className="size-3" />
                  PR
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

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

const MetricInput = forwardRef<
  HTMLInputElement,
  {
    completed: boolean;
    config: MetricInputConfig;
    onUpdate: (update: SetRowUpdate) => void;
    setNumber: number;
    value: number | null;
  }
>(function MetricInput({ completed, config, onUpdate, setNumber, value }, ref) {
  return (
    <label className="space-y-1">
      <span className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">
        {config.label}
      </span>
      <div className="relative">
        <Input
          aria-label={`${config.label} for set ${setNumber}`}
          className={cn(
            'h-11 rounded-xl border-border bg-card text-base',
            config.unitLabel ? 'pr-12' : null,
            completed && 'border-emerald-500/20 bg-background/80 opacity-80',
          )}
          inputMode={config.key === 'weight' || config.key === 'distance' ? 'decimal' : 'numeric'}
          min={0}
          onChange={(event) =>
            onUpdate(
              {
                [config.key]: parseNumberInput(event.currentTarget.value),
              } as SetRowUpdate,
            )
          }
          placeholder={config.placeholder}
          ref={ref}
          step={config.step}
          type="number"
          value={value ?? ''}
        />
        {config.unitLabel ? (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-muted">
            {config.unitLabel}
          </span>
        ) : null}
      </div>
    </label>
  );
});

function getMetricInputs(
  trackingType: ExerciseTrackingType,
  distanceUnit: string,
  weightUnit: WeightUnit,
): MetricInputConfig[] {
  switch (trackingType) {
    case 'weight_reps':
      return [
        {
          key: 'weight',
          label: 'Weight',
          placeholder: '--',
          step: '0.5',
          unitLabel: weightUnit,
        },
        {
          key: 'reps',
          label: 'Reps',
          placeholder: '0',
          step: '1',
          unitLabel: null,
        },
      ];
    case 'weight_seconds':
      return [
        {
          key: 'weight',
          label: 'Weight',
          placeholder: '--',
          step: '0.5',
          unitLabel: weightUnit,
        },
        {
          key: 'seconds',
          label: 'Seconds',
          placeholder: '0',
          step: '1',
          unitLabel: 'sec',
        },
      ];
    case 'bodyweight_reps':
    case 'reps_only':
      return [
        {
          key: 'reps',
          label: 'Reps',
          placeholder: '0',
          step: '1',
          unitLabel: null,
        },
      ];
    case 'reps_seconds':
      return [
        {
          key: 'reps',
          label: 'Reps',
          placeholder: '0',
          step: '1',
          unitLabel: null,
        },
        {
          key: 'seconds',
          label: 'Seconds',
          placeholder: '0',
          step: '1',
          unitLabel: 'sec',
        },
      ];
    case 'seconds_only':
      return [
        {
          key: 'seconds',
          label: 'Seconds',
          placeholder: '0',
          step: '1',
          unitLabel: 'sec',
        },
      ];
    case 'distance':
      return [
        {
          key: 'distance',
          label: 'Distance',
          placeholder: '0',
          step: '0.1',
          unitLabel: distanceUnit,
        },
      ];
    case 'cardio':
      return [
        {
          key: 'seconds',
          label: 'Duration',
          placeholder: '0',
          step: '1',
          unitLabel: 'sec',
        },
        {
          key: 'distance',
          label: 'Distance',
          placeholder: '0',
          step: '0.1',
          unitLabel: distanceUnit,
        },
      ];
    default:
      return [
        {
          key: 'weight',
          label: 'Weight',
          placeholder: '--',
          step: '0.5',
          unitLabel: weightUnit,
        },
        {
          key: 'reps',
          label: 'Reps',
          placeholder: '0',
          step: '1',
          unitLabel: null,
        },
      ];
  }
}

function getSeparator(trackingType: ExerciseTrackingType) {
  return trackingType === 'cardio' ? '+' : '×';
}

function getFocusMetricKey(
  trackingType: ExerciseTrackingType,
  metricInputs: MetricInputConfig[],
): MetricKey {
  if (trackingType === 'weight_reps') {
    return 'reps';
  }

  return metricInputs[0]?.key ?? 'reps';
}

function getMetricValue(
  key: MetricKey,
  values: { distance: number | null; reps: number | null; seconds: number | null; weight: number | null },
) {
  if (key === 'distance') {
    return values.distance;
  }

  if (key === 'seconds') {
    return values.seconds;
  }

  if (key === 'weight') {
    return values.weight;
  }

  return values.reps;
}

function parseNumberInput(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function exceedsLastPerformance(
  current: { distance: number | null; reps: number | null; seconds: number | null; weight: number | null },
  previous: SetRowProps['lastPerformance'],
  trackingType: ExerciseTrackingType,
) {
  if (!previous) {
    return false;
  }

  switch (trackingType) {
    case 'weight_reps': {
      if (current.reps === null) {
        return false;
      }

      if (previous.weight !== null && current.weight !== null) {
        return (
          current.weight > previous.weight ||
          (current.weight === previous.weight && current.reps > previous.reps)
        );
      }

      if (previous.weight === null && current.weight !== null) {
        return true;
      }

      return current.reps > previous.reps;
    }
    case 'weight_seconds': {
      const previousSeconds = previous.seconds ?? previous.reps;
      if (current.seconds === null) {
        return false;
      }

      if (previous.weight !== null && current.weight !== null) {
        return (
          current.weight > previous.weight ||
          (current.weight === previous.weight && current.seconds > previousSeconds)
        );
      }

      if (previous.weight === null && current.weight !== null) {
        return true;
      }

      return current.seconds > previousSeconds;
    }
    case 'bodyweight_reps':
    case 'reps_only':
      return current.reps !== null && current.reps > previous.reps;
    case 'reps_seconds': {
      const previousSeconds = previous.seconds ?? 0;
      if (current.reps === null || current.seconds === null) {
        return false;
      }

      return (
        current.reps > previous.reps ||
        (current.reps === previous.reps && current.seconds > previousSeconds)
      );
    }
    case 'seconds_only': {
      const previousSeconds = previous.seconds ?? previous.reps;
      return current.seconds !== null && current.seconds > previousSeconds;
    }
    case 'distance': {
      const previousDistance = previous.distance ?? 0;
      return current.distance !== null && current.distance > previousDistance;
    }
    case 'cardio': {
      const previousDistance = previous.distance ?? 0;
      const previousSeconds = previous.seconds ?? previous.reps;
      if (current.distance === null && current.seconds === null) {
        return false;
      }

      return (
        (current.distance ?? 0) > previousDistance ||
        ((current.distance ?? 0) === previousDistance && (current.seconds ?? 0) > previousSeconds)
      );
    }
    default:
      return false;
  }
}

function formatLastSet(
  lastPerformance: NonNullable<SetRowProps['lastPerformance']>,
  trackingType: ExerciseTrackingType,
  weightUnit: WeightUnit,
) {
  const distanceUnit = weightUnit === 'lbs' ? 'mi' : 'm';

  switch (trackingType) {
    case 'weight_reps':
      return `${formatWeight(lastPerformance.weight)}x${lastPerformance.reps}`;
    case 'weight_seconds':
      return `${formatWeight(lastPerformance.weight)}x${lastPerformance.seconds ?? lastPerformance.reps} sec`;
    case 'bodyweight_reps':
    case 'reps_only':
      return `${lastPerformance.reps} reps`;
    case 'reps_seconds':
      return `${lastPerformance.reps}x${lastPerformance.seconds ?? 0} sec`;
    case 'seconds_only':
      return `${lastPerformance.seconds ?? lastPerformance.reps} sec`;
    case 'distance':
      return `${formatDecimal(lastPerformance.distance ?? 0)} ${distanceUnit}`;
    case 'cardio':
      return `${lastPerformance.seconds ?? lastPerformance.reps} sec + ${formatDecimal(lastPerformance.distance ?? 0)} ${distanceUnit}`;
    default:
      return `${formatWeight(lastPerformance.weight)}x${lastPerformance.reps}`;
  }
}

function formatTargetReps(target: NonNullable<SetRowProps['target']>) {
  if (target.minReps && target.maxReps && target.minReps !== target.maxReps) {
    return `${target.minReps}-${target.maxReps}`;
  }

  return `${target.maxReps ?? target.minReps ?? ''}`;
}

function formatWeight(weight: number | null | undefined) {
  if (weight == null) {
    return '0';
  }

  return Number.isInteger(weight) ? `${weight}` : weight.toFixed(1);
}

function formatDecimal(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

export type { SetRowProps, SetRowUpdate };

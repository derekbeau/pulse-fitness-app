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

import {
  getDistanceUnit,
  isSetCompleteForTrackingType,
} from '../lib/tracking';

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
    reps: number;
    weight: number | null;
  } | null;
  onAddSet?: () => void;
  onUpdate: (update: SetRowUpdate) => void;
  reps: number | null;
  seconds?: number | null;
  setNumber: number;
  target?: {
    maxReps?: number | null;
    minReps?: number | null;
    weight: number;
  } | null;
  trackingType?: ExerciseTrackingType;
  weight?: number | null;
  weightUnit?: WeightUnit;
};

type InputKey = 'distance' | 'reps' | 'seconds' | 'weight';

type MetricInputConfig = {
  inputMode: 'decimal' | 'numeric';
  key: InputKey;
  label: string;
  placeholder: string;
  step: string;
  suffix?: string;
};

export const SetRow = forwardRef<HTMLInputElement, SetRowProps>(function SetRow(
  {
    completed,
    distance = null,
    isLast,
    lastPerformance = null,
    onAddSet,
    onUpdate,
    reps,
    seconds = null,
    setNumber,
    target = null,
    trackingType = 'weight_reps',
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
  const distanceUnit = getDistanceUnit(weightUnit);
  const { inputs, separator } = getMetricInputs(trackingType, weightUnit);

  return (
    <div className="space-y-2">
      <div
        className={cn(
          'grid gap-3 rounded-2xl border px-3 py-3 transition-colors sm:grid-cols-[minmax(0,5rem)_minmax(0,1fr)_auto] sm:items-center',
          completed ? 'border-emerald-500/25 bg-emerald-500/10' : 'border-border bg-background',
        )}
        data-slot="set-row"
      >
        <div className="flex min-h-11 items-center">
          <span className="text-sm font-semibold text-foreground">{`Set ${setNumber}`}</span>
        </div>

        <div className="space-y-1">
          <div className={cn('grid gap-2', inputs.length === 1 ? 'grid-cols-1' : 'grid-cols-[1fr_auto_1fr]')}>
            {inputs.map((input, index) => (
              <InputWithSeparator
                completed={completed}
                input={input}
                key={input.key}
                onChange={(value) => {
                  const nextValues = {
                    distance,
                    reps,
                    seconds,
                    weight,
                    [input.key]: value,
                  };

                  onUpdate({
                    [input.key]: value,
                    completed: isSetCompleteForTrackingType(trackingType, nextValues),
                  });
                }}
                ref={shouldAttachFocusRef(input.key, trackingType) ? ref : undefined}
                separator={index > 0 ? separator : null}
                setNumber={setNumber}
                value={getInputValue(input.key, { distance, reps, seconds, weight })}
              />
            ))}
          </div>
          {target ? (
            <p className="text-xs text-muted">
              {formatTargetLabel({
                distanceUnit,
                target,
                trackingType,
                weightUnit,
              })}
            </p>
          ) : null}
          {lastPerformance ? (
            <div className="flex min-h-4 items-center gap-1 text-xs text-muted">
              <span>{`Last time: ${formatLastSet(lastPerformance, trackingType)}`}</span>
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
    input: MetricInputConfig;
    onChange: (value: number | null) => void;
    setNumber: number;
    value: number | null;
  }
>(function MetricInput({ completed, input, onChange, setNumber, value }, ref) {
  return (
    <label className="space-y-1">
      <span className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">
        {input.label}
      </span>
      <div className="relative">
        <Input
          aria-label={`${input.label} for set ${setNumber}`}
          className={cn(
            'h-11 rounded-xl border-border bg-card text-base',
            input.suffix ? 'pr-12' : '',
            completed && 'border-emerald-500/20 bg-background/80 opacity-80',
          )}
          inputMode={input.inputMode}
          min={0}
          onChange={(event) => onChange(parseNumberInput(event.currentTarget.value))}
          placeholder={input.placeholder}
          ref={ref}
          step={input.step}
          type="number"
          value={value ?? ''}
        />
        {input.suffix ? (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-muted">
            {input.suffix}
          </span>
        ) : null}
      </div>
    </label>
  );
});

const InputWithSeparator = forwardRef<
  HTMLInputElement,
  {
    completed: boolean;
    input: MetricInputConfig;
    onChange: (value: number | null) => void;
    separator: string | null;
    setNumber: number;
    value: number | null;
  }
>(function InputWithSeparator(
  { completed, input, onChange, separator, setNumber, value },
  ref,
) {
  return (
    <>
      {separator ? (
        <span className="flex items-center justify-center text-lg font-semibold text-muted">
          {separator}
        </span>
      ) : null}
      <MetricInput
        completed={completed}
        input={input}
        onChange={onChange}
        ref={ref}
        setNumber={setNumber}
        value={value}
      />
    </>
  );
});

function getMetricInputs(trackingType: ExerciseTrackingType, weightUnit: WeightUnit) {
  const distanceUnit = getDistanceUnit(weightUnit);

  const weightInput: MetricInputConfig = {
    inputMode: 'decimal',
    key: 'weight',
    label: 'Weight',
    placeholder: '--',
    step: '0.5',
    suffix: weightUnit,
  };
  const repsInput: MetricInputConfig = {
    inputMode: 'numeric',
    key: 'reps',
    label: 'Reps',
    placeholder: '0',
    step: '1',
  };
  const secondsInput: MetricInputConfig = {
    inputMode: 'numeric',
    key: 'seconds',
    label: 'Seconds',
    placeholder: '0',
    step: '1',
    suffix: 'sec',
  };
  const distanceInput: MetricInputConfig = {
    inputMode: 'decimal',
    key: 'distance',
    label: 'Distance',
    placeholder: '0',
    step: '0.1',
    suffix: distanceUnit,
  };

  switch (trackingType) {
    case 'weight_reps':
      return { inputs: [weightInput, repsInput], separator: '×' };
    case 'weight_seconds':
      return { inputs: [weightInput, secondsInput], separator: '×' };
    case 'bodyweight_reps':
    case 'reps_only':
      return { inputs: [repsInput], separator: null };
    case 'reps_seconds':
      return { inputs: [repsInput, secondsInput], separator: '×' };
    case 'seconds_only':
      return { inputs: [secondsInput], separator: null };
    case 'distance':
      return { inputs: [distanceInput], separator: null };
    case 'cardio':
      return { inputs: [secondsInput, distanceInput], separator: '+' };
    default:
      return { inputs: [weightInput, repsInput], separator: '×' };
  }
}

function shouldAttachFocusRef(inputKey: InputKey, trackingType: ExerciseTrackingType) {
  switch (trackingType) {
    case 'weight_reps':
      return inputKey === 'reps';
    case 'weight_seconds':
    case 'seconds_only':
    case 'cardio':
      return inputKey === 'seconds';
    case 'distance':
      return inputKey === 'distance';
    default:
      return inputKey === 'reps';
  }
}

function parseNumberInput(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function getInputValue(input: InputKey, values: Record<InputKey, number | null>) {
  return values[input] ?? null;
}

function exceedsLastPerformance(
  current: { distance: number | null; reps: number | null; seconds: number | null; weight: number | null },
  previous: SetRowProps['lastPerformance'],
  trackingType: ExerciseTrackingType,
) {
  if (!previous) {
    return false;
  }

  const currentReps = current.reps ?? 0;
  const currentSeconds = current.seconds ?? current.reps ?? 0;
  const previousReps = previous.reps;

  if (trackingType === 'seconds_only') {
    return currentSeconds > previousReps;
  }

  if (trackingType === 'weight_seconds') {
    const currentWeight = current.weight;
    const previousWeight = previous.weight;

    if (currentWeight == null || previousWeight == null) {
      return false;
    }

    return (
      currentWeight > previousWeight ||
      (currentWeight === previousWeight && currentSeconds > previousReps)
    );
  }

  const currentWeight = current.weight;
  const previousWeight = previous.weight;

  if (previousWeight !== null && currentWeight !== null) {
    return (
      currentWeight > previousWeight ||
      (currentWeight === previousWeight && currentReps > previous.reps)
    );
  }

  if (previousWeight === null && currentWeight !== null) {
    return true;
  }

  return currentReps > previous.reps;
}

function formatLastSet(
  lastPerformance: NonNullable<SetRowProps['lastPerformance']>,
  trackingType: ExerciseTrackingType,
) {
  const repsLabel = `${lastPerformance.reps}`;

  if (trackingType === 'seconds_only') {
    return `${repsLabel} sec`;
  }

  if (trackingType === 'weight_seconds') {
    if (lastPerformance.weight == null) {
      return `${repsLabel} sec`;
    }

    return `${formatWeight(lastPerformance.weight)}x${repsLabel} sec`;
  }

  if (lastPerformance.weight === null) {
    return repsLabel;
  }

  return `${formatWeight(lastPerformance.weight)}x${repsLabel}`;
}

function formatTargetLabel({
  distanceUnit,
  target,
  trackingType,
  weightUnit,
}: {
  distanceUnit: string;
  target: NonNullable<SetRowProps['target']>;
  trackingType: ExerciseTrackingType;
  weightUnit: WeightUnit;
}) {
  const repRange = formatTargetReps(target);

  switch (trackingType) {
    case 'weight_reps':
      return `Target: ${formatWeightWithUnit(target.weight, weightUnit)} x ${repRange}`;
    case 'weight_seconds':
      return `Target: ${formatWeightWithUnit(target.weight, weightUnit)} x ${repRange} sec`;
    case 'bodyweight_reps':
    case 'reps_only':
      return `Target: ${repRange}`;
    case 'reps_seconds':
      return `Target: ${repRange} x ${repRange} sec`;
    case 'seconds_only':
      return `Target: ${repRange} sec`;
    case 'distance':
      return `Target: ${repRange} ${distanceUnit}`;
    case 'cardio':
      return `Target: ${repRange} sec + ${repRange} ${distanceUnit}`;
    default:
      return `Target: ${formatWeightWithUnit(target.weight, weightUnit)} x ${repRange}`;
  }
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

import { forwardRef, useState } from 'react';
import type { ExerciseTrackingType, WeightUnit } from '@pulse/shared';

import { Input } from '@/components/ui/input';
import { useDebouncedCallback } from '@/lib/use-debounced-callback';
import { cn } from '@/lib/utils';

import { getDistanceUnit, isSetCompleteForTrackingType } from '../lib/tracking';

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
  onUpdate: (update: SetRowUpdate) => void;
  reps: number | null;
  seconds?: number | null;
  setNumber: number;
  trackingType?: ExerciseTrackingType;
  weight?: number | null;
  weightUnit?: WeightUnit;
};

type InputKey = 'distance' | 'reps' | 'seconds' | 'weight';

type MetricInputConfig = {
  ariaLabel: string;
  inputMode: 'decimal' | 'numeric';
  key: InputKey;
  placeholder: string;
  step: string;
  suffix?: string;
};

type InputValues = Record<InputKey, number | null>;

export const SetRow = forwardRef<HTMLInputElement, SetRowProps>(function SetRow(
  {
    completed,
    distance = null,
    onUpdate,
    reps,
    seconds = null,
    setNumber,
    trackingType = 'weight_reps',
    weight = null,
    weightUnit = 'lbs',
  },
  ref,
) {
  const { inputs, separator } = getMetricInputs(trackingType, weightUnit);
  const [localOverrides, setLocalOverrides] = useState<Partial<InputValues>>({});
  const resolvedValues = resolveInputValues(
    {
      distance,
      reps,
      seconds,
      weight,
    },
    localOverrides,
  );
  const debouncedOnUpdate = useDebouncedCallback((update: SetRowUpdate) => {
    onUpdate(update);
  });
  const localCompleted = completed || isSetCompleteForTrackingType(trackingType, resolvedValues);

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-xl border px-2.5 py-2 transition-colors',
        localCompleted ? 'border-emerald-500/25 bg-emerald-500/10' : 'border-border bg-background',
      )}
      data-slot="set-row"
    >
      <span className="shrink-0 text-xs font-semibold text-muted">{`Set ${setNumber}`}</span>

      <div
        className={cn(
          'grid min-w-0 flex-1 items-center gap-1.5',
          inputs.length === 1 ? 'grid-cols-1' : 'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]',
        )}
      >
        {inputs.map((input, index) => (
          <InputWithSeparator
            completed={localCompleted}
            input={input}
            key={input.key}
            onChange={(value) => {
              const nextValues: InputValues = {
                ...resolvedValues,
                [input.key]: value,
              };
              const nextCompleted = isSetCompleteForTrackingType(trackingType, nextValues);
              setLocalOverrides((current) => ({
                ...current,
                [input.key]: value,
              }));

              debouncedOnUpdate.run({
                ...nextValues,
                completed: nextCompleted,
              });
            }}
            onBlur={() => {
              debouncedOnUpdate.flush();
              setLocalOverrides({});
            }}
            ref={shouldAttachFocusRef(input.key, trackingType) ? ref : undefined}
            separator={index > 0 ? separator : null}
            setNumber={setNumber}
            value={getInputValue(input.key, resolvedValues)}
          />
        ))}
      </div>
    </div>
  );
});

const MetricInput = forwardRef<
  HTMLInputElement,
  {
    completed: boolean;
    input: MetricInputConfig;
    onBlur: () => void;
    onChange: (value: number | null) => void;
    setNumber: number;
    value: number | null;
  }
>(function MetricInput({ completed, input, onBlur, onChange, setNumber, value }, ref) {
  return (
    <div className="relative">
      <Input
        aria-label={`${input.ariaLabel} for set ${setNumber}`}
        className={cn(
          'h-9 rounded-lg border-border bg-card pr-8 text-sm',
          completed && 'border-emerald-500/20 bg-background/80 opacity-80',
        )}
        inputMode={input.inputMode}
        min={0}
        onBlur={onBlur}
        onChange={(event) => onChange(parseNumberInput(event.currentTarget.value))}
        placeholder={input.placeholder}
        ref={ref}
        step={input.step}
        type="number"
        value={value ?? ''}
      />
      {input.suffix ? (
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] font-semibold text-muted uppercase">
          {input.suffix}
        </span>
      ) : null}
    </div>
  );
});

const InputWithSeparator = forwardRef<
  HTMLInputElement,
  {
    completed: boolean;
    input: MetricInputConfig;
    onBlur: () => void;
    onChange: (value: number | null) => void;
    separator: string | null;
    setNumber: number;
    value: number | null;
  }
>(function InputWithSeparator(
  { completed, input, onBlur, onChange, separator, setNumber, value },
  ref,
) {
  return (
    <>
      {separator ? (
        <span className="flex items-center justify-center text-sm font-semibold text-muted">
          {separator}
        </span>
      ) : null}
      <MetricInput
        completed={completed}
        input={input}
        onBlur={onBlur}
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
    ariaLabel: 'Weight',
    inputMode: 'decimal',
    key: 'weight',
    placeholder: '--',
    step: '0.5',
    suffix: weightUnit,
  };
  const repsInput: MetricInputConfig = {
    ariaLabel: 'Reps',
    inputMode: 'numeric',
    key: 'reps',
    placeholder: '0',
    step: '1',
  };
  const secondsInput: MetricInputConfig = {
    ariaLabel: 'Seconds',
    inputMode: 'numeric',
    key: 'seconds',
    placeholder: '0',
    step: '1',
    suffix: 'sec',
  };
  const distanceInput: MetricInputConfig = {
    ariaLabel: 'Distance',
    inputMode: 'decimal',
    key: 'distance',
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

function resolveInputValues(
  serverValues: InputValues,
  localOverrides: Partial<InputValues>,
): InputValues {
  return {
    ...serverValues,
    ...localOverrides,
  };
}

export type { SetRowProps, SetRowUpdate };

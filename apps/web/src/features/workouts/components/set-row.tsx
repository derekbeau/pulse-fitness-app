import { forwardRef, useId, useState, type ReactNode } from 'react';
import type { ExerciseTrackingType, WeightUnit } from '@pulse/shared';

import { Input } from '@/components/ui/input';
import { useDebouncedCallback } from '@/lib/use-debounced-callback';
import { cn } from '@/lib/utils';

import { getDistanceUnit, isSetCompleteForTrackingType } from '../lib/tracking';
import { RirPicker } from './rir-picker';

type SetRowUpdate = {
  completed?: boolean;
  distance?: number | null;
  reps?: number | null;
  rpe?: number | null;
  rir?: number | null;
  seconds?: number | null;
  weight?: number | null;
  zone?: number | null;
};

type SetRowProps = {
  effortSlot?: ReactNode;
  completed: boolean;
  distance?: number | null;
  label?: string;
  onUpdate: (update: SetRowUpdate) => void;
  reps: number | null;
  rpe?: number | null;
  rir?: number | null;
  seconds?: number | null;
  setNumber: number;
  showRirControl?: boolean;
  targetDistance?: number | null;
  targetSeconds?: number | null;
  targetWeight?: number | null;
  targetWeightMax?: number | null;
  targetWeightMin?: number | null;
  trackingType?: ExerciseTrackingType;
  weight?: number | null;
  weightUnit?: WeightUnit;
  zone?: number | null;
};

type InputKey = 'distance' | 'reps' | 'rpe' | 'seconds' | 'weight' | 'zone';

type MetricInputConfig = {
  ariaLabel: string;
  inputMode: 'decimal' | 'numeric';
  key: InputKey;
  max?: number;
  min?: number;
  placeholder: string;
  step: string;
  suffix?: string;
};

type InputValues = Record<InputKey, number | null>;

const SET_VALUE_UPDATE_DEBOUNCE_MS = 700;

export const SetRow = forwardRef<HTMLInputElement, SetRowProps>(function SetRow(
  {
    completed,
    effortSlot,
    distance = null,
    label,
    onUpdate,
    reps,
    rpe = null,
    rir = null,
    seconds = null,
    setNumber,
    showRirControl = false,
    targetDistance = null,
    targetSeconds = null,
    targetWeight = null,
    targetWeightMax = null,
    targetWeightMin = null,
    trackingType = 'weight_reps',
    weight = null,
    weightUnit = 'lbs',
    zone = null,
  },
  ref,
) {
  const { inputs, separator } = getMetricInputs(trackingType, weightUnit);
  const [localOverrides, setLocalOverrides] = useState<Partial<InputValues>>({});
  const resolvedValues = resolveInputValues(
    {
      distance,
      reps,
      rpe,
      seconds,
      weight,
      zone,
    },
    localOverrides,
  );
  const debouncedOnUpdate = useDebouncedCallback((update: SetRowUpdate) => {
    onUpdate(update);
  }, SET_VALUE_UPDATE_DEBOUNCE_MS);
  const localCompleted = completed;
  const targetHint = formatTargetHint({
    targetDistance,
    targetSeconds,
    targetWeight,
    targetWeightMax,
    targetWeightMin,
    trackingType,
    weightUnit,
  });

  return (
    <div
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 rounded-xl border px-2.5 py-2 transition-colors lg:grid-cols-[auto_minmax(0,1fr)_auto]',
        localCompleted ? 'border-emerald-500/25 bg-emerald-500/10' : 'border-border bg-background',
      )}
      data-slot="set-row"
    >
      <div className="min-w-0 self-start lg:self-center">
        <span className="text-xs font-semibold text-muted">{label ?? `Set ${setNumber}`}</span>
        {targetHint ? <p className="break-words text-[10px] text-muted">{targetHint}</p> : null}
      </div>

      <div
        className={cn(
          'col-span-2 row-start-2 grid min-w-0 w-full items-center gap-1.5 lg:col-span-1 lg:col-start-2 lg:row-start-1',
          getInputGridClassName(inputs.length),
        )}
        data-slot="set-metrics"
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
              setLocalOverrides((current) => ({
                ...current,
                [input.key]: value,
              }));

              const autoCompleted = isSetCompleteForTrackingType(trackingType, nextValues);
              debouncedOnUpdate.run(buildSetRowUpdate(nextValues, input.key, autoCompleted));
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

      {effortSlot != null || showRirControl ? (
        <div className="col-start-2 row-start-1 justify-self-end lg:col-start-3">
          {effortSlot ?? (
            <RirPicker
              onChange={(nextRir) => onUpdate({ rir: nextRir, rpe: null })}
              setNumber={setNumber}
              trackingType={trackingType}
              value={rir}
            />
          )}
        </div>
      ) : null}
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
  const suffixId = useId();

  return (
    <div
      className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5"
      data-slot="metric-field"
    >
      <Input
        aria-describedby={input.suffix ? suffixId : undefined}
        aria-label={`${input.ariaLabel} for set ${setNumber}`}
        className={cn(
          'h-11 min-w-0 rounded-lg border-border bg-card px-2.5 text-base tabular-nums',
          completed && 'border-emerald-500/20 bg-background/80 opacity-80',
        )}
        data-slot="metric-input"
        inputMode={input.inputMode}
        max={input.max}
        min={input.min ?? 0}
        onBlur={onBlur}
        onChange={(event) => onChange(parseNumberInput(event.currentTarget.value))}
        placeholder={input.placeholder}
        ref={ref}
        step={input.step}
        type="number"
        value={value ?? ''}
      />
      {input.suffix ? (
        <span
          className="whitespace-nowrap text-[10px] font-semibold text-muted uppercase"
          data-slot="metric-unit"
          id={suffixId}
        >
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
        <span className="hidden items-center justify-center text-sm font-semibold text-muted lg:flex">
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
    placeholder: '--',
    step: '1',
    suffix: 'reps',
  };
  const secondsInput: MetricInputConfig = {
    ariaLabel: trackingType === 'duration' ? 'Duration' : 'Seconds',
    inputMode: 'numeric',
    key: 'seconds',
    max: 21_600,
    placeholder: '--',
    step: '1',
    suffix: 'sec',
  };
  const rpeInput: MetricInputConfig = {
    ariaLabel: 'RPE',
    inputMode: 'numeric',
    key: 'rpe',
    max: 10,
    min: 1,
    placeholder: '--',
    step: '1',
    suffix: 'rpe',
  };
  const zoneInput: MetricInputConfig = {
    ariaLabel: 'Zone',
    inputMode: 'numeric',
    key: 'zone',
    max: 5,
    min: 1,
    placeholder: '--',
    step: '1',
    suffix: 'zone',
  };
  const distanceInput: MetricInputConfig = {
    ariaLabel: 'Distance',
    inputMode: 'decimal',
    key: 'distance',
    placeholder: '--',
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
    case 'duration':
      return { inputs: [secondsInput, rpeInput, zoneInput], separator: null };
    case 'distance':
      return { inputs: [distanceInput], separator: null };
    case 'cardio':
      return { inputs: [secondsInput, distanceInput], separator: '+' };
    default:
      return { inputs: [weightInput, repsInput], separator: '×' };
  }
}

function formatTargetHint({
  targetDistance,
  targetSeconds,
  targetWeight,
  targetWeightMax,
  targetWeightMin,
  trackingType,
  weightUnit,
}: {
  targetDistance: number | null;
  targetSeconds: number | null;
  targetWeight: number | null;
  targetWeightMax: number | null;
  targetWeightMin: number | null;
  trackingType: ExerciseTrackingType;
  weightUnit: WeightUnit;
}) {
  const weightRange =
    targetWeightMin !== null && targetWeightMax !== null
      ? `${targetWeightMin}-${targetWeightMax} ${weightUnit}`
      : null;
  const weightValue =
    targetWeight !== null ? `${targetWeight} ${weightUnit}` : (weightRange ?? null);
  const secondsValue = targetSeconds !== null ? `${targetSeconds} sec` : null;
  const distanceValue =
    targetDistance !== null ? `${targetDistance} ${getDistanceUnit(weightUnit)}` : null;

  switch (trackingType) {
    case 'weight_reps':
      return weightValue ? `Target: ${weightValue}` : null;
    case 'seconds_only':
    case 'duration':
      return secondsValue ? `Target: ${secondsValue}` : null;
    case 'weight_seconds':
      if (weightValue && secondsValue) {
        return `Target: ${weightValue} × ${secondsValue}`;
      }
      if (weightValue) {
        return `Target: ${weightValue}`;
      }
      return secondsValue ? `Target: ${secondsValue}` : null;
    case 'distance':
      return distanceValue ? `Target: ${distanceValue}` : null;
    case 'reps_seconds':
      return secondsValue ? `Target: ${secondsValue}` : null;
    case 'cardio':
      if (secondsValue && distanceValue) {
        return `Target: ${secondsValue} + ${distanceValue}`;
      }
      if (secondsValue) {
        return `Target: ${secondsValue}`;
      }
      return distanceValue ? `Target: ${distanceValue}` : null;
    default:
      return null;
  }
}

function shouldAttachFocusRef(inputKey: InputKey, trackingType: ExerciseTrackingType) {
  switch (trackingType) {
    case 'weight_reps':
      return inputKey === 'reps';
    case 'weight_seconds':
    case 'seconds_only':
    case 'duration':
    case 'cardio':
      return inputKey === 'seconds';
    case 'distance':
      return inputKey === 'distance';
    default:
      return inputKey === 'reps';
  }
}

function getInputGridClassName(inputCount: number) {
  if (inputCount === 1) {
    return 'grid-cols-1';
  }

  if (inputCount === 2) {
    return 'grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]';
  }

  return 'grid-cols-1';
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

function buildSetRowUpdate(
  values: InputValues,
  changedInput: InputKey,
  completed: boolean,
): SetRowUpdate {
  return {
    completed,
    distance: values.distance,
    reps: values.reps,
    ...(changedInput === 'rpe' || values.rpe !== null ? { rpe: values.rpe } : {}),
    seconds: values.seconds,
    weight: values.weight,
    ...(changedInput === 'zone' || values.zone !== null ? { zone: values.zone } : {}),
  };
}

export type { SetRowProps, SetRowUpdate };

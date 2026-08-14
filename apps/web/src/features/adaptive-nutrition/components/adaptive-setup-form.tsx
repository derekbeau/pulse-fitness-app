import { zodResolver } from '@hookform/resolvers/zod';
import {
  convertWeightFromKg,
  convertWeightToKg,
  type AdaptiveProgramMutation,
  type NutritionTarget,
} from '@pulse/shared';
import { Calculator, Scale, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLatestWeight } from '@/features/weight/api/weight';
import { useWeightUnit } from '@/hooks/use-weight-unit';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';

import { usePutAdaptiveNutritionProgram } from '../api/adaptive-nutrition';
import { formatAdaptiveDate } from '../lib/format-adaptive-nutrition';

const requiredNumber = (label: string, minimum: number, maximum: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .refine((value) => Number.isFinite(Number(value)), `${label} must be a number`)
    .refine(
      (value) => Number(value) >= minimum && Number(value) <= maximum,
      `${label} must be between ${minimum} and ${maximum}`,
    );

const optionalNumber = (label: string, minimum: number, maximum: number) =>
  z
    .string()
    .trim()
    .refine(
      (value) =>
        value === '' ||
        (Number.isFinite(Number(value)) && Number(value) >= minimum && Number(value) <= maximum),
      `${label} must be between ${minimum} and ${maximum}`,
    );

const setupFormSchema = z
  .object({
    activityLevel: z.enum(['sedentary', 'low_active', 'active', 'very_active']),
    birthDate: z.string(),
    calorieFloor: optionalNumber('Calorie floor', 1200, 8000),
    currentWeight: z.string(),
    currentWeightSource: z.enum(['saved', 'enter']),
    fatAllocationPct: requiredNumber('Fat allocation', 20, 40),
    goalRate: requiredNumber('Goal rate', 0, 1),
    goalType: z.enum(['lose', 'maintain', 'gain']),
    heightCm: z.string(),
    heightFeet: z.string(),
    heightInches: z.string(),
    heightUnit: z.enum(['metric', 'imperial']),
    manualTdee: z.string(),
    proteinGrams: requiredNumber('Protein', 40, 400),
    rmrEquation: z.enum(['mifflin_male', 'mifflin_female', 'manual_tdee']),
    targetWeight: z.string(),
    timeZone: z.string().trim().min(1, 'Time zone is required'),
  })
  .superRefine((values, context) => {
    const isManual = values.rmrEquation === 'manual_tdee';

    if (!isManual) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(values.birthDate)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Birth date is required',
          path: ['birthDate'],
        });
      } else {
        const age = calculateAge(values.birthDate, values.timeZone);
        if (age < 18 || age > 100) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Age must be between 18 and 100',
            path: ['birthDate'],
          });
        }
      }

      const heightCm = getHeightCm(values);
      if (heightCm === null || heightCm < 100 || heightCm > 250) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Height must be between 100 and 250 cm',
          path: [values.heightUnit === 'metric' ? 'heightCm' : 'heightFeet'],
        });
      }
    }

    if (isManual && !isNumberInRange(values.manualTdee, 800, 8000)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Starting TDEE must be between 800 and 8000 kcal',
        path: ['manualTdee'],
      });
    }

    if (values.currentWeightSource === 'enter' && !isNumberInRange(values.currentWeight, 1, 1500)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter a current weight',
        path: ['currentWeight'],
      });
    }

    if (values.goalType !== 'maintain' && !isNumberInRange(values.targetWeight, 1, 1500)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Target weight is required for this goal',
        path: ['targetWeight'],
      });
    }

    if (values.goalType === 'maintain' && Number(values.goalRate) !== 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Maintenance uses a 0% weekly rate',
        path: ['goalRate'],
      });
    }
    if (values.goalType === 'lose' && !isNumberInRange(values.goalRate, 0.1, 1)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Loss rate must be between 0.1% and 1.0%',
        path: ['goalRate'],
      });
    }
    if (values.goalType === 'gain' && !isNumberInRange(values.goalRate, 0.1, 0.5)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Gain rate must be between 0.1% and 0.5%',
        path: ['goalRate'],
      });
    }
  });

type SetupFormValues = z.infer<typeof setupFormSchema>;

type AdaptiveSetupFormProps = {
  currentTarget: NutritionTarget | null;
};

export function AdaptiveSetupForm({ currentTarget }: AdaptiveSetupFormProps) {
  const latestWeightQuery = useLatestWeight();
  const programMutation = usePutAdaptiveNutritionProgram();
  const { weightUnit } = useWeightUnit();
  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Detroit',
    [],
  );
  const latestWeight = latestWeightQuery.data;
  const initialHasRecentSavedWeight = latestWeight
    ? getCalendarAgeDays(latestWeight.date, timeZone) <= 7
    : false;
  const defaultWeightKg = latestWeight
    ? convertWeightToKg(latestWeight.weight, latestWeight.unit)
    : null;
  const defaultDisplayWeight =
    defaultWeightKg === null ? '' : String(convertWeightFromKg(defaultWeightKg, weightUnit));
  const defaultProtein =
    currentTarget?.protein ??
    (defaultWeightKg == null ? 150 : Math.round((defaultWeightKg * 1.8) / 5) * 5);

  const form = useForm<SetupFormValues>({
    defaultValues: {
      activityLevel: 'low_active',
      birthDate: '',
      calorieFloor: '',
      currentWeight: defaultDisplayWeight,
      currentWeightSource: initialHasRecentSavedWeight ? 'saved' : 'enter',
      fatAllocationPct: '30',
      goalRate: '0.5',
      goalType: 'lose',
      heightCm: '',
      heightFeet: '5',
      heightInches: '10',
      heightUnit: 'imperial',
      manualTdee: '',
      proteinGrams: String(defaultProtein),
      rmrEquation: 'mifflin_male',
      targetWeight: '',
      timeZone,
    },
    mode: 'onBlur',
    resolver: zodResolver(setupFormSchema),
  });

  const rmrEquation = form.watch('rmrEquation');
  const goalType = form.watch('goalType');
  const heightUnit = form.watch('heightUnit');
  const currentWeightSource = form.watch('currentWeightSource');
  const selectedTimeZone = form.watch('timeZone');
  const hasRecentSavedWeight = latestWeight
    ? getCalendarAgeDays(latestWeight.date, selectedTimeZone) <= 7
    : false;

  useEffect(() => {
    if (!latestWeight || defaultWeightKg === null) return;
    if (!form.getFieldState('currentWeight').isDirty) {
      form.setValue('currentWeight', String(convertWeightFromKg(defaultWeightKg, weightUnit)));
    }
    if (!form.getFieldState('currentWeightSource').isDirty) {
      form.setValue('currentWeightSource', hasRecentSavedWeight ? 'saved' : 'enter');
    }
    if (!currentTarget && !form.getFieldState('proteinGrams').isDirty) {
      form.setValue('proteinGrams', String(Math.round((defaultWeightKg * 1.8) / 5) * 5));
    }
  }, [currentTarget, defaultWeightKg, form, hasRecentSavedWeight, latestWeight, weightUnit]);

  const onSubmit = async (values: SetupFormValues) => {
    if (values.currentWeightSource === 'saved' && !hasRecentSavedWeight) {
      form.setError('currentWeightSource', {
        message: 'Saved weight must be no more than seven days old',
        type: 'manual',
      });
      return;
    }

    const currentWeightKg =
      values.currentWeightSource === 'enter'
        ? convertWeightToKg(Number(values.currentWeight), weightUnit)
        : latestWeight
          ? convertWeightToKg(latestWeight.weight, latestWeight.unit)
          : Number.NaN;
    const targetWeightKg = convertWeightToKg(Number(values.targetWeight), weightUnit);
    if (
      values.goalType === 'lose' &&
      Number.isFinite(currentWeightKg) &&
      targetWeightKg >= currentWeightKg
    ) {
      form.setError('targetWeight', {
        message: 'Loss target must be below your current weight',
        type: 'manual',
      });
      return;
    }
    if (
      values.goalType === 'gain' &&
      Number.isFinite(currentWeightKg) &&
      targetWeightKg <= currentWeightKg
    ) {
      form.setError('targetWeight', {
        message: 'Gain target must be above your current weight',
        type: 'manual',
      });
      return;
    }

    const payload = toProgramMutation(values, weightUnit);
    try {
      await programMutation.mutateAsync(payload);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : 'Unable to create the coaching program. Please review the fields and try again.';
      form.setError('root', { message, type: 'server' });
    }
  };

  return (
    <Card className="gap-5 border-primary/20 py-5">
      <CardHeader className="gap-3 px-5 sm:px-6">
        <div className="flex items-center gap-2 text-primary">
          <Calculator aria-hidden="true" className="size-4" />
          <p className="text-xs font-semibold uppercase tracking-[0.18em]">Starting estimate</p>
        </div>
        <CardTitle className="text-xl sm:text-2xl">
          <h2>Set up Adaptive TDEE</h2>
        </CardTitle>
        <CardDescription className="max-w-3xl leading-relaxed">
          Start with a transparent RMR and activity estimate or enter your own starting expenditure.
          Pulse personalizes it only after enough complete nutrition and weight data exist.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5 sm:px-6">
        <form className="space-y-6" noValidate onSubmit={form.handleSubmit(onSubmit)}>
          <fieldset className="space-y-3">
            <legend className="text-base font-semibold">Body and baseline</legend>
            <div className="grid gap-4 md:grid-cols-2">
              <FormSelect
                error={form.formState.errors.rmrEquation?.message}
                id="coach-rmr-equation"
                label="Starting equation"
                registration={form.register('rmrEquation')}
              >
                <option value="mifflin_male">Mifflin-St Jeor · male coefficient</option>
                <option value="mifflin_female">Mifflin-St Jeor · female coefficient</option>
                <option value="manual_tdee">Enter starting TDEE manually</option>
              </FormSelect>
              <FormInput
                error={form.formState.errors.timeZone?.message}
                id="coach-time-zone"
                label="Time zone"
                registration={form.register('timeZone')}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Equation choice selects the published Mifflin coefficient. It does not measure or
              diagnose metabolism.
            </p>

            {rmrEquation !== 'manual_tdee' ? (
              <div className="grid gap-4 md:grid-cols-2">
                <FormInput
                  error={form.formState.errors.birthDate?.message}
                  id="coach-birth-date"
                  label="Birth date"
                  registration={form.register('birthDate')}
                  type="date"
                />
                <FormSelect
                  error={form.formState.errors.activityLevel?.message}
                  id="coach-activity-level"
                  label="Starting activity level"
                  registration={form.register('activityLevel')}
                >
                  <option value="sedentary">Mostly seated · 1.20</option>
                  <option value="low_active">Light movement or several workouts · 1.375</option>
                  <option value="active">Consistently active · 1.55</option>
                  <option value="very_active">Very active or physical work · 1.725</option>
                </FormSelect>
                <FormInput
                  error={form.formState.errors.manualTdee?.message}
                  id="coach-equation-tdee-override"
                  inputMode="numeric"
                  label="Starting TDEE override (optional)"
                  registration={form.register('manualTdee')}
                  type="number"
                />
                <div className="space-y-2 md:col-span-2">
                  <Label>Height display</Label>
                  <div className="grid grid-cols-2 gap-2" role="group" aria-label="Height unit">
                    <UnitButton
                      active={heightUnit === 'imperial'}
                      label="Feet and inches"
                      onClick={() =>
                        form.setValue('heightUnit', 'imperial', { shouldValidate: true })
                      }
                    />
                    <UnitButton
                      active={heightUnit === 'metric'}
                      label="Centimeters"
                      onClick={() =>
                        form.setValue('heightUnit', 'metric', { shouldValidate: true })
                      }
                    />
                  </div>
                  {heightUnit === 'metric' ? (
                    <FormInput
                      error={form.formState.errors.heightCm?.message}
                      id="coach-height-cm"
                      inputMode="decimal"
                      label="Height (cm)"
                      registration={form.register('heightCm')}
                      type="number"
                    />
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <FormInput
                        error={form.formState.errors.heightFeet?.message}
                        id="coach-height-feet"
                        inputMode="numeric"
                        label="Feet"
                        registration={form.register('heightFeet')}
                        type="number"
                      />
                      <FormInput
                        error={form.formState.errors.heightInches?.message}
                        id="coach-height-inches"
                        inputMode="decimal"
                        label="Inches"
                        registration={form.register('heightInches')}
                        type="number"
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <FormInput
                error={form.formState.errors.manualTdee?.message}
                id="coach-manual-tdee"
                inputMode="numeric"
                label="Starting TDEE (kcal/day)"
                registration={form.register('manualTdee')}
                type="number"
              />
            )}
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="flex items-center gap-2 text-base font-semibold">
              <Scale aria-hidden="true" className="size-4 text-primary" /> Current weight
            </legend>
            <div
              className="grid gap-2 sm:grid-cols-2"
              role="group"
              aria-label="Current weight source"
            >
              <UnitButton
                active={currentWeightSource === 'saved'}
                disabled={!hasRecentSavedWeight}
                label={
                  latestWeight
                    ? `Use ${latestWeight.weight} ${latestWeight.unit} from ${formatAdaptiveDate(latestWeight.date)}`
                    : 'Use recent saved weight'
                }
                onClick={() =>
                  form.setValue('currentWeightSource', 'saved', { shouldValidate: true })
                }
              />
              <UnitButton
                active={currentWeightSource === 'enter'}
                label="Enter a current weight"
                onClick={() =>
                  form.setValue('currentWeightSource', 'enter', { shouldValidate: true })
                }
              />
            </div>
            {latestWeight && !hasRecentSavedWeight ? (
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Your saved weigh-in is more than seven days old. Enter a current weight to continue.
              </p>
            ) : null}
            {form.formState.errors.currentWeightSource ? (
              <p className="text-sm text-destructive" role="alert">
                {form.formState.errors.currentWeightSource.message}
              </p>
            ) : null}
            {currentWeightSource === 'enter' ? (
              <FormInput
                error={form.formState.errors.currentWeight?.message}
                id="coach-current-weight"
                inputMode="decimal"
                label={`Current weight (${weightUnit})`}
                registration={form.register('currentWeight')}
                type="number"
              />
            ) : null}
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-base font-semibold">Goal and macros</legend>
            <div className="grid gap-4 md:grid-cols-2">
              <FormSelect
                error={form.formState.errors.goalType?.message}
                id="coach-goal-type"
                label="Goal"
                registration={form.register('goalType', {
                  onChange: (event) => {
                    const nextGoal = event.currentTarget.value as SetupFormValues['goalType'];
                    form.setValue(
                      'goalRate',
                      nextGoal === 'maintain' ? '0' : nextGoal === 'gain' ? '0.25' : '0.5',
                      { shouldValidate: true },
                    );
                  },
                })}
              >
                <option value="lose">Lose weight</option>
                <option value="maintain">Maintain weight</option>
                <option value="gain">Gain weight</option>
              </FormSelect>
              {goalType !== 'maintain' ? (
                <FormInput
                  error={form.formState.errors.targetWeight?.message}
                  id="coach-target-weight"
                  inputMode="decimal"
                  label={`Target weight (${weightUnit})`}
                  registration={form.register('targetWeight')}
                  type="number"
                />
              ) : null}
              <FormInput
                disabled={goalType === 'maintain'}
                error={form.formState.errors.goalRate?.message}
                id="coach-goal-rate"
                inputMode="decimal"
                label="Goal rate (% body weight/week)"
                registration={form.register('goalRate')}
                step="0.05"
                type="number"
              />
              <FormInput
                error={form.formState.errors.proteinGrams?.message}
                id="coach-protein"
                inputMode="numeric"
                label="Protein (g/day)"
                registration={form.register('proteinGrams')}
                step="5"
                type="number"
              />
              <FormInput
                error={form.formState.errors.fatAllocationPct?.message}
                id="coach-fat-allocation"
                inputMode="decimal"
                label="Fat allocation (%)"
                registration={form.register('fatAllocationPct')}
                type="number"
              />
              <FormInput
                error={form.formState.errors.calorieFloor?.message}
                id="coach-calorie-floor"
                inputMode="numeric"
                label="Calorie floor (optional)"
                registration={form.register('calorieFloor')}
                type="number"
              />
            </div>
          </fieldset>

          <div className="rounded-xl border border-primary/20 bg-primary/6 p-4">
            <div className="flex gap-3">
              <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
              <p className="text-sm leading-relaxed text-muted-foreground">
                Setup creates a pending baseline preview. Your current nutrition targets do not
                change until you review and select{' '}
                <strong className="text-foreground">Use these targets</strong>.
              </p>
            </div>
          </div>

          {form.formState.errors.root ? (
            <p className="text-sm text-destructive" role="alert">
              {form.formState.errors.root.message}
            </p>
          ) : null}

          <Button className="w-full sm:w-auto" disabled={programMutation.isPending} type="submit">
            {programMutation.isPending ? 'Creating preview…' : 'Preview starting targets'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

type FormInputProps = {
  disabled?: boolean;
  error?: string;
  id: string;
  inputMode?: 'decimal' | 'numeric';
  label: string;
  registration: ReturnType<ReturnType<typeof useForm<SetupFormValues>>['register']>;
  step?: string;
  type?: string;
};

function FormInput({
  disabled,
  error,
  id,
  inputMode,
  label,
  registration,
  step,
  type = 'text',
}: FormInputProps) {
  const errorId = `${id}-error`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        aria-describedby={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
        disabled={disabled}
        id={id}
        inputMode={inputMode}
        step={step}
        type={type}
        {...registration}
      />
      {error ? (
        <p className="text-sm text-destructive" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function FormSelect({
  children,
  error,
  id,
  label,
  registration,
}: {
  children: React.ReactNode;
  error?: string;
  id: string;
  label: string;
  registration: ReturnType<ReturnType<typeof useForm<SetupFormValues>>['register']>;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        aria-describedby={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
        className="min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        id={id}
        {...registration}
      >
        {children}
      </select>
      {error ? (
        <p className="text-sm text-destructive" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function UnitButton({
  active,
  disabled = false,
  label,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      aria-pressed={active}
      className={cn('h-auto min-h-11 whitespace-normal', active && 'border-primary bg-primary/10')}
      disabled={disabled}
      onClick={onClick}
      type="button"
      variant="outline"
    >
      {label}
    </Button>
  );
}

function toProgramMutation(
  values: SetupFormValues,
  weightUnit: 'lbs' | 'kg',
): AdaptiveProgramMutation {
  const isManual = values.rmrEquation === 'manual_tdee';
  const targetWeightKg =
    values.goalType === 'maintain'
      ? null
      : convertWeightToKg(Number(values.targetWeight), weightUnit);

  return {
    activityLevel: isManual ? null : values.activityLevel,
    birthDate: isManual ? null : values.birthDate,
    currentWeight:
      values.currentWeightSource === 'enter'
        ? { unit: weightUnit, weight: Number(values.currentWeight) }
        : null,
    fatAllocationPct: Number(values.fatAllocationPct),
    goalRatePctPerWeek:
      values.goalType === 'maintain'
        ? 0
        : Number(values.goalRate) * (values.goalType === 'lose' ? -1 : 1),
    goalType: values.goalType,
    heightCm: isManual ? null : getHeightCm(values),
    manualBaselineTdeeKcal: values.manualTdee === '' ? null : Number(values.manualTdee),
    proteinGrams: Math.round(Number(values.proteinGrams)),
    rebaseline: false,
    rmrEquation: values.rmrEquation,
    status: 'active',
    supersedePending: false,
    targetWeightKg,
    timeZone: values.timeZone,
    userCalorieFloorKcal:
      values.calorieFloor === '' ? undefined : Math.round(Number(values.calorieFloor)),
  };
}

function getHeightCm(values: SetupFormValues) {
  if (values.heightUnit === 'metric') {
    return isNumberInRange(values.heightCm, 1, 500) ? Number(values.heightCm) : null;
  }

  if (
    !isNumberInRange(values.heightFeet, 1, 9) ||
    !isNumberInRange(values.heightInches, 0, 11.99)
  ) {
    return null;
  }

  return (Number(values.heightFeet) * 12 + Number(values.heightInches)) * 2.54;
}

function isNumberInRange(value: string, minimum: number, maximum: number) {
  const number = Number(value);
  return value.trim() !== '' && Number.isFinite(number) && number >= minimum && number <= maximum;
}

function calculateAge(birthDate: string, timeZone: string) {
  const [year, month, day] = birthDate.split('-').map(Number);
  const [todayYear, todayMonth, todayDay] = getDateKeyInTimeZone(timeZone).split('-').map(Number);
  let age = todayYear - year;
  if (todayMonth < month || (todayMonth === month && todayDay < day)) {
    age -= 1;
  }
  return age;
}

function getCalendarAgeDays(date: string, timeZone: string) {
  const [year, month, day] = date.split('-').map(Number);
  const entryUtc = Date.UTC(year, month - 1, day);
  const [todayYear, todayMonth, todayDay] = getDateKeyInTimeZone(timeZone).split('-').map(Number);
  const todayUtc = Date.UTC(todayYear, todayMonth - 1, todayDay);
  return Math.floor((todayUtc - entryUtc) / 86_400_000);
}

function getDateKeyInTimeZone(timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      month: '2-digit',
      timeZone,
      year: 'numeric',
    }).formatToParts(new Date());
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((candidate) => candidate.type === type)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  } catch {
    const today = new Date();
    return [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-');
  }
}

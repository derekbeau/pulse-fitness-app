import { zodResolver } from '@hookform/resolvers/zod';
import {
  ADAPTIVE_SETUP_FAT_PREFERENCES,
  ADAPTIVE_SETUP_GOAL_RATE_RULES,
  AdaptiveTdeeConfigurationError,
  calculateAdaptiveProteinPresets,
  calculateAdaptiveSetupProjection,
  calculateBaselineTdee,
  calculateSystemCalorieFloor,
  convertWeightFromKg,
  convertWeightToKg,
  getAdaptiveSetupLocalDate,
  matchAdaptiveProteinPreset,
  type AdaptiveFatPreference,
  type AdaptiveProgramMutation,
  type AdaptiveProteinPreset,
  type AdaptiveSetupProjection,
  type NutritionTarget,
} from '@pulse/shared';
import { Calculator, ChevronDown, Scale, ShieldCheck, Target, UtensilsCrossed } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
import {
  AdaptiveSetupChoiceGroup,
  RecommendedRangeRail,
  type AdaptiveSetupChoice,
} from './adaptive-setup-choice-group';
import { AdaptiveSetupProjectionCard } from './adaptive-setup-projection-card';

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
    (defaultWeightKg == null ? 150 : calculateAdaptiveProteinPresets(defaultWeightKg).recommended);
  const initialProteinMode =
    currentTarget && defaultWeightKg
      ? matchAdaptiveProteinPreset(defaultWeightKg, currentTarget.protein)
      : currentTarget
        ? 'custom'
        : 'recommended';
  const [rateMode, setRateMode] = useState('0.5');
  const [proteinMode, setProteinMode] = useState<AdaptiveProteinPreset>(initialProteinMode);
  const [fatMode, setFatMode] = useState<AdaptiveFatPreference>('balanced');

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

  const values = form.watch();
  const hasRecentSavedWeight = latestWeight
    ? getCalendarAgeDays(latestWeight.date, values.timeZone) <= 7
    : false;
  const currentWeightKg = resolveCurrentWeightKg(
    values,
    latestWeight,
    hasRecentSavedWeight,
    weightUnit,
  );

  useEffect(() => {
    if (!latestWeight || defaultWeightKg === null) return;
    if (!form.getFieldState('currentWeight').isDirty) {
      form.setValue('currentWeight', String(convertWeightFromKg(defaultWeightKg, weightUnit)));
    }
    if (!form.getFieldState('currentWeightSource').isDirty) {
      form.setValue('currentWeightSource', hasRecentSavedWeight ? 'saved' : 'enter');
    }
  }, [defaultWeightKg, form, hasRecentSavedWeight, latestWeight, weightUnit]);

  useEffect(() => {
    if (currentWeightKg === null || form.getFieldState('proteinGrams').isDirty) return;
    if (currentTarget) {
      form.setValue('proteinGrams', String(currentTarget.protein));
      setProteinMode(matchAdaptiveProteinPreset(currentWeightKg, currentTarget.protein));
      return;
    }
    if (proteinMode !== 'custom') {
      const presets = calculateAdaptiveProteinPresets(currentWeightKg);
      form.setValue('proteinGrams', String(presets[proteinMode]));
    }
  }, [currentTarget, currentWeightKg, form, proteinMode]);

  useEffect(() => {
    if (currentWeightKg === null || proteinMode === 'custom') return;
    const presets = calculateAdaptiveProteinPresets(currentWeightKg);
    form.setValue('proteinGrams', String(presets[proteinMode]), { shouldValidate: true });
  }, [currentWeightKg, form, proteinMode]);

  const projectionState = useMemo(
    () =>
      buildLiveProjection({
        hasRecentSavedWeight,
        latestWeight,
        values,
        weightUnit,
      }),
    [hasRecentSavedWeight, latestWeight, values, weightUnit],
  );
  const sourceLabel =
    values.currentWeightSource === 'saved' && latestWeight
      ? `saved weigh-in from ${formatAdaptiveDate(latestWeight.date)}`
      : 'entered for this setup';

  const onSubmit = async (submittedValues: SetupFormValues) => {
    if (submittedValues.currentWeightSource === 'saved' && !hasRecentSavedWeight) {
      form.setError('currentWeightSource', {
        message: 'Saved weight must be no more than seven days old',
        type: 'manual',
      });
      return;
    }

    const selectedWeightKg = resolveCurrentWeightKg(
      submittedValues,
      latestWeight,
      hasRecentSavedWeight,
      weightUnit,
    );
    const targetWeightKg = convertWeightToKg(Number(submittedValues.targetWeight), weightUnit);
    if (
      submittedValues.goalType === 'lose' &&
      selectedWeightKg !== null &&
      targetWeightKg >= selectedWeightKg
    ) {
      form.setError('targetWeight', {
        message: 'Loss target must be below your current weight',
        type: 'manual',
      });
      return;
    }
    if (
      submittedValues.goalType === 'gain' &&
      selectedWeightKg !== null &&
      targetWeightKg <= selectedWeightKg
    ) {
      form.setError('targetWeight', {
        message: 'Gain target must be above your current weight',
        type: 'manual',
      });
      return;
    }
    if (projectionState.projection === null) {
      form.setError('root', {
        message: projectionState.message,
        type: 'manual',
      });
      return;
    }

    const payload = toProgramMutation(submittedValues, weightUnit);
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

  const goalRateRule =
    values.goalType === 'maintain' ? null : ADAPTIVE_SETUP_GOAL_RATE_RULES[values.goalType];
  const proteinPresets =
    currentWeightKg === null ? null : calculateAdaptiveProteinPresets(currentWeightKg);

  return (
    <Card className="gap-5 border-primary/20 py-5">
      <CardHeader className="gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-2 text-primary">
          <Calculator aria-hidden="true" className="size-4" />
          <p className="text-xs font-semibold uppercase tracking-[0.18em]">Starting estimate</p>
        </div>
        <CardTitle className="text-xl sm:text-2xl">
          <h2>Set up Adaptive TDEE</h2>
        </CardTitle>
        <CardDescription className="max-w-3xl leading-relaxed">
          Build a starting plan you understand. Every choice updates the projection here first;
          Pulse learns and adapts only after you review future check-ins.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 sm:px-6">
        <form className="space-y-6" noValidate onSubmit={form.handleSubmit(onSubmit)}>
          <input type="hidden" {...form.register('goalType')} />
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.12fr)_minmax(22rem,0.88fr)]">
            <div className="min-w-0 space-y-8">
              <fieldset className="space-y-4">
                <SectionHeading
                  description="This anchors the first estimate. Adaptive TDEE will replace guesswork with your logged data over time."
                  icon={<Calculator aria-hidden="true" />}
                  title="1. Estimate your baseline"
                />
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

                {values.rmrEquation !== 'manual_tdee' ? (
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
                          active={values.heightUnit === 'imperial'}
                          label="Feet and inches"
                          onClick={() =>
                            form.setValue('heightUnit', 'imperial', { shouldValidate: true })
                          }
                        />
                        <UnitButton
                          active={values.heightUnit === 'metric'}
                          label="Centimeters"
                          onClick={() =>
                            form.setValue('heightUnit', 'metric', { shouldValidate: true })
                          }
                        />
                      </div>
                      {values.heightUnit === 'metric' ? (
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

              <fieldset className="space-y-4 border-t pt-8">
                <SectionHeading
                  description="Your selected starting weight drives rate, timeline, and protein guidance."
                  icon={<Scale aria-hidden="true" />}
                  title="2. Choose your starting weight"
                />
                <div
                  className="grid gap-2 sm:grid-cols-2"
                  role="group"
                  aria-label="Current weight source"
                >
                  <UnitButton
                    active={values.currentWeightSource === 'saved'}
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
                    active={values.currentWeightSource === 'enter'}
                    label="Enter a current weight"
                    onClick={() =>
                      form.setValue('currentWeightSource', 'enter', { shouldValidate: true })
                    }
                  />
                </div>
                {latestWeight && !hasRecentSavedWeight ? (
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Your saved weigh-in is more than seven days old. Enter a current weight to
                    continue.
                  </p>
                ) : null}
                {form.formState.errors.currentWeightSource ? (
                  <p className="text-sm text-destructive" role="alert">
                    {form.formState.errors.currentWeightSource.message}
                  </p>
                ) : null}
                {values.currentWeightSource === 'enter' ? (
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

              <fieldset className="space-y-4 border-t pt-8">
                <SectionHeading
                  description="Pulse recommends a sustainable default and translates it into a real-world pace."
                  icon={<Target aria-hidden="true" />}
                  title="3. Set your goal and pace"
                />
                <AdaptiveSetupChoiceGroup
                  choices={GOAL_CHOICES}
                  label="Goal direction"
                  onValueChange={(nextValue) => {
                    const nextGoal = nextValue as SetupFormValues['goalType'];
                    const nextRate =
                      nextGoal === 'maintain'
                        ? 0
                        : ADAPTIVE_SETUP_GOAL_RATE_RULES[nextGoal].defaultPct;
                    form.setValue('goalType', nextGoal, { shouldValidate: true });
                    form.setValue('goalRate', String(nextRate), { shouldValidate: true });
                    setRateMode(String(nextRate));
                  }}
                  value={values.goalType}
                />
                {values.goalType !== 'maintain' ? (
                  <FormInput
                    error={form.formState.errors.targetWeight?.message}
                    id="coach-target-weight"
                    inputMode="decimal"
                    label={`Target weight (${weightUnit})`}
                    registration={form.register('targetWeight')}
                    type="number"
                  />
                ) : (
                  <div className="rounded-xl border bg-secondary/35 p-4 text-sm leading-relaxed text-muted-foreground">
                    Maintenance centers the plan on your starting weight and has no finish date.
                  </div>
                )}

                {goalRateRule ? (
                  <div className="space-y-4">
                    <div>
                      <Label className="text-base">Weekly goal rate</Label>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Select a coached pace or enter a custom value inside the existing allowed
                        range.
                      </p>
                    </div>
                    <AdaptiveSetupChoiceGroup
                      choices={rateChoices(values.goalType as 'lose' | 'gain')}
                      label="Weekly goal rate"
                      onValueChange={(nextValue) => {
                        setRateMode(nextValue);
                        if (nextValue !== 'custom') {
                          form.setValue('goalRate', nextValue, { shouldValidate: true });
                        }
                      }}
                      value={rateMode}
                    />
                    {rateMode === 'custom' ? (
                      <FormInput
                        error={form.formState.errors.goalRate?.message}
                        id="coach-goal-rate"
                        inputMode="decimal"
                        label="Custom rate (% body weight/week)"
                        registration={form.register('goalRate')}
                        step="0.05"
                        type="number"
                      />
                    ) : (
                      <input type="hidden" {...form.register('goalRate')} />
                    )}
                    <RecommendedRangeRail
                      allowedMaximum={goalRateRule.allowedMaximumPct}
                      allowedMinimum={goalRateRule.allowedMinimumPct}
                      recommendedMaximum={goalRateRule.recommendedMaximumPct}
                      recommendedMinimum={goalRateRule.recommendedMinimumPct}
                      selected={Number(values.goalRate) || goalRateRule.defaultPct}
                    />
                  </div>
                ) : (
                  <input type="hidden" {...form.register('goalRate')} />
                )}
              </fieldset>

              <fieldset className="space-y-5 border-t pt-8">
                <SectionHeading
                  description="Protein is allocated first, then fat; carbohydrate receives the remaining calories."
                  icon={<UtensilsCrossed aria-hidden="true" />}
                  title="4. Shape your macros"
                />
                <div className="space-y-3">
                  <div>
                    <Label className="text-base">Protein target</Label>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Presets use your canonical starting weight and round to the nearest 5 g.
                    </p>
                  </div>
                  <AdaptiveSetupChoiceGroup
                    choices={proteinChoices(proteinPresets)}
                    label="Protein target"
                    onValueChange={(nextValue) => {
                      const mode = nextValue as AdaptiveProteinPreset;
                      setProteinMode(mode);
                      if (mode !== 'custom' && proteinPresets) {
                        form.setValue('proteinGrams', String(proteinPresets[mode]), {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                      }
                    }}
                    value={proteinMode}
                  />
                  {proteinMode === 'custom' ? (
                    <FormInput
                      error={form.formState.errors.proteinGrams?.message}
                      id="coach-protein"
                      inputMode="numeric"
                      label="Custom protein (g/day)"
                      registration={form.register('proteinGrams')}
                      step="5"
                      type="number"
                    />
                  ) : (
                    <input type="hidden" {...form.register('proteinGrams')} />
                  )}
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Higher protein can use calories that would otherwise go to carbohydrate or fat.
                    Above the recommended preset, returns commonly diminish rather than becoming
                    automatically unsafe.
                  </p>
                </div>

                <div className="space-y-3 border-t pt-5">
                  <div>
                    <Label className="text-base">Fat and carbohydrate preference</Label>
                    <p className="mt-1 text-sm text-muted-foreground">
                      This changes the split, not the total calorie target.
                    </p>
                  </div>
                  <AdaptiveSetupChoiceGroup
                    choices={FAT_CHOICES}
                    label="Fat and carbohydrate preference"
                    onValueChange={(nextValue) => {
                      const mode = nextValue as AdaptiveFatPreference;
                      setFatMode(mode);
                      if (mode !== 'custom') {
                        form.setValue(
                          'fatAllocationPct',
                          String(ADAPTIVE_SETUP_FAT_PREFERENCES[mode]),
                          { shouldDirty: true, shouldValidate: true },
                        );
                      }
                    }}
                    value={fatMode}
                  />
                  {fatMode === 'custom' ? (
                    <FormInput
                      error={form.formState.errors.fatAllocationPct?.message}
                      id="coach-fat-allocation"
                      inputMode="decimal"
                      label="Custom fat allocation (% of calories)"
                      registration={form.register('fatAllocationPct')}
                      type="number"
                    />
                  ) : (
                    <input type="hidden" {...form.register('fatAllocationPct')} />
                  )}
                </div>
              </fieldset>

              <details className="group rounded-xl border bg-secondary/20">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold [&::-webkit-details-marker]:hidden">
                  Advanced calorie floor
                  <ChevronDown
                    aria-hidden="true"
                    className="size-4 transition-transform group-open:rotate-180"
                  />
                </summary>
                <div className="space-y-3 border-t px-4 py-4">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    This applies to loss goals only. It can raise—but never lower—Pulse’s effective
                    system floor. Leave it blank to use the system default.
                  </p>
                  {values.goalType === 'lose' ? (
                    <FormInput
                      error={form.formState.errors.calorieFloor?.message}
                      id="coach-calorie-floor"
                      inputMode="numeric"
                      label="Optional calorie floor (kcal/day)"
                      registration={form.register('calorieFloor')}
                      type="number"
                    />
                  ) : (
                    <p className="rounded-lg bg-background p-3 text-sm text-muted-foreground">
                      Switch to a loss goal to set a higher floor.
                    </p>
                  )}
                </div>
              </details>
            </div>

            <aside aria-live="polite" className="min-w-0 xl:sticky xl:top-5">
              <AdaptiveSetupProjectionCard
                currentWeightKg={currentWeightKg}
                emptyMessage={projectionState.message}
                goalType={values.goalType}
                projection={projectionState.projection}
                sourceLabel={sourceLabel}
                targetWeightKg={projectionState.targetWeightKg}
                weightUnit={weightUnit}
              />
            </aside>
          </div>

          <div className="rounded-xl border border-primary/20 bg-primary/6 p-4">
            <div className="flex gap-3">
              <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
              <p className="text-sm leading-relaxed text-muted-foreground">
                Preview creates your program and a pending baseline recommendation. Your current
                nutrition targets do not change until you review it and select{' '}
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

const GOAL_CHOICES: readonly AdaptiveSetupChoice[] = [
  {
    description: 'A calorie deficit with a sustainable weekly pace.',
    label: 'Lose weight',
    value: 'lose',
  },
  {
    description: 'Hold around your starting weight without a finish date.',
    label: 'Maintain',
    value: 'maintain',
  },
  {
    description: 'A calorie surplus with a controlled weekly pace.',
    label: 'Gain weight',
    value: 'gain',
  },
];

const FAT_CHOICES: readonly AdaptiveSetupChoice[] = [
  {
    description: '25% of calories from fat',
    label: 'Higher carb',
    meta: 'More calories remain for carbohydrate',
    value: 'higher_carb',
  },
  {
    badge: 'Recommended',
    description: '30% of calories from fat',
    label: 'Balanced',
    meta: 'A flexible middle ground',
    value: 'balanced',
  },
  {
    description: '35% of calories from fat',
    label: 'Higher fat',
    meta: 'Fewer calories remain for carbohydrate',
    value: 'higher_fat',
  },
  {
    description: 'Choose 20–40% of calories',
    label: 'Custom',
    meta: 'For experienced users',
    value: 'custom',
  },
];

function rateChoices(goalType: 'lose' | 'gain'): readonly AdaptiveSetupChoice[] {
  const rules = ADAPTIVE_SETUP_GOAL_RATE_RULES[goalType];
  return [
    ...rules.presets.map((preset) => ({
      badge: preset.valuePct === rules.defaultPct ? 'Recommended' : undefined,
      description: `${preset.valuePct.toFixed(2)}% of body weight per week`,
      label: preset.label,
      meta:
        goalType === 'gain' && preset.label === 'Faster'
          ? 'Faster scale gain does not guarantee faster muscle gain'
          : undefined,
      value: String(preset.valuePct),
    })),
    {
      description: `${rules.allowedMinimumPct.toFixed(2)}–${rules.allowedMaximumPct.toFixed(2)}% per week`,
      label: 'Custom',
      meta: 'Values outside the recommended band show a caution',
      value: 'custom',
    },
  ];
}

function proteinChoices(
  presets: ReturnType<typeof calculateAdaptiveProteinPresets> | null,
): readonly AdaptiveSetupChoice[] {
  const description = (key: Exclude<AdaptiveProteinPreset, 'custom'>, multiplier: number) =>
    presets
      ? `${presets[key]} g/day · ${multiplier.toFixed(1)} g/kg`
      : `${multiplier.toFixed(1)} g/kg`;
  return [
    { description: description('moderate', 1.6), label: 'Moderate', value: 'moderate' },
    {
      badge: 'Recommended',
      description: description('recommended', 1.8),
      label: 'Recommended',
      value: 'recommended',
    },
    { description: description('high', 2.2), label: 'High', value: 'high' },
    {
      description: 'Enter your own daily gram target',
      label: 'Custom',
      value: 'custom',
    },
  ];
}

function SectionHeading({
  description,
  icon,
  title,
}: {
  description: string;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <legend className="space-y-1.5">
      <span className="flex items-center gap-2 text-base font-semibold [&_svg]:size-4 [&_svg]:text-primary">
        {icon} {title}
      </span>
      <span className="block max-w-2xl text-sm font-normal leading-relaxed text-muted-foreground">
        {description}
      </span>
    </legend>
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
        className="min-h-11 w-full cursor-pointer rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
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

function buildLiveProjection({
  hasRecentSavedWeight,
  latestWeight,
  values,
  weightUnit,
}: {
  hasRecentSavedWeight: boolean;
  latestWeight: { date: string; unit: 'kg' | 'lbs'; weight: number } | null | undefined;
  values: SetupFormValues;
  weightUnit: 'kg' | 'lbs';
}): {
  message: string;
  projection: AdaptiveSetupProjection | null;
  targetWeightKg: number | null;
} {
  const empty = (message: string, targetWeightKg: number | null = null) => ({
    message,
    projection: null,
    targetWeightKg,
  });
  const currentWeightKg = resolveCurrentWeightKg(
    values,
    latestWeight,
    hasRecentSavedWeight,
    weightUnit,
  );
  if (currentWeightKg === null) {
    return empty('Add a current weight to calculate your pace, timeline, and protein targets.');
  }

  let targetWeightKg: number | null = null;
  if (values.goalType !== 'maintain') {
    if (!isNumberInRange(values.targetWeight, 1, 1500)) {
      return empty('Choose a target weight to see how long the goal may take.');
    }
    targetWeightKg = convertWeightToKg(Number(values.targetWeight), weightUnit);
    if (
      (values.goalType === 'lose' && targetWeightKg >= currentWeightKg) ||
      (values.goalType === 'gain' && targetWeightKg <= currentWeightKg)
    ) {
      return empty(
        values.goalType === 'lose'
          ? 'Choose a loss target below your starting weight.'
          : 'Choose a gain target above your starting weight.',
        targetWeightKg,
      );
    }
  }

  if (!isNumberInRange(values.proteinGrams, 40, 400)) {
    return empty('Choose a valid protein target to calculate the macro split.', targetWeightKg);
  }
  if (!isNumberInRange(values.fatAllocationPct, 20, 40)) {
    return empty('Choose a fat allocation between 20% and 40%.', targetWeightKg);
  }

  try {
    const calculationLocalDate = getAdaptiveSetupLocalDate(new Date(), values.timeZone);
    const isManual = values.rmrEquation === 'manual_tdee';
    if (isManual && !isNumberInRange(values.manualTdee, 800, 8000)) {
      return empty('Enter your starting TDEE to calculate the plan.', targetWeightKg);
    }
    if (!isManual) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(values.birthDate)) {
        return empty(
          'Add your birth date to calculate the starting energy estimate.',
          targetWeightKg,
        );
      }
      const heightCm = getHeightCm(values);
      if (heightCm === null || heightCm < 100 || heightCm > 250) {
        return empty(
          'Add a valid height to calculate the starting energy estimate.',
          targetWeightKg,
        );
      }
    }
    const baseline = calculateBaselineTdee({
      activityLevel: isManual ? null : values.activityLevel,
      birthDate: isManual ? null : values.birthDate,
      calculationDate: calculationLocalDate,
      equation: values.rmrEquation,
      heightCm: isManual ? null : getHeightCm(values),
      manualBaselineTdeeKcal: values.manualTdee === '' ? null : Number(values.manualTdee),
      weightKg: currentWeightKg,
    });
    const systemCalorieFloorKcal = calculateSystemCalorieFloor(baseline.baselineTdeeKcal);
    const userCalorieFloorKcal =
      values.goalType === 'lose' && values.calorieFloor !== ''
        ? Number(values.calorieFloor)
        : systemCalorieFloorKcal;
    if (!Number.isFinite(userCalorieFloorKcal) || userCalorieFloorKcal < systemCalorieFloorKcal) {
      return empty(
        `The optional floor must be at least Pulse’s ${systemCalorieFloorKcal} kcal system floor.`,
        targetWeightKg,
      );
    }
    const goalRatePctPerWeek =
      values.goalType === 'maintain'
        ? 0
        : Number(values.goalRate) * (values.goalType === 'lose' ? -1 : 1);
    const projection = calculateAdaptiveSetupProjection({
      baselineTdeeKcal: baseline.baselineTdeeKcal,
      calculationLocalDate,
      currentWeightKg,
      estimatedRmrKcal: baseline.estimatedRmrKcal,
      fatAllocationPct: Number(values.fatAllocationPct),
      goalRatePctPerWeek,
      goalType: values.goalType,
      proteinGrams: Math.round(Number(values.proteinGrams)),
      systemCalorieFloorKcal,
      targetWeightKg,
      userCalorieFloorKcal,
    });
    return { message: '', projection, targetWeightKg };
  } catch (error) {
    if (
      error instanceof AdaptiveTdeeConfigurationError &&
      error.code === 'MACRO_CONFIGURATION_INFEASIBLE'
    ) {
      return empty(
        'Protein and fat use more calories than this plan allows. Lower one of them to restore a feasible carbohydrate target.',
        targetWeightKg,
      );
    }
    return empty(
      error instanceof Error
        ? error.message
        : 'Complete the required fields to calculate your projected plan.',
      targetWeightKg,
    );
  }
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
      values.goalType !== 'lose' || values.calorieFloor === ''
        ? undefined
        : Math.round(Number(values.calorieFloor)),
  };
}

function resolveCurrentWeightKg(
  values: SetupFormValues,
  latestWeight: { unit: 'kg' | 'lbs'; weight: number } | null | undefined,
  hasRecentSavedWeight: boolean,
  weightUnit: 'kg' | 'lbs',
) {
  if (values.currentWeightSource === 'saved') {
    return latestWeight && hasRecentSavedWeight
      ? convertWeightToKg(latestWeight.weight, latestWeight.unit)
      : null;
  }
  return isNumberInRange(values.currentWeight, 1, 1500)
    ? convertWeightToKg(Number(values.currentWeight), weightUnit)
    : null;
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
  const [todayYear, todayMonth, todayDay] = getAdaptiveSetupLocalDate(new Date(), timeZone)
    .split('-')
    .map(Number);
  let age = todayYear - year;
  if (todayMonth < month || (todayMonth === month && todayDay < day)) {
    age -= 1;
  }
  return age;
}

function getCalendarAgeDays(date: string, timeZone: string) {
  const [year, month, day] = date.split('-').map(Number);
  const entryUtc = Date.UTC(year, month - 1, day);
  const [todayYear, todayMonth, todayDay] = getAdaptiveSetupLocalDate(new Date(), timeZone)
    .split('-')
    .map(Number);
  const todayUtc = Date.UTC(todayYear, todayMonth - 1, todayDay);
  return Math.floor((todayUtc - entryUtc) / 86_400_000);
}

import { zodResolver } from '@hookform/resolvers/zod';
import {
  convertWeightFromKg,
  convertWeightToKg,
  type AdaptiveCheckInSummary,
  type AdaptiveGoal,
  type AdaptiveGoalProgress,
  type AdaptiveGoalType,
} from '@pulse/shared';
import { ArrowLeft, CheckCircle2, ShieldCheck, Target } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWeightUnit } from '@/hooks/use-weight-unit';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';

import { useEditAdaptiveGoal, useStartAdaptiveGoal } from '../api/adaptive-nutrition';
import { formatAdaptiveWeight } from '../lib/format-adaptive-nutrition';

const numericField = (label: string, minimum: number, maximum: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .refine((value) => Number.isFinite(Number(value)), `${label} must be a number`)
    .refine(
      (value) => Number(value) >= minimum && Number(value) <= maximum,
      `${label} must be between ${minimum} and ${maximum}`,
    );

const goalEditorSchema = z
  .object({
    goalType: z.enum(['lose', 'maintain', 'gain']),
    goalWeight: numericField('Goal weight', 1, 1500),
    goalRate: numericField('Goal rate', 0, 1),
    supersedePendingRecommendation: z.boolean(),
  })
  .superRefine((values, context) => {
    if (values.goalType === 'maintain' && Number(values.goalRate) !== 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Maintenance uses a 0% weekly rate',
        path: ['goalRate'],
      });
    }
    if (values.goalType === 'lose' && !inRange(values.goalRate, 0.1, 1)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Loss rate must be between 0.1% and 1.0%',
        path: ['goalRate'],
      });
    }
    if (values.goalType === 'gain' && !inRange(values.goalRate, 0.1, 0.5)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Gain rate must be between 0.1% and 0.5%',
        path: ['goalRate'],
      });
    }
  });

type GoalEditorValues = z.infer<typeof goalEditorSchema>;

type GoalEditorDialogProps = {
  activeGoal: AdaptiveGoal | null;
  fallbackGoalType: AdaptiveGoalType;
  fallbackGoalWeightKg: number | null;
  mode: 'edit' | 'new';
  onOpenChange: (open: boolean) => void;
  onSaved: (message: string) => void;
  open: boolean;
  pendingRecommendation: AdaptiveCheckInSummary | null;
  progress: AdaptiveGoalProgress | null;
};

export function GoalEditorDialog({
  activeGoal,
  fallbackGoalType,
  fallbackGoalWeightKg,
  mode,
  onOpenChange,
  onSaved,
  open,
  pendingRecommendation,
  progress,
}: GoalEditorDialogProps) {
  const { weightUnit } = useWeightUnit();
  const editMutation = useEditAdaptiveGoal();
  const startMutation = useStartAdaptiveGoal();
  const [reviewValues, setReviewValues] = useState<GoalEditorValues | null>(null);
  const defaultValues = getDefaultValues(
    activeGoal,
    mode,
    weightUnit,
    fallbackGoalType,
    fallbackGoalWeightKg,
  );
  const form = useForm<GoalEditorValues>({
    defaultValues,
    mode: 'onBlur',
    resolver: zodResolver(goalEditorSchema),
  });
  const selectedType = form.watch('goalType');
  const isPending = editMutation.isPending || startMutation.isPending;

  useEffect(() => {
    if (!open) return;
    form.reset(
      getDefaultValues(activeGoal, mode, weightUnit, fallbackGoalType, fallbackGoalWeightKg),
    );
    setReviewValues(null);
  }, [activeGoal, fallbackGoalType, fallbackGoalWeightKg, form, mode, open, weightUnit]);

  const prepareReview = (values: GoalEditorValues) => {
    const currentTrendKg = progress?.currentTrendWeightKg ?? activeGoal?.startTrendWeightKg ?? null;
    const goalWeightKg = convertWeightToKg(Number(values.goalWeight), weightUnit);

    if (mode === 'new' && activeGoal && values.goalType === activeGoal.type) {
      form.setError('goalType', {
        message: 'Use Edit goal for changes in the same direction',
        type: 'manual',
      });
      return;
    }
    if (mode === 'edit' && activeGoal && values.goalType !== activeGoal.type) {
      form.setError('goalType', {
        message: 'Start a new goal to change direction',
        type: 'manual',
      });
      return;
    }
    if (values.goalType === 'lose' && currentTrendKg !== null && goalWeightKg >= currentTrendKg) {
      form.setError('goalWeight', {
        message: 'Loss target must be below your current trend weight',
        type: 'manual',
      });
      return;
    }
    if (values.goalType === 'gain' && currentTrendKg !== null && goalWeightKg <= currentTrendKg) {
      form.setError('goalWeight', {
        message: 'Gain target must be above your current trend weight',
        type: 'manual',
      });
      return;
    }

    setReviewValues(values);
  };

  const saveGoal = async () => {
    if (!reviewValues) return;
    const goalWeightKg = convertWeightToKg(Number(reviewValues.goalWeight), weightUnit);
    const strategy = {
      type: reviewValues.goalType,
      targetWeightKg: reviewValues.goalType === 'maintain' ? null : goalWeightKg,
      maintenanceCenterKg: reviewValues.goalType === 'maintain' ? goalWeightKg : null,
      goalRatePctPerWeek:
        reviewValues.goalType === 'maintain'
          ? 0
          : Number(reviewValues.goalRate) * (reviewValues.goalType === 'lose' ? -1 : 1),
      supersedePendingRecommendation: reviewValues.supersedePendingRecommendation,
    } as const;

    try {
      if (mode === 'edit') {
        if (!activeGoal) throw new Error('An active goal is required to edit');
        await editMutation.mutateAsync({
          id: activeGoal.id,
          input: {
            ...strategy,
            expectedRevisionId: progress?.goalRevisionId,
          },
        });
        onSaved(
          'Goal updated. Your current nutrition targets stay in place until you accept the new recommendation.',
        );
      } else {
        await startMutation.mutateAsync(strategy);
        onSaved(
          'New goal started. Your history and Adaptive TDEE were preserved; current targets stay in place until you accept the recommendation.',
        );
      }
      onOpenChange(false);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : `Unable to ${mode === 'edit' ? 'update' : 'start'} this goal.`;
      form.setError('root', { message, type: 'server' });
      setReviewValues(null);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="mb-1 flex items-center gap-2 text-primary">
            <Target aria-hidden="true" className="size-4" />
            <span className="text-xs font-semibold uppercase tracking-[0.16em]">
              {reviewValues
                ? 'Review change'
                : mode === 'edit'
                  ? 'Edit goal'
                  : 'New progress period'}
            </span>
          </div>
          <DialogTitle>
            {reviewValues
              ? mode === 'edit'
                ? 'Confirm your updated goal'
                : 'Confirm your new goal'
              : mode === 'edit'
                ? 'Adjust the strategy, keep the history'
                : 'What are you working toward next?'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'edit'
              ? 'Editing preserves the original start date and start weight for this goal.'
              : 'A new direction starts a new progress period. Prior goals remain in history, and your weight, nutrition, check-ins, and learned Adaptive TDEE do not reset.'}
          </DialogDescription>
        </DialogHeader>

        {reviewValues ? (
          <GoalReview
            activeGoal={activeGoal}
            mode={mode}
            pendingRecommendation={pendingRecommendation}
            progress={progress}
            values={reviewValues}
            weightUnit={weightUnit}
            onSupersedeChange={(checked) => {
              const next = { ...reviewValues, supersedePendingRecommendation: checked };
              setReviewValues(next);
              form.setValue('supersedePendingRecommendation', checked);
            }}
          />
        ) : (
          <form
            className="space-y-5"
            id="goal-editor-form"
            noValidate
            onSubmit={form.handleSubmit(prepareReview)}
          >
            {mode === 'new' ? (
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold">Goal direction</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {(['lose', 'maintain', 'gain'] as const).map((type) => (
                    <Button
                      aria-pressed={selectedType === type}
                      className={cn(
                        'min-h-11 whitespace-normal',
                        selectedType === type && 'border-primary bg-primary/10',
                      )}
                      key={type}
                      onClick={() => {
                        form.setValue('goalType', type, { shouldValidate: true });
                        form.setValue('goalRate', defaultRate(type), { shouldValidate: true });
                      }}
                      type="button"
                      variant="outline"
                    >
                      {type === 'lose'
                        ? 'Lose weight'
                        : type === 'gain'
                          ? 'Gain weight'
                          : 'Maintain'}
                    </Button>
                  ))}
                </div>
                {form.formState.errors.goalType ? (
                  <p className="text-sm text-destructive" role="alert">
                    {form.formState.errors.goalType.message}
                  </p>
                ) : null}
              </fieldset>
            ) : null}

            <div className="rounded-xl border border-primary/20 bg-primary/6 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Current trend context
              </p>
              <p className="mt-1 text-lg font-semibold">
                {formatAdaptiveWeight(
                  progress?.currentTrendWeightKg ?? activeGoal?.startTrendWeightKg,
                  weightUnit,
                )}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {(progress?.currentTrendWeightKg ?? activeGoal?.startTrendWeightKg)
                  ? 'This smoothed trend—not the latest scale reading—anchors goal direction checks.'
                  : 'Pulse will resolve a fresh trend weight before it starts the goal.'}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <GoalInput
                error={form.formState.errors.goalWeight?.message}
                id="goal-editor-weight"
                label={`${selectedType === 'maintain' ? 'Maintenance center' : 'Target weight'} (${weightUnit})`}
                registration={form.register('goalWeight')}
              />
              <GoalInput
                disabled={selectedType === 'maintain'}
                error={form.formState.errors.goalRate?.message}
                id="goal-editor-rate"
                label="Desired rate (% body weight/week)"
                max={selectedType === 'gain' ? '0.5' : '1'}
                min={selectedType === 'maintain' ? '0' : '0.1'}
                registration={form.register('goalRate')}
                step="0.05"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Supported range:{' '}
              {selectedType === 'lose'
                ? '0.1–1.0%'
                : selectedType === 'gain'
                  ? '0.1–0.5%'
                  : 'maintenance uses no weekly rate'}
              .
            </p>

            {form.formState.errors.root ? (
              <p className="text-sm text-destructive" role="alert">
                {form.formState.errors.root.message}
              </p>
            ) : null}
          </form>
        )}

        <DialogFooter>
          {reviewValues ? (
            <>
              <Button
                className="min-h-11"
                disabled={isPending}
                onClick={() => setReviewValues(null)}
                type="button"
                variant="outline"
              >
                <ArrowLeft aria-hidden="true" /> Back
              </Button>
              <Button
                className="min-h-11"
                disabled={
                  isPending ||
                  (Boolean(pendingRecommendation) && !reviewValues.supersedePendingRecommendation)
                }
                onClick={() => void saveGoal()}
                type="button"
              >
                <CheckCircle2 aria-hidden="true" />
                {isPending ? 'Saving…' : mode === 'edit' ? 'Update goal' : 'Start new goal'}
              </Button>
            </>
          ) : (
            <Button className="min-h-11" form="goal-editor-form" type="submit">
              Review change
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GoalReview({
  activeGoal,
  mode,
  pendingRecommendation,
  progress,
  values,
  weightUnit,
  onSupersedeChange,
}: {
  activeGoal: AdaptiveGoal | null;
  mode: 'edit' | 'new';
  pendingRecommendation: AdaptiveCheckInSummary | null;
  progress: AdaptiveGoalProgress | null;
  values: GoalEditorValues;
  weightUnit: 'kg' | 'lbs';
  onSupersedeChange: (checked: boolean) => void;
}) {
  const trendWeightKg = progress?.currentTrendWeightKg ?? activeGoal?.startTrendWeightKg ?? null;
  const goalWeightKg = convertWeightToKg(Number(values.goalWeight), weightUnit);
  return (
    <div className="space-y-4">
      <dl className="grid gap-3 rounded-xl border border-border/70 p-4 sm:grid-cols-2">
        <ReviewValue label="Direction" value={goalTypeLabel(values.goalType)} />
        <ReviewValue
          label={values.goalType === 'maintain' ? 'Center' : 'Target'}
          value={formatAdaptiveWeight(goalWeightKg, weightUnit)}
        />
        <ReviewValue
          label="Desired rate"
          value={values.goalType === 'maintain' ? 'No change target' : `${values.goalRate}% / week`}
        />
        <ReviewValue
          label="Projection impact"
          value={formatPlanningProjection(values, trendWeightKg, goalWeightKg)}
        />
      </dl>

      <div className="flex gap-3 rounded-xl border border-primary/20 bg-primary/6 p-4">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
        <p className="text-sm leading-relaxed text-muted-foreground">
          {mode === 'new'
            ? 'Confirming closes the prior goal and begins a new progress period from the fresh trend weight. Historical goals and learned expenditure remain intact.'
            : 'Confirming appends an immutable revision while preserving this goal’s original starting point.'}{' '}
          <strong className="text-foreground">
            Nutrition targets do not change until you accept the recommendation.
          </strong>
        </p>
      </div>

      {pendingRecommendation ? (
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/8 p-4">
          <Checkbox
            aria-describedby="supersede-pending-help"
            checked={values.supersedePendingRecommendation}
            className="mt-0.5"
            onCheckedChange={(checked) => onSupersedeChange(checked === true)}
          />
          <span>
            <span className="block text-sm font-semibold">Replace the pending recommendation</span>
            <span className="mt-1 block text-xs text-muted-foreground" id="supersede-pending-help">
              I understand the current pending recommendation will be preserved as superseded in
              history and replaced with one based on this goal.
            </span>
          </span>
        </label>
      ) : null}

      <p aria-live="polite" className="sr-only">
        Goal change summary ready for final confirmation.
      </p>
    </div>
  );
}

function GoalInput({
  disabled = false,
  error,
  id,
  label,
  max,
  min,
  registration,
  step = '0.1',
}: {
  disabled?: boolean;
  error?: string;
  id: string;
  label: string;
  max?: string;
  min?: string;
  registration: ReturnType<ReturnType<typeof useForm<GoalEditorValues>>['register']>;
  step?: string;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        aria-describedby={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
        disabled={disabled}
        id={id}
        inputMode="decimal"
        max={max}
        min={min}
        step={step}
        type="number"
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

function ReviewValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}

function getDefaultValues(
  activeGoal: AdaptiveGoal | null,
  mode: 'edit' | 'new',
  unit: 'kg' | 'lbs',
  fallbackGoalType: AdaptiveGoalType,
  fallbackGoalWeightKg: number | null,
) {
  const type =
    mode === 'edit' && activeGoal
      ? activeGoal.type
      : activeGoal
        ? nextGoalType(activeGoal.type)
        : fallbackGoalType;
  const weightKg =
    mode === 'edit' && activeGoal
      ? (activeGoal.targetWeightKg ??
        activeGoal.maintenanceCenterKg ??
        activeGoal.startTrendWeightKg)
      : (fallbackGoalWeightKg ?? activeGoal?.startTrendWeightKg ?? null);
  return {
    goalType: type,
    goalWeight:
      weightKg === null ? '' : String(roundDisplayWeight(convertWeightFromKg(weightKg, unit))),
    goalRate:
      mode === 'edit' && activeGoal
        ? String(Math.abs(activeGoal.goalRatePctPerWeek))
        : defaultRate(type),
    supersedePendingRecommendation: false,
  } satisfies GoalEditorValues;
}

function nextGoalType(type: AdaptiveGoalType): AdaptiveGoalType {
  return type === 'maintain' ? 'lose' : 'maintain';
}

function defaultRate(type: AdaptiveGoalType) {
  return type === 'maintain' ? '0' : type === 'gain' ? '0.25' : '0.5';
}

function goalTypeLabel(type: AdaptiveGoalType) {
  return type === 'lose' ? 'Lose weight' : type === 'gain' ? 'Gain weight' : 'Maintain weight';
}

function formatPlanningProjection(
  values: GoalEditorValues,
  currentTrendWeightKg: number | null,
  goalWeightKg: number,
) {
  if (values.goalType === 'maintain') return 'No completion ETA for maintenance';
  if (currentTrendWeightKg === null) return 'Calculated after Pulse resolves a fresh trend';
  const desiredRateKgPerWeek = currentTrendWeightKg * (Number(values.goalRate) / 100);
  if (!Number.isFinite(desiredRateKgPerWeek) || desiredRateKgPerWeek <= 0) {
    return 'Calculated after save';
  }
  const weeks = Math.abs(goalWeightKg - currentTrendWeightKg) / desiredRateKgPerWeek;
  return `About ${Math.max(1, Math.round(weeks))} weeks at the desired pace`;
}

function roundDisplayWeight(value: number) {
  return Math.round(value * 10) / 10;
}

function inRange(value: string, minimum: number, maximum: number) {
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum;
}

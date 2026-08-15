import {
  convertAdaptiveSetupRateForDisplay,
  convertWeightFromKg,
  type AdaptiveGoalType,
  type AdaptiveSetupProjection,
} from '@pulse/shared';
import { CalendarRange, CircleGauge, Info, Sparkles, TriangleAlert } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import { formatAdaptiveDate } from '../lib/format-adaptive-nutrition';

export function AdaptiveSetupProjectionCard({
  currentWeightKg,
  emptyMessage,
  goalType,
  projection,
  sourceLabel,
  targetWeightKg,
  weightUnit,
}: {
  currentWeightKg: number | null;
  emptyMessage: string;
  goalType: AdaptiveGoalType;
  projection: AdaptiveSetupProjection | null;
  sourceLabel: string;
  targetWeightKg: number | null;
  weightUnit: 'kg' | 'lbs';
}) {
  if (!projection || currentWeightKg === null) {
    return (
      <Card className="overflow-hidden border-dashed">
        <div className="bg-secondary/45 px-5 py-5 sm:px-6">
          <div className="flex items-center gap-2 text-primary">
            <CircleGauge aria-hidden="true" className="size-4" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em]">Your projected plan</p>
          </div>
          <h3 className="mt-2 text-xl font-semibold">Your choices will take shape here</h3>
        </div>
        <CardContent className="space-y-4 px-5 py-5 sm:px-6">
          <div className="flex items-start gap-3 rounded-xl border bg-background p-4">
            <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
            <p className="text-sm leading-relaxed text-muted-foreground">{emptyMessage}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            This calculator is local. Nothing is saved while you edit.
          </p>
        </CardContent>
      </Card>
    );
  }

  const rateUnit = weightUnit === 'lbs' ? 'lb' : 'kg';
  const startRate = convertAdaptiveSetupRateForDisplay(
    projection.startingWeightChangeKgPerWeek,
    weightUnit,
  );
  const endRate = convertAdaptiveSetupRateForDisplay(
    projection.endingWeightChangeKgPerWeek,
    weightUnit,
  );
  const monthlyRate = convertAdaptiveSetupRateForDisplay(
    projection.approximateMonthlyChangeKg,
    weightUnit,
  );
  const totalChange = formatWeight(projection.totalWeightChangeKg, weightUnit);
  const targetLabel =
    goalType === 'maintain' || targetWeightKg === null
      ? `Maintain around ${formatWeight(currentWeightKg, weightUnit)}`
      : `${goalType === 'lose' ? 'Lose to' : 'Gain to'} ${formatWeight(targetWeightKg, weightUnit)}`;
  const warnings = projectionWarnings(projection, goalType);

  return (
    <Card className="overflow-hidden border-primary/20 shadow-sm" data-testid="setup-projection">
      <div className="bg-[color:var(--color-accent-cream)] px-5 py-5 text-[color:var(--color-on-accent)] sm:px-6">
        <div className="flex items-center gap-2">
          <Sparkles aria-hidden="true" className="size-4" />
          <p className="text-xs font-semibold uppercase tracking-[0.18em]">Your projected plan</p>
        </div>
        <div className="mt-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div>
            <h3 className="text-xl font-semibold sm:text-2xl">{targetLabel}</h3>
            <p className="mt-1 text-sm opacity-80">
              Start {formatWeight(currentWeightKg, weightUnit)} · {sourceLabel}
              {goalType === 'maintain' ? '' : ` · ${totalChange} total`}
            </p>
          </div>
          <div className="mt-3 sm:mt-0 sm:text-right">
            <p className="text-3xl font-semibold tabular-nums">
              {formatCalories(projection.goal.goalCalories)}
            </p>
            <p className="text-xs font-medium uppercase tracking-[0.12em] opacity-75">kcal/day</p>
          </div>
        </div>
      </div>

      <CardContent className="space-y-5 px-5 py-5 sm:px-6">
        <section aria-labelledby="setup-pace-heading" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-semibold" id="setup-pace-heading">
              Pace and timeline
            </h4>
            <span
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs font-semibold',
                projection.rateGuidance.status === 'caution'
                  ? 'border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-200'
                  : 'border-primary/25 bg-primary/8 text-primary',
              )}
            >
              {projection.rateGuidance.label}
              {projection.rateGuidance.status === 'recommended' ? ' · Recommended' : ''}
            </span>
          </div>
          {goalType === 'maintain' ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Maintenance holds the goal rate at 0%. There is no artificial finish date.
            </p>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {Math.abs(projection.requestedGoalRatePctPerWeek).toFixed(2)}% of body weight per
                week. Because this is percentage-based, the absolute {rateUnit}/week changes with
                body weight.
              </p>
              {projection.rateIsGuardrailLimited ? (
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  Guardrails limit the estimated starting target to about{' '}
                  {Math.abs(projection.goal.achievableGoalRatePctPerWeek).toFixed(2)}% per week.
                </p>
              ) : null}
              <dl className="grid grid-cols-3 gap-2 rounded-xl bg-secondary/45 p-3 text-center">
                <Metric label="Starts" value={`${startRate} ${rateUnit}/wk`} />
                <Metric label="Ends" value={`${endRate} ${rateUnit}/wk`} />
                <Metric label="Approx." value={`${monthlyRate} ${rateUnit}/mo`} />
              </dl>
              {projection.timeline ? (
                <div className="flex items-start gap-3 rounded-xl border p-3.5">
                  <CalendarRange
                    aria-hidden="true"
                    className="mt-0.5 size-5 shrink-0 text-primary"
                  />
                  <div>
                    <p className="font-semibold">About {projection.timeline.displayWeeks} weeks</p>
                    <p className="text-sm text-muted-foreground">
                      Projected around {formatAdaptiveDate(projection.timeline.completionLocalDate)}
                    </p>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>

        <section aria-labelledby="setup-energy-heading" className="space-y-3 border-t pt-5">
          <h4 className="font-semibold" id="setup-energy-heading">
            Starting energy plan
          </h4>
          <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
            {projection.estimatedRmrKcal === null ? null : (
              <Definition
                label="Estimated RMR"
                value={`${formatCalories(projection.estimatedRmrKcal)} kcal`}
              />
            )}
            <Definition
              label="Baseline TDEE"
              value={`${formatCalories(projection.baselineTdeeKcal)} kcal`}
            />
            <Definition
              label="Requested adjustment"
              value={`${formatSignedCalories(projection.goal.requestedCalorieAdjustment)} kcal/day`}
            />
            <Definition
              label="Starting target"
              value={`${formatCalories(projection.goal.goalCalories)} kcal/day`}
            />
          </dl>
        </section>

        <section aria-labelledby="setup-macros-heading" className="space-y-3 border-t pt-5">
          <h4 className="font-semibold" id="setup-macros-heading">
            Protein, fat, and carbohydrate
          </h4>
          <div
            aria-label={`Macro calorie split: protein ${projection.proteinCaloriesPct.toFixed(1)} percent, fat ${projection.fatCaloriesPct.toFixed(1)} percent, carbohydrate ${projection.carbohydrateCaloriesPct.toFixed(1)} percent`}
            className="flex h-2 overflow-hidden rounded-full bg-secondary"
            role="img"
          >
            <span className="bg-primary" style={{ width: `${projection.proteinCaloriesPct}%` }} />
            <span
              className="bg-[color:var(--color-accent-pink)]"
              style={{ width: `${projection.fatCaloriesPct}%` }}
            />
            <span
              className="bg-[color:var(--color-accent-mint)]"
              style={{ width: `${projection.carbohydrateCaloriesPct}%` }}
            />
          </div>
          <dl className="space-y-3 text-sm">
            <MacroRow
              label="Protein"
              value={`${projection.macros.protein} g · ${projection.proteinGramsPerKg.toFixed(2)} g/kg · ${projection.proteinGramsPerPound.toFixed(2)} g/lb`}
            />
            <MacroRow
              label="Fat"
              value={`${projection.macros.fat} g · ${projection.fatCaloriesPct.toFixed(1)}% of calories`}
            />
            <MacroRow
              label="Carbohydrate"
              value={`${projection.macros.carbs} g · ${projection.carbohydrateCaloriesPct.toFixed(1)}% of calories`}
            />
          </dl>
        </section>

        {warnings.length > 0 ? (
          <section aria-label="Plan cautions" className="space-y-2 border-t pt-5">
            {warnings.map((warning) => (
              <div
                className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/8 p-3 text-sm leading-relaxed"
                key={warning}
              >
                <TriangleAlert
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300"
                />
                <p>{warning}</p>
              </div>
            ))}
          </section>
        ) : null}

        <div className="flex items-start gap-2 border-t pt-5 text-xs leading-relaxed text-muted-foreground">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>
            This is the starting plan. After you accept a check-in, Pulse can adapt calories and
            macros as expenditure and body weight change.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 break-words font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Definition({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function MacroRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="font-medium">{label}</dt>
      <dd className="text-muted-foreground tabular-nums sm:text-right">{value}</dd>
    </div>
  );
}

function formatWeight(weightKg: number, unit: 'kg' | 'lbs') {
  const value = convertWeightFromKg(weightKg, unit);
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value)} ${unit}`;
}

function formatCalories(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function formatSignedCalories(value: number) {
  const rounded = Math.round(value);
  if (rounded === 0) return '0';
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)}`;
}

function projectionWarnings(projection: AdaptiveSetupProjection, goalType: AdaptiveGoalType) {
  const warnings: string[] = [];
  if (projection.warningCodes.includes('OUTSIDE_RECOMMENDED_RANGE')) {
    warnings.push(
      goalType === 'gain'
        ? 'This rate is allowed but outside Pulse’s recommended gain range. A faster gain rate does not guarantee faster muscle gain and may increase fat gain.'
        : 'This rate is allowed but outside Pulse’s recommended loss range. Consider whether the pace is sustainable before previewing it.',
    );
  }
  if (projection.warningCodes.includes('CALORIE_FLOOR_APPLIED')) {
    warnings.push(
      'The calorie floor limits this starting target, so the requested loss rate is not fully achievable.',
    );
  }
  if (projection.warningCodes.includes('DEFICIT_LIMIT_APPLIED')) {
    warnings.push('Pulse’s maximum-deficit guardrail is also limiting the requested loss rate.');
  }
  if (projection.warningCodes.includes('GOAL_REACHED')) {
    warnings.push(
      'This target is already within Pulse’s goal tolerance, so no completion date is projected.',
    );
  }
  return warnings;
}

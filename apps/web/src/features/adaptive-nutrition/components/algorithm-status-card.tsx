import type { AdaptiveGoalType, AdaptiveNutritionState } from '@pulse/shared';
import { Activity, CalendarClock, Scale, Utensils } from 'lucide-react';
import { useId } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';

import {
  adaptiveReasonCopy,
  adaptiveStateCopy,
  formatAdaptiveCalories,
  formatAdaptiveDate,
  formatAdaptiveGrams,
} from '../lib/format-adaptive-nutrition';

type AlgorithmStatusCardProps = {
  state: AdaptiveNutritionState;
};

export function AlgorithmStatusCard({ state }: AlgorithmStatusCardProps) {
  const copy = adaptiveStateCopy[state.state];
  const eligibilityReasonCodes = state.eligibility?.reasonCodes ?? [];
  const blockingReasonCodes =
    state.state === 'holding'
      ? state.program?.status === 'paused'
        ? (['PROGRAM_PAUSED', ...eligibilityReasonCodes] as const)
        : eligibilityReasonCodes
      : state.state === 'learning'
        ? eligibilityReasonCodes.filter(
            (code) => code === 'STALE_WEIGHT' || code === 'SUSPECT_WEIGHT_DATA',
          )
        : [];
  const activeTdee =
    state.latestAcceptedCheckIn?.proposedTdeeKcal ?? state.program?.baselineTdeeKcal ?? null;

  return (
    <Card className="relative gap-5 overflow-hidden border-primary/20 bg-card py-5">
      <div aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-primary" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 -top-24 size-52 rounded-full bg-primary/8 blur-3xl"
      />
      <CardHeader className="gap-3 px-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            {copy.eyebrow}
          </p>
          {state.checkInDue || state.pendingCheckIn ? (
            <Badge variant={state.pendingCheckIn ? 'default' : 'outline'}>
              {state.pendingCheckIn ? 'Review ready' : 'Check-in due'}
            </Badge>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <CardTitle className="text-xl sm:text-2xl">
            <h2>{copy.title}</h2>
          </CardTitle>
          <CardDescription className="max-w-2xl leading-relaxed">
            {copy.description}
          </CardDescription>
        </div>
      </CardHeader>

      {state.program ? (
        <CardContent className="space-y-5 px-5 sm:px-6">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <StatusMetric
              icon={Activity}
              label={state.latestAcceptedCheckIn ? 'Adaptive TDEE' : 'Starting expenditure'}
              value={formatAdaptiveCalories(activeTdee)}
            />
            <StatusMetric
              icon={Utensils}
              label="Current calories"
              value={formatAdaptiveCalories(state.currentTarget?.calories)}
            />
            <StatusMetric
              icon={Scale}
              label="Goal"
              value={formatGoal(state.program.goalType, state.program.goalRatePctPerWeek)}
            />
            <StatusMetric
              icon={CalendarClock}
              label="Next check-in"
              value={formatAdaptiveDate(state.nextCheckInDate)}
            />
          </div>

          {state.currentTarget ? (
            <dl className="grid grid-cols-3 gap-2 rounded-xl border border-border/70 bg-background/65 p-3 text-center sm:max-w-md sm:text-left">
              <MacroValue
                label="Protein"
                value={formatAdaptiveGrams(state.currentTarget.protein)}
              />
              <MacroValue label="Carbs" value={formatAdaptiveGrams(state.currentTarget.carbs)} />
              <MacroValue label="Fat" value={formatAdaptiveGrams(state.currentTarget.fat)} />
            </dl>
          ) : null}

          {state.eligibility ? <EligibilityProgress eligibility={state.eligibility} /> : null}

          {blockingReasonCodes.length ? (
            <section aria-labelledby="coach-blocking-reasons" className="space-y-2">
              <h3 className="text-sm font-semibold" id="coach-blocking-reasons">
                {state.state === 'holding'
                  ? 'Why Pulse is holding'
                  : 'What Pulse needs you to review'}
              </h3>
              <ul className="space-y-2">
                {[...new Set(blockingReasonCodes)].map((code) => (
                  <li
                    className="rounded-xl border border-amber-500/25 bg-amber-500/8 p-3"
                    key={code}
                  >
                    <p className="text-sm font-medium">{adaptiveReasonCopy[code].label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {adaptiveReasonCopy[code].action}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}

function EligibilityProgress({
  eligibility,
}: {
  eligibility: NonNullable<AdaptiveNutritionState['eligibility']>;
}) {
  return (
    <section aria-labelledby="coach-data-progress" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold" id="coach-data-progress">
          Data readiness
        </h3>
        <Badge variant={eligibility.eligible ? 'default' : 'outline'}>
          {eligibility.eligible ? 'Eligible' : 'Building'}
        </Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <ReadinessMetric
          label="Complete nutrition"
          logged={`${eligibility.completeNutritionDaysLogged} logged`}
          max={eligibility.requiredCompleteNutritionDays}
          progressLabel="Usable with weight trend"
          value={eligibility.completeNutritionDaysUsable}
          valueDescription={{ plural: 'usable nutrition days', singular: 'usable nutrition day' }}
        />
        <ReadinessMetric
          label="Scale weigh-ins"
          logged={`${eligibility.weighInsLogged} logged`}
          max={eligibility.requiredWeighIns}
          progressLabel="Usable after daily cutoff"
          value={eligibility.weighInsUsable}
          valueDescription={{ plural: 'usable weigh-ins', singular: 'usable weigh-in' }}
        />
        <ReadinessMetric
          label="Weight trend"
          logged="Completed-day window"
          max={eligibility.requiredWeightSpanDays}
          progressLabel="Span in days"
          value={eligibility.weightSpanDays}
          valueDescription={{ plural: 'span days', singular: 'span day' }}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        Most recent usable weigh-in:{' '}
        {eligibility.latestUsableWeightAgeDays == null
          ? 'none in the completed-day window yet'
          : eligibility.latestUsableWeightAgeDays === 0
            ? `on ${formatAdaptiveDate(eligibility.analysisEndDate)}`
            : `${eligibility.latestUsableWeightAgeDays} day${eligibility.latestUsableWeightAgeDays === 1 ? '' : 's'} before the cutoff`}
      </p>
      {eligibility.noteCodes.length > 0 ? (
        <ul aria-label="Readiness details" aria-live="polite" className="space-y-2">
          {eligibility.noteCodes.map((code) => (
            <li
              className="rounded-lg border border-primary/15 bg-primary/5 px-3 py-2 text-sm leading-relaxed text-muted-foreground"
              key={code}
            >
              {formatReadinessNote(code, eligibility)}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function ReadinessMetric({
  label,
  logged,
  max,
  progressLabel,
  value,
  valueDescription,
}: {
  label: string;
  logged: string;
  max: number;
  progressLabel: string;
  value: number;
  valueDescription: { plural: string; singular: string };
}) {
  const titleId = useId();
  const loggedId = useId();

  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-background/55 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold" id={titleId}>
          {label}
        </p>
        <p className="shrink-0 text-xs font-medium text-muted-foreground" id={loggedId}>
          {logged}
        </p>
      </div>
      <ProgressBar
        aria-describedby={`${titleId} ${loggedId}`}
        aria-label={`${label}: ${progressLabel}`}
        aria-valuetext={`${value} ${value === 1 ? valueDescription.singular : valueDescription.plural}; ${max} required`}
        label={progressLabel}
        max={max}
        showValue
        value={value}
        valueLabel={`${value} / ${max}`}
      />
    </div>
  );
}

function formatReadinessNote(
  code: NonNullable<AdaptiveNutritionState['eligibility']>['noteCodes'][number],
  eligibility: NonNullable<AdaptiveNutritionState['eligibility']>,
) {
  switch (code) {
    case 'COMPLETE_NUTRITION_PENDING_COMPLETED_DAY_CUTOFF': {
      const count = eligibility.completeNutritionDaysPendingCutoff;
      return `${count} complete nutrition ${count === 1 ? 'day is' : 'days are'} saved for ${formatAdaptiveDate(eligibility.pendingCutoffDate)}. ${count === 1 ? 'It' : 'They'} will enter coaching analysis after that local day ends in ${eligibility.timeZone}.`;
    }
    case 'WEIGH_INS_PENDING_COMPLETED_DAY_CUTOFF': {
      const count = eligibility.weighInsPendingCutoff;
      return `${count} ${count === 1 ? 'weigh-in is' : 'weigh-ins are'} saved for ${formatAdaptiveDate(eligibility.pendingCutoffDate)}. ${count === 1 ? 'It' : 'They'} will enter coaching analysis after that local day ends in ${eligibility.timeZone}.`;
    }
    case 'COMPLETE_NUTRITION_BEFORE_WEIGHT_TREND': {
      const count = eligibility.completeNutritionDaysBeforeWeightTrend;
      return `${count} complete nutrition ${count === 1 ? 'day was' : 'days were'} logged before your weight trend began. ${count === 1 ? 'It stays' : 'They stay'} in your history but ${count === 1 ? 'does' : 'do'} not count toward this coaching window.`;
    }
    case 'COMPLETE_NUTRITION_AWAITING_WEIGHT_TREND': {
      const count = eligibility.completeNutritionDaysAwaitingWeightTrend;
      return `${count} complete nutrition ${count === 1 ? 'day is' : 'days are'} saved and waiting for matching weight-trend coverage.`;
    }
  }
}

function StatusMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border/70 bg-background/70 p-3">
      <Icon aria-hidden="true" className="mb-2 size-4 text-primary" />
      <p className="text-[0.7rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-semibold text-foreground sm:text-base">{value}</p>
    </div>
  );
}

function MacroValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold">{value}</dd>
    </div>
  );
}

function formatGoal(goalType: AdaptiveGoalType, rate: number) {
  const label = goalType === 'lose' ? 'Lose' : goalType === 'gain' ? 'Gain' : 'Maintain';
  return rate === 0 ? label : `${label} ${Math.abs(rate)}%/week`;
}

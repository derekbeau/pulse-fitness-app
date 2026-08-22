import type {
  AdaptiveGoalTrajectory,
  AdaptiveGoalTrajectoryQuery,
  WeightUnit,
} from '@pulse/shared';
import { CalendarRange, Gauge, ShieldCheck, Target, TrendingUp } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Skeleton } from '@/components/ui/skeleton';
import { useWeightUnit } from '@/hooks/use-weight-unit';

import { useAdaptiveGoalTrajectory } from '../api/adaptive-nutrition';
import {
  formatAdaptiveDate,
  formatAdaptiveWeight,
  formatAdaptiveWeightChange,
  formatAdaptiveWeightDelta,
} from '../lib/format-adaptive-nutrition';
import { GoalTrajectoryChart } from './goal-trajectory-chart';

const RANGE_OPTIONS: Array<{ value: AdaptiveGoalTrajectoryQuery['range']; label: string }> = [
  { value: '1m', label: '1M' },
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: '1y', label: '1Y' },
  { value: 'all', label: 'All' },
];

const paceCopy = {
  near_selected: 'Near selected pace',
  faster_than_selected: 'Faster than selected',
  slower_than_selected: 'Slower than selected',
  moving_away: 'Recent trend moved away from target',
  flat: 'Recent trend is holding steady',
  reached: 'Target range reached',
  insufficient_data: 'Building a reliable trend',
} as const;

export function GoalTrajectoryWorkspace({ goalId, end }: { goalId: string; end?: string }) {
  const [range, setRange] = useState<AdaptiveGoalTrajectoryQuery['range']>('3m');
  const [lookbackDays, setLookbackDays] = useState<14 | 21 | 28>(21);
  const query = useAdaptiveGoalTrajectory(goalId, { range, lookbackDays, end });
  const { weightUnit } = useWeightUnit();

  if (query.isLoading) {
    return (
      <div aria-label="Loading goal trajectory" className="space-y-4" role="status">
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <Card className="border-destructive/30" role="alert">
        <CardHeader>
          <CardTitle>Goal trajectory could not be loaded</CardTitle>
          <CardDescription>Your goal and nutrition targets are safe.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            className="min-h-11"
            onClick={() => void query.refetch()}
            type="button"
            variant="outline"
          >
            Retry trajectory
          </Button>
        </CardContent>
      </Card>
    );
  }
  const analytics = query.data;
  return (
    <div className="space-y-6" data-slot="goal-trajectory-workspace">
      <TrajectoryHero analytics={analytics} unit={weightUnit} />

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold">Chart range</p>
              <p aria-live="polite" className="text-xs text-muted-foreground">
                {range.toUpperCase()} · {analytics.trendPoints.length} Product Trend Weight
                observations
              </p>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Goal trajectory range">
              {RANGE_OPTIONS.map((option) => (
                <Button
                  aria-pressed={range === option.value}
                  className="min-h-11 min-w-11"
                  key={option.value}
                  onClick={() => setRange(option.value)}
                  size="sm"
                  type="button"
                  variant={range === option.value ? 'default' : 'outline'}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <label className="grid gap-1 text-sm font-medium">
              Recent pace lookback
              <select
                className="min-h-11 rounded-lg border border-input bg-background px-3"
                onChange={(event) => setLookbackDays(Number(event.target.value) as 14 | 21 | 28)}
                value={lookbackDays}
              >
                <option value={14}>Last 14 days</option>
                <option value={21}>Last 21 days</option>
                <option value={28}>Last 28 days</option>
              </select>
            </label>
          </div>
          <GoalTrajectoryChart analytics={analytics} unit={weightUnit} />
        </CardContent>
      </Card>

      {analytics.summary.kind === 'weight_change' ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <ForecastCard analytics={analytics} unit={weightUnit} />
          <WeeklyContribution analytics={analytics} unit={weightUnit} />
        </div>
      ) : (
        <MaintenanceAnalytics analytics={analytics} unit={weightUnit} />
      )}

      <GoalRecord analytics={analytics} unit={weightUnit} />
    </div>
  );
}

function TrajectoryHero({
  analytics,
  unit,
}: {
  analytics: AdaptiveGoalTrajectory;
  unit: WeightUnit;
}) {
  const summary = analytics.summary;
  const title =
    summary.kind === 'maintenance'
      ? `Maintain around ${formatAdaptiveWeight(summary.centerWeightKg, unit)}`
      : `${summary.type === 'lose' ? 'Lose' : 'Gain'} to ${formatAdaptiveWeight(summary.targetWeightKg, unit)}`;
  const status =
    summary.kind === 'maintenance'
      ? summary.rangeStatus === 'within'
        ? 'In maintenance range'
        : summary.rangeStatus === 'near_edge'
          ? 'Near the range edge'
          : summary.rangeStatus === 'below'
            ? 'Below maintenance range'
            : summary.rangeStatus === 'above'
              ? 'Above maintenance range'
              : 'Building a reliable trend'
      : paceCopy[summary.paceState];
  return (
    <Card
      className="overflow-hidden border-primary/25 py-0 shadow-[0_22px_70px_-56px_var(--color-primary)]"
      data-slot="goal-trajectory-hero"
    >
      <div className="h-1 bg-gradient-to-r from-primary via-primary/70 to-transparent" />
      <CardHeader className="gap-3 px-5 pt-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-primary">
            <Target aria-hidden="true" className="size-4" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em]">Goal trajectory</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{status}</Badge>
            {analytics.isHistorical ? (
              <Badge variant="secondary">Historical · read only</Badge>
            ) : null}
          </div>
        </div>
        <CardTitle className="text-2xl sm:text-3xl">
          <h2>{title}</h2>
        </CardTitle>
        <CardDescription>
          Strategy as of {formatAdaptiveDate(analytics.strategyAsOfDate)} in {analytics.timeZone} ·
          evidence through {formatAdaptiveDate(analytics.evidenceThroughDate)}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 px-5 pb-5 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <HeroMetric
            label="Product Trend Weight"
            sublabel={
              analytics.productTrend.currentTrendDate
                ? `${formatAdaptiveDate(analytics.productTrend.currentTrendDate)} · ${analytics.productTrend.state.replace('_', ' ')}`
                : 'Not enough goal-period evidence'
            }
            value={formatAdaptiveWeight(analytics.productTrend.currentTrendWeightKg, unit)}
          />
          <HeroMetric
            label="Adaptive strategy trend"
            sublabel={
              summary.currentTrendDate
                ? formatAdaptiveDate(summary.currentTrendDate)
                : 'Not enough evidence'
            }
            value={formatAdaptiveWeight(summary.currentTrendWeightKg, unit)}
          />
          <HeroMetric
            label="Stored Adaptive start"
            sublabel={formatAdaptiveDate(analytics.goal.startedLocalDate)}
            value={formatAdaptiveWeight(summary.startTrendWeightKg, unit)}
          />
          <HeroMetric
            label={summary.kind === 'maintenance' ? 'Center' : 'Target'}
            sublabel={`Revision ${analytics.activeRevision.sequence}`}
            value={formatAdaptiveWeight(
              summary.kind === 'maintenance' ? summary.centerWeightKg : summary.targetWeightKg,
              unit,
            )}
          />
        </div>
        {summary.kind === 'weight_change' && summary.percentComplete !== null ? (
          <div>
            <ProgressBar
              aria-label={`${Math.round(summary.percentComplete)} percent of goal distance completed`}
              label="Goal distance"
              max={100}
              showValue={false}
              value={summary.percentComplete}
            />
            <div className="mt-2 flex flex-wrap justify-between gap-2 text-sm">
              <span>{Math.round(summary.percentComplete)}% complete</span>
              <span>
                {formatAdaptiveWeight(summary.completedChangeKg, unit)} completed ·{' '}
                {formatAdaptiveWeight(summary.remainingChangeKg, unit)} remaining
              </span>
            </div>
          </div>
        ) : null}
        <CompletionEvidence analytics={analytics} />
      </CardContent>
    </Card>
  );
}

function CompletionEvidence({ analytics }: { analytics: AdaptiveGoalTrajectory }) {
  const review = analytics.completionReview;
  if (analytics.summary.kind === 'maintenance') {
    return (
      <p className="rounded-xl border border-border/70 bg-muted/15 p-3 text-sm">
        Maintenance has no completion percentage or automatic correction. Any plan change still
        requires a check-in review and explicit acceptance.
      </p>
    );
  }
  const latestScaleDate = analytics.summary.latestScale
    ? formatAdaptiveDate(analytics.summary.latestScale.date)
    : null;
  if (review.reasonCode === 'GOAL_CLOSED') {
    return (
      <p className="rounded-xl border border-border/70 bg-muted/15 p-3 text-sm">
        This goal is closed and its completion evidence is read-only.
        {latestScaleDate
          ? ` The latest scale evidence in this goal was recorded ${latestScaleDate}.`
          : ' No scale evidence was recorded during this goal.'}
      </p>
    );
  }
  if (review.trendTargetStatus === 'reached' && review.scaleTargetStatus !== 'reached') {
    return (
      <p className="rounded-xl border border-emerald-500/25 bg-emerald-500/8 p-3 text-sm">
        Your Adaptive model trend is in the completion range.
        {latestScaleDate
          ? ` The latest scale value from ${latestScaleDate} is shown separately and does not block review.`
          : ' No separate scale evidence is available.'}
      </p>
    );
  }
  if (review.scaleTargetStatus === 'reached' && review.trendTargetStatus !== 'reached') {
    return (
      <p className="rounded-xl border border-amber-500/25 bg-amber-500/8 p-3 text-sm">
        {latestScaleDate
          ? `The latest scale value from ${latestScaleDate} crossed the target, but the Adaptive model trend has not.`
          : 'The latest scale value crossed the target, but the Adaptive model trend has not.'}{' '}
        Pulse will wait for the trend before offering completion review.
      </p>
    );
  }
  return (
    <p className="text-sm text-muted-foreground">
      A raw weigh-in never completes a goal. Completion uses the Adaptive model tolerance and the
      existing accepted check-in review.
    </p>
  );
}

function ForecastCard({
  analytics,
  unit,
}: {
  analytics: AdaptiveGoalTrajectory;
  unit: WeightUnit;
}) {
  if (analytics.summary.kind !== 'weight_change') return null;
  const forecast = analytics.forecast;
  const actualRate = analytics.actualRate;
  const etaShift = forecast?.etaChangeFromGoalStartDays ?? null;
  const revisionEtaShift = forecast?.etaChangeFromLatestRevisionDays ?? null;
  const closedGoal = analytics.goal.status !== 'active';
  const historicalContextSuffix = closedGoal
    ? 'at goal end'
    : `as of ${formatAdaptiveDate(analytics.strategyAsOfDate)}`;
  const formatEtaShift = (value: number | null) =>
    value === null
      ? 'Not available'
      : value > 1
        ? `${value} days later`
        : value < -1
          ? `${Math.abs(value)} days earlier`
          : 'About unchanged';
  const forecastExplanation = (() => {
    if (!forecast) {
      return 'This historical goal is closed. Pulse preserves its recorded trajectory and does not publish a new completion estimate.';
    }
    if (forecast.status === 'available') {
      return `Your recent trend averaged ${formatAdaptiveWeightChange(actualRate.kgPerWeek, unit)} over ${actualRate.lookbackDays} days versus the selected ${formatAdaptiveWeightChange(analytics.summary.selectedRateKgPerWeek, unit)}.`;
    }
    if (forecast.status === 'reached') {
      return 'The supported Adaptive model trend is inside the target tolerance. Completion still requires the existing accepted check-in review.';
    }
    switch (forecast.unavailableReason) {
      case 'MOVING_AWAY':
        return 'Your recent trend is moving away from the target, so Pulse is not turning that pace into a completion date. Your goal and current targets have not changed.';
      case 'RATE_TOO_SMALL':
        return 'Your supported recent trend is essentially flat, so it does not support an honest completion date. Your goal and current targets have not changed.';
      case 'STALE_WEIGHT':
        return 'Recent weigh-in evidence is stale, so Pulse is not publishing a completion range. Your goal and current targets have not changed.';
      case 'SUSPECT_WEIGHT_DATA':
        return 'Pulse found suspect weight evidence and is withholding a completion range until the data is reviewed. Your goal and current targets have not changed.';
      case 'LIMITED_TREND_CONFIDENCE':
        return 'Pulse can show the measured pace, but the evidence is still limited, so it is not publishing a completion range. Your goal and current targets have not changed.';
      case 'INSUFFICIENT_TREND':
        return 'Pulse does not have enough supported trend history for an honest completion range. Your goal and current targets have not changed.';
      case 'INSUFFICIENT_OBSERVED_WEIGHT':
        return 'Pulse does not have enough observed weigh-ins for an honest completion range. Modeled dates are not counted as scale evidence, and your plan has not changed.';
    }
  })();
  return (
    <Card data-slot="goal-trajectory-forecast">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Gauge aria-hidden="true" className="size-4 text-primary" />
          <CardTitle>
            <h2>Forecast explanation</h2>
          </CardTitle>
        </div>
        <CardDescription>
          Structured evidence using revision {analytics.activeRevision.sequence}, effective{' '}
          {formatAdaptiveDate(analytics.activeRevision.effectiveLocalDate)}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Metric
            label="Selected pace"
            value={`${Math.abs(analytics.summary.selectedRatePctPerWeek).toFixed(2)}%/week · ${formatAdaptiveWeightChange(analytics.summary.selectedRateKgPerWeek, unit)}`}
          />
          <Metric
            label={`Recent pace · ${actualRate.lookbackDays} days`}
            value={
              actualRate.status === 'available'
                ? formatAdaptiveWeightChange(actualRate.kgPerWeek, unit)
                : 'Not measured'
            }
          />
          <Metric
            label="Estimated completion"
            value={
              closedGoal
                ? `Goal closed${analytics.goal.endedLocalDate ? ` ${formatAdaptiveDate(analytics.goal.endedLocalDate)}` : ''}`
                : forecast?.status === 'available'
                  ? `${formatAdaptiveDate(forecast.projectedStartDate)} – ${formatAdaptiveDate(forecast.projectedEndDate)}`
                  : forecast?.status === 'reached'
                    ? 'Target range reached'
                    : 'No reliable estimate yet'
            }
          />
          <Metric label="ETA change since goal start" value={formatEtaShift(etaShift)} />
          <Metric
            label="ETA change since latest revision"
            value={formatEtaShift(revisionEtaShift)}
          />
          <Metric
            label="Rate confidence"
            value={`${actualRate.confidence.replace('_', ' ')} · ${actualRate.observedWeightCount} observed weigh-ins across ${actualRate.spanDays} days`}
          />
        </dl>
        <p className="rounded-xl border border-border/70 bg-muted/15 p-3 text-sm">
          {forecastExplanation}
        </p>
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
          <div className="flex items-start gap-2">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
            <p>
              {analytics.isHistorical
                ? 'This historical record cannot change your plan. Review your current goal in Nutrition Coach for active recommendations.'
                : 'Pulse will not increase a deficit or surplus to catch up. Your next check-in reviews expenditure and safety limits; current targets stay in place until you accept a recommendation.'}
            </p>
          </div>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Metric
            label={
              analytics.isHistorical
                ? `Calorie target ${historicalContextSuffix}`
                : 'Current calorie target'
            }
            value={
              analytics.context.calorieTargetKcal === null
                ? 'Not available'
                : `${Math.round(analytics.context.calorieTargetKcal).toLocaleString()} kcal/day`
            }
          />
          <Metric
            label={
              analytics.isHistorical
                ? `Adaptive expenditure ${historicalContextSuffix}`
                : 'Adaptive expenditure'
            }
            value={
              analytics.context.adaptiveExpenditureKcal === null
                ? 'Not available'
                : `${Math.round(analytics.context.adaptiveExpenditureKcal).toLocaleString()} kcal/day`
            }
          />
        </dl>
      </CardContent>
    </Card>
  );
}

function WeeklyContribution({
  analytics,
  unit,
}: {
  analytics: AdaptiveGoalTrajectory;
  unit: WeightUnit;
}) {
  return (
    <Card data-slot="goal-weekly-contribution">
      <CardHeader>
        <div className="flex items-center gap-2">
          <TrendingUp aria-hidden="true" className="size-4 text-primary" />
          <CardTitle>
            <h2>Weekly contribution</h2>
          </CardTitle>
        </div>
        <CardDescription>
          Weekly movement can go either direction. Pulse uses the longer trend and does not punish
          an individual week.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {analytics.summary.kind === 'weight_change' ? (
          <div className="mb-3 space-y-1 rounded-xl border border-border/70 bg-muted/15 p-3 text-sm tabular-nums">
            <p>
              Original goal distance ·{' '}
              <strong>
                {formatAdaptiveWeight(analytics.summary.originalPlannedChangeKg, unit)}
              </strong>
            </p>
            {analytics.summary.revisionAdjustmentKg !== 0 ? (
              <p>
                Goal revision adjustment ·{' '}
                <strong>
                  {formatAdaptiveWeightDelta(analytics.summary.revisionAdjustmentKg, unit)}
                </strong>
              </p>
            ) : null}
            <p>
              Current planned distance ·{' '}
              <strong>{formatAdaptiveWeight(analytics.summary.totalPlannedChangeKg, unit)}</strong>
            </p>
          </div>
        ) : null}
        {analytics.weeklyContributions.length ? (
          <ol className="space-y-2">
            {analytics.weeklyContributions.map((week) => (
              <li className="rounded-xl border border-border/70 p-3" key={week.periodStartDate}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {formatAdaptiveDate(week.periodStartDate)} –{' '}
                    {formatAdaptiveDate(week.periodEndDate)}
                  </p>
                  <Badge variant="outline">
                    {week.direction === 'insufficient_evidence'
                      ? 'Not enough evidence'
                      : week.direction === 'toward'
                        ? 'Toward target'
                        : week.direction === 'away'
                          ? 'Away from target'
                          : 'Neutral'}
                  </Badge>
                </div>
                <p className="mt-2 text-sm tabular-nums">
                  {week.movementTowardTargetKg === null
                    ? 'Movement not calculated; missing evidence is not treated as zero.'
                    : week.direction === 'away'
                      ? `${formatAdaptiveWeight(Math.abs(week.movementTowardTargetKg), unit)} away from target · ${formatAdaptiveWeight(week.remainingDistanceKg, unit)} remaining`
                      : week.direction === 'neutral'
                        ? `No net movement toward or away from target · ${formatAdaptiveWeight(week.remainingDistanceKg, unit)} remaining`
                        : `${formatAdaptiveWeightDelta(week.movementTowardTargetKg, unit)} toward target · ${formatAdaptiveWeight(week.remainingDistanceKg, unit)} remaining`}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {week.observedWeightCount} observed weigh-in
                  {week.observedWeightCount === 1 ? '' : 's'} in this completed week
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            No completed seven-day goal intervals yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function MaintenanceAnalytics({
  analytics,
  unit,
}: {
  analytics: AdaptiveGoalTrajectory;
  unit: WeightUnit;
}) {
  if (analytics.summary.kind !== 'maintenance') return null;
  const summary = analytics.summary;
  return (
    <Card data-slot="goal-maintenance-analytics">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CalendarRange aria-hidden="true" className="size-4 text-primary" />
          <CardTitle>
            <h2>Dynamic maintenance</h2>
          </CardTitle>
        </div>
        <CardDescription>
          The Pulse-defined band is informational: max(0.68 kg, center × 1%) on each side.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Maintenance band"
            value={`${formatAdaptiveWeight(summary.rangeLowerKg, unit)} – ${formatAdaptiveWeight(summary.rangeUpperKg, unit)}`}
          />
          <Metric
            label="Current position"
            value={
              summary.rangeStatus === 'within'
                ? 'In range'
                : summary.rangeStatus === 'near_edge'
                  ? 'Near edge'
                  : summary.rangeStatus === 'below'
                    ? 'Below range'
                    : summary.rangeStatus === 'above'
                      ? 'Above range'
                      : 'Not enough evidence'
            }
          />
          <Metric
            label="Distance from center"
            value={formatAdaptiveWeightDelta(summary.signedDistanceFromCenterKg, unit)}
          />
          <Metric
            label="Time in range"
            value={
              summary.timeInRange.timeInRangeFraction === null
                ? 'Not enough evidence'
                : `${summary.timeInRange.daysWithinRange} of ${summary.timeInRange.modeledDays} modeled days · ${Math.round(summary.timeInRange.timeInRangeFraction * 100)}%`
            }
          />
        </dl>
        <p className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
          No plan change is being proposed by this read-only view. Small corrective changes may
          appear only through the existing check-in review, and your current targets remain until
          you accept.
        </p>
      </CardContent>
    </Card>
  );
}

function GoalRecord({ analytics, unit }: { analytics: AdaptiveGoalTrajectory; unit: WeightUnit }) {
  return (
    <Card data-slot="goal-trajectory-record">
      <CardHeader>
        <CardTitle>
          <h2>Goal record</h2>
        </CardTitle>
        <CardDescription>
          Immutable strategy revisions and accepted check-ins stay attached to this goal only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="space-y-2">
          {analytics.annotations.map((annotation) => (
            <li className="rounded-xl border border-border/70 p-3 text-sm" key={annotation.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{annotation.label}</span>
                <span className="text-muted-foreground">{formatAdaptiveDate(annotation.date)}</span>
              </div>
              {annotation.revisionSequence ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Revision {annotation.revisionSequence}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted-foreground">
          Display trend: Product Trend Weight v1. Strategy trend: Adaptive model trend (
          {analytics.algorithmVersion}).{' '}
          {analytics.isHistorical ? 'Latest scale evidence in this goal' : 'Current scale evidence'}
          {analytics.summary.latestScale
            ? ` · ${formatAdaptiveDate(analytics.summary.latestScale.date)}: ${formatAdaptiveWeight(analytics.summary.latestScale.weightKg, unit)}`
            : ': Not available'}
          .
        </p>
      </CardContent>
    </Card>
  );
}

function HeroMetric({
  label,
  sublabel,
  value,
}: {
  label: string;
  sublabel: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-muted/15 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

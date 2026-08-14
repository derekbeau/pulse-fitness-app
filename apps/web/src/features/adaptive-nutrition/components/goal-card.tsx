import type { AdaptiveGoal, AdaptiveGoalProgress } from '@pulse/shared';
import { ArrowDownRight, ArrowUpRight, Gauge, Pencil, Target } from 'lucide-react';
import type { RefObject } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { useWeightUnit } from '@/hooks/use-weight-unit';

import {
  formatAdaptiveDate,
  formatAdaptiveWeight,
  formatAdaptiveWeightChange,
} from '../lib/format-adaptive-nutrition';

type GoalCardProps = {
  goal: AdaptiveGoal | null;
  progress: AdaptiveGoalProgress | null;
  goalActionRequired: 'select_goal' | 'complete_goal' | null;
  editButtonRef?: RefObject<HTMLButtonElement | null>;
  startNewButtonRef?: RefObject<HTMLButtonElement | null>;
  onEdit: () => void;
  onStartNew: () => void;
};

const projectionReasonCopy = {
  INSUFFICIENT_TREND: 'Not enough trend data yet',
  STALE_WEIGHT: 'A current weight is needed',
  MOVING_AWAY: 'Recent movement is away from the goal',
  RATE_TOO_SMALL: 'Recent movement is too small to project honestly',
  LOW_CONFIDENCE: 'Trend confidence is still developing',
} as const;

const weightChangeStatusCopy = {
  on_track: 'On track',
  ahead: 'Ahead of desired pace',
  behind: 'Behind desired pace',
  moving_away: 'Moving away from goal',
  reached: 'Goal range reached',
  insufficient_data: 'Building a reliable trend',
} as const;

const maintenanceStatusCopy = {
  within: 'Within range',
  near_edge: 'Near the range edge',
  below: 'Below range',
  above: 'Above range',
  insufficient_data: 'Range status unavailable',
} as const;

export function GoalCard({
  goal,
  progress,
  goalActionRequired,
  editButtonRef,
  startNewButtonRef,
  onEdit,
  onStartNew,
}: GoalCardProps) {
  const { weightUnit } = useWeightUnit();

  if (!goal) {
    return (
      <Card className="overflow-hidden border-amber-500/25 py-0">
        <div className="h-1 bg-amber-500" />
        <CardHeader className="gap-3 px-5 pt-5 sm:px-6">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
            <Target aria-hidden="true" className="size-4" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em]">Your goal</p>
          </div>
          <CardTitle>
            <h2>Choose what you’re working toward</h2>
          </CardTitle>
          <CardDescription className="max-w-2xl leading-relaxed">
            Your nutrition history and learned expenditure are safe. Select a goal before the next
            Adaptive TDEE check-in.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-5 pb-5 sm:px-6">
          <Button ref={startNewButtonRef} className="min-h-11" onClick={onStartNew} type="button">
            Start a new goal
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-primary/25 py-0 shadow-[0_18px_55px_-48px_var(--color-primary)]">
      <div className="h-1 bg-gradient-to-r from-primary via-primary/70 to-transparent" />
      <CardHeader className="gap-3 px-5 pt-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-primary">
            <Target aria-hidden="true" className="size-4" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em]">Your goal</p>
          </div>
          {progress ? (
            <Badge variant="outline">
              {progress.kind === 'weight_change'
                ? weightChangeStatusCopy[progress.status]
                : maintenanceStatusCopy[progress.rangeStatus]}
            </Badge>
          ) : null}
        </div>
        <CardTitle className="text-xl sm:text-2xl">
          <h2>{goalTitle(goal, weightUnit)}</h2>
        </CardTitle>
        <CardDescription>
          Started {formatAdaptiveDate(goal.startedLocalDate)} from a trend weight of{' '}
          {formatAdaptiveWeight(goal.startTrendWeightKg, weightUnit)}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 px-5 pb-5 sm:px-6">
        {!progress ? (
          <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Goal progress is temporarily unavailable. Your goal remains active and no targets have
            changed.
          </div>
        ) : progress.kind === 'weight_change' ? (
          <WeightChangeProgress progress={progress} weightUnit={weightUnit} />
        ) : (
          <MaintenanceProgress progress={progress} weightUnit={weightUnit} />
        )}

        {goalActionRequired === 'complete_goal' ? (
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/8 p-3 text-sm">
            Your trend is within the goal range. Review the completion step before moving to
            maintenance.
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
          <Button ref={editButtonRef} className="min-h-11" onClick={onEdit} type="button">
            <Pencil aria-hidden="true" /> Edit goal
          </Button>
          <Button
            ref={startNewButtonRef}
            className="min-h-11"
            onClick={onStartNew}
            type="button"
            variant="outline"
          >
            <Target aria-hidden="true" /> Start a new goal
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function WeightChangeProgress({
  progress,
  weightUnit,
}: {
  progress: Extract<AdaptiveGoalProgress, { kind: 'weight_change' }>;
  weightUnit: 'kg' | 'lbs';
}) {
  const percent = progress.percentComplete;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Current trend"
          sublabel="Smoothed; not a single weigh-in"
          value={formatAdaptiveWeight(progress.currentTrendWeightKg, weightUnit)}
        />
        <Metric
          label="Latest scale"
          sublabel="Most recent scale entry"
          value={formatAdaptiveWeight(progress.latestScaleWeightKg, weightUnit)}
        />
        <Metric
          label="Completed"
          value={formatAdaptiveWeight(progress.completedDistanceKg, weightUnit)}
        />
        <Metric
          label="Remaining"
          value={formatAdaptiveWeight(progress.remainingDistanceKg, weightUnit)}
        />
      </div>

      {percent === null ? (
        <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
          Progress needs a usable trend weight.
        </p>
      ) : (
        <ProgressBar
          aria-label={`${Math.round(percent)} percent of goal distance completed`}
          className="rounded-xl border border-border/60 bg-muted/20 p-3"
          label="Goal distance"
          max={100}
          showValue={false}
          value={percent}
        />
      )}
      {percent !== null ? (
        <p className="-mt-3 text-right text-sm font-semibold">{Math.round(percent)}% complete</p>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-border/70 p-4">
          <div className="flex items-center gap-2">
            {progress.type === 'lose' ? (
              <ArrowDownRight aria-hidden="true" className="size-4 text-primary" />
            ) : (
              <ArrowUpRight aria-hidden="true" className="size-4 text-primary" />
            )}
            <h3 className="text-sm font-semibold">Pace</h3>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Desired</dt>
              <dd className="mt-1 font-semibold">
                {formatAdaptiveWeightChange(progress.desiredRateKgPerWeek, weightUnit)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Recent actual</dt>
              <dd className="mt-1 font-semibold">
                {formatAdaptiveWeightChange(progress.actualRateKgPerWeek, weightUnit)}
              </dd>
            </div>
          </dl>
        </div>
        <div className="rounded-xl border border-border/70 p-4">
          <div className="flex items-center gap-2">
            <Gauge aria-hidden="true" className="size-4 text-primary" />
            <h3 className="text-sm font-semibold">Estimated completion</h3>
          </div>
          <p className="mt-3 text-sm font-semibold">
            {formatProjection(progress.actualProjection)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Desired-pace window: {formatProjection(progress.desiredProjection)}
          </p>
        </div>
      </div>
    </div>
  );
}

function MaintenanceProgress({
  progress,
  weightUnit,
}: {
  progress: Extract<AdaptiveGoalProgress, { kind: 'maintenance' }>;
  weightUnit: 'kg' | 'lbs';
}) {
  const markerPosition =
    progress.currentTrendWeightKg === null
      ? null
      : Math.min(
          100,
          Math.max(
            0,
            ((progress.currentTrendWeightKg - progress.rangeLowerKg) /
              (progress.rangeUpperKg - progress.rangeLowerKg) +
              0.5) *
              50,
          ),
        );

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric
          label="Current trend"
          sublabel="Smoothed; not a single weigh-in"
          value={formatAdaptiveWeight(progress.currentTrendWeightKg, weightUnit)}
        />
        <Metric
          label="Distance from center"
          value={formatDistanceFromCenter(progress.signedDistanceFromCenterKg, weightUnit)}
        />
        <Metric
          label="Days in range"
          sublabel={`${progress.observedDays} observed trend days`}
          value={String(progress.daysWithinRange)}
        />
      </div>

      <div
        aria-label={`${maintenanceStatusCopy[progress.rangeStatus]}. Maintenance range ${formatAdaptiveWeight(progress.rangeLowerKg, weightUnit)} to ${formatAdaptiveWeight(progress.rangeUpperKg, weightUnit)}. Current trend ${formatAdaptiveWeight(progress.currentTrendWeightKg, weightUnit)}.`}
        className="rounded-xl border border-border/70 p-4"
        role="img"
      >
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{formatAdaptiveWeight(progress.rangeLowerKg, weightUnit)}</span>
          <span className="font-semibold text-foreground">
            Center {formatAdaptiveWeight(progress.centerWeightKg, weightUnit)}
          </span>
          <span>{formatAdaptiveWeight(progress.rangeUpperKg, weightUnit)}</span>
        </div>
        <div className="relative mt-3 h-4 rounded-full bg-secondary">
          <div className="absolute inset-y-0 left-1/4 right-1/4 rounded-full bg-emerald-500/45" />
          {markerPosition !== null ? (
            <span
              aria-hidden="true"
              className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary shadow"
              style={{ left: `${markerPosition}%` }}
            />
          ) : null}
        </div>
        <p className="mt-3 text-sm font-semibold">{maintenanceStatusCopy[progress.rangeStatus]}</p>
      </div>
    </div>
  );
}

function Metric({ label, sublabel, value }: { label: string; sublabel?: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-semibold tabular-nums">{value}</p>
      {sublabel ? <p className="mt-1 text-[0.7rem] text-muted-foreground">{sublabel}</p> : null}
    </div>
  );
}

function goalTitle(goal: AdaptiveGoal, unit: 'kg' | 'lbs') {
  if (goal.type === 'maintain') {
    return `Maintain around ${formatAdaptiveWeight(goal.maintenanceCenterKg, unit)}`;
  }
  return `${goal.type === 'lose' ? 'Lose' : 'Gain'} to ${formatAdaptiveWeight(goal.targetWeightKg, unit)}`;
}

function formatProjection(
  projection: Extract<AdaptiveGoalProgress, { kind: 'weight_change' }>['actualProjection'],
) {
  if (projection.unavailableReason) {
    return projectionReasonCopy[projection.unavailableReason];
  }
  return `${formatAdaptiveDate(projection.projectedStartDate)} – ${formatAdaptiveDate(projection.projectedEndDate)}`;
}

function formatDistanceFromCenter(valueKg: number | null, unit: 'kg' | 'lbs') {
  if (valueKg === null) return '—';
  if (valueKg === 0) return 'At center';
  return `${formatAdaptiveWeight(Math.abs(valueKg), unit)} ${valueKg > 0 ? 'above' : 'below'}`;
}

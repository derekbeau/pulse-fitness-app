import { useMemo, useState } from 'react';
import { type ExerciseTrackingType, type WeightUnit } from '@pulse/shared';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import { getDistanceUnit } from '../lib/tracking';
import type { ActiveWorkoutPerformanceHistorySession } from '../types';
import {
  computeEstimated1RM,
  computeSessionVolume,
  getMetricOptionsForTrackingType,
  type TrendMetricKey,
} from './exercise-trend-metrics';

type ExerciseTrendChartProps = {
  className?: string;
  exerciseName: string;
  sessions: ActiveWorkoutPerformanceHistorySession[];
  trackingType?: ExerciseTrackingType;
  weightUnit?: WeightUnit;
};

type DateRange = '30d' | '90d' | 'all';

type ChartDatum = {
  date: string;
  dateLabel: string;
  value: number;
};

const dateRangeOptions: Array<{ label: string; value: DateRange }> = [
  { label: 'Last 30 days', value: '30d' },
  { label: 'Last 90 days', value: '90d' },
  { label: 'All time', value: 'all' },
];

const axisDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

const tooltipDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

export function ExerciseTrendChart({
  className,
  exerciseName,
  sessions,
  trackingType = 'weight_reps',
  weightUnit = 'lbs',
}: ExerciseTrendChartProps) {
  const [selectedRange, setSelectedRange] = useState<DateRange>('90d');
  const metricOptions = useMemo(
    () => getMetricOptionsForTrackingType(trackingType),
    [trackingType],
  );
  const [selectedMetric, setSelectedMetric] = useState<TrendMetricKey>(metricOptions[0]?.key ?? 'max_reps');
  const activeMetric = metricOptions.some((metric) => metric.key === selectedMetric)
    ? selectedMetric
    : (metricOptions[0]?.key ?? 'max_reps');

  const chartData = useMemo(() => {
    const sortedHistory = [...sessions].sort((left, right) => left.date.localeCompare(right.date));

    return filterHistoryByRange(sortedHistory, selectedRange)
      .map((session) => {
        const value = computeMetricValueFromSession(session, activeMetric, trackingType);

        if (value == null) {
          return null;
        }

        return {
          date: session.date,
          dateLabel: axisDateFormatter.format(new Date(`${session.date}T12:00:00`)),
          value,
        };
      })
      .filter((point): point is ChartDatum => point != null);
  }, [activeMetric, selectedRange, sessions, trackingType]);

  const selectedMetricLabel =
    metricOptions.find((metric) => metric.key === activeMetric)?.label ?? 'Max Reps';
  const metricUnit = getMetricUnit(activeMetric, trackingType, weightUnit);
  const yAxisLabel = `${selectedMetricLabel} (${metricUnit})`;

  return (
    <Card className={cn('w-full border-border bg-card/95 py-0 shadow-sm', className)}>
      <CardHeader className="gap-4 border-b border-border py-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">{exerciseName}</CardTitle>
            <p className="text-sm text-muted">Track progression across completed sessions.</p>
          </div>

          <div
            aria-label="Trend date range"
            className="inline-flex w-full flex-wrap items-center gap-2 rounded-full border border-border bg-secondary/35 p-1 sm:w-auto"
            role="group"
          >
            {dateRangeOptions.map((option) => (
              <Button
                aria-pressed={selectedRange === option.value}
                className="rounded-full"
                key={option.value}
                onClick={() => setSelectedRange(option.value)}
                size="sm"
                type="button"
                variant={selectedRange === option.value ? 'default' : 'ghost'}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        <div
          aria-label="Trend metric selector"
          className="inline-flex w-full flex-wrap items-center gap-2 rounded-full border border-border bg-secondary/35 p-1"
          role="group"
        >
          {metricOptions.map((metric) => (
            <Button
              aria-pressed={activeMetric === metric.key}
              className="rounded-full"
              key={metric.key}
              onClick={() => setSelectedMetric(metric.key)}
              size="sm"
              type="button"
              variant={activeMetric === metric.key ? 'default' : 'ghost'}
            >
              {metric.label}
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="px-4 py-5 sm:px-6">
        {chartData.length === 0 ? (
          <div className="flex min-h-56 items-center justify-center rounded-3xl border border-dashed border-border bg-secondary/20 px-6 text-center">
            <div className="space-y-2">
              <p className="text-base font-semibold text-foreground">No history yet</p>
              <p className="text-sm text-muted">
                Complete a few sessions for {exerciseName.toLowerCase()} to unlock progression
                trends.
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-4xl space-y-4">
            <MetricCard
              accentClassName="bg-[var(--color-accent-mint)] text-on-mint"
              label={`Latest ${selectedMetricLabel.toLowerCase()}`}
              value={`${numberFormatter.format(chartData.at(-1)?.value ?? 0)} ${metricUnit}`.trim()}
            />

            <div
              aria-label={`${exerciseName} trend chart`}
              className="h-72 w-full rounded-3xl border border-border bg-background/60 p-3 sm:h-80 sm:p-4"
              role="img"
            >
              <ResponsiveContainer height="100%" width="100%">
                <LineChart data={chartData} margin={{ top: 12, right: 12, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                  <XAxis
                    axisLine={false}
                    dataKey="dateLabel"
                    minTickGap={24}
                    tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
                    tickLine={false}
                  />
                  <YAxis
                    axisLine={false}
                    orientation="left"
                    tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
                    tickFormatter={(value: number) => formatAxisTick(value, metricUnit)}
                    tickLine={false}
                    width={60}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-card)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '16px',
                      color: 'var(--color-foreground)',
                    }}
                    formatter={(value: number | undefined) => [
                      `${numberFormatter.format(value ?? 0)} ${metricUnit}`.trim(),
                      selectedMetricLabel,
                    ]}
                    labelFormatter={(_label, payload) => {
                      const point = payload?.[0]?.payload as ChartDatum | undefined;

                      return point ? tooltipDateFormatter.format(new Date(`${point.date}T12:00:00`)) : '';
                    }}
                    separator=": "
                  />
                  <Line
                    dataKey="value"
                    dot={{ fill: 'var(--color-primary)', r: 4, strokeWidth: 0 }}
                    isAnimationActive={false}
                    name={yAxisLabel}
                    stroke="var(--color-primary)"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    type="monotone"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MetricCard({
  accentClassName,
  label,
  value,
}: {
  accentClassName: string;
  label: string;
  value: string;
}) {
  return (
    <div className={cn('rounded-3xl px-4 py-4', accentClassName)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-75">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function getMetricUnit(
  metricKey: TrendMetricKey,
  trackingType: ExerciseTrackingType,
  weightUnit: WeightUnit,
) {
  if (metricKey === 'max_weight' || metricKey === 'est_1rm') {
    return weightUnit;
  }

  if (metricKey === 'max_reps') {
    return trackingType === 'distance' ? getDistanceUnit(weightUnit) : 'reps';
  }

  if (metricKey === 'total_volume') {
    return `${weightUnit}*reps`;
  }

  return 'sec';
}

function computeMetricValueFromSession(
  session: ActiveWorkoutPerformanceHistorySession,
  metric: TrendMetricKey,
  trackingType: ExerciseTrackingType,
): number | null {
  const setsWithReps = session.sets.filter(
    (set): set is { reps: number; setNumber: number; weight: number | null } => set.reps != null,
  );

  if (setsWithReps.length === 0) {
    return null;
  }

  if (metric === 'max_weight') {
    const maxWeight = setsWithReps.reduce((best, set) => Math.max(best, set.weight ?? 0), 0);
    return Number.isFinite(maxWeight) ? maxWeight : null;
  }

  if (metric === 'max_reps') {
    return setsWithReps.reduce((best, set) => Math.max(best, set.reps), 0);
  }

  if (metric === 'max_time') {
    return setsWithReps.reduce((best, set) => Math.max(best, set.reps), 0);
  }

  if (trackingType !== 'weight_reps') {
    return null;
  }

  const weightedSets = setsWithReps.filter((set) => (set.weight ?? 0) > 0);
  if (weightedSets.length === 0) {
    return null;
  }

  if (metric === 'total_volume') {
    return computeSessionVolume(
      weightedSets.map((set) => ({
        reps: set.reps,
        weight: set.weight ?? 0,
      })),
    );
  }

  if (metric === 'est_1rm') {
    return weightedSets.reduce((best, set) => {
      const estimated = computeEstimated1RM(set.weight ?? 0, set.reps);
      return estimated > best ? estimated : best;
    }, 0);
  }

  return null;
}

function formatAxisTick(value: number, unit: string) {
  return `${numberFormatter.format(value)} ${unit}`.trim();
}

function filterHistoryByRange(history: ActiveWorkoutPerformanceHistorySession[], range: DateRange) {
  if (range === 'all' || history.length === 0) {
    return history;
  }

  const latestDate = new Date(`${history[history.length - 1]?.date}T12:00:00`);
  const windowDays = range === '30d' ? 30 : 90;
  const startDate = new Date(latestDate);
  startDate.setDate(startDate.getDate() - (windowDays - 1));

  return history.filter((point) => new Date(`${point.date}T12:00:00`) >= startDate);
}

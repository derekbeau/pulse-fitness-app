import { useMemo, useState } from 'react';
import { type ExerciseTrackingType, type WeightUnit } from '@pulse/shared';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import { getDistanceUnit } from '../lib/tracking';
import type { ActiveWorkoutExerciseHistoryPoint } from '../types';

type ExerciseTrendChartProps = {
  className?: string;
  exerciseName: string;
  history: ActiveWorkoutExerciseHistoryPoint[];
  trackingType?: ExerciseTrackingType;
  weightUnit?: WeightUnit;
};

type DateRange = '30d' | '90d' | 'all';

type MetricKey = 'distance' | 'reps' | 'seconds' | 'weight';

type MetricConfig = {
  color: string;
  key: MetricKey;
  label: string;
  unit: string;
  yAxisId: 'primary' | 'secondary';
};

type ChartDatum = ActiveWorkoutExerciseHistoryPoint & {
  dateLabel: string;
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
  history,
  trackingType = 'weight_reps',
  weightUnit = 'lbs',
}: ExerciseTrendChartProps) {
  const [selectedRange, setSelectedRange] = useState<DateRange>('90d');
  const metricConfig = getMetricConfig(trackingType, weightUnit);

  const chartData = useMemo(() => {
    const sortedHistory = [...history].sort((left, right) => left.date.localeCompare(right.date));

    return filterHistoryByRange(sortedHistory, selectedRange).map((point) => ({
      ...point,
      dateLabel: axisDateFormatter.format(new Date(`${point.date}T12:00:00`)),
      distance: point.distance ?? 0,
      reps: point.reps ?? 0,
      seconds: point.seconds ?? point.reps ?? 0,
      weight: point.weight ?? 0,
    }));
  }, [history, selectedRange]);

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
            <div className={cn('grid gap-3', metricConfig.secondary ? 'sm:grid-cols-2' : 'sm:grid-cols-1')}>
              <MetricCard
                accentClassName="bg-[var(--color-accent-mint)] text-on-mint"
                label={`Latest ${metricConfig.primary.label.toLowerCase()}`}
                value={formatMetricValue(chartData.at(-1), metricConfig.primary)}
              />
              {metricConfig.secondary ? (
                <MetricCard
                  accentClassName="bg-[var(--color-accent-cream)] text-on-cream"
                  label={`Latest ${metricConfig.secondary.label.toLowerCase()}`}
                  value={formatMetricValue(chartData.at(-1), metricConfig.secondary)}
                />
              ) : null}
            </div>

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
                    tickFormatter={(value: number) => formatAxisTick(value, metricConfig.primary.unit)}
                    tickLine={false}
                    yAxisId="primary"
                    width={56}
                  />
                  {metricConfig.secondary ? (
                    <YAxis
                      axisLine={false}
                      orientation="right"
                      tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
                      tickFormatter={(value: number) =>
                        formatAxisTick(value, metricConfig.secondary?.unit ?? '')
                      }
                      tickLine={false}
                      yAxisId="secondary"
                      width={56}
                    />
                  ) : null}
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-card)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '16px',
                      color: 'var(--color-foreground)',
                    }}
                    formatter={(value: number | undefined, name: string | undefined) => {
                      let metric = metricConfig.primary;

                      if (metricConfig.secondary && metricConfig.secondary.key === name) {
                        metric = metricConfig.secondary;
                      }

                      return [`${numberFormatter.format(value ?? 0)} ${metric.unit}`.trim(), metric.label];
                    }}
                    labelFormatter={(_label, payload) => {
                      const point = payload?.[0]?.payload as ChartDatum | undefined;

                      return point
                        ? tooltipDateFormatter.format(new Date(`${point.date}T12:00:00`))
                        : '';
                    }}
                    separator=": "
                  />
                  <Line
                    dataKey={metricConfig.primary.key}
                    dot={{ fill: metricConfig.primary.color, r: 4, strokeWidth: 0 }}
                    isAnimationActive={false}
                    name={metricConfig.primary.key}
                    stroke={metricConfig.primary.color}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    type="monotone"
                    yAxisId={metricConfig.primary.yAxisId}
                  />
                  {metricConfig.secondary ? (
                    <Line
                      dataKey={metricConfig.secondary.key}
                      dot={{ fill: metricConfig.secondary.color, r: 4, strokeWidth: 0 }}
                      isAnimationActive={false}
                      name={metricConfig.secondary.key}
                      stroke={metricConfig.secondary.color}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      type="monotone"
                      yAxisId={metricConfig.secondary.yAxisId}
                    />
                  ) : null}
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

function getMetricConfig(trackingType: ExerciseTrackingType, weightUnit: WeightUnit) {
  const distanceUnit = getDistanceUnit(weightUnit);

  const weightMetric: MetricConfig = {
    color: 'var(--color-primary)',
    key: 'weight',
    label: 'Weight',
    unit: weightUnit,
    yAxisId: 'primary',
  };

  const repsMetric: MetricConfig = {
    color: 'var(--color-accent-cream)',
    key: 'reps',
    label: 'Reps',
    unit: 'reps',
    yAxisId: 'secondary',
  };

  const secondsMetric: MetricConfig = {
    color: 'var(--color-accent-cream)',
    key: 'seconds',
    label: 'Duration',
    unit: 'sec',
    yAxisId: 'secondary',
  };

  const distanceMetric: MetricConfig = {
    color: 'var(--color-primary)',
    key: 'distance',
    label: 'Distance',
    unit: distanceUnit,
    yAxisId: 'primary',
  };

  switch (trackingType) {
    case 'weight_reps':
      return { primary: weightMetric, secondary: repsMetric };
    case 'weight_seconds':
      return { primary: weightMetric, secondary: secondsMetric };
    case 'bodyweight_reps':
    case 'reps_only':
      return { primary: { ...repsMetric, yAxisId: 'primary' as const }, secondary: null };
    case 'reps_seconds':
      return {
        primary: { ...repsMetric, yAxisId: 'primary' as const },
        secondary: secondsMetric,
      };
    case 'seconds_only':
      return { primary: { ...secondsMetric, yAxisId: 'primary' as const }, secondary: null };
    case 'distance':
      return { primary: distanceMetric, secondary: null };
    case 'cardio':
      return {
        primary: { ...secondsMetric, yAxisId: 'primary' as const },
        secondary: { ...distanceMetric, yAxisId: 'secondary' as const },
      };
    default:
      return { primary: weightMetric, secondary: repsMetric };
  }
}

function formatMetricValue(point: ChartDatum | undefined, metric: MetricConfig) {
  const value = point ? Number(point[metric.key] ?? 0) : 0;
  return `${numberFormatter.format(value)} ${metric.unit}`.trim();
}

function formatAxisTick(value: number, unit: string) {
  return `${numberFormatter.format(value)} ${unit}`.trim();
}

function filterHistoryByRange(history: ActiveWorkoutExerciseHistoryPoint[], range: DateRange) {
  if (range === 'all' || history.length === 0) {
    return history;
  }

  const latestDate = new Date(`${history[history.length - 1]?.date}T12:00:00`);
  const windowDays = range === '30d' ? 30 : 90;
  const startDate = new Date(latestDate);
  startDate.setDate(startDate.getDate() - (windowDays - 1));

  return history.filter((point) => new Date(`${point.date}T12:00:00`) >= startDate);
}

import { useMemo, useState } from 'react';
import {
  resolveChartDateRange,
  type ChartRangePreset,
  type ExerciseTrackingType,
  type WeightUnit,
} from '@pulse/shared';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  ChartDataTable,
  ChartFrame,
  ChartLegend,
  ChartPointDetail,
  ChartRangeControl,
  ChartState,
  ChartSummary,
  ChartTooltip,
  formatChartAxisDate,
  formatChartDate,
} from '@/components/charts';
import { Button } from '@/components/ui/button';
import { getToday, toDateKey } from '@/lib/date';

import { getDistanceUnit } from '../lib/tracking';
import type { ActiveWorkoutPerformanceHistorySession } from '../types';
import { buildExerciseTrendData, type ExerciseTrendDatum } from './exercise-trend-data';
import { getMetricOptionsForTrackingType, type TrendMetricKey } from './exercise-trend-metrics';

type ExerciseTrendChartProps = {
  className?: string;
  exerciseName: string;
  sessions: ActiveWorkoutPerformanceHistorySession[];
  trackingType?: ExerciseTrackingType;
  weightUnit?: WeightUnit;
};

type DateRange = Extract<ChartRangePreset, '1m' | '3m' | 'all'>;

const dateRangeOptions = [
  { label: '1M', value: '1m' },
  { label: '3M', value: '3m' },
  { label: 'All', value: 'all' },
] as const satisfies ReadonlyArray<{ label: string; value: DateRange }>;

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
  const [selectedRange, setSelectedRange] = useState<DateRange>('3m');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const metricOptions = useMemo(
    () => getMetricOptionsForTrackingType(trackingType),
    [trackingType],
  );
  const [selectedMetric, setSelectedMetric] = useState<TrendMetricKey>(
    metricOptions[0]?.key ?? 'max_reps',
  );
  const activeMetric = metricOptions.some((metric) => metric.key === selectedMetric)
    ? selectedMetric
    : (metricOptions[0]?.key ?? 'max_reps');
  const sortedSessions = useMemo(
    () =>
      [...sessions].sort(
        (left, right) =>
          left.date.localeCompare(right.date) || left.sessionId.localeCompare(right.sessionId),
      ),
    [sessions],
  );
  const referenceDate = sortedSessions.at(-1)?.date ?? toDateKey(getToday());
  const earliestDate = sortedSessions[0]?.date ?? referenceDate;
  const dateRange = useMemo(
    () =>
      resolveChartDateRange({
        earliestDate,
        preset: selectedRange,
        referenceDate,
      }),
    [earliestDate, referenceDate, selectedRange],
  );
  const chartData = useMemo(
    () =>
      buildExerciseTrendData({
        metric: activeMetric,
        sessions: sortedSessions.filter(
          (session) => session.date >= dateRange.startDate && session.date <= dateRange.endDate,
        ),
        trackingType,
      }),
    [activeMetric, dateRange.endDate, dateRange.startDate, sortedSessions, trackingType],
  );

  const selectedMetricLabel =
    metricOptions.find((metric) => metric.key === activeMetric)?.label ?? 'Max Reps';
  const metricUnit = getMetricUnit(activeMetric, trackingType, weightUnit);
  const selectedPoint = selectedSessionId
    ? (chartData.find((point) => point.sessionId === selectedSessionId) ?? null)
    : null;
  const sessionPositions = useMemo(() => buildSessionPositions(chartData), [chartData]);
  const firstValue = chartData[0]?.value ?? null;
  const latestValue = chartData.at(-1)?.value ?? null;
  const change = firstValue === null || latestValue === null ? null : latestValue - firstValue;
  const minimum = chartData.length > 0 ? Math.min(...chartData.map((point) => point.value)) : null;
  const maximum = chartData.length > 0 ? Math.max(...chartData.map((point) => point.value)) : null;

  return (
    <ChartFrame
      annotations={
        <div
          aria-label="Trend metric selector"
          className="flex w-full flex-wrap items-center gap-1 rounded-2xl bg-secondary/30 p-1"
          role="group"
        >
          {metricOptions.map((metric) => (
            <Button
              aria-pressed={activeMetric === metric.key}
              className="min-h-11 rounded-full"
              key={metric.key}
              onClick={() => {
                setSelectedMetric(metric.key);
                setSelectedSessionId(null);
              }}
              type="button"
              variant={activeMetric === metric.key ? 'default' : 'ghost'}
            >
              {metric.label}
            </Button>
          ))}
        </div>
      }
      className={className}
      controls={
        <ChartRangeControl
          aria-controls="exercise-trend-visual"
          label="Trend date range"
          onChange={(value) => {
            setSelectedRange(value);
            setSelectedSessionId(null);
          }}
          options={dateRangeOptions}
          statusText={`${selectedRange.toUpperCase()} · ${formatChartDate(dateRange.startDate)}–${formatChartDate(dateRange.endDate)} · ${chartData.length} sessions`}
          value={selectedRange}
        />
      }
      description={`Track ${selectedMetricLabel.toLowerCase()} across completed sessions. Ranges end on the latest session, ${formatChartDate(referenceDate)}.`}
      detail={
        selectedPoint ? (
          <ChartPointDetail>
            <p className="font-medium text-foreground">{formatChartDate(selectedPoint.date)}</p>
            {(sessionPositions.get(selectedPoint.sessionId)?.count ?? 1) > 1 ? (
              <p className="mt-1 text-muted-foreground">
                Session {sessionPositions.get(selectedPoint.sessionId)?.position} of{' '}
                {sessionPositions.get(selectedPoint.sessionId)?.count}
              </p>
            ) : null}
            <p className="mt-1 text-muted-foreground">
              {selectedMetricLabel} {formatMetricValue(selectedPoint.value, metricUnit)}
            </p>
          </ChartPointDetail>
        ) : null
      }
      id="exercise-trend"
      summary={
        <ChartSummary
          items={[
            {
              detail: chartData.at(-1)?.date
                ? formatChartDate(chartData.at(-1)?.date ?? referenceDate)
                : 'No completed session',
              label: `Latest ${selectedMetricLabel.toLowerCase()}`,
              value:
                latestValue === null ? 'Not available' : formatMetricValue(latestValue, metricUnit),
            },
            {
              detail: `${chartData.length} valid sessions`,
              label: 'Selected-range change',
              value:
                change === null
                  ? 'Not available'
                  : `${change > 0 ? '+' : ''}${formatMetricValue(change, metricUnit)}`,
            },
            {
              label: 'Minimum',
              value: minimum === null ? 'Not available' : formatMetricValue(minimum, metricUnit),
            },
            {
              label: 'Maximum',
              value: maximum === null ? 'Not available' : formatMetricValue(maximum, metricUnit),
            },
          ]}
          label="Selected exercise range summary"
        />
      }
      table={
        <ChartDataTable
          caption={`Exact ${exerciseName} ${selectedMetricLabel} values`}
          columns={[
            { key: 'date', header: 'Date', render: (point) => formatChartDate(point.date) },
            {
              key: 'value',
              header: selectedMetricLabel,
              render: (point) => formatMetricValue(point.value, metricUnit),
            },
          ]}
          getRowKey={(point) => point.sessionId}
          onSelectRow={(point) => setSelectedSessionId(point.sessionId)}
          rows={chartData}
          selectionLabel={(point) => {
            const position = sessionPositions.get(point.sessionId);
            return `Inspect ${formatChartDate(point.date)}${position && position.count > 1 ? ` · session ${position.position} of ${position.count}` : ''}`;
          }}
        />
      }
      title={exerciseName}
    >
      {chartData.length === 0 ? (
        <ChartState
          description={`Complete a session with a supported ${selectedMetricLabel.toLowerCase()} value to unlock this trend.`}
          kind="empty"
          title="No history in this range"
        />
      ) : (
        <div className="space-y-3">
          <ChartLegend
            items={[
              {
                color: 'var(--color-primary)',
                label: `${selectedMetricLabel} (${metricUnit})`,
                style: 'line',
              },
            ]}
          />
          <div
            aria-label={`${exerciseName} trend chart`}
            className="h-72 min-w-0 sm:h-80"
            role="img"
          >
            <ResponsiveContainer
              height="100%"
              initialDimension={{ height: 288, width: 320 }}
              width="100%"
            >
              <LineChart
                data={chartData}
                margin={{ top: 12, right: 12, bottom: 4, left: 0 }}
                onClick={(state) => {
                  if (typeof state?.activeLabel === 'string') {
                    setSelectedSessionId(state.activeLabel);
                  }
                }}
              >
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis
                  axisLine={false}
                  dataKey="sessionId"
                  minTickGap={24}
                  tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
                  tickFormatter={(sessionId: string) => {
                    const point = chartData.find((datum) => datum.sessionId === sessionId);
                    return point ? formatChartAxisDate(point.date) : '';
                  }}
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
                  content={({ active, payload }) => {
                    const point = payload?.[0]?.payload as ExerciseTrendDatum | undefined;
                    const position = point ? sessionPositions.get(point.sessionId) : undefined;
                    return active && point ? (
                      <ChartTooltip
                        date={`${formatChartDate(point.date)}${position && position.count > 1 ? ` · Session ${position.position} of ${position.count}` : ''}`}
                        rows={[
                          {
                            color: 'var(--color-primary)',
                            label: selectedMetricLabel,
                            value:
                              typeof payload?.[0]?.value === 'number'
                                ? formatMetricValue(payload[0].value, metricUnit)
                                : null,
                          },
                        ]}
                      />
                    ) : null;
                  }}
                />
                <Line
                  dataKey="value"
                  dot={{ fill: 'var(--color-primary)', r: 4, strokeWidth: 0 }}
                  isAnimationActive={false}
                  name={selectedMetricLabel}
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
    </ChartFrame>
  );
}

function buildSessionPositions(points: ExerciseTrendDatum[]) {
  const pointsByDate = new Map<string, ExerciseTrendDatum[]>();
  for (const point of points) {
    pointsByDate.set(point.date, [...(pointsByDate.get(point.date) ?? []), point]);
  }

  const positions = new Map<string, { count: number; position: number }>();
  for (const sameDatePoints of pointsByDate.values()) {
    sameDatePoints.forEach((point, index) => {
      positions.set(point.sessionId, { count: sameDatePoints.length, position: index + 1 });
    });
  }
  return positions;
}

function getMetricUnit(
  metricKey: TrendMetricKey,
  trackingType: ExerciseTrackingType,
  weightUnit: WeightUnit,
) {
  if (metricKey === 'max_weight' || metricKey === 'est_1rm') return weightUnit;
  if (metricKey === 'max_reps') {
    return trackingType === 'distance' ? getDistanceUnit(weightUnit) : 'reps';
  }
  if (metricKey === 'total_volume') return `${weightUnit}*reps`;
  return 'sec';
}

function formatMetricValue(value: number, unit: string) {
  return `${numberFormatter.format(value)} ${unit}`.trim();
}

function formatAxisTick(value: number, unit: string) {
  return `${numberFormatter.format(value)} ${unit}`.trim();
}

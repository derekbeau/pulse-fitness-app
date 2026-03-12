import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BodyWeightEntry } from '@pulse/shared';
import { computeEWMA, computeWeightInsights } from '@pulse/shared';
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
import { apiRequest } from '@/lib/api-client';
import { formatTrendChange, formatWeight } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

type RangeOption = {
  value: '1w' | '1m' | '3m' | '6m' | '1y' | 'all';
  label: '1W' | '1M' | '3M' | '6M' | '1Y' | 'All';
  days: number | null;
};

type ChartPoint = {
  date: string;
  scale: number;
  trend: number;
};

const RANGE_OPTIONS: RangeOption[] = [
  { value: '1w', label: '1W', days: 7 },
  { value: '1m', label: '1M', days: 30 },
  { value: '3m', label: '3M', days: 90 },
  { value: '6m', label: '6M', days: 180 },
  { value: '1y', label: '1Y', days: 365 },
  { value: 'all', label: 'All', days: null },
];

const DEFAULT_RANGE: RangeOption = RANGE_OPTIONS[1];
const SERIES_COLORS = {
  scale: 'var(--color-primary)',
  trend: 'var(--color-accent-cream)',
} as const;

const axisDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

const tooltipDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const fetchWeightEntries = async (days: number | null) => {
  const params = new URLSearchParams();

  if (days !== null) {
    params.set('days', String(days));
  }

  const query = params.toString();
  const path = query ? `/api/v1/weight?${query}` : '/api/v1/weight';

  return apiRequest<BodyWeightEntry[]>(path, { method: 'GET' });
};

const formatWeightLabel = (value: number) => formatWeight(value, 'lbs');

const formatInsightChange = (change: number) => {
  const formatted = formatTrendChange(change);
  const signPrefix = change > 0 ? '+' : '';
  return `${signPrefix}${formatted} lbs`;
};

const getDirectionGlyph = (direction: 'up' | 'down' | 'stable') => {
  if (direction === 'up') {
    return '↑';
  }

  if (direction === 'down') {
    return '↓';
  }

  return '→';
};

const computeYAxisDomain = (data: ChartPoint[]): [number, number] => {
  if (data.length === 0) {
    return [0, 1];
  }

  const values = data.flatMap((entry) => [entry.scale, entry.trend]);
  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    const baselinePadding = Math.max(1, min * 0.02);
    return [min - baselinePadding, max + baselinePadding];
  }

  const dynamicPadding = Math.max(0.5, (max - min) * 0.1);
  return [Number((min - dynamicPadding).toFixed(1)), Number((max + dynamicPadding).toFixed(1))];
};

export function WeightTrendChart() {
  const [selectedRange, setSelectedRange] = useState<RangeOption>(DEFAULT_RANGE);
  const [visibleSeries, setVisibleSeries] = useState({
    scale: true,
    trend: true,
  });

  const weightEntriesQuery = useQuery({
    queryKey: ['dashboard', 'weight-trend-chart', selectedRange.value],
    queryFn: () => fetchWeightEntries(selectedRange.days),
  });

  const chartData = useMemo(() => {
    const entries = weightEntriesQuery.data ?? [];

    return computeEWMA(entries.map((entry) => ({ date: entry.date, weight: entry.weight })));
  }, [weightEntriesQuery.data]);

  const threeDayInsights = useMemo(() => computeWeightInsights(chartData, 3), [chartData]);
  const sevenDayInsights = useMemo(() => computeWeightInsights(chartData, 7), [chartData]);

  const headerInsights = useMemo(() => {
    if (chartData.length === 0) {
      return {
        avgWeight: 0,
        currentTrend: 0,
      };
    }

    const avgPeriod = selectedRange.days ?? chartData.length;
    const summary = computeWeightInsights(chartData, avgPeriod);

    return {
      avgWeight: summary.avgWeight,
      currentTrend: chartData[chartData.length - 1]?.trend ?? 0,
    };
  }, [chartData, selectedRange.days]);

  const yDomain = useMemo(() => computeYAxisDomain(chartData), [chartData]);

  const toggleSeries = (series: 'scale' | 'trend') => {
    setVisibleSeries((current) => ({
      ...current,
      [series]: !current[series],
    }));
  };

  return (
    <Card aria-labelledby="weight-trend-chart-heading" data-slot="weight-trend-chart">
      <CardHeader className="gap-4 border-b border-border/70 pb-5">
        <div className="space-y-1">
          <CardTitle>
            <h2
              className="text-xl font-semibold text-foreground md:text-2xl"
              id="weight-trend-chart-heading"
            >
              Weight Trend
            </h2>
          </CardTitle>
          <p className="text-sm text-muted-foreground">Scale weight with EWMA smoothing.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-secondary/45 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Current trend
            </p>
            <p
              className="mt-1 text-2xl font-semibold text-foreground"
              data-slot="weight-trend-current-trend"
            >
              {chartData.length > 0 ? formatWeightLabel(headerInsights.currentTrend) : '--'}
            </p>
          </div>
          <div className="rounded-xl bg-secondary/45 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Period average
            </p>
            <p
              className="mt-1 text-2xl font-semibold text-foreground"
              data-slot="weight-trend-period-average"
            >
              {chartData.length > 0 ? formatWeightLabel(headerInsights.avgWeight) : '--'}
            </p>
          </div>
        </div>

        <div
          aria-label="Weight trend range"
          className="inline-flex w-full flex-wrap items-center gap-2 rounded-full border border-border bg-secondary/35 p-1"
          role="group"
        >
          {RANGE_OPTIONS.map((option) => (
            <Button
              aria-pressed={selectedRange.value === option.value}
              className="rounded-full"
              key={option.value}
              onClick={() => setSelectedRange(option)}
              size="sm"
              type="button"
              variant={selectedRange.value === option.value ? 'default' : 'ghost'}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-5 px-4 py-5 sm:px-6">
        {weightEntriesQuery.isLoading ? (
          <div
            className="h-[280px] w-full animate-pulse rounded-2xl bg-muted/50"
            data-slot="weight-trend-loading"
          />
        ) : weightEntriesQuery.isError ? (
          <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-border/70 bg-muted/20 px-6 text-center">
            <p className="text-sm text-muted-foreground">Unable to load weight trend data.</p>
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-border bg-muted/15 px-6 text-center">
            <div className="space-y-2">
              <p className="text-base font-semibold text-foreground">
                Log your weight to see trends
              </p>
              <a
                className="text-sm font-medium text-primary hover:underline"
                href="#dashboard-log-weight-card"
              >
                Go to weight entry
              </a>
            </div>
          </div>
        ) : (
          <>
            {!visibleSeries.scale && !visibleSeries.trend ? (
              <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground sm:h-[320px]">
                Enable at least one series to display the chart.
              </div>
            ) : (
              <div
                aria-label="Weight trend chart"
                className="h-[280px] w-full sm:h-[320px]"
                role="img"
              >
                <ResponsiveContainer height="100%" width="100%">
                  <LineChart data={chartData} margin={{ top: 12, right: 8, bottom: 6, left: 2 }}>
                    <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                    <XAxis
                      axisLine={false}
                      dataKey="date"
                      minTickGap={20}
                      tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
                      tickFormatter={(value: string) =>
                        axisDateFormatter.format(new Date(`${value}T12:00:00`))
                      }
                      tickLine={false}
                    />
                    <YAxis
                      axisLine={false}
                      domain={yDomain}
                      tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
                      tickFormatter={(value: number) => formatTrendChange(value)}
                      tickLine={false}
                      width={50}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--color-card)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '14px',
                        color: 'var(--color-foreground)',
                      }}
                      formatter={(value: number | undefined, name: string | undefined) => {
                        if (name === 'scale') {
                          return [formatWeightLabel(value ?? 0), 'Scale Weight'];
                        }

                        return [formatWeightLabel(value ?? 0), 'Trend Weight'];
                      }}
                      labelFormatter={(label) =>
                        typeof label === 'string'
                          ? tooltipDateFormatter.format(new Date(`${label}T12:00:00`))
                          : ''
                      }
                      separator=": "
                    />
                    {visibleSeries.scale ? (
                      <Line
                        dataKey="scale"
                        dot={{ fill: SERIES_COLORS.scale, r: 3.5, strokeWidth: 0 }}
                        isAnimationActive={false}
                        name="scale"
                        stroke={SERIES_COLORS.scale}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        type="monotone"
                      />
                    ) : null}
                    {visibleSeries.trend ? (
                      <Line
                        dataKey="trend"
                        dot={{
                          fill: SERIES_COLORS.trend,
                          r: 4,
                          stroke: 'var(--color-card)',
                          strokeWidth: 1.5,
                        }}
                        isAnimationActive={false}
                        name="trend"
                        stroke={SERIES_COLORS.trend}
                        strokeDasharray="6 4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        type="monotone"
                      />
                    ) : null}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2" data-slot="weight-trend-legend">
              <LegendToggle
                active={visibleSeries.scale}
                color={SERIES_COLORS.scale}
                label="Scale Weight"
                onClick={() => toggleSeries('scale')}
              />
              <LegendToggle
                active={visibleSeries.trend}
                color={SERIES_COLORS.trend}
                label="Trend Weight"
                onClick={() => toggleSeries('trend')}
              />
            </div>

            <div
              className="grid gap-2 rounded-xl border border-border/70 bg-secondary/25 px-4 py-3"
              data-slot="weight-trend-insights"
            >
              <p className="text-sm text-foreground">
                3-day change: {formatInsightChange(threeDayInsights.periodChange)}{' '}
                <span aria-label={`3-day direction ${threeDayInsights.direction}`}>
                  {getDirectionGlyph(threeDayInsights.direction)}
                </span>
              </p>
              <p className="text-sm text-foreground">
                7-day change: {formatInsightChange(sevenDayInsights.periodChange)}{' '}
                <span aria-label={`7-day direction ${sevenDayInsights.direction}`}>
                  {getDirectionGlyph(sevenDayInsights.direction)}
                </span>
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function LegendToggle({
  active,
  color,
  label,
  onClick,
}: {
  active: boolean;
  color: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'border-border bg-secondary/55 text-foreground'
          : 'border-border/70 bg-background text-muted-foreground',
      )}
      onClick={onClick}
      type="button"
    >
      <span
        aria-hidden="true"
        className="size-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span>{label}</span>
    </button>
  );
}

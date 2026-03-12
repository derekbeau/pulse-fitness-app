import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer } from 'recharts';
import type { DashboardTrendMetric } from '@pulse/shared';

import { Card, CardContent } from '@/components/ui/card';
import { useMacroTrend } from '@/hooks/use-macro-trend';
import { useWeightTrend } from '@/hooks/use-weight-trend';
import { accentCardStyles } from '@/lib/accent-card-styles';
import { addDays, parseDateInput, toDateKey } from '@/lib/date';
import { formatCalories, formatGrams, formatTrendChange, formatWeight } from '@/lib/format-utils';
import { calculateTrendChangePercent } from '@/features/dashboard/lib/trend-sparklines';
import { cn } from '@/lib/utils';

const TREND_DAYS = 30;
type ChangeDirection = 'up' | 'down' | 'neutral';

type TrendMetricCardProps = {
  label: string;
  currentValue: string;
  changePercent: number;
  color: string;
  data: TrendSparklineRealDatum[];
  className?: string;
  textClassName?: string;
};

export type TrendSparklineDatum = {
  date: string;
  value: number | null;
};

export type TrendSparklineProps = {
  data: TrendSparklineDatum[];
  color: string;
  label: string;
  currentValue: number | string;
  changePercent: number;
  className?: string;
  textClassName?: string;
  emptyMessage?: string;
};

export type TrendSparklinesProps = {
  endDate?: string;
  metrics?: DashboardTrendMetric[];
};

const DEFAULT_TREND_METRICS: DashboardTrendMetric[] = ['weight', 'calories', 'protein'];

const CHANGE_ICONS = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  neutral: Minus,
} satisfies Record<ChangeDirection, typeof ArrowUpRight>;

type TrendSparklineRealDatum = {
  date: string;
  value: number;
};

const toMetricSeries = <TEntry extends { date: string }>(
  entries: TEntry[],
  valueSelector: (entry: TEntry) => number | null,
): TrendSparklineDatum[] => {
  return entries.map((entry) => ({
    date: entry.date,
    value: valueSelector(entry),
  }));
};

const isTrendValuePresent = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const filterSeriesWithData = (series: TrendSparklineDatum[]): TrendSparklineRealDatum[] =>
  series.filter((entry): entry is TrendSparklineRealDatum => isTrendValuePresent(entry.value));

const getValueForDate = (series: TrendSparklineDatum[], date: string): number | null | undefined =>
  series.find((entry) => entry.date === date)?.value;

const getLatestValue = (series: TrendSparklineRealDatum[], fallback: number): number => {
  return series.at(-1)?.value ?? fallback;
};

const getPreviousValue = (series: TrendSparklineRealDatum[], fallback: number): number => {
  return series.at(-2)?.value ?? fallback;
};

const formatChangePercent = (changePercent: number): string => {
  const formatted = formatTrendChange(changePercent);

  if (changePercent > 0) {
    return `+${formatted}%`;
  }

  return `${formatted}%`;
};

const getChangeDirection = (changePercent: number): ChangeDirection => {
  if (changePercent > 0) {
    return 'up';
  }

  if (changePercent < 0) {
    return 'down';
  }

  return 'neutral';
};

const resolveTrendRange = (endDate?: string) => {
  const resolvedEndDate = endDate ?? toDateKey(new Date());
  const startDate = toDateKey(addDays(parseDateInput(resolvedEndDate), -(TREND_DAYS - 1)));

  return {
    from: startDate,
    to: resolvedEndDate,
  };
};

export function TrendSparkline({
  data,
  color,
  label,
  currentValue,
  changePercent,
  className,
  textClassName,
  emptyMessage = 'No data',
}: TrendSparklineProps) {
  const direction = getChangeDirection(changePercent);
  const ChangeIcon = CHANGE_ICONS[direction];
  const textClass = textClassName ?? 'text-on-accent';
  const plottedData = filterSeriesWithData(data);
  const hasSingleDataPoint = plottedData.length === 1;

  return (
    <div className={cn('flex h-full flex-col gap-4', className)} data-slot="trend-sparkline">
      <div className="flex items-start justify-between gap-4">
        <p
          className={cn(
            'text-sm font-medium opacity-70 dark:text-muted dark:opacity-100',
            textClass,
          )}
        >
          {label}
        </p>

        <div className="space-y-1 text-right">
          <p
            className={cn('text-3xl font-semibold tracking-tight dark:text-foreground', textClass)}
          >
            {currentValue}
          </p>
          <div
            aria-label={`trend ${direction}`}
            className={cn(
              'flex items-center justify-end gap-1 text-sm font-medium opacity-80 dark:text-muted dark:opacity-100',
              textClass,
            )}
            data-slot="trend-sparkline-change"
          >
            <ChangeIcon aria-hidden="true" className="size-4" />
            <span>{formatChangePercent(changePercent)}</span>
          </div>
        </div>
      </div>

      {plottedData.length === 0 ? (
        <div
          className="flex h-[60px] items-center justify-center rounded-md bg-muted/35"
          data-slot="trend-sparkline-empty"
        >
          <p className="text-sm text-muted">{emptyMessage}</p>
        </div>
      ) : (
        <div
          aria-label={`${label} sparkline`}
          className="h-[60px] w-full"
          data-slot="trend-sparkline-chart"
          role="img"
        >
          <ResponsiveContainer height="100%" width="100%">
            <LineChart data={plottedData} margin={{ top: 6, right: 0, bottom: 2, left: 0 }}>
              <Line
                dataKey="value"
                dot={
                  hasSingleDataPoint ? { fill: color, r: 4, stroke: color, strokeWidth: 0 } : false
                }
                isAnimationActive={false}
                stroke={color}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={hasSingleDataPoint ? 0 : 3}
                type="monotone"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function TrendMetricCard({
  label,
  currentValue,
  changePercent,
  color,
  data,
  className,
  textClassName,
}: TrendMetricCardProps) {
  return (
    <Card
      className={cn(
        'gap-0 border-transparent py-5 shadow-sm dark:text-foreground',
        textClassName,
        className,
      )}
      data-slot="trend-sparkline-card"
    >
      <CardContent className="h-full px-5">
        <TrendSparkline
          changePercent={changePercent}
          color={color}
          currentValue={currentValue}
          data={data}
          label={label}
          textClassName={textClassName}
        />
      </CardContent>
    </Card>
  );
}

function TrendMetricCardSkeleton() {
  return (
    <Card
      className="gap-0 border-transparent py-5 shadow-sm"
      data-slot="trend-sparkline-card-skeleton"
    >
      <CardContent className="h-full px-5">
        <div className="flex h-full flex-col gap-4" data-slot="trend-sparkline-skeleton">
          <div className="flex items-start justify-between gap-4">
            <div className="h-4 w-28 animate-pulse rounded bg-muted/50" />
            <div className="space-y-2">
              <div className="ml-auto h-8 w-20 animate-pulse rounded bg-muted/50" />
              <div className="ml-auto h-4 w-14 animate-pulse rounded bg-muted/50" />
            </div>
          </div>
          <div className="h-[60px] w-full animate-pulse rounded bg-muted/50" />
        </div>
      </CardContent>
    </Card>
  );
}

export function TrendSparklines({ endDate, metrics }: TrendSparklinesProps) {
  const resolvedMetrics = metrics ?? DEFAULT_TREND_METRICS;
  const needsWeight = resolvedMetrics.includes('weight');
  const needsMacros = resolvedMetrics.includes('calories') || resolvedMetrics.includes('protein');
  const range = resolveTrendRange(endDate);
  const weightTrendQuery = useWeightTrend(range.from, range.to, { enabled: needsWeight });
  const macroTrendQuery = useMacroTrend(range.from, range.to, { enabled: needsMacros });

  if ((needsWeight && weightTrendQuery.isLoading) || (needsMacros && macroTrendQuery.isLoading)) {
    return (
      <section aria-label="Trend sparklines">
        <div className="grid gap-4">
          <TrendMetricCardSkeleton />
          <TrendMetricCardSkeleton />
          <TrendMetricCardSkeleton />
        </div>
      </section>
    );
  }

  if ((needsWeight && weightTrendQuery.isError) || (needsMacros && macroTrendQuery.isError)) {
    return (
      <section aria-label="Trend sparklines">
        <Card className="gap-0 border-border/70 py-4 shadow-sm">
          <CardContent className="px-5">
            <p className="text-sm text-muted-foreground">Unable to load trend data.</p>
          </CardContent>
        </Card>
      </section>
    );
  }

  const weightSeriesRaw = needsWeight
    ? toMetricSeries(weightTrendQuery.data ?? [], (entry) => entry.value)
    : [];
  const calorieSeriesRaw = needsMacros
    ? toMetricSeries(macroTrendQuery.data ?? [], (entry) => entry.calories)
    : [];
  const proteinSeriesRaw = needsMacros
    ? toMetricSeries(macroTrendQuery.data ?? [], (entry) => entry.protein)
    : [];
  const calorieSeries = filterSeriesWithData(calorieSeriesRaw);
  const proteinSeries = filterSeriesWithData(proteinSeriesRaw);
  const weightSeries = filterSeriesWithData(weightSeriesRaw);
  const latestWeight = getLatestValue(weightSeries, 0);
  const latestCalories = getLatestValue(calorieSeries, 0);
  const latestProtein = getLatestValue(proteinSeries, 0);
  const selectedCalorieValue = getValueForDate(calorieSeriesRaw, range.to);
  const selectedProteinValue = getValueForDate(proteinSeriesRaw, range.to);
  const selectedWeightValue = getValueForDate(weightSeriesRaw, range.to);
  const hasSelectedCalorieValue = isTrendValuePresent(selectedCalorieValue);
  const hasSelectedProteinValue = isTrendValuePresent(selectedProteinValue);
  const hasSelectedWeightValue = isTrendValuePresent(selectedWeightValue);

  const allConfigs = {
    weight: {
      label: 'Weight Trend',
      currentValue: hasSelectedWeightValue ? formatWeight(selectedWeightValue, 'lbs') : '--',
      changePercent:
        weightSeries.length > 1
          ? calculateTrendChangePercent(latestWeight, getPreviousValue(weightSeries, latestWeight))
          : 0,
      color: 'var(--color-on-cream)',
      data: weightSeries,
      className: accentCardStyles.cream,
      textClassName: 'text-on-cream',
    },
    calories: {
      label: 'Calorie Trend',
      currentValue: hasSelectedCalorieValue ? `${formatCalories(selectedCalorieValue)} kcal` : '--',
      changePercent:
        calorieSeries.length > 1
          ? calculateTrendChangePercent(
              latestCalories,
              getPreviousValue(calorieSeries, latestCalories),
            )
          : 0,
      color: 'var(--color-on-pink)',
      data: calorieSeries,
      className: accentCardStyles.pink,
      textClassName: 'text-on-pink',
    },
    protein: {
      label: 'Protein Trend',
      currentValue: hasSelectedProteinValue ? formatGrams(selectedProteinValue) : '--',
      changePercent:
        proteinSeries.length > 1
          ? calculateTrendChangePercent(
              latestProtein,
              getPreviousValue(proteinSeries, latestProtein),
            )
          : 0,
      color: 'var(--color-on-mint)',
      data: proteinSeries,
      className: accentCardStyles.mint,
      textClassName: 'text-on-mint',
    },
  } satisfies Record<DashboardTrendMetric, TrendMetricCardProps>;

  const configs = resolvedMetrics.map((metric) => allConfigs[metric]);

  if (configs.length === 0) {
    return (
      <section aria-label="Trend sparklines">
        <Card className="gap-0 border-border/70 py-4 shadow-sm">
          <CardContent className="px-5">
            <p className="text-sm text-muted-foreground">No trend metrics selected.</p>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section aria-label="Trend sparklines">
      <div className="grid gap-4">
        {configs.map((config) => (
          <TrendMetricCard key={config.label} {...config} />
        ))}
      </div>
    </section>
  );
}

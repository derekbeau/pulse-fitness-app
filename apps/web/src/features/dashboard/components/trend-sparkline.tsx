import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer } from 'recharts';

import { Card, CardContent } from '@/components/ui/card';
import { calculateTrendChangePercent } from '@/features/dashboard/lib/trend-sparklines';
import {
  mockMacroTrend,
  mockWeightTrend,
  type MacroTrendEntry,
  type WeightTrendEntry,
} from '@/lib/mock-data/dashboard';
import { cn } from '@/lib/utils';

export type TrendSparklineDatum = {
  date: string;
  value: number;
};

export type TrendSparklineProps = {
  data: TrendSparklineDatum[];
  color: string;
  label: string;
  currentValue: number | string;
  changePercent: number;
  className?: string;
  textClassName?: string;
};

type ChangeDirection = 'up' | 'down' | 'neutral';

type TrendMetricCardProps = {
  label: string;
  currentValue: string;
  changePercent: number;
  color: string;
  data: TrendSparklineDatum[];
  className?: string;
  textClassName?: string;
};

const CHANGE_ICONS = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  neutral: Minus,
} satisfies Record<ChangeDirection, typeof ArrowUpRight>;

const toMetricSeries = <TEntry extends { date: string }>(
  entries: TEntry[],
  valueSelector: (entry: TEntry) => number,
): TrendSparklineDatum[] => {
  return entries.map((entry) => ({
    date: entry.date,
    value: valueSelector(entry),
  }));
};

const getLatestValue = (series: TrendSparklineDatum[], fallback: number): number => {
  return series.at(-1)?.value ?? fallback;
};

const getPreviousValue = (series: TrendSparklineDatum[], fallback: number): number => {
  return series.at(-2)?.value ?? fallback;
};

const formatChangePercent = (changePercent: number): string => {
  if (changePercent > 0) {
    return `+${changePercent}%`;
  }

  return `${changePercent}%`;
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

const weightSeries = toMetricSeries(mockWeightTrend, (entry: WeightTrendEntry) => entry.value);
const calorieSeries = toMetricSeries(mockMacroTrend, (entry: MacroTrendEntry) => entry.calories);
const proteinSeries = toMetricSeries(mockMacroTrend, (entry: MacroTrendEntry) => entry.protein);

const TREND_CARD_CONFIGS = [
  {
    label: 'Weight Trend',
    currentValue: `${getLatestValue(weightSeries, 0).toFixed(1)} lbs`,
    changePercent: calculateTrendChangePercent(
      getLatestValue(weightSeries, 0),
      getPreviousValue(weightSeries, getLatestValue(weightSeries, 0)),
    ),
    color: '#b8860b',
    data: weightSeries,
    className:
      'bg-[var(--color-accent-cream)] dark:border-l-4 dark:border-l-amber-500 dark:border-t-border/60 dark:border-r-border/60 dark:border-b-border/60 dark:bg-card',
    textClassName: 'text-on-cream',
  },
  {
    label: 'Calorie Trend',
    currentValue: `${getLatestValue(calorieSeries, 0)} kcal`,
    changePercent: calculateTrendChangePercent(
      getLatestValue(calorieSeries, 0),
      getPreviousValue(calorieSeries, getLatestValue(calorieSeries, 0)),
    ),
    color: '#c2477a',
    data: calorieSeries,
    className:
      'bg-[var(--color-accent-pink)] dark:border-l-4 dark:border-l-pink-500 dark:border-t-border/60 dark:border-r-border/60 dark:border-b-border/60 dark:bg-card',
    textClassName: 'text-on-pink',
  },
  {
    label: 'Protein Trend',
    currentValue: `${getLatestValue(proteinSeries, 0)} g`,
    changePercent: calculateTrendChangePercent(
      getLatestValue(proteinSeries, 0),
      getPreviousValue(proteinSeries, getLatestValue(proteinSeries, 0)),
    ),
    color: '#2a8a62',
    data: proteinSeries,
    className:
      'bg-[var(--color-accent-mint)] dark:border-l-4 dark:border-l-emerald-500 dark:border-t-border/60 dark:border-r-border/60 dark:border-b-border/60 dark:bg-card',
    textClassName: 'text-on-mint',
  },
] satisfies TrendMetricCardProps[];

export function TrendSparkline({
  data,
  color,
  label,
  currentValue,
  changePercent,
  className,
  textClassName,
}: TrendSparklineProps) {
  const direction = getChangeDirection(changePercent);
  const ChangeIcon = CHANGE_ICONS[direction];
  const textClass = textClassName ?? 'text-on-accent';

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

      <div
        aria-label={`${label} sparkline`}
        className="h-[60px] w-full"
        data-slot="trend-sparkline-chart"
        role="img"
      >
        <ResponsiveContainer height="100%" width="100%">
          <LineChart data={data} margin={{ top: 6, right: 0, bottom: 2, left: 0 }}>
            <Line
              dataKey="value"
              dot={false}
              isAnimationActive={false}
              stroke={color}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={3}
              type="monotone"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
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

export function TrendSparklines() {
  return (
    <section aria-label="Trend sparklines">
      <div className="grid gap-4">
        {TREND_CARD_CONFIGS.map((config) => (
          <TrendMetricCard key={config.label} {...config} />
        ))}
      </div>
    </section>
  );
}

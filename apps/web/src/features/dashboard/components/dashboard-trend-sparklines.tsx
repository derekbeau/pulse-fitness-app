import { Card, CardContent } from '@/components/ui/card';
import { calculateTrendChangePercent } from '@/features/dashboard/lib/trend-sparklines';
import {
  mockMacroTrend,
  mockWeightTrend,
  type MacroTrendEntry,
  type WeightTrendEntry,
} from '@/lib/mock-data/dashboard';
import { cn } from '@/lib/utils';

import { TrendSparkline, type TrendSparklineDatum } from './trend-sparkline';

type TrendMetricCardProps = {
  label: string;
  currentValue: string;
  changePercent: number;
  color: string;
  data: TrendSparklineDatum[];
  className?: string;
};

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
    color: '#3B82F6',
    data: weightSeries,
    className: 'bg-[var(--color-accent-cream)]',
  },
  {
    label: 'Calorie Trend',
    currentValue: `${getLatestValue(calorieSeries, 0)} kcal`,
    changePercent: calculateTrendChangePercent(
      getLatestValue(calorieSeries, 0),
      getPreviousValue(calorieSeries, getLatestValue(calorieSeries, 0)),
    ),
    color: '#F59E0B',
    data: calorieSeries,
    className: 'bg-[var(--color-accent-pink)]',
  },
  {
    label: 'Protein Trend',
    currentValue: `${getLatestValue(proteinSeries, 0)} g`,
    changePercent: calculateTrendChangePercent(
      getLatestValue(proteinSeries, 0),
      getPreviousValue(proteinSeries, getLatestValue(proteinSeries, 0)),
    ),
    color: '#22C55E',
    data: proteinSeries,
    className: 'bg-[var(--color-accent-mint)]',
  },
] satisfies TrendMetricCardProps[];

function TrendMetricCard({
  label,
  currentValue,
  changePercent,
  color,
  data,
  className,
}: TrendMetricCardProps) {
  return (
    <Card
      className={cn('gap-0 border-transparent py-5 text-on-accent shadow-sm', className)}
      data-slot="trend-sparkline-card"
    >
      <CardContent className="h-full px-5">
        <TrendSparkline
          changePercent={changePercent}
          color={color}
          currentValue={currentValue}
          data={data}
          label={label}
        />
      </CardContent>
    </Card>
  );
}

export function DashboardTrendSparklines() {
  return (
    <section aria-label="Trend sparklines">
      <div className="grid gap-4 lg:grid-cols-3">
        {TREND_CARD_CONFIGS.map((config) => (
          <TrendMetricCard key={config.label} {...config} />
        ))}
      </div>
    </section>
  );
}

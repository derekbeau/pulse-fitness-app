import { useMemo, useState } from 'react';
import type { DashboardMacrosTrendPoint } from '@pulse/shared';
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
import { useMacroTrend } from '@/hooks/use-macro-trend';
import { addDays, getToday, parseDateInput, toDateKey } from '@/lib/date';
import { formatCalories, formatGrams } from '@/lib/format-utils';

const NUTRITION_TREND_RANGES = [
  { value: '7d', label: '7D', days: 7 },
  { value: '30d', label: '30D', days: 30 },
  { value: '90d', label: '90D', days: 90 },
] as const;

const MACRO_SERIES = [
  { key: 'calories', color: 'var(--color-primary)', label: 'Calories' },
  { key: 'protein', color: 'var(--color-accent-mint)', label: 'Protein' },
  { key: 'carbs', color: 'var(--color-accent-cream)', label: 'Carbs' },
  { key: 'fat', color: 'var(--color-accent-pink)', label: 'Fat' },
] as const;

type NutritionTrendRange = (typeof NUTRITION_TREND_RANGES)[number]['value'];
type MacroSeriesKey = (typeof MACRO_SERIES)[number]['key'];
type NutritionTrendRangeOption = (typeof NUTRITION_TREND_RANGES)[number];

type NutritionTrendChartPoint = {
  date: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};

type MacroAverages = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

const axisDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

const tooltipDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function resolveDateRange(days: number) {
  const today = getToday();
  const to = toDateKey(today);
  const from = toDateKey(addDays(today, -(days - 1)));

  return { from, to };
}

function getDateKeysInRange(from: string, to: string) {
  const start = parseDateInput(from);
  const end = parseDateInput(to);
  const keys: string[] = [];

  for (let current = start; current <= end; current = addDays(current, 1)) {
    keys.push(toDateKey(current));
  }

  return keys;
}

function buildChartData(
  points: DashboardMacrosTrendPoint[] | undefined,
  from: string,
  to: string,
): NutritionTrendChartPoint[] {
  const pointsByDate = new Map((points ?? []).map((point) => [point.date, point]));

  return getDateKeysInRange(from, to).map((date) => {
    const point = pointsByDate.get(date) ?? null;

    return {
      date,
      calories: point?.calories ?? null,
      protein: point?.protein ?? null,
      carbs: point?.carbs ?? null,
      fat: point?.fat ?? null,
    };
  });
}

function computeDailyAverages(
  points: DashboardMacrosTrendPoint[] | undefined,
): MacroAverages | null {
  const entries = points ?? [];

  if (entries.length === 0) {
    return null;
  }

  const totals = entries.reduce(
    (sum, point) => ({
      calories: sum.calories + point.calories,
      protein: sum.protein + point.protein,
      carbs: sum.carbs + point.carbs,
      fat: sum.fat + point.fat,
    }),
    {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    },
  );

  return {
    calories: totals.calories / entries.length,
    protein: totals.protein / entries.length,
    carbs: totals.carbs / entries.length,
    fat: totals.fat / entries.length,
  };
}

function formatAxisDate(date: string) {
  return axisDateFormatter.format(new Date(`${date}T12:00:00`));
}

function formatTooltipDate(date: string) {
  return tooltipDateFormatter.format(new Date(`${date}T12:00:00`));
}

function formatMacroValue(metric: MacroSeriesKey, value: number) {
  if (metric === 'calories') {
    return formatCalories(value, 'kcal');
  }

  return formatGrams(value);
}

const NUTRITION_TREND_RANGE_OPTIONS: Record<NutritionTrendRange, NutritionTrendRangeOption> = {
  '7d': NUTRITION_TREND_RANGES[0],
  '30d': NUTRITION_TREND_RANGES[1],
  '90d': NUTRITION_TREND_RANGES[2],
};

export function NutritionTrends() {
  const [range, setRange] = useState<NutritionTrendRange>('30d');
  const selectedRange = NUTRITION_TREND_RANGE_OPTIONS[range];
  const dateRange = useMemo(() => resolveDateRange(selectedRange.days), [selectedRange.days]);
  const macroTrendQuery = useMacroTrend(dateRange.from, dateRange.to);
  const loggedDayCount = macroTrendQuery.data?.length ?? 0;

  const chartData = useMemo(
    () => buildChartData(macroTrendQuery.data, dateRange.from, dateRange.to),
    [dateRange.from, dateRange.to, macroTrendQuery.data],
  );
  const dailyAverages = useMemo(
    () => computeDailyAverages(macroTrendQuery.data),
    [macroTrendQuery.data],
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Macro trends</h2>
          <p className="text-sm text-muted">Daily calories, protein, carbs, and fat intake.</p>
        </div>

        <div
          aria-label="Nutrition trends range"
          className="inline-flex w-fit items-center gap-1 rounded-full border border-border bg-card p-1"
          role="group"
        >
          {NUTRITION_TREND_RANGES.map((rangeOption) => (
            <Button
              aria-pressed={rangeOption.value === range}
              className="rounded-full"
              key={rangeOption.value}
              onClick={() => setRange(rangeOption.value)}
              size="sm"
              type="button"
              variant={rangeOption.value === range ? 'default' : 'ghost'}
            >
              {rangeOption.label}
            </Button>
          ))}
        </div>
      </div>

      {macroTrendQuery.isLoading ? (
        <div className="h-[260px] w-full animate-pulse rounded-2xl bg-muted/40" />
      ) : macroTrendQuery.isError ? (
        <div className="flex min-h-[180px] items-center justify-center rounded-2xl border border-border/70 bg-muted/20 px-4 text-center sm:min-h-[220px]">
          <p className="text-sm text-muted">Unable to load nutrition trends.</p>
        </div>
      ) : (macroTrendQuery.data?.length ?? 0) === 0 ? (
        <div className="flex min-h-[180px] items-center justify-center rounded-2xl border border-dashed border-border bg-muted/15 px-4 text-center sm:min-h-[220px]">
          <p className="text-sm text-muted">No meals logged in this range yet.</p>
        </div>
      ) : (
        <div aria-label="Nutrition macro trend chart" className="h-[260px] w-full" role="img">
          <ResponsiveContainer height="100%" width="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis
                axisLine={false}
                dataKey="date"
                minTickGap={16}
                tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
                tickFormatter={formatAxisDate}
                tickLine={false}
              />
              <YAxis
                axisLine={false}
                tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
                tickFormatter={(value: number) => String(Math.round(value))}
                tickLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-card)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '14px',
                  color: 'var(--color-foreground)',
                }}
                formatter={(rawValue, rawName) => {
                  const seriesKey =
                    typeof rawName === 'string' ? (rawName as MacroSeriesKey) : 'calories';
                  const value = Array.isArray(rawValue)
                    ? Number(rawValue[0] ?? 0)
                    : typeof rawValue === 'number'
                      ? rawValue
                      : 0;
                  const label =
                    MACRO_SERIES.find((series) => series.key === seriesKey)?.label ?? 'Value';
                  return [formatMacroValue(seriesKey, value), label];
                }}
                labelFormatter={(label) =>
                  typeof label === 'string' ? formatTooltipDate(label) : label
                }
              />

              {MACRO_SERIES.map((series) => (
                <Line
                  activeDot={{ r: 3 }}
                  connectNulls={false}
                  dataKey={series.key}
                  dot={false}
                  isAnimationActive={false}
                  key={series.key}
                  name={series.key}
                  stroke={series.color}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  type="monotone"
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <section className="space-y-2 rounded-2xl border border-border/70 bg-card px-4 py-4">
        <h3 className="text-sm font-semibold text-foreground">
          Avg per logged day ({selectedRange.label})
        </h3>
        <p className="text-xs text-muted">
          {loggedDayCount} logged {loggedDayCount === 1 ? 'day' : 'days'}
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <AverageStat
            label="Calories"
            value={dailyAverages ? formatCalories(dailyAverages.calories, 'kcal') : '--'}
          />
          <AverageStat
            label="Protein"
            value={dailyAverages ? formatGrams(dailyAverages.protein) : '--'}
          />
          <AverageStat
            label="Carbs"
            value={dailyAverages ? formatGrams(dailyAverages.carbs) : '--'}
          />
          <AverageStat label="Fat" value={dailyAverages ? formatGrams(dailyAverages.fat) : '--'} />
        </div>
      </section>
    </section>
  );
}

type AverageStatProps = {
  label: string;
  value: string;
};

function AverageStat({ label, value }: AverageStatProps) {
  return (
    <div className="rounded-xl bg-secondary/35 px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className="mt-1 text-base font-semibold text-foreground">{value}</p>
    </div>
  );
}

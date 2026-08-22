import { useMemo, useState } from 'react';
import { resolveChartDateRange, type ChartRangePreset } from '@pulse/shared';
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
import { useMacroTrend } from '@/hooks/use-macro-trend';
import { formatCalories, formatGrams } from '@/lib/format-utils';
import {
  buildNutritionTrendData,
  computeNutritionDailyAverages,
  type NutritionTrendChartPoint,
} from './nutrition-trend-data';

const NUTRITION_TREND_RANGES = [
  { value: '1w', label: '1W' },
  { value: '1m', label: '1M' },
  { value: '3m', label: '3M' },
] as const satisfies ReadonlyArray<{ value: ChartRangePreset; label: string }>;

const MACRO_SERIES = [
  { key: 'calories', color: 'var(--color-primary)', label: 'Calories' },
  { key: 'protein', color: 'var(--color-accent-mint)', label: 'Protein' },
  { key: 'carbs', color: 'var(--color-accent-cream)', label: 'Carbs' },
  { key: 'fat', color: 'var(--color-accent-pink)', label: 'Fat' },
] as const;

type NutritionTrendRange = (typeof NUTRITION_TREND_RANGES)[number]['value'];
type MacroSeriesKey = (typeof MACRO_SERIES)[number]['key'];

type NutritionTrendsProps = {
  referenceDate: string;
};

function formatMacroValue(metric: MacroSeriesKey, value: number) {
  return metric === 'calories' ? formatCalories(value, 'kcal') : formatGrams(value);
}

function formatMacroPointValue(metric: MacroSeriesKey, value: number | null) {
  return value === null ? 'Not available' : formatMacroValue(metric, value);
}

function NutritionTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string;
  payload?: Array<{ dataKey?: string | number; value?: number | string }>;
}) {
  if (!active || typeof label !== 'string') return null;
  const values = new Map(payload?.map((entry) => [String(entry.dataKey), entry.value]) ?? []);
  return (
    <ChartTooltip
      date={formatChartDate(label)}
      rows={MACRO_SERIES.map((series) => {
        const value = values.get(series.key);
        return {
          color: series.color,
          label: series.label,
          value: typeof value === 'number' ? formatMacroValue(series.key, value) : null,
        };
      })}
    />
  );
}

export function NutritionTrends({ referenceDate }: NutritionTrendsProps) {
  const [range, setRange] = useState<NutritionTrendRange>('1m');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const dateRange = useMemo(
    () => resolveChartDateRange({ preset: range, referenceDate }),
    [range, referenceDate],
  );
  const macroTrendQuery = useMacroTrend(dateRange.startDate, dateRange.endDate);
  const loggedDayCount = macroTrendQuery.data?.length ?? 0;
  const chartData = useMemo(
    () => buildNutritionTrendData(macroTrendQuery.data, dateRange.startDate, dateRange.endDate),
    [dateRange.endDate, dateRange.startDate, macroTrendQuery.data],
  );
  const dailyAverages = useMemo(
    () => computeNutritionDailyAverages(macroTrendQuery.data),
    [macroTrendQuery.data],
  );
  const selectedPoint = selectedDate
    ? (chartData.find((point) => point.date === selectedDate) ?? null)
    : null;

  return (
    <ChartFrame
      controls={
        <ChartRangeControl
          aria-controls="nutrition-trend-visual"
          label="Nutrition trends range"
          onChange={(value) => {
            setRange(value);
            setSelectedDate(null);
          }}
          options={NUTRITION_TREND_RANGES}
          statusText={`${range.toUpperCase()} · ${formatChartDate(dateRange.startDate)}–${formatChartDate(dateRange.endDate)} · ${loggedDayCount} logged days`}
          value={range}
        />
      }
      description={`Daily values from ${formatChartDate(dateRange.startDate)} through ${formatChartDate(dateRange.endDate)}. Missing days remain gaps, not zeros.`}
      detail={
        selectedPoint ? (
          <ChartPointDetail>
            <p className="font-medium text-foreground">{formatChartDate(selectedPoint.date)}</p>
            <p className="mt-1 text-muted-foreground">
              {MACRO_SERIES.map(
                (series) =>
                  `${series.label} ${formatMacroPointValue(series.key, selectedPoint[series.key]).toLowerCase()}`,
              ).join(' · ')}
            </p>
          </ChartPointDetail>
        ) : null
      }
      id="nutrition-trend"
      summary={
        macroTrendQuery.isLoading || macroTrendQuery.isError ? undefined : (
          <ChartSummary
            items={MACRO_SERIES.map((series) => ({
              detail: `${loggedDayCount} logged ${loggedDayCount === 1 ? 'day' : 'days'}`,
              label: `Average ${series.label.toLowerCase()}`,
              value:
                dailyAverages === null
                  ? 'Not available'
                  : formatMacroValue(series.key, dailyAverages[series.key]),
            }))}
            label="Selected nutrition range summary"
          />
        )
      }
      table={
        macroTrendQuery.isLoading || macroTrendQuery.isError ? undefined : (
          <ChartDataTable
            caption="Exact daily nutrition trend values"
            columns={[
              { key: 'date', header: 'Date', render: (point) => formatChartDate(point.date) },
              ...MACRO_SERIES.map((series) => ({
                key: series.key,
                header: series.label,
                render: (point: NutritionTrendChartPoint) =>
                  formatMacroPointValue(series.key, point[series.key]),
              })),
            ]}
            getRowKey={(point) => point.date}
            onSelectRow={(point) => setSelectedDate(point.date)}
            rows={chartData}
            selectionLabel={(point) => `Inspect ${formatChartDate(point.date)}`}
          />
        )
      }
      title="Macro trends"
    >
      {macroTrendQuery.isLoading ? (
        <ChartState
          description="Loading exact daily macro values."
          kind="loading"
          title="Loading macro trends"
        />
      ) : macroTrendQuery.isError ? (
        <ChartState
          description="Your logged meals are safe. Try loading this range again."
          kind="error"
          onAction={() => void macroTrendQuery.refetch()}
          title="Macro trends could not be loaded"
        />
      ) : loggedDayCount === 0 ? (
        <ChartState
          description="No meals are logged in this selected range."
          kind="empty"
          title="No nutrition data in range"
        />
      ) : (
        <div className="space-y-3">
          <ChartLegend
            items={MACRO_SERIES.map((series) => ({ ...series, style: 'line' as const }))}
          />
          <div aria-label="Nutrition macro trend chart" className="h-[260px] min-w-0" role="img">
            <ResponsiveContainer
              height="100%"
              initialDimension={{ height: 260, width: 320 }}
              width="100%"
            >
              <LineChart
                data={chartData}
                margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
                onClick={(state) => {
                  if (typeof state?.activeLabel === 'string') setSelectedDate(state.activeLabel);
                }}
              >
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis
                  axisLine={false}
                  dataKey="date"
                  minTickGap={16}
                  tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
                  tickFormatter={formatChartAxisDate}
                  tickLine={false}
                />
                <YAxis
                  axisLine={false}
                  tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
                  tickFormatter={(value: number) => String(Math.round(value))}
                  tickLine={false}
                  width={40}
                />
                <Tooltip content={<NutritionTooltip />} />
                {MACRO_SERIES.map((series) => (
                  <Line
                    activeDot={{ r: 4 }}
                    connectNulls={false}
                    dataKey={series.key}
                    dot={false}
                    isAnimationActive={false}
                    key={series.key}
                    name={series.label}
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
        </div>
      )}
    </ChartFrame>
  );
}

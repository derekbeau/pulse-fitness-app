import { convertWeightFromKg, type AdaptiveGoalTrajectory, type WeightUnit } from '@pulse/shared';
import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  formatTrendWeightAxisDate,
  formatTrendWeightDate,
  trendWeightChartTicks,
  trendWeightCoordinateDateKey,
  trendWeightDateCoordinate,
} from '@/features/weight/lib/trend-weight-date';

import { formatAdaptiveWeight } from '../lib/format-adaptive-nutrition';

type ChartRow = {
  date: string;
  dateValue: number;
  trend: number | null;
  scale: number | null;
  segment: number | null;
  target: number | null;
  maintenanceLower: number | null;
  maintenanceUpper: number | null;
  forecast: number | null;
  forecastFaster: number | null;
  forecastSlower: number | null;
};

type Selection =
  | { kind: 'point'; date: string }
  | { kind: 'annotation'; annotationId: string; date: string };

export function GoalTrajectoryChart({
  analytics,
  unit,
}: {
  analytics: AdaptiveGoalTrajectory;
  unit: WeightUnit;
}) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const chartData = useMemo(() => {
    const rows = new Map<string, ChartRow>();
    let segment = 0;
    for (const [index, point] of analytics.trendPoints.entries()) {
      if (index > 0 && (point.gapFromPreviousDays ?? 0) > 7) segment += 1;
      rows.set(point.date, {
        date: point.date,
        dateValue: trendWeightDateCoordinate(point.date),
        trend: point.trendWeightKg === null ? null : convertWeightFromKg(point.trendWeightKg, unit),
        scale: point.scaleWeightKg === null ? null : convertWeightFromKg(point.scaleWeightKg, unit),
        segment: point.evidenceState === 'strategy_event' ? null : segment,
        target:
          point.targetWeightKg === null ? null : convertWeightFromKg(point.targetWeightKg, unit),
        maintenanceLower:
          point.maintenanceLowerKg === null
            ? null
            : convertWeightFromKg(point.maintenanceLowerKg, unit),
        maintenanceUpper:
          point.maintenanceUpperKg === null
            ? null
            : convertWeightFromKg(point.maintenanceUpperKg, unit),
        forecast: null,
        forecastFaster: null,
        forecastSlower: null,
      });
    }
    for (const point of analytics.forecast?.points ?? []) {
      const existing = rows.get(point.date);
      rows.set(point.date, {
        date: point.date,
        dateValue: trendWeightDateCoordinate(point.date),
        trend: existing?.trend ?? null,
        scale: existing?.scale ?? null,
        segment: existing?.segment ?? null,
        target:
          existing?.target ??
          (analytics.summary.kind === 'weight_change'
            ? convertWeightFromKg(analytics.summary.targetWeightKg, unit)
            : null),
        maintenanceLower: existing?.maintenanceLower ?? null,
        maintenanceUpper: existing?.maintenanceUpper ?? null,
        forecast: convertWeightFromKg(point.expectedTrendWeightKg, unit),
        forecastFaster: convertWeightFromKg(point.fasterTrendWeightKg, unit),
        forecastSlower: convertWeightFromKg(point.slowerTrendWeightKg, unit),
      });
    }
    return [...rows.values()].sort((left, right) => left.date.localeCompare(right.date));
  }, [analytics, unit]);
  const trendSegments = useMemo(
    () => [
      ...new Set(
        chartData
          .map((point) => point.segment)
          .filter((segment): segment is number => segment !== null),
      ),
    ],
    [chartData],
  );
  const yValues = chartData.flatMap((point) =>
    [
      point.trend,
      point.scale,
      point.target,
      point.maintenanceLower,
      point.maintenanceUpper,
      point.forecast,
      point.forecastFaster,
      point.forecastSlower,
    ].filter((value): value is number => value !== null),
  );
  const fallbackWeight = convertWeightFromKg(
    analytics.summary.currentTrendWeightKg ?? analytics.summary.startTrendWeightKg,
    unit,
  );
  const minimum = yValues.length > 0 ? Math.min(...yValues) : fallbackWeight;
  const maximum = yValues.length > 0 ? Math.max(...yValues) : fallbackWeight;
  const padding = Math.max(0.5, (maximum - minimum) * 0.1);
  const selectedRow = selection
    ? (chartData.find((point) => point.date === selection.date) ?? null)
    : null;
  const selectedPoint = selection
    ? (analytics.trendPoints.find((point) => point.date === selection.date) ?? null)
    : null;
  const selectedAnnotation =
    selection?.kind === 'annotation'
      ? (analytics.annotations.find((item) => item.id === selection.annotationId) ?? null)
      : null;
  const currentPoint = analytics.productTrend.currentTrendDate
    ? (chartData.find((point) => point.date === analytics.productTrend.currentTrendDate) ?? null)
    : null;

  return (
    <section
      aria-labelledby="goal-trajectory-chart-title"
      className="space-y-4"
      data-slot="goal-trajectory-chart"
    >
      <div>
        <h2 className="text-lg font-semibold" id="goal-trajectory-chart-title">
          Goal trajectory
        </h2>
        <p className="text-sm text-muted-foreground">
          Solid is Product Trend Weight. Adaptive model facts remain separate for strategy,
          completion, and estimates.
        </p>
      </div>
      <div
        className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground"
        aria-label="Trajectory legend"
      >
        <span>
          <i className="mr-2 inline-block h-0.5 w-6 bg-primary align-middle" />
          Product Trend Weight
        </span>
        <span>
          <i className="mr-2 inline-block w-6 border-t-2 border-dashed border-primary align-middle" />
          Estimated path
        </span>
        <span>
          <i className="mr-2 inline-block w-6 border-t border-dashed border-foreground align-middle" />
          Goal target or band
        </span>
      </div>
      {chartData.length === 0 ? (
        <div className="flex min-h-52 items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/40 p-6 text-center text-sm text-muted-foreground">
          No supported model trend is available for this goal period yet.
        </div>
      ) : (
        <div
          aria-hidden="true"
          className="h-80 min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-card/40 p-2"
        >
          <ResponsiveContainer
            height="100%"
            initialDimension={{ height: 320, width: 320 }}
            width="100%"
          >
            <ComposedChart
              data={chartData}
              margin={{ bottom: 4, left: 0, right: 10, top: 12 }}
              onClick={(state) => {
                const coordinate = state?.activeLabel;
                if (typeof coordinate === 'number')
                  setSelection({ kind: 'point', date: trendWeightCoordinateDateKey(coordinate) });
              }}
            >
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 5" vertical={false} />
              <XAxis
                axisLine={false}
                dataKey="dateValue"
                domain={[
                  trendWeightDateCoordinate(analytics.range.startDate),
                  trendWeightDateCoordinate(
                    analytics.forecast?.projectedEndDate ?? analytics.range.endDate,
                  ),
                ]}
                interval="preserveStartEnd"
                scale="time"
                tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
                tickFormatter={formatTrendWeightAxisDate}
                tickLine={false}
                ticks={trendWeightChartTicks(
                  analytics.range.startDate,
                  analytics.forecast?.projectedEndDate ?? analytics.range.endDate,
                )}
                type="number"
              />
              <YAxis
                axisLine={false}
                domain={[minimum - padding, maximum + padding]}
                tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
                tickFormatter={(value: number) => `${value.toFixed(0)} ${unit}`}
                tickLine={false}
                width={48}
              />
              <Tooltip content={<TrajectoryTooltip unit={unit} />} />
              {analytics.annotations.map((annotation) => (
                <ReferenceLine
                  className="goal-trajectory-annotation-line"
                  key={annotation.id}
                  stroke="var(--color-on-cream)"
                  strokeDasharray={
                    annotation.kind === 'goal_started'
                      ? undefined
                      : annotation.kind.startsWith('goal_') && annotation.kind.endsWith('_revised')
                        ? '6 4'
                        : annotation.kind.startsWith('accepted_')
                          ? '2 5'
                          : '8 3'
                  }
                  strokeOpacity={annotation.kind.includes('revised') ? 0.75 : 0.5}
                  strokeWidth={annotation.kind === 'goal_started' ? 2 : 1.5}
                  x={trendWeightDateCoordinate(annotation.date)}
                />
              ))}
              <Line
                dataKey="maintenanceLower"
                dot={false}
                isAnimationActive={false}
                stroke="var(--color-on-cream)"
                strokeDasharray="4 4"
                strokeOpacity={0.7}
              />
              <Line
                dataKey="maintenanceUpper"
                dot={false}
                isAnimationActive={false}
                stroke="var(--color-on-cream)"
                strokeDasharray="4 4"
                strokeOpacity={0.7}
              />
              <Line
                className="goal-trajectory-target-line"
                dataKey="target"
                dot={false}
                isAnimationActive={false}
                stroke="var(--color-on-cream)"
                strokeDasharray="6 5"
                strokeWidth={1.5}
                type="stepAfter"
              />
              {trendSegments.map((segment) => (
                <Line
                  data={chartData.map((point) => ({
                    ...point,
                    segmentTrend: point.segment === segment ? point.trend : null,
                  }))}
                  dataKey="segmentTrend"
                  dot={false}
                  isAnimationActive={false}
                  key={segment}
                  name="trend"
                  stroke="var(--color-primary)"
                  strokeWidth={3}
                  type="monotone"
                />
              ))}
              <Scatter
                dataKey="scale"
                fill="var(--color-foreground)"
                isAnimationActive={false}
                name="scale"
                onClick={(point) => {
                  if (typeof point.date === 'string')
                    setSelection({ kind: 'point', date: point.date });
                }}
                shape="circle"
              />
              <Line
                dataKey="forecastFaster"
                dot={false}
                isAnimationActive={false}
                stroke="var(--color-primary)"
                strokeDasharray="2 6"
                strokeOpacity={0.35}
                type="linear"
              />
              <Line
                dataKey="forecastSlower"
                dot={false}
                isAnimationActive={false}
                stroke="var(--color-primary)"
                strokeDasharray="2 6"
                strokeOpacity={0.35}
                type="linear"
              />
              <Line
                dataKey="forecast"
                dot={false}
                isAnimationActive={false}
                stroke="var(--color-primary)"
                strokeDasharray="7 6"
                strokeWidth={2}
                type="linear"
              />
              {currentPoint?.trend !== null && currentPoint ? (
                <ReferenceDot
                  fill="var(--color-primary)"
                  r={5}
                  stroke="var(--color-background)"
                  strokeWidth={2}
                  x={currentPoint.dateValue}
                  y={currentPoint.trend}
                />
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      <div
        aria-live="polite"
        className="rounded-xl border border-border/70 bg-muted/15 p-3 text-sm"
        data-slot="goal-trajectory-point-detail"
      >
        {selectedAnnotation ? (
          <p>
            <strong>{formatTrendWeightDate(selectedAnnotation.date)}</strong> ·{' '}
            {selectedAnnotation.label} · {selectedAnnotation.kind.replaceAll('_', ' ')}
            {selectedAnnotation.revisionSequence
              ? ` · revision ${selectedAnnotation.revisionSequence}`
              : ''}
          </p>
        ) : selectedRow ? (
          <p>
            <strong>{formatTrendWeightDate(selectedRow.date)}</strong>
            {selectedPoint
              ? selectedPoint.evidenceState === 'strategy_event'
                ? ` · Strategy event · no Product Trend Weight observation · revision ${selectedPoint.revisionSequence}`
                : ` · Product Trend Weight ${formatAdaptiveWeight(selectedPoint.trendWeightKg, unit)} · Scale Weight ${formatAdaptiveWeight(selectedPoint.scaleWeightKg, unit)} · ${selectedPoint.evidenceState.replace('_', ' ')} · Adaptive strategy trend ${formatAdaptiveWeight(selectedPoint.adaptiveStrategyTrendWeightKg, unit)} · revision ${selectedPoint.revisionSequence}`
              : ''}
            {selectedRow.forecast !== null
              ? ` · Estimated trend ${selectedRow.forecast.toFixed(1)} ${unit} · corridor ${Math.min(selectedRow.forecastFaster ?? selectedRow.forecast, selectedRow.forecastSlower ?? selectedRow.forecast).toFixed(1)}–${Math.max(selectedRow.forecastFaster ?? selectedRow.forecast, selectedRow.forecastSlower ?? selectedRow.forecast).toFixed(1)} ${unit}`
              : ''}
          </p>
        ) : (
          <p className="text-muted-foreground">
            Select a chart point or exact-value row for persistent details.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Goal annotations">
        {analytics.annotations.map((annotation) => (
          <button
            className="min-h-11 rounded-full border border-border/70 px-3 text-left text-xs hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            key={annotation.id}
            onClick={() =>
              setSelection({
                kind: 'annotation',
                annotationId: annotation.id,
                date: annotation.date,
              })
            }
            type="button"
          >
            {formatTrendWeightDate(annotation.date)} · {annotation.label}
          </button>
        ))}
      </div>

      <details
        className="rounded-xl border border-border/70"
        data-slot="goal-trajectory-exact-values"
      >
        <summary className="flex min-h-11 cursor-pointer items-center px-4 font-medium">
          Exact trajectory values
        </summary>
        <div className="max-h-[32rem] overflow-auto border-t border-border/70">
          <table className="w-full min-w-[64rem] text-left text-sm">
            <caption className="sr-only">Exact values for the goal trajectory chart</caption>
            <thead className="bg-muted/30 text-xs text-muted-foreground">
              <tr>
                <th className="p-3" scope="col">
                  Date
                </th>
                <th className="p-3" scope="col">
                  Product Trend Weight
                </th>
                <th className="p-3" scope="col">
                  Scale Weight
                </th>
                <th className="p-3" scope="col">
                  Adaptive strategy trend
                </th>
                <th className="p-3" scope="col">
                  Forecast and corridor
                </th>
                <th className="p-3" scope="col">
                  Goal setting or band
                </th>
                <th className="p-3" scope="col">
                  Evidence
                </th>
                <th className="p-3" scope="col">
                  Section and revision
                </th>
                <th className="p-3" scope="col">
                  Annotations
                </th>
              </tr>
            </thead>
            <tbody>
              {chartData.map((row) => {
                const point = analytics.trendPoints.find((item) => item.date === row.date) ?? null;
                const annotations = analytics.annotations.filter((item) => item.date === row.date);
                return (
                  <tr className="border-t border-border/70" key={row.date}>
                    <td className="p-3">
                      <button
                        className="min-h-11 text-left underline-offset-4 hover:underline"
                        onClick={() => setSelection({ kind: 'point', date: row.date })}
                        type="button"
                      >
                        {formatTrendWeightDate(row.date)}
                      </button>
                    </td>
                    <td className="p-3 tabular-nums">
                      {formatAdaptiveWeight(point?.trendWeightKg ?? null, unit)}
                    </td>
                    <td className="p-3 tabular-nums">
                      {formatAdaptiveWeight(point?.scaleWeightKg ?? null, unit)}
                    </td>
                    <td className="p-3 tabular-nums">
                      {formatAdaptiveWeight(point?.adaptiveStrategyTrendWeightKg ?? null, unit)}
                    </td>
                    <td className="p-3 tabular-nums">
                      {row.forecast === null
                        ? 'Not available'
                        : `${row.forecast.toFixed(1)} ${unit} (${Math.min(row.forecastFaster ?? row.forecast, row.forecastSlower ?? row.forecast).toFixed(1)}–${Math.max(row.forecastFaster ?? row.forecast, row.forecastSlower ?? row.forecast).toFixed(1)})`}
                    </td>
                    <td className="p-3 tabular-nums">
                      {formatAdaptiveWeight(
                        point?.targetWeightKg ?? point?.maintenanceCenterKg ?? null,
                        unit,
                      )}
                      {point?.maintenanceLowerKg !== null && point?.maintenanceLowerKg !== undefined
                        ? ` · ${formatAdaptiveWeight(point.maintenanceLowerKg, unit)}–${formatAdaptiveWeight(point.maintenanceUpperKg, unit)}`
                        : ''}
                    </td>
                    <td className="p-3">
                      {point
                        ? point.evidenceState === 'strategy_event'
                          ? 'Strategy event · no Product Trend Weight observation'
                          : `${point.evidenceState.replace('_', ' ')} · ${point.observationCount} observations`
                        : 'Forecast only'}
                    </td>
                    <td className="p-3">
                      {point ? `${point.section} · revision ${point.revisionSequence}` : 'forecast'}
                    </td>
                    <td className="p-3">
                      {annotations.length
                        ? annotations.map((item) => item.label).join(' · ')
                        : 'None'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function TrajectoryTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number }>;
  label?: number;
  unit: WeightUnit;
}) {
  if (!active || typeof label !== 'number') return null;
  const values = new Map(payload?.map((entry) => [entry.dataKey, entry.value]) ?? []);
  const segmentTrend = payload?.find((entry) => entry.dataKey === 'segmentTrend')?.value;
  if (segmentTrend !== undefined) values.set('trend', segmentTrend);
  const rows = [
    ['trend', 'Product Trend Weight'],
    ['scale', 'Scale Weight'],
    ['forecast', 'Estimated trend'],
    ['target', 'Goal target'],
    ['maintenanceLower', 'Maintenance lower'],
    ['maintenanceUpper', 'Maintenance upper'],
  ] as const;
  return (
    <div className="rounded-xl border border-border bg-popover p-3 text-xs shadow-lg">
      <p className="font-semibold">{formatTrendWeightDate(trendWeightCoordinateDateKey(label))}</p>
      {rows.map(([key, rowLabel]) =>
        values.get(key) == null ? null : (
          <p className="mt-1" key={key}>
            {rowLabel}: {Number(values.get(key)).toFixed(1)} {unit}
          </p>
        ),
      )}
    </div>
  );
}

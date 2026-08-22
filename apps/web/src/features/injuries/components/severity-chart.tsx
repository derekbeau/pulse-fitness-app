import { useCallback, useId, useMemo, useState } from 'react';
import {
  chartCoordinateDateKey,
  resolveChartDateRange,
  type ChartRangePreset,
} from '@pulse/shared';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  ChartAnnotationLayer,
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
import type { SeverityPoint, TimelineEvent, TimelineEventType } from '../types';
import { buildSeverityChartData, type SeverityChartDatum } from './severity-chart-data';

type SeverityChartProps = {
  severityHistory: SeverityPoint[];
  timeline: TimelineEvent[];
};

type SeverityMarkerDotProps = {
  cx?: number;
  cy?: number;
  payload?: SeverityChartDatum;
};

type SeverityRange = Extract<ChartRangePreset, '1m' | '3m' | '6m' | '1y' | 'all'>;

const RANGE_OPTIONS = [
  { label: '1M', value: '1m' },
  { label: '3M', value: '3m' },
  { label: '6M', value: '6m' },
  { label: '1Y', value: '1y' },
  { label: 'All', value: 'all' },
] as const satisfies ReadonlyArray<{ label: string; value: SeverityRange }>;

const EVENT_META: Record<
  TimelineEventType,
  { badgeTextColor: string; dotFill: string; dotStroke: string; label: string }
> = {
  onset: {
    badgeTextColor: '#ffffff',
    dotFill: 'var(--color-destructive)',
    dotStroke: 'color-mix(in srgb, var(--color-destructive) 30%, var(--color-card))',
    label: 'Onset',
  },
  flare: {
    badgeTextColor: 'var(--color-on-cream)',
    dotFill: 'color-mix(in srgb, var(--color-destructive) 68%, var(--color-accent-cream))',
    dotStroke: 'color-mix(in srgb, var(--color-destructive) 28%, var(--color-card))',
    label: 'Flare',
  },
  improvement: {
    badgeTextColor: 'var(--color-on-mint)',
    dotFill: 'var(--color-accent-mint)',
    dotStroke: 'var(--color-on-mint)',
    label: 'Improvement',
  },
  treatment: {
    badgeTextColor: '#ffffff',
    dotFill: 'var(--color-primary)',
    dotStroke: 'color-mix(in srgb, var(--color-primary) 35%, var(--color-card))',
    label: 'Treatment',
  },
  milestone: {
    badgeTextColor: 'var(--color-on-cream)',
    dotFill: 'var(--color-accent-cream)',
    dotStroke: 'var(--color-on-cream)',
    label: 'Milestone',
  },
};

export function SeverityChart({ severityHistory, timeline }: SeverityChartProps) {
  const chartId = useId();
  const [range, setRange] = useState<SeverityRange>('3m');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const allDates = useMemo(
    () =>
      [...severityHistory.map((point) => point.date), ...timeline.map((item) => item.date)].sort(),
    [severityHistory, timeline],
  );
  const referenceDate = allDates.at(-1) ?? '1970-01-01';
  const earliestDate = allDates[0] ?? referenceDate;
  const dateRange = useMemo(
    () => resolveChartDateRange({ earliestDate, preset: range, referenceDate }),
    [earliestDate, range, referenceDate],
  );
  const data = useMemo(
    () =>
      buildSeverityChartData(severityHistory, timeline).filter(
        (point) => point.date >= dateRange.startDate && point.date <= dateRange.endDate,
      ),
    [dateRange.endDate, dateRange.startDate, severityHistory, timeline],
  );
  const observedPoints = data.filter((point) => point.observed);
  const selectedPoint = selectedDate
    ? (data.find((point) => point.date === selectedDate) ?? null)
    : null;
  const values = observedPoints.flatMap((point) => (point.value === null ? [] : [point.value]));
  const firstValue = values[0] ?? null;
  const latestValue = values.at(-1) ?? null;
  const gradientId = `severity-gradient-${chartId.replace(/:/g, '-')}`;

  const renderSeverityDot = useCallback(({ cx, cy, payload }: SeverityMarkerDotProps) => {
    if (typeof cx !== 'number' || typeof cy !== 'number' || !payload) return null;
    const eventMeta = payload.primaryEventType ? EVENT_META[payload.primaryEventType] : null;
    const severity = payload.value === null ? 'not available' : `${payload.value} of 10`;
    return (
      <g data-date={payload.date} data-slot="severity-point-marker">
        <circle
          aria-label={`${formatChartDate(payload.date)} · Severity ${severity}${eventMeta ? ` · ${eventMeta.label} event` : ''}`}
          className="cursor-pointer outline-none"
          cx={cx}
          cy={cy}
          data-slot={eventMeta ? 'severity-event-marker' : undefined}
          fill={eventMeta?.dotFill ?? 'var(--color-primary)'}
          onClick={() => setSelectedDate(payload.date)}
          onFocus={() => setSelectedDate(payload.date)}
          r={eventMeta ? 6 : 4}
          stroke={eventMeta?.dotStroke ?? 'var(--color-card)'}
          strokeWidth={2}
          tabIndex={0}
        />
        {eventMeta ? (
          <circle
            cx={cx}
            cy={cy}
            fill="none"
            pointerEvents="none"
            r={10}
            stroke={eventMeta.dotFill}
            strokeOpacity={0.2}
            strokeWidth={6}
          />
        ) : null}
      </g>
    );
  }, []);

  return (
    <ChartFrame
      annotations={
        <ChartAnnotationLayer
          annotations={timeline
            .filter((event) => event.date >= dateRange.startDate && event.date <= dateRange.endDate)
            .map((event) => ({
              date: event.date,
              id: event.id,
              label: `${EVENT_META[event.type].label}: ${event.event}`,
            }))}
          formatDate={formatChartDate}
          onSelect={(event) => setSelectedDate(event.date)}
        />
      }
      controls={
        <ChartRangeControl
          aria-controls="severity-chart-visual"
          label="Severity date range"
          onChange={(value) => {
            setRange(value);
            setSelectedDate(null);
          }}
          options={RANGE_OPTIONS}
          statusText={`${range.toUpperCase()} · ${formatChartDate(dateRange.startDate)}–${formatChartDate(dateRange.endDate)} · ${observedPoints.length} check-ins`}
          value={range}
        />
      }
      description="Severity uses a 0–10 scale, where 10 is the worst. Event-only dates are modeled only when a recorded severity provides a basis; otherwise severity remains unavailable."
      detail={
        selectedPoint ? (
          <ChartPointDetail>
            <p className="font-medium text-foreground">{formatChartDate(selectedPoint.date)}</p>
            <p className="mt-1 text-muted-foreground">
              Severity{' '}
              {selectedPoint.value === null ? 'not available' : `${selectedPoint.value} of 10`} ·{' '}
              {selectedPoint.observed
                ? 'Recorded check-in'
                : selectedPoint.value === null
                  ? 'Event annotation only'
                  : 'Modeled event position'}
            </p>
            {selectedPoint.events.map((event) => (
              <p className="mt-1 text-muted-foreground" key={event.id}>
                {EVENT_META[event.type].label}: {event.event}
              </p>
            ))}
          </ChartPointDetail>
        ) : null
      }
      id="severity-chart"
      summary={
        <ChartSummary
          items={[
            {
              detail: observedPoints.at(-1)?.date
                ? formatChartDate(observedPoints.at(-1)?.date ?? referenceDate)
                : 'No check-in',
              label: 'Latest severity',
              value: latestValue === null ? 'Not available' : `${latestValue} / 10`,
            },
            {
              detail: `${observedPoints.length} recorded check-ins`,
              label: 'Selected-range change',
              value:
                firstValue === null || latestValue === null
                  ? 'Not available'
                  : `${latestValue - firstValue > 0 ? '+' : ''}${latestValue - firstValue}`,
            },
            {
              label: 'Minimum severity',
              value: values.length === 0 ? 'Not available' : `${Math.min(...values)} / 10`,
            },
            {
              label: 'Maximum severity',
              value: values.length === 0 ? 'Not available' : `${Math.max(...values)} / 10`,
            },
          ]}
          label="Selected severity range summary"
        />
      }
      table={
        <ChartDataTable
          caption="Exact severity values and recovery events"
          columns={[
            { key: 'date', header: 'Date', render: (point) => formatChartDate(point.date) },
            {
              key: 'severity',
              header: 'Severity',
              render: (point) => (point.value === null ? 'Not available' : `${point.value} / 10`),
            },
            {
              key: 'source',
              header: 'State',
              render: (point) =>
                point.observed
                  ? 'Recorded check-in'
                  : point.value === null
                    ? 'Event annotation only'
                    : 'Modeled event position',
            },
            {
              key: 'events',
              header: 'Events',
              render: (point) =>
                point.events.length === 0
                  ? 'None'
                  : point.events
                      .map((event) => `${EVENT_META[event.type].label}: ${event.event}`)
                      .join(' · '),
            },
          ]}
          getRowKey={(point) => point.date}
          onSelectRow={(point) => setSelectedDate(point.date)}
          rows={data}
          selectionLabel={(point) => `Inspect ${formatChartDate(point.date)}`}
        />
      }
      title="Pain / Severity Over Time"
    >
      {observedPoints.length < 2 ? (
        <ChartState
          description="Add at least two severity check-ins in this range. A severity of zero remains a valid observation."
          kind="insufficient"
          title="Not enough data to show a trend yet"
        />
      ) : (
        <div className="space-y-3">
          <ChartLegend
            items={[
              {
                color: 'var(--color-primary)',
                label: 'Severity line',
                style: 'line',
              },
              {
                color: 'var(--color-destructive)',
                label: 'Recovery event marker',
                style: 'dot',
              },
            ]}
          />
          <div className="relative">
            <div
              aria-label="Pain / Severity Over Time chart"
              className="aspect-[16/9] min-h-64 w-full"
              data-slot="severity-chart"
              role="img"
            >
              <ResponsiveContainer
                height="100%"
                initialDimension={{ height: 288, width: 320 }}
                width="100%"
              >
                <AreaChart
                  data={data}
                  margin={{ bottom: 8, left: 4, right: 12, top: 16 }}
                  onClick={(state) => {
                    if (typeof state?.activeLabel === 'number') {
                      setSelectedDate(chartCoordinateDateKey(state.activeLabel));
                    }
                  }}
                >
                  <defs>
                    <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-destructive)" stopOpacity={0.34} />
                      <stop offset="100%" stopColor="var(--color-accent-mint)" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    opacity={0.35}
                    stroke="var(--color-border)"
                    strokeDasharray="4 4"
                    vertical={false}
                  />
                  <XAxis
                    axisLine={false}
                    dataKey="timestamp"
                    domain={['dataMin', 'dataMax']}
                    minTickGap={28}
                    scale="time"
                    tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
                    tickFormatter={formatChartAxisDate}
                    tickLine={false}
                    type="number"
                  />
                  <YAxis
                    allowDecimals={false}
                    axisLine={false}
                    domain={[0, 10]}
                    label={{
                      angle: -90,
                      fill: 'var(--color-muted)',
                      position: 'insideLeft',
                      style: { textAnchor: 'middle' },
                      value: 'Severity',
                    }}
                    tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
                    tickLine={false}
                    ticks={[0, 2, 4, 6, 8, 10]}
                    width={46}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      const point = payload?.[0]?.payload as SeverityChartDatum | undefined;
                      if (!active || !point) return null;
                      return (
                        <ChartTooltip
                          dataSlot="severity-tooltip"
                          date={formatChartDate(point.date)}
                          rows={[
                            {
                              color: 'var(--color-primary)',
                              label: 'Severity',
                              value: point.value === null ? null : `${point.value} / 10`,
                            },
                            {
                              label: 'State',
                              value: point.observed
                                ? 'Recorded check-in'
                                : point.value === null
                                  ? 'Event annotation only'
                                  : 'Modeled event position',
                            },
                            ...point.events.map((event, index) => ({
                              color: EVENT_META[event.type].dotFill,
                              label:
                                point.events.length > 1
                                  ? `${EVENT_META[event.type].label} ${index + 1}`
                                  : EVENT_META[event.type].label,
                              value: event.notes ? `${event.event} · ${event.notes}` : event.event,
                            })),
                          ]}
                        />
                      );
                    }}
                  />
                  <Area
                    dataKey="value"
                    dot={renderSeverityDot}
                    fill={`url(#${gradientId})`}
                    isAnimationActive={false}
                    stroke="var(--color-primary)"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    type="linear"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </ChartFrame>
  );
}

import { formatWeight, type TrendWeightAnalytics, type TrendWeightRange } from '@pulse/shared';
import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, CircleHelp, Scale, TrendingDown, TrendingUp } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTrendWeightAnalytics } from '@/features/weight/api/weight';
import { parseDateInput } from '@/lib/date';

const RANGE_OPTIONS: Array<{ value: TrendWeightRange; label: string }> = [
  { value: '1m', label: '1M' },
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: '1y', label: '1Y' },
  { value: 'all', label: 'All' },
];

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const axisFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

const formatDate = (date: string) => dateFormatter.format(parseDateInput(`${date}T12:00:00`));
const dateValue = (date: string) => Date.parse(`${date}T12:00:00.000Z`);
const formatRecordedAt = (timestamp: number, timeZone: string) =>
  new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
    timeZoneName: 'short',
  }).format(timestamp);
const signedWeight = (value: number, unit: 'lbs' | 'kg') =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatWeight(Math.abs(value), unit)}`;

const STATE_LABELS: Record<TrendWeightAnalytics['current']['state'], string> = {
  no_data: 'No trend data',
  scale_only: 'Still learning',
  developing: 'Limited confidence',
  sufficient: 'Trend established',
  stale: 'Trend may be stale',
};

const stateTone = (state: TrendWeightAnalytics['current']['state']) =>
  state === 'sufficient' ? 'default' : state === 'stale' ? 'destructive' : 'secondary';

function chartSegments(points: TrendWeightAnalytics['points']) {
  let segment = 0;
  return points.map((point, index) => {
    if (index > 0 && point.startsNewTrendSegment) segment += 1;
    return { ...point, dateValue: dateValue(point.date), segment };
  });
}

type TrendWeightWorkspaceProps = {
  compact?: boolean;
  end?: string;
};

export function TrendWeightWorkspace({ compact = false, end }: TrendWeightWorkspaceProps) {
  const [range, setRange] = useState<TrendWeightRange>('1m');
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [tableOpen, setTableOpen] = useState(false);
  const query = useTrendWeightAnalytics(range, end);
  const analytics = query.data;
  const points = useMemo(() => chartSegments(analytics?.points ?? []), [analytics?.points]);
  const segments = useMemo(() => [...new Set(points.map((point) => point.segment))], [points]);
  const markerGroups = useMemo(() => {
    const groups = new Map<string, TrendWeightAnalytics['markers']>();
    for (const marker of analytics?.markers ?? []) {
      groups.set(marker.date, [...(groups.get(marker.date) ?? []), marker]);
    }
    return [...groups.entries()].map(([date, markers]) => ({ date, markers }));
  }, [analytics?.markers]);
  const selectedPoint =
    points.find((point) => point.sourceEntryId === selectedPointId) ?? points.at(-1) ?? null;
  const values = points.flatMap((point) =>
    point.trendWeight === null ? [point.scaleWeight] : [point.scaleWeight, point.trendWeight],
  );
  const yDomain: [number, number] = values.length
    ? [Math.min(...values) - 1, Math.max(...values) + 1]
    : [0, 1];
  const targetInView =
    analytics?.goal?.targetWeight !== null &&
    analytics?.goal?.targetWeight !== undefined &&
    analytics.goal.targetWeight >= yDomain[0] &&
    analytics.goal.targetWeight <= yDomain[1];
  const maintenanceBandInView =
    analytics?.goal?.maintenanceLower !== null &&
    analytics?.goal?.maintenanceLower !== undefined &&
    analytics?.goal?.maintenanceUpper !== null &&
    analytics?.goal?.maintenanceUpper !== undefined &&
    analytics.goal.maintenanceUpper >= yDomain[0] &&
    analytics.goal.maintenanceLower <= yDomain[1];

  if (query.isLoading) {
    return (
      <section
        aria-busy="true"
        aria-label="Loading Trend Weight"
        className="min-h-72 animate-pulse rounded-3xl border border-border/70 bg-card/80"
        role="status"
      />
    );
  }

  if (query.isError || !analytics) {
    return (
      <section className="rounded-3xl border border-destructive/40 bg-card p-5" role="alert">
        <h2 className="font-semibold text-foreground">Trend Weight could not be loaded</h2>
        <p className="mt-1 text-sm text-muted-foreground">Your measurements are safe.</p>
        <Button className="mt-4 min-h-11" onClick={() => void query.refetch()} type="button">
          Retry
        </Button>
      </section>
    );
  }

  const { current, unit } = analytics;
  const latest = current.latestScale;
  const directionIcon =
    current.ratePerWeek === null || Math.abs(current.ratePerWeek) < 0.01
      ? Activity
      : current.ratePerWeek < 0
        ? TrendingDown
        : TrendingUp;
  const DirectionIcon = directionIcon;

  return (
    <section className="min-w-0 space-y-4" data-slot="trend-weight-workspace">
      <article
        aria-labelledby="trend-weight-summary-heading"
        className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm"
      >
        <div
          className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[1.15fr_0.85fr]"
          style={{
            backgroundImage:
              'radial-gradient(circle at top right, color-mix(in srgb, var(--color-primary) 16%, transparent), transparent 48%)',
          }}
        >
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={stateTone(current.state)}>{STATE_LABELS[current.state]}</Badge>
              {analytics.isHistorical ? <Badge variant="outline">Historical view</Badge> : null}
              <span className="text-xs text-muted-foreground">
                {current.evidence.observationCount} recent weigh-ins
              </span>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Trend Weight</p>
              <h2
                className="mt-1 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl"
                id="trend-weight-summary-heading"
              >
                {current.trendWeight === null
                  ? 'Not available'
                  : formatWeight(current.trendWeight, unit)}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {current.trendDate
                  ? `Effective ${formatDate(current.trendDate)}`
                  : analytics.explanation.headline}
              </p>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              {analytics.explanation.detail}
            </p>
          </div>

          <dl className="grid min-w-0 gap-2 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-2xl border border-border/60 bg-background/70 p-3">
              <dt className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Latest scale
              </dt>
              <dd
                className="mt-1 font-semibold text-foreground"
                data-slot="trend-weight-latest-scale"
              >
                {latest ? formatWeight(latest.weight, latest.unit) : 'Not available'}
              </dd>
              <dd className="text-xs text-muted-foreground">
                {latest ? formatDate(latest.date) : 'No measurements yet'}
              </dd>
              {latest ? (
                <dd className="text-xs text-muted-foreground">
                  {latest.updatedAt > latest.createdAt ? 'Updated' : 'Recorded'}{' '}
                  {formatRecordedAt(
                    latest.updatedAt > latest.createdAt ? latest.updatedAt : latest.createdAt,
                    analytics.timeZone,
                  )}
                </dd>
              ) : null}
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/70 p-3">
              <dt className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Scale vs trend
              </dt>
              <dd className="mt-1 font-semibold text-foreground">
                {current.scaleTrendDifference === null
                  ? 'Not available'
                  : signedWeight(current.scaleTrendDifference, unit)}
              </dd>
              <dd className="text-xs text-muted-foreground">Raw measurement difference</dd>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/70 p-3">
              <dt className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Recent pace
              </dt>
              <dd className="mt-1 flex items-center gap-1.5 font-semibold text-foreground">
                <DirectionIcon aria-hidden="true" className="size-4" />
                {current.ratePerWeek === null
                  ? 'Not available'
                  : `${signedWeight(current.ratePerWeek, unit)}/week`}
              </dd>
              <dd className="text-xs text-muted-foreground">Dated 14-day regression</dd>
            </div>
          </dl>
        </div>
      </article>

      {!compact ? (
        <section aria-labelledby="trend-weight-deltas-heading" className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground" id="trend-weight-deltas-heading">
            Change by interval
          </h2>
          <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {analytics.deltas.map((delta) => (
              <div
                className="rounded-2xl border border-border/70 bg-card p-3"
                key={delta.requestedDays}
              >
                <dt className="text-xs font-medium text-muted-foreground">
                  {delta.requestedDays} days
                </dt>
                <dd className="mt-1 text-lg font-semibold text-foreground">
                  {delta.status === 'supported' && delta.value !== null
                    ? signedWeight(delta.value, unit)
                    : 'Not available'}
                </dd>
                <dd className="text-xs text-muted-foreground">
                  {delta.fromTrendDate
                    ? `From ${formatDate(delta.fromTrendDate)}`
                    : delta.reasonCode === 'STALE_CURRENT_TREND'
                      ? 'Current estimate is stale'
                      : 'Needs an earlier supported trend'}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <figure
        aria-describedby="trend-weight-chart-description"
        aria-labelledby="trend-weight-chart-heading"
        className="min-w-0 rounded-3xl border border-border/70 bg-card p-4 shadow-sm sm:p-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground" id="trend-weight-chart-heading">
              Scale and Trend Weight
            </h2>
            <p className="text-sm text-muted-foreground" id="trend-weight-chart-description">
              Scale dots are individual measurements. The solid line is Product Trend Weight; gaps
              are not bridged.
            </p>
          </div>
          <div aria-label="Trend Weight range" className="flex flex-wrap gap-1" role="group">
            {RANGE_OPTIONS.map((option) => (
              <Button
                aria-pressed={range === option.value}
                className="min-h-11 min-w-11 rounded-full px-3"
                key={option.value}
                onClick={() => setRange(option.value)}
                type="button"
                variant={range === option.value ? 'default' : 'ghost'}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        {markerGroups.length > 0 ? (
          <div
            aria-label="Chart annotations"
            className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground"
            data-slot="trend-weight-marker-lane"
          >
            {markerGroups.map((group) => (
              <span
                className="rounded-full border border-border/70 bg-background/70 px-2.5 py-1"
                data-date={group.date}
                key={group.date}
              >
                {formatDate(group.date)} ·{' '}
                {group.markers.length > 1
                  ? `${group.markers.length} events: ${group.markers
                      .map((marker) => marker.label)
                      .join(' + ')}`
                  : group.markers[0]?.label}
              </span>
            ))}
          </div>
        ) : null}

        {points.length === 0 ? (
          <div className="mt-4 flex min-h-64 items-center justify-center rounded-2xl border border-dashed border-border p-6 text-center">
            <div>
              <Scale aria-hidden="true" className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-2 font-medium text-foreground">
                {analytics.current.latestScale
                  ? 'No recent weigh-ins fall inside this chart range. Latest scale remains listed above.'
                  : 'Log your first weigh-in to start Trend Weight.'}
              </p>
            </div>
          </div>
        ) : (
          <div aria-label="Trend Weight chart" className="mt-4 h-72 min-w-0 sm:h-80" role="img">
            <ResponsiveContainer
              height="100%"
              initialDimension={{ width: 320, height: 288 }}
              width="100%"
            >
              <ComposedChart
                accessibilityLayer={false}
                data={points}
                margin={{ top: 12, right: 8, bottom: 0, left: 0 }}
              >
                <defs>
                  <pattern
                    height="8"
                    id="trend-weight-maintenance-pattern"
                    patternUnits="userSpaceOnUse"
                    width="8"
                  >
                    <path
                      d="M-2 2 L2 -2 M0 8 L8 0 M6 10 L10 6"
                      stroke="var(--color-primary)"
                      strokeOpacity="0.35"
                      strokeWidth="1.5"
                    />
                  </pattern>
                </defs>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 4" />
                <XAxis
                  allowDuplicatedCategory={false}
                  axisLine={false}
                  dataKey="dateValue"
                  domain={[
                    dateValue(analytics.range.startDate),
                    dateValue(analytics.range.endDate),
                  ]}
                  minTickGap={22}
                  scale="time"
                  tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
                  tickFormatter={(value: number) => axisFormatter.format(new Date(value))}
                  tickLine={false}
                  type="number"
                />
                <YAxis
                  axisLine={false}
                  domain={yDomain}
                  tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
                  tickFormatter={(value: number) => value.toFixed(0)}
                  tickLine={false}
                  width={38}
                />
                {maintenanceBandInView ? (
                  <ReferenceArea
                    fill="url(#trend-weight-maintenance-pattern)"
                    fillOpacity={1}
                    ifOverflow="extendDomain"
                    y1={analytics.goal?.maintenanceLower ?? undefined}
                    y2={analytics.goal?.maintenanceUpper ?? undefined}
                  />
                ) : null}
                {targetInView && analytics.goal ? (
                  <ReferenceLine
                    label={{ value: 'Goal', fill: 'var(--color-muted)', fontSize: 11 }}
                    stroke="var(--color-muted)"
                    strokeDasharray="5 4"
                    y={analytics.goal.targetWeight ?? undefined}
                  />
                ) : null}
                {markerGroups.map((group) => (
                  <ReferenceLine
                    className="trend-weight-marker-line"
                    ifOverflow="visible"
                    key={group.date}
                    stroke="var(--color-muted)"
                    strokeDasharray="2 4"
                    x={dateValue(group.date)}
                  />
                ))}
                <Tooltip
                  content={({ active, payload }) => {
                    const point = payload?.[0]?.payload as
                      | (TrendWeightAnalytics['points'][number] & { dateValue: number })
                      | undefined;
                    if (!active || !point) return null;
                    return (
                      <div
                        className="rounded-xl border border-border bg-card p-3 text-sm shadow-lg"
                        data-slot="trend-weight-tooltip"
                      >
                        <p className="font-medium text-foreground">{formatDate(point.date)}</p>
                        <p className="mt-1 text-muted-foreground">
                          Scale {formatWeight(point.scaleWeight, unit)}
                        </p>
                        <p className="text-muted-foreground">
                          Trend{' '}
                          {point.trendWeight === null
                            ? 'Not available'
                            : formatWeight(point.trendWeight, unit)}
                        </p>
                        <p className="text-muted-foreground">
                          State {point.state.replace('_', ' ')}
                        </p>
                      </div>
                    );
                  }}
                />
                {segments.map((segment) => (
                  <Line
                    className="trend-weight-segment"
                    data={points.map((point) => ({
                      ...point,
                      segmentTrend: point.segment === segment ? point.trendWeight : null,
                    }))}
                    dataKey="segmentTrend"
                    dot={false}
                    isAnimationActive={false}
                    key={segment}
                    name="trendWeight"
                    stroke="var(--color-primary)"
                    strokeWidth={3}
                    type="monotone"
                  />
                ))}
                <Scatter
                  cursor="pointer"
                  dataKey="scaleWeight"
                  fill="var(--color-foreground)"
                  isAnimationActive={false}
                  name="scaleWeight"
                  onClick={(point) => {
                    if (typeof point.sourceEntryId === 'string') {
                      setSelectedPointId(point.sourceEntryId);
                    }
                  }}
                  shape="circle"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-4 text-xs font-medium text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <span className="size-2 rounded-full bg-foreground" />
            Scale Weight dots
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-0.5 w-6 bg-primary" />
            Trend Weight line
          </span>
          {analytics.goal ? (
            <span className="inline-flex items-center gap-2">
              {analytics.goal.type === 'maintain' ? (
                <span
                  className="h-3 w-6 border border-primary/50"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 35%, transparent) 0 2px, transparent 2px 5px)',
                  }}
                />
              ) : (
                <span className="w-6 border-t-2 border-dashed border-muted-foreground" />
              )}
              {analytics.goal.type === 'maintain' ? 'Maintenance corridor' : 'Goal target'}
            </span>
          ) : null}
        </div>

        {selectedPoint ? (
          <div
            aria-live="polite"
            className="mt-4 rounded-2xl bg-secondary/40 p-3"
            data-slot="trend-weight-point-detail"
          >
            <p className="font-medium text-foreground">{formatDate(selectedPoint.date)}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Scale {formatWeight(selectedPoint.scaleWeight, unit)} · Trend{' '}
              {selectedPoint.trendWeight === null
                ? 'not available'
                : formatWeight(selectedPoint.trendWeight, unit)}{' '}
              · {selectedPoint.state.replace('_', ' ')}
            </p>
          </div>
        ) : null}
      </figure>

      {!compact ? (
        <>
          <section className="grid gap-3 lg:grid-cols-2">
            <article className="rounded-3xl border border-border/70 bg-card p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <CircleHelp aria-hidden="true" className="size-5 text-primary" />
                <h2 className="font-semibold text-foreground">Why Trend Weight lags</h2>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {analytics.explanation.lag}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {analytics.explanation.confidence}
              </p>
            </article>
            <article className="rounded-3xl border border-border/70 bg-card p-4 sm:p-5">
              <h2 className="font-semibold text-foreground">Goal context</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {analytics.goal
                  ? `${analytics.goal.type === 'lose' ? 'Loss' : analytics.goal.type === 'gain' ? 'Gain' : 'Maintenance'} goal · ${analytics.goal.explanation}${analytics.goal.type === 'maintain' ? ` Position: ${analytics.goal.maintenanceBandState.replaceAll('_', ' ')}.` : ''}`
                  : 'No active goal comparison. Trend Weight is still useful for direction.'}
              </p>
              {analytics.goal ? (
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">
                      {analytics.goal.type === 'maintain' ? 'Maintenance corridor' : 'Goal target'}
                    </dt>
                    <dd className="font-medium text-foreground">
                      {analytics.goal.type === 'maintain' &&
                      analytics.goal.maintenanceLower !== null &&
                      analytics.goal.maintenanceUpper !== null
                        ? `${formatWeight(analytics.goal.maintenanceLower, unit)}–${formatWeight(analytics.goal.maintenanceUpper, unit)}`
                        : analytics.goal.targetWeight === null
                          ? 'Not available'
                          : formatWeight(analytics.goal.targetWeight, unit)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Selected rate</dt>
                    <dd className="font-medium text-foreground">
                      {analytics.goal.desiredRatePerWeek === null
                        ? 'Not available'
                        : `${signedWeight(analytics.goal.desiredRatePerWeek, unit)}/week`}
                    </dd>
                  </div>
                </dl>
              ) : null}
              {analytics.goal && !targetInView && analytics.goal.targetWeight !== null ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Goal target is outside this chart’s measurement range; it remains listed here
                  without compressing the scale data.
                </p>
              ) : null}
              <h3 className="mt-4 text-sm font-semibold text-foreground">How Pulse uses weight</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {analytics.policy.explanation}
              </p>
            </article>
          </section>

          <section className="rounded-3xl border border-border/70 bg-card p-4 sm:p-5">
            <Button
              aria-controls="trend-weight-exact-values"
              aria-expanded={tableOpen}
              className="min-h-11"
              onClick={() => setTableOpen((value) => !value)}
              type="button"
              variant="outline"
            >
              {tableOpen ? 'Hide exact values' : 'Show exact values'}
            </Button>
            {tableOpen ? (
              <div className="mt-4 overflow-x-auto" id="trend-weight-exact-values">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <caption className="sr-only">Exact Scale and Trend Weight values</caption>
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="py-2 pr-3" scope="col">
                        Date
                      </th>
                      <th className="px-3 py-2" scope="col">
                        Scale
                      </th>
                      <th className="px-3 py-2" scope="col">
                        Trend
                      </th>
                      <th className="px-3 py-2" scope="col">
                        Difference
                      </th>
                      <th className="px-3 py-2" scope="col">
                        State
                      </th>
                      <th className="pl-3 py-2" scope="col">
                        Annotation
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {points.map((point) => (
                      <tr className="border-b border-border/60" key={point.sourceEntryId}>
                        <td className="py-2 pr-3">
                          <button
                            className="min-h-11 text-left font-medium text-primary hover:underline"
                            onClick={() => setSelectedPointId(point.sourceEntryId)}
                            type="button"
                          >
                            {formatDate(point.date)}
                          </button>
                        </td>
                        <td className="px-3 py-2">{formatWeight(point.scaleWeight, unit)}</td>
                        <td className="px-3 py-2">
                          {point.trendWeight === null
                            ? 'Not available'
                            : formatWeight(point.trendWeight, unit)}
                        </td>
                        <td className="px-3 py-2">
                          {point.scaleTrendDifference === null
                            ? 'Not available'
                            : signedWeight(point.scaleTrendDifference, unit)}
                        </td>
                        <td className="px-3 py-2">{point.state.replace('_', ' ')}</td>
                        <td className="pl-3 py-2">
                          {[
                            point.annotation,
                            ...analytics.markers
                              .filter((marker) => marker.date === point.date)
                              .map((marker) => marker.label),
                          ]
                            .filter(Boolean)
                            .join(' · ') || 'None'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {tableOpen && analytics.markers.length > 0 ? (
              <section aria-labelledby="trend-weight-annotations-heading" className="mt-5">
                <h3 className="text-sm font-semibold" id="trend-weight-annotations-heading">
                  Annotations
                </h3>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {analytics.markers.map((marker) => (
                    <li key={`${marker.kind}-${marker.id}`}>
                      {formatDate(marker.date)} · {marker.label} ·{' '}
                      {marker.kind.replaceAll('_', ' ')}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </section>
        </>
      ) : null}
    </section>
  );
}

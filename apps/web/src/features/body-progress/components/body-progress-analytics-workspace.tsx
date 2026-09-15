import {
  chartDateCoordinate,
  formatWeight,
  type BodyProgressAnalytics,
  type BodyProgressPoint,
  type BodyProgressRange,
  type LengthUnit,
} from '@pulse/shared';
import { Activity, Dumbbell, Scale, ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
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
  ChartTooltip,
  formatChartAxisDate,
  formatChartDate,
} from '@/components/charts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { useBodyProgressAnalytics } from '../api/body-progress';
import { formatLength, qualityLabel } from './body-format';

const RANGE_OPTIONS: Array<{ value: BodyProgressRange; label: string }> = [
  { value: '1m', label: '1M' },
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: '1y', label: '1Y' },
  { value: 'all', label: 'All' },
];

const SIGNAL_LABELS: Record<BodyProgressAnalytics['signal']['state'], string> = {
  insufficient_data: 'Insufficient data',
  favorable_gain_signal: 'Favorable gain signal',
  possible_recomp_signal: 'Possible recomp signal',
  possible_fat_gain_signal: 'Possible fat-gain signal',
  favorable_loss_signal: 'Favorable loss signal',
  maintenance_signal: 'Maintenance signal',
  mixed_signal: 'Mixed signal',
  stale: 'Stale signal',
};

const SITE_LABELS: Record<BodyProgressPoint['site'], string> = {
  waist_iliac_crest_nhanes: 'Waist',
  chest_nipple_line_relaxed: 'Chest',
  hips_maximum: 'Hips',
  upper_arm_midpoint_flexed: 'Upper arm',
  thigh_midpoint: 'Thigh',
};

const siteLabel = (point: Pick<BodyProgressPoint, 'site' | 'laterality'>) =>
  `${SITE_LABELS[point.site]}${point.laterality === 'none' ? '' : ` · ${point.laterality}`}`;

const displayMm = (value: number, unit: LengthUnit) => value / (unit === 'cm' ? 10 : 25.4);

const signedLength = (value: number, unit: LengthUnit) =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatLength(Math.abs(value), unit)}`;

const signedWeight = (value: number, unit: 'lbs' | 'kg') =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatWeight(Math.abs(value), unit)}`;

type ChartPoint = BodyProgressPoint & {
  chartValue: number;
  dateValue: number;
  segmentId: string;
};

export function BodyProgressAnalyticsWorkspace({ lengthUnit }: { lengthUnit: LengthUnit }) {
  const [range, setRange] = useState<BodyProgressRange>('3m');
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const query = useBodyProgressAnalytics(range);
  const analytics = query.data;
  const points = useMemo<ChartPoint[]>(
    () =>
      (analytics?.segments ?? []).flatMap((segment) =>
        segment.points.map((point) => ({
          ...point,
          chartValue: displayMm(point.canonicalMm, lengthUnit),
          dateValue: chartDateCoordinate(point.date),
          segmentId: segment.id,
        })),
      ),
    [analytics?.segments, lengthUnit],
  );
  const selectedPoint =
    points.find((point) => point.measurementId === selectedMeasurementId) ?? null;
  const selectedMarker =
    analytics?.markers.find((marker) => marker.id === selectedMarkerId) ?? null;
  const chartValues = points.map((point) => point.chartValue);
  const yDomain: [number, number] = chartValues.length
    ? [Math.min(...chartValues) - 2, Math.max(...chartValues) + 2]
    : [0, 1];

  if (query.isLoading) {
    return (
      <ChartState
        description="Pulse is loading server-owned circumference, Trend Weight, and progression evidence."
        kind="loading"
        title="Loading Body Progress analytics"
      />
    );
  }

  if (query.isError || !analytics) {
    return (
      <ChartState
        description="No trend or body-composition interpretation was guessed. Your check-ins remain available below."
        kind="error"
        onAction={() => void query.refetch()}
        title="Body Progress analytics could not be loaded"
      />
    );
  }

  const enabledKeys = new Set(
    analytics.readiness.enabledSites.map((site) => `${site.site}:${site.laterality}`),
  );
  const latestSupported = analytics.segments
    .filter(
      (segment) =>
        segment.analysis.state === 'supported' &&
        enabledKeys.has(`${segment.site}:${segment.laterality}`),
    )
    .sort((left, right) =>
      (left.points.at(-1)?.date ?? '').localeCompare(right.points.at(-1)?.date ?? ''),
    );
  const supportedState = analytics.readiness.state === 'ready';
  const latestSupportedCards = latestSupported.flatMap((segment) => {
    const point = segment.points.at(-1);
    return point ? [{ point, segment }] : [];
  });
  const chartState =
    analytics.readiness.state === 'stale'
      ? 'stale'
      : analytics.segments.length === 0
        ? 'empty'
        : 'insufficient';

  return (
    <section className="min-w-0 space-y-5" data-slot="body-progress-analytics-workspace">
      <Card className="overflow-hidden border-border/70 shadow-sm">
        <div
          className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[1.2fr_0.8fr]"
          style={{
            backgroundImage:
              'radial-gradient(circle at top right, color-mix(in srgb, var(--color-primary) 15%, transparent), transparent 48%)',
          }}
        >
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={analytics.signal.state === 'stale' ? 'destructive' : 'secondary'}>
                {SIGNAL_LABELS[analytics.signal.state]}
              </Badge>
              <Badge variant="outline">{analytics.signal.confidence} confidence</Badge>
              {analytics.isHistorical ? <Badge variant="outline">Historical view</Badge> : null}
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Body Progress signal</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {analytics.signal.headline}
              </h2>
            </div>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              {analytics.signal.detail}
            </p>
            <p className="text-sm font-medium text-foreground">{analytics.signal.nextAction}</p>
          </div>
          <dl className="grid min-w-0 gap-2 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-2xl border border-border/60 bg-background/70 p-3">
              <dt className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Trend Weight
              </dt>
              <dd className="mt-1 font-semibold text-foreground">
                {analytics.weight.trendWeight === null
                  ? 'Not available'
                  : formatWeight(analytics.weight.trendWeight, analytics.weight.unit)}
              </dd>
              <dd className="text-xs text-muted-foreground">
                {analytics.weight.trendDate
                  ? `Effective ${formatChartDate(analytics.weight.trendDate)}`
                  : `State: ${analytics.weight.state.replaceAll('_', ' ')}`}
              </dd>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/70 p-3">
              <dt className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Recent pace
              </dt>
              <dd className="mt-1 font-semibold text-foreground">
                {analytics.weight.recentPacePerWeek === null
                  ? 'Not available'
                  : `${signedWeight(analytics.weight.recentPacePerWeek, analytics.weight.unit)}/week`}
              </dd>
              <dd className="text-xs text-muted-foreground">
                Product Trend Weight · {analytics.weight.paceFreshness}
              </dd>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/70 p-3">
              <dt className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Progression evidence
              </dt>
              <dd className="mt-1 font-semibold capitalize text-foreground">
                {analytics.strengthEvidence.state}
              </dd>
              <dd className="text-xs text-muted-foreground">
                Server-owned workout decisions · {analytics.strengthEvidence.confidence}
              </dd>
            </div>
          </dl>
        </div>
        <CardContent className="border-t border-border/70 pt-4">
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/weight/history">
                <Scale aria-hidden="true" /> Open Trend Weight
              </Link>
            </Button>
            <Badge variant="outline">
              {analytics.readiness.completedCheckInCount} completed check-ins
            </Badge>
            <Badge variant="outline">
              {analytics.readiness.supportedSegmentCount} supported segments
            </Badge>
          </div>
        </CardContent>
      </Card>

      <ChartFrame
        annotations={
          <ChartAnnotationLayer
            annotations={analytics.markers}
            formatDate={formatChartDate}
            label="Body Progress chart annotations"
            onSelect={(marker) => setSelectedMarkerId(marker.id)}
            selectedId={selectedMarkerId}
          />
        }
        controls={
          <ChartRangeControl
            aria-controls="body-progress-circumference-chart-visual"
            label="Body Progress range"
            onChange={(value) => {
              setRange(value);
              setSelectedMeasurementId(null);
              setSelectedMarkerId(null);
            }}
            options={RANGE_OPTIONS}
            statusText={`${range.toUpperCase()} · ${formatChartDate(analytics.range.startDate)}–${formatChartDate(analytics.range.endDate)} · ${points.length} readings`}
            value={range}
          />
        }
        description="Each line is one exact site, laterality, and protocol version. Protocol changes and gaps are not bridged; dots are server-canonical check-in values."
        detail={
          selectedPoint || selectedMarker ? (
            <ChartPointDetail label="Selected Body Progress evidence">
              {selectedPoint ? (
                <>
                  <p className="font-medium text-foreground">
                    {formatChartDate(selectedPoint.date)} · {siteLabel(selectedPoint)}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Canonical {formatLength(selectedPoint.canonicalMm, lengthUnit)} · raw{' '}
                    {selectedPoint.readingsMm
                      .filter((value): value is number => value !== null)
                      .map((value) => formatLength(value, lengthUnit))
                      .join(', ')}{' '}
                    · {qualityLabel[selectedPoint.quality]}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selectedPoint.protocolId} · {selectedPoint.protocolVersion} · check-in version{' '}
                    {selectedPoint.checkInVersion}
                    {selectedPoint.corrected ? ' · corrected' : ''}
                  </p>
                </>
              ) : null}
              {selectedMarker ? (
                <p className={selectedPoint ? 'mt-3 border-t pt-3' : ''}>
                  {formatChartDate(selectedMarker.date)} · {selectedMarker.label}
                </p>
              ) : null}
            </ChartPointDetail>
          ) : undefined
        }
        id="body-progress-circumference-chart"
        summary={
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {latestSupportedCards.map(({ point, segment }) => (
              <div className="rounded-xl border border-border/70 bg-muted/10 p-3" key={segment.id}>
                <p className="text-xs text-muted-foreground">
                  {siteLabel(point)} · compatible segment
                </p>
                <p className="mt-1 font-semibold text-foreground">
                  {segment.rawDelta
                    ? `${signedLength(segment.rawDelta.deltaMm, lengthUnit)} raw change`
                    : 'No raw change available'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {segment.analysis.direction.replaceAll('_', ' ')} ·{' '}
                  {segment.analysis.independentlySpacedPointCount} independently spaced
                </p>
              </div>
            ))}
          </div>
        }
        table={
          points.length ? (
            <ChartDataTable
              caption="Exact Body Progress chart values and provenance"
              columns={[
                { key: 'date', header: 'Date', render: (point) => formatChartDate(point.date) },
                { key: 'site', header: 'Site', render: (point) => siteLabel(point) },
                {
                  key: 'canonical',
                  header: 'Canonical',
                  render: (point) => formatLength(point.canonicalMm, lengthUnit),
                },
                {
                  key: 'raw',
                  header: 'Raw readings',
                  render: (point) =>
                    point.readingsMm
                      .filter((value): value is number => value !== null)
                      .map((value) => formatLength(value, lengthUnit))
                      .join(' · '),
                },
                {
                  key: 'quality',
                  header: 'Quality',
                  render: (point) => qualityLabel[point.quality],
                },
                {
                  key: 'protocol',
                  header: 'Protocol',
                  render: (point) => `${point.protocolId} · ${point.protocolVersion}`,
                },
              ]}
              getRowKey={(point) => point.measurementId}
              onSelectRow={(point) => setSelectedMeasurementId(point.measurementId)}
              rows={points}
              selectionLabel={(point) =>
                `Inspect ${siteLabel(point)} on ${formatChartDate(point.date)}`
              }
              summary="View exact chart values and raw readings"
            />
          ) : undefined
        }
        title="Circumference trends"
        visualClassName="min-h-72"
      >
        {!supportedState ? (
          <ChartState
            description={
              chartState === 'stale'
                ? 'The latest compatible measurement is beyond the configured cadence plus the seven-day freshness grace period.'
                : analytics.segments.length === 0
                  ? 'Complete a standardized check-in to begin a protocol-bound history.'
                  : 'Direction needs at least 3 compatible check-ins spanning 28 days, with independently counted readings at least 10 days apart.'
            }
            kind={chartState}
            title={chartState === 'stale' ? 'Measurements are stale' : 'Direction is not ready'}
          />
        ) : (
          <div
            aria-label="Body Progress circumference chart"
            className="h-72 min-w-0 sm:h-80"
            role="img"
          >
            <ResponsiveContainer
              height="100%"
              initialDimension={{ width: 320, height: 288 }}
              width="100%"
            >
              <ComposedChart data={points} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 4" />
                <XAxis
                  axisLine={false}
                  dataKey="dateValue"
                  domain={[
                    chartDateCoordinate(analytics.range.startDate),
                    chartDateCoordinate(analytics.range.endDate),
                  ]}
                  minTickGap={24}
                  scale="time"
                  tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
                  tickFormatter={formatChartAxisDate}
                  tickLine={false}
                  type="number"
                />
                <YAxis
                  axisLine={false}
                  domain={yDomain}
                  tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
                  tickFormatter={(value: number) => value.toFixed(0)}
                  tickLine={false}
                  unit={lengthUnit}
                  width={46}
                />
                {analytics.markers.map((marker) => (
                  <ReferenceLine
                    ifOverflow="visible"
                    key={marker.id}
                    stroke="var(--color-muted)"
                    strokeDasharray="2 4"
                    x={chartDateCoordinate(marker.date)}
                  />
                ))}
                <Tooltip
                  content={({ active, payload }) => {
                    const point = payload?.[0]?.payload as ChartPoint | undefined;
                    if (!active || !point) return null;
                    return (
                      <ChartTooltip
                        dataSlot="body-progress-tooltip"
                        date={`${formatChartDate(point.date)} · ${siteLabel(point)}`}
                        rows={[
                          {
                            color: 'var(--color-primary)',
                            label: 'Canonical',
                            value: formatLength(point.canonicalMm, lengthUnit),
                          },
                          { label: 'Quality', value: qualityLabel[point.quality] },
                          { label: 'Protocol', value: point.protocolVersion },
                        ]}
                      />
                    );
                  }}
                />
                {analytics.segments.map((segment, index) => (
                  <Line
                    data={segment.points.map((point) => ({
                      ...point,
                      chartValue: displayMm(point.canonicalMm, lengthUnit),
                      dateValue: chartDateCoordinate(point.date),
                    }))}
                    dataKey="chartValue"
                    dot={false}
                    isAnimationActive={false}
                    key={segment.id}
                    stroke={`var(--chart-${(index % 5) + 1})`}
                    strokeWidth={2.5}
                    type="linear"
                  />
                ))}
                <Scatter
                  cursor="pointer"
                  dataKey="chartValue"
                  fill="var(--color-foreground)"
                  isAnimationActive={false}
                  onClick={(point) => {
                    if (typeof point.measurementId === 'string')
                      setSelectedMeasurementId(point.measurementId);
                  }}
                  shape="circle"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
        <ChartLegend
          className="mt-3"
          items={[
            { color: 'var(--color-foreground)', label: 'Canonical check-in value', style: 'dot' },
            { color: 'var(--color-primary)', label: 'Compatible protocol segment', style: 'line' },
          ]}
        />
      </ChartFrame>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity aria-hidden="true" className="size-5 text-primary" /> Evidence and readiness
            </CardTitle>
            <CardDescription>Server-owned facts used for this bounded signal.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {analytics.signal.supportingFacts.length ? (
              <ul className="space-y-2">
                {analytics.signal.supportingFacts.map((fact) => (
                  <li
                    className="rounded-xl border border-border/70 p-3"
                    key={`${fact.code}:${fact.date ?? 'none'}`}
                  >
                    <p className="font-medium">{fact.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {fact.source.replaceAll('_', ' ')}
                      {fact.date ? ` · ${formatChartDate(fact.date)}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">No supporting facts are available yet.</p>
            )}
            {analytics.signal.contradictoryFacts.length ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="font-medium">Contradictory evidence</p>
                <ul className="mt-1 text-muted-foreground">
                  {analytics.signal.contradictoryFacts.map((fact) => (
                    <li key={`${fact.code}:${fact.label}`}>{fact.label}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert aria-hidden="true" className="size-5 text-primary" /> Limits, not
              estimates
            </CardTitle>
            <CardDescription>What these measurements cannot establish.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
              {analytics.signal.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
            {analytics.signal.unavailableInputs.length ? (
              <p className="rounded-xl border border-border/70 p-3 text-muted-foreground">
                Unavailable inputs:{' '}
                {analytics.signal.unavailableInputs.join(', ').replaceAll('_', ' ')}.
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Policy: 3 compatible check-ins · 28-day span · 10-day independent spacing ·{' '}
              {analytics.algorithm.noiseFloorMm.waist_iliac_crest_nhanes / 10} cm waist noise floor
              · no interpolation.
            </p>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Dumbbell aria-hidden="true" className="size-4" /> Workout exposure is not treated as
              strength. Only existing progression decisions are adapted.
            </p>
          </CardContent>
        </Card>
      </div>

      {analytics.legacyPoints.length ? (
        <p className="rounded-xl border border-border/70 bg-muted/10 p-3 text-sm text-muted-foreground">
          {analytics.legacyPoints.length} legacy scalar value
          {analytics.legacyPoints.length === 1 ? '' : 's'} remain separate and unsupported for
          repeated-reading trend analysis.
        </p>
      ) : null}
    </section>
  );
}

import type {
  EnergyBalanceAnalytics,
  EnergyBalancePoint,
  EnergyBalanceRangePreset,
  EnergyBalanceState,
} from '@pulse/shared';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Info,
  Scale,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { ChartRangeControl } from '@/components/charts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import { useAdaptiveEnergyBalance } from '../api/adaptive-nutrition';

const RANGE_OPTIONS: Array<{ label: string; value: EnergyBalanceRangePreset }> = [
  { label: '1W', value: '1w' },
  { label: '1M', value: '1m' },
  { label: '3M', value: '3m' },
  { label: '6M', value: '6m' },
  { label: '1Y', value: '1y' },
  { label: 'All', value: 'all' },
];

const stateCopy: Record<
  EnergyBalanceState,
  { label: string; detail: string; icon: typeof Sparkles }
> = {
  learning: {
    label: 'Learning',
    detail: 'Your starting estimate stays active while complete days and weigh-ins build coverage.',
    icon: Sparkles,
  },
  updating: {
    label: 'Updating',
    detail: 'Accepted check-ins are personalizing your expenditure estimate.',
    icon: CheckCircle2,
  },
  holding: {
    label: 'Holding',
    detail: 'Pulse is preserving the last accepted estimate until the data is reliable again.',
    icon: Clock3,
  },
  review_needed: {
    label: 'Review needed',
    detail: 'A recommendation is waiting, but it has not changed expenditure or targets.',
    icon: AlertCircle,
  },
};

const goalTypeLabel = {
  lose: 'Loss',
  maintain: 'Maintenance',
  gain: 'Gain',
} as const;

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const longDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
  year: 'numeric',
});

const formatDate = (value: string) => longDateFormatter.format(new Date(`${value}T12:00:00Z`));
const formatAxisDate = (value: string) => dateFormatter.format(new Date(`${value}T12:00:00Z`));
const formatKcal = (value: number | null) =>
  value === null ? 'Not enough data' : `${Math.round(value).toLocaleString()} kcal`;
const formatSignedKcal = (value: number | null) =>
  value === null
    ? 'Not enough data'
    : `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(Math.round(value)).toLocaleString()} kcal`;
const formatKg = (value: number | null) =>
  value === null
    ? 'Not enough data'
    : `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(2)} kg`;

const tooltipStyle = {
  backgroundColor: 'var(--color-card)',
  border: '1px solid var(--color-border)',
  borderRadius: '14px',
  color: 'var(--color-foreground)',
};

const expenditureStateStroke: Record<EnergyBalanceState, string> = {
  learning: 'var(--color-muted-foreground)',
  updating: 'var(--color-primary)',
  holding: 'var(--color-on-cream)',
  review_needed: 'var(--color-destructive)',
};

const expenditureStateDash: Record<EnergyBalanceState, string | undefined> = {
  learning: '3 5',
  updating: undefined,
  holding: '8 5',
  review_needed: '2 4',
};

export function buildExpenditureStateSegments(points: readonly EnergyBalancePoint[]) {
  const segments: Array<{
    id: string;
    state: EnergyBalanceState;
    data: Array<{ date: string; expenditure: number }>;
  }> = [];
  let previous: { date: string; expenditure: number } | null = null;

  for (const point of points) {
    if (point.expenditureKcal === null) {
      previous = null;
      continue;
    }
    const current = { date: point.periodEnd, expenditure: point.expenditureKcal };
    const active = segments.at(-1);
    if (active?.state === point.state) active.data.push(current);
    else {
      segments.push({
        id: `${point.state}-${point.periodStart}-${segments.length}`,
        state: point.state,
        data: previous ? [previous, current] : [current],
      });
    }
    previous = current;
  }

  return segments;
}

export function resolveMarkerChartDate(points: readonly EnergyBalancePoint[], markerDate: string) {
  return (
    points.find((point) => point.periodStart <= markerDate && markerDate <= point.periodEnd)
      ?.periodEnd ?? markerDate
  );
}

export function EnergyBalanceWorkspace() {
  const [range, setRange] = useState<EnergyBalanceRangePreset>('1m');
  const [comparison, setComparison] = useState<'target' | 'expenditure'>('target');
  const requestedEnd = new URLSearchParams(window.location.search).get('end');
  const end = requestedEnd?.match(/^\d{4}-\d{2}-\d{2}$/) ? requestedEnd : undefined;
  const query = useAdaptiveEnergyBalance({ aggregation: 'auto', end, range });

  const analytics = query.data;
  return (
    <div className="space-y-5" data-slot="energy-balance-workspace">
      <RangeControl
        analytics={analytics}
        busy={query.isFetching}
        onRange={setRange}
        range={range}
      />
      {query.isLoading ? <EnergyBalanceLoading /> : null}
      {query.isError || (!analytics && !query.isLoading) ? (
        <Card role="alert">
          <CardContent className="space-y-3 py-6">
            <p className="font-semibold">Energy balance could not be loaded.</p>
            <p className="text-sm text-muted-foreground">
              Your nutrition data was not changed. Retry this read-only view.
            </p>
            <Button onClick={() => void query.refetch()} type="button" variant="outline">
              Retry analytics
            </Button>
          </CardContent>
        </Card>
      ) : null}
      {analytics ? (
        <>
          <StateHero analytics={analytics} />
          <SummaryGrid analytics={analytics} />
          <ExpenditureHistory analytics={analytics} />
          <BalanceChart
            analytics={analytics}
            comparison={comparison}
            onComparison={setComparison}
          />
          <PredictionCard analytics={analytics} />
          <WhyEstimate analytics={analytics} />
        </>
      ) : null}
    </div>
  );
}

function RangeControl({
  analytics,
  busy,
  onRange,
  range,
}: {
  analytics: EnergyBalanceAnalytics | undefined;
  busy: boolean;
  onRange: (range: EnergyBalanceRangePreset) => void;
  range: EnergyBalanceRangePreset;
}) {
  return (
    <Card aria-busy={busy} className="gap-4 py-4">
      <CardContent className="space-y-3 px-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Analysis range</p>
            <p aria-live="polite" className="text-xs text-muted-foreground">
              {analytics
                ? `${formatDate(analytics.range.startDate)}–${formatDate(analytics.range.endDate)} · ${analytics.range.aggregation}`
                : 'Loading selected range…'}
            </p>
          </div>
          {analytics ? <Badge variant="outline">{analytics.timeZone}</Badge> : null}
        </div>
        <ChartRangeControl
          label="Energy balance range"
          onChange={onRange}
          options={RANGE_OPTIONS}
          statusText={
            analytics
              ? `${range.toUpperCase()} · ${formatDate(analytics.range.startDate)}–${formatDate(analytics.range.endDate)} · ${analytics.points.length} periods`
              : 'Loading selected range'
          }
          value={range}
        />
      </CardContent>
    </Card>
  );
}

function StateHero({ analytics }: { analytics: EnergyBalanceAnalytics }) {
  const copy = stateCopy[analytics.current.state];
  const Icon = copy.icon;
  const complete = analytics.current.readiness.completeNutritionDaysUsable;
  const required = analytics.current.readiness.requiredCompleteNutritionDays;
  const weighIns = analytics.current.readiness.weighInsUsable;
  const requiredWeighIns = analytics.current.readiness.requiredWeighIns;

  return (
    <Card
      className="relative overflow-hidden border-primary/25 bg-card py-5"
      data-slot="energy-state-hero"
    >
      <div aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-primary" />
      <div
        aria-hidden="true"
        className="absolute -right-12 -top-20 size-52 rounded-full bg-primary/10 blur-3xl"
      />
      <CardHeader className="relative gap-4 px-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge
            className="gap-1.5"
            variant={analytics.current.state === 'updating' ? 'default' : 'outline'}
          >
            <Icon aria-hidden="true" className="size-3.5" /> {copy.label}
          </Badge>
          {analytics.isHistorical ? <Badge variant="outline">Historical view</Badge> : null}
        </div>
        <div className="grid gap-5 md:grid-cols-[1.2fr_0.8fr] md:items-end">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              {analytics.current.expenditureSourceCheckInId
                ? 'Adaptive TDEE'
                : 'Starting expenditure'}
            </p>
            <p className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
              {Math.round(analytics.current.adaptiveTdeeKcal).toLocaleString()}
              <span className="ml-2 text-base font-medium text-muted-foreground">kcal/day</span>
            </p>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{copy.detail}</p>
          </div>
          <dl className="grid grid-cols-2 gap-2">
            <HeroFact
              label={
                analytics.current.goalType
                  ? `${goalTypeLabel[analytics.current.goalType]} target`
                  : 'Current target'
              }
              value={formatKcal(analytics.current.calorieTargetKcal)}
            />
            <HeroFact
              label="Confidence"
              value={
                analytics.current.confidenceLabel
                  ? `${analytics.current.confidenceLabel} · ${Math.round((analytics.current.confidenceScore ?? 0) * 100)}%`
                  : 'Building'
              }
            />
            <HeroFact label="Nutrition evidence" value={`${complete} / ${required} usable`} />
            <HeroFact
              label="Weigh-in evidence"
              value={`${weighIns} / ${requiredWeighIns} usable`}
            />
          </dl>
        </div>
      </CardHeader>
      <CardContent className="relative px-5 sm:px-6">
        <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
          <p className="font-semibold">{analytics.explanation.headline}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {analytics.explanation.detail}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function HeroFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border/70 bg-background/65 p-3">
      <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-semibold">{value}</dd>
    </div>
  );
}

function SummaryGrid({ analytics }: { analytics: EnergyBalanceAnalytics }) {
  const summary = analytics.summary;
  return (
    <section aria-labelledby="range-summary-title" className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold" id="range-summary-title">
          Selected-range summary
        </h2>
        <p className="text-sm text-muted-foreground">
          Nutrition coverage: {summary.completeNutritionDays} of {analytics.range.calendarDays}{' '}
          complete days. Benchmarks use every available date; comparisons use matched complete days.
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <SummaryMetric label="Average intake" value={formatKcal(summary.averageIntakeKcal)} />
        <SummaryMetric
          label="Average expenditure"
          value={formatKcal(summary.averageExpenditureKcal)}
        />
        <SummaryMetric
          label="Intake vs target"
          signed={summary.averageIntakeMinusTargetKcal}
          value={formatSignedKcal(summary.averageIntakeMinusTargetKcal)}
        />
        <SummaryMetric
          label="Intake vs expenditure"
          signed={summary.averageIntakeMinusExpenditureKcal}
          value={formatSignedKcal(summary.averageIntakeMinusExpenditureKcal)}
        />
        <SummaryMetric label="Predicted change" value={formatKg(summary.predictedWeightChangeKg)} />
        <SummaryMetric
          label="Observed trend"
          value={formatKg(summary.observedTrendWeightChangeKg)}
        />
      </dl>
    </section>
  );
}

function SummaryMetric({
  label,
  signed,
  value,
}: {
  label: string;
  signed?: number | null;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-border/70 bg-card p-3.5 shadow-xs">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-2 flex items-center gap-1.5 break-words text-sm font-semibold sm:text-base">
        {signed == null ? null : signed > 0 ? (
          <ArrowUpRight aria-hidden="true" className="size-4 shrink-0 text-amber-600" />
        ) : signed < 0 ? (
          <ArrowDownRight aria-hidden="true" className="size-4 shrink-0 text-sky-600" />
        ) : (
          <CircleDashed aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        )}
        {value}
      </dd>
    </div>
  );
}

function ExpenditureHistory({ analytics }: { analytics: EnergyBalanceAnalytics }) {
  const chartData = analytics.points.map((point) => ({
    date: point.periodEnd,
    expenditure: point.expenditureKcal,
  }));
  const segments = buildExpenditureStateSegments(analytics.points);
  const markerLines = analytics.markers.map((marker) => ({
    ...marker,
    x: resolveMarkerChartDate(analytics.points, marker.date),
  }));
  return (
    <Card className="gap-3 py-5">
      <CardHeader className="gap-2 px-5 sm:px-6">
        <div className="flex items-center gap-2">
          <Sparkles aria-hidden="true" className="size-4 text-primary" />
          <CardTitle>
            <h2>Expenditure history</h2>
          </CardTitle>
        </div>
        <CardDescription>
          The line begins at the deterministic starting estimate. Only accepted check-ins replace
          it; held and review-needed events never do.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-3 sm:px-5">
        <div aria-label="Adaptive expenditure history chart" className="h-64 w-full" role="img">
          <ResponsiveContainer
            height="100%"
            initialDimension={{ height: 256, width: 320 }}
            width="100%"
          >
            <LineChart data={chartData} margin={{ bottom: 4, left: 0, right: 8, top: 10 }}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis
                axisLine={false}
                dataKey="date"
                minTickGap={24}
                tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                tickFormatter={formatAxisDate}
                tickLine={false}
              />
              <YAxis
                axisLine={false}
                domain={['dataMin - 100', 'dataMax + 100']}
                tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                tickFormatter={(value: number) => `${Math.round(value)}`}
                tickLine={false}
                width={42}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value, name) => [
                  formatKcal(Number(value)),
                  `${String(name).replace('_', ' ')} expenditure`,
                ]}
                labelFormatter={(value) => formatDate(String(value))}
                shared={false}
              />
              {segments.map((segment) => (
                <Line
                  data={segment.data}
                  dataKey="expenditure"
                  dot={
                    segment.data.length === 1
                      ? { fill: expenditureStateStroke[segment.state], r: 4 }
                      : false
                  }
                  isAnimationActive={false}
                  key={segment.id}
                  name={segment.state}
                  stroke={expenditureStateStroke[segment.state]}
                  strokeDasharray={expenditureStateDash[segment.state]}
                  strokeLinecap="round"
                  strokeWidth={3}
                  type="stepAfter"
                />
              ))}
              {markerLines.map((marker) => (
                <ReferenceLine
                  key={marker.id}
                  stroke="var(--color-muted-foreground)"
                  strokeDasharray="2 4"
                  x={marker.x}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border px-2.5 py-1">Dotted · learning</span>
          <span className="rounded-full border px-2.5 py-1">Solid · updating</span>
          <span className="rounded-full border px-2.5 py-1">Dashed · holding</span>
          <span className="rounded-full border px-2.5 py-1">Fine dots · review needed</span>
          {analytics.markers.map((marker) => (
            <span className="rounded-full border px-2.5 py-1" key={marker.id}>
              {formatDate(marker.date)} · {marker.label}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function BalanceChart({
  analytics,
  comparison,
  onComparison,
}: {
  analytics: EnergyBalanceAnalytics;
  comparison: 'target' | 'expenditure';
  onComparison: (value: 'target' | 'expenditure') => void;
}) {
  const chartData = analytics.points.map((point) => ({
    comparison: comparison === 'target' ? point.targetKcal : point.expenditureKcal,
    date: point.periodEnd,
    intake: point.includedInBalance ? point.intakeKcal : null,
    status: point.nutritionStatus,
  }));
  const hasPendingCutoffNutrition = analytics.points.some((point) =>
    point.reasonCodes.includes('COMPLETE_NUTRITION_PENDING_COMPLETED_DAY_CUTOFF'),
  );
  return (
    <Card className="gap-3 py-5">
      <CardHeader className="gap-3 px-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>
              <h2>Energy balance</h2>
            </CardTitle>
            <CardDescription>
              Complete intake days against the matching daily benchmark.
            </CardDescription>
          </div>
          <div
            aria-label="Energy balance comparison"
            className="grid grid-cols-2 rounded-lg border bg-secondary/25 p-1"
            role="group"
          >
            {(['target', 'expenditure'] as const).map((value) => (
              <Button
                aria-pressed={comparison === value}
                className="px-3"
                key={value}
                onClick={() => onComparison(value)}
                size="sm"
                type="button"
                variant={comparison === value ? 'default' : 'ghost'}
              >
                {value === 'target' ? 'Target' : 'Expenditure'}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-3 sm:px-5">
        <div
          aria-label={`Complete intake compared with ${comparison}`}
          className="h-72 w-full"
          role="img"
        >
          <ResponsiveContainer
            height="100%"
            initialDimension={{ height: 288, width: 320 }}
            width="100%"
          >
            <ComposedChart data={chartData} margin={{ bottom: 4, left: 0, right: 8, top: 10 }}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis
                axisLine={false}
                dataKey="date"
                minTickGap={24}
                tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                tickFormatter={formatAxisDate}
                tickLine={false}
              />
              <YAxis
                axisLine={false}
                domain={[0, 'auto']}
                tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                tickLine={false}
                width={42}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value, name) => [
                  formatKcal(value == null ? null : Number(value)),
                  name === 'intake'
                    ? 'Complete intake'
                    : comparison === 'target'
                      ? 'Target'
                      : 'Expenditure',
                ]}
                labelFormatter={(value) => formatDate(String(value))}
              />
              <Bar
                dataKey="intake"
                fill="var(--color-primary)"
                isAnimationActive={false}
                maxBarSize={28}
                name="intake"
                radius={[6, 6, 0, 0]}
              />
              <Line
                connectNulls
                dataKey="comparison"
                dot={false}
                isAnimationActive={false}
                name="comparison"
                stroke="var(--color-foreground)"
                strokeDasharray="7 5"
                strokeWidth={2.5}
                type="monotone"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="flex items-start gap-2 rounded-xl border border-border/70 bg-secondary/20 p-3 text-sm text-muted-foreground">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          Gaps are intentional: partial, unknown, missing, and current-day cutoff entries are
          visible in the data table, but never plotted as zero.
        </p>
        {hasPendingCutoffNutrition ? (
          <p className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
            Today’s complete nutrition is logged and visible. It will enter energy-balance
            calculations after the local day ends in {analytics.timeZone}.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PredictionCard({ analytics }: { analytics: EnergyBalanceAnalytics }) {
  const summary = analytics.summary;
  return (
    <Card className="gap-3 py-5">
      <CardHeader className="gap-2 px-5 sm:px-6">
        <div className="flex items-center gap-2">
          <Scale aria-hidden="true" className="size-4 text-primary" />
          <CardTitle>
            <h2>Predicted vs observed change</h2>
          </CardTitle>
        </div>
        <CardDescription>
          Prediction uses complete daily intervals with a matching expenditure estimate, beginning
          at the first Trend Weight observation and ending before the final observation date.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-5 sm:px-6">
        <dl className="grid grid-cols-2 gap-3">
          <HeroFact
            label={`Predicted · ${summary.predictedModeledDays} daily intervals`}
            value={formatKg(summary.predictedWeightChangeKg)}
          />
          <HeroFact label="Observed trend" value={formatKg(summary.observedTrendWeightChangeKg)} />
        </dl>
        <p
          className={cn(
            'rounded-xl border p-3 text-sm',
            summary.reconciliationComparable
              ? 'border-primary/20 bg-primary/5'
              : 'border-amber-500/25 bg-amber-500/8',
          )}
        >
          {summary.observedTrendStartDate && summary.observedTrendEndDate
            ? summary.reconciliationComparable
              ? `All required daily intervals from ${formatDate(summary.observedTrendStartDate)} up to, but not including, ${formatDate(summary.observedTrendEndDate)} are covered, so the comparison is directly comparable.`
              : `Not every required daily interval from ${formatDate(summary.observedTrendStartDate)} up to, but not including, ${formatDate(summary.observedTrendEndDate)} is covered. Pulse shows the actual modeled intervals without filling or scaling missing days.`
            : 'Two Trend Weight observations are needed to define an elapsed interval. Pulse does not invent a prediction from low data.'}
        </p>
        {summary.reasonCodes.includes('SHORT_WINDOW_NOISY') ? (
          <p className="text-xs text-muted-foreground">
            One-week changes are especially sensitive to water, sodium, digestion, and normal scale
            noise.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function WhyEstimate({ analytics }: { analytics: EnergyBalanceAnalytics }) {
  const expenditureSourceCheckInId = analytics.current.expenditureSourceCheckInId;
  const expenditureMarker =
    expenditureSourceCheckInId === null
      ? undefined
      : analytics.markers.find((marker) => marker.checkInId === expenditureSourceCheckInId);
  return (
    <Card className="gap-3 py-5">
      <CardHeader className="gap-2 px-5 sm:px-6">
        <div className="flex items-center gap-2">
          <BookOpen aria-hidden="true" className="size-4 text-primary" />
          <CardTitle>
            <h2>Why this estimate?</h2>
          </CardTitle>
        </div>
        <CardDescription>Every visual value has a text and table equivalent.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-5 sm:px-6">
        <p className="rounded-xl border border-border/70 bg-secondary/15 p-3 text-sm text-muted-foreground">
          The starting expenditure has no accepted check-in ID or fingerprint. Accepted check-in
          snapshots and fingerprints stay immutable. Corrected nutrition or weight records recompute
          this read-only projection and produce a new preview fingerprint; they never rewrite
          accepted history.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          <Reason
            label="Nutrition used"
            value={`${analytics.summary.completeNutritionDays} complete days`}
          />
          <Reason
            label="Nutrition excluded"
            value={`${analytics.summary.excludedNutritionDays} incomplete or cutoff days`}
          />
          <Reason
            label="Expenditure source"
            value={
              expenditureMarker
                ? `Accepted check-in · ${formatDate(expenditureMarker.date)}`
                : 'Starting estimate'
            }
          />
          <Reason label="Calculation version" value={analytics.algorithmVersion} />
          <Reason
            label="Goal direction"
            value={
              analytics.current.goalType
                ? goalTypeLabel[analytics.current.goalType]
                : 'No active adaptive goal'
            }
          />
        </ul>
        <details className="group rounded-xl border border-border/70">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 py-3 font-semibold">
            View accessible data table
          </summary>
          <div className="overflow-x-auto border-t">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <caption className="sr-only">
                Energy balance values and evidence statuses for the selected range
              </caption>
              <thead className="bg-secondary/30 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2" scope="col">
                    Period
                  </th>
                  <th className="px-3 py-2" scope="col">
                    Nutrition status
                  </th>
                  <th className="px-3 py-2" scope="col">
                    Logged intake
                  </th>
                  <th className="px-3 py-2" scope="col">
                    Modeled intake
                  </th>
                  <th className="px-3 py-2" scope="col">
                    Target
                  </th>
                  <th className="px-3 py-2" scope="col">
                    Expenditure
                  </th>
                  <th className="px-3 py-2" scope="col">
                    Trend weight
                  </th>
                  <th className="px-3 py-2" scope="col">
                    Energy state
                  </th>
                  <th className="px-3 py-2" scope="col">
                    Goal
                  </th>
                  <th className="px-3 py-2" scope="col">
                    Reasons
                  </th>
                  <th className="px-3 py-2" scope="col">
                    Audit sources
                  </th>
                </tr>
              </thead>
              <tbody>
                {analytics.points.map((point) => (
                  <DataRow key={`${point.periodStart}-${point.periodEnd}`} point={point} />
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

function Reason({ label, value }: { label: string; value: string }) {
  return (
    <li className="rounded-xl border border-border/70 bg-secondary/15 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 break-all text-sm font-medium">{value}</p>
    </li>
  );
}

function DataRow({ point }: { point: EnergyBalancePoint }) {
  return (
    <tr className="border-t">
      <td className="px-3 py-2">
        {formatDate(point.periodStart)}
        {point.periodStart !== point.periodEnd ? `–${formatDate(point.periodEnd)}` : ''}
      </td>
      <td className="px-3 py-2 capitalize">{point.nutritionStatus.replace('_', ' ')}</td>
      <td className="px-3 py-2">{formatKcal(point.loggedIntakeKcal)}</td>
      <td className="px-3 py-2">{formatKcal(point.intakeKcal)}</td>
      <td className="px-3 py-2">{formatKcal(point.targetKcal)}</td>
      <td className="px-3 py-2">{formatKcal(point.expenditureKcal)}</td>
      <td className="px-3 py-2">
        {point.trendWeightKg === null ? 'Not enough data' : `${point.trendWeightKg.toFixed(2)} kg`}
      </td>
      <td className="px-3 py-2 capitalize">{point.state.replace('_', ' ')}</td>
      <td className="px-3 py-2">{point.goalType ? goalTypeLabel[point.goalType] : 'None'}</td>
      <td className="px-3 py-2">
        {[...point.calculationReasonCodes, ...point.reasonCodes].join(', ') || 'None'}
      </td>
      <td className="px-3 py-2">
        {[
          point.expenditureKcal === null
            ? 'No expenditure estimate'
            : point.expenditureSourceCheckInId
              ? `Expenditure check-in ${point.expenditureSourceCheckInId}`
              : 'Expenditure starting estimate',
          ...point.sourceCheckInIds
            .filter((id) => id !== point.expenditureSourceCheckInId)
            .map((id) => `State check-in ${id}`),
          ...point.goalRevisionIds.map((id) => `Goal revision ${id}`),
        ].join(', ')}
      </td>
    </tr>
  );
}

function EnergyBalanceLoading() {
  return (
    <div
      aria-label="Loading energy balance analytics"
      aria-live="polite"
      className="space-y-4"
      role="status"
    >
      <Skeleton className="h-72 rounded-2xl" />
      <Skeleton className="h-24 rounded-2xl" />
      <Skeleton className="h-80 rounded-2xl" />
    </div>
  );
}

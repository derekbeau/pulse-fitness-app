import { useEffect, useMemo, useState } from 'react';
import type { WorkoutMuscleAnalyticsRange } from '@pulse/shared';
import { Link } from 'react-router';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import { useWorkoutMuscleAnalytics } from '../api/progression';

const RANGES = [
  { label: '7D', value: '7d' },
  { label: '30D', value: '30d' },
  { label: '90D', value: '90d' },
] as const;

function MuscleTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string;
  payload?: Array<{ dataKey?: string | number; value?: number | string }>;
}) {
  if (!active || !label) return null;
  const values = new Map(payload?.map((entry) => [String(entry.dataKey), entry.value]) ?? []);
  return (
    <ChartTooltip
      date={formatChartDate(label)}
      rows={[
        {
          color: 'var(--color-primary)',
          label: 'Completed set equivalents',
          value:
            typeof values.get('qualifyingSetEquivalents') === 'number'
              ? String(values.get('qualifyingSetEquivalents'))
              : null,
        },
        {
          color: 'var(--color-accent-cream)',
          label: 'Planned set equivalents',
          value:
            typeof values.get('plannedSetEquivalents') === 'number'
              ? String(values.get('plannedSetEquivalents'))
              : null,
        },
      ]}
    />
  );
}

export function MuscleAnalytics() {
  const [range, setRange] = useState<WorkoutMuscleAnalyticsRange>('30d');
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const analyticsQuery = useWorkoutMuscleAnalytics({ range, timeZone });
  const analytics = analyticsQuery.data;
  const muscle =
    analytics?.rows.find((row) => row.muscle === selectedMuscle) ?? analytics?.rows[0] ?? null;
  const chartData = useMemo(
    () => analytics?.series.filter((point) => point.muscle === muscle?.muscle) ?? [],
    [analytics?.series, muscle?.muscle],
  );
  const selectedPoint = selectedDate
    ? (chartData.find((point) => point.date === selectedDate) ?? null)
    : null;
  const selectedSources =
    analytics?.sources.filter((source) => source.muscle === muscle?.muscle) ?? [];

  useEffect(() => {
    setSelectedDate(null);
    if (analytics?.rows.length && !analytics.rows.some((row) => row.muscle === selectedMuscle)) {
      setSelectedMuscle(analytics.rows[0]?.muscle ?? null);
    }
  }, [analytics?.rows, selectedMuscle]);

  return (
    <section aria-labelledby="muscle-analytics-heading" className="space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
          Descriptive training evidence
        </p>
        <h2 className="mt-1 text-2xl font-semibold" id="muscle-analytics-heading">
          Muscle coverage
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
          Completed qualifying sets use versioned primary (1.0) and secondary (0.5) contributions.
          These are exposure totals—not universal optimal-volume targets. Only completions linked to
          an exact scheduled set fulfill that plan; ad-hoc work remains descriptive exposure.
        </p>
      </div>

      <ChartFrame
        controls={
          <ChartRangeControl
            aria-controls="muscle-exposure-chart-visual"
            label="Muscle analytics range"
            onChange={(value) => {
              setRange(value);
              setSelectedDate(null);
            }}
            options={RANGES}
            statusText={`${range.toUpperCase()} muscle exposure range selected`}
            value={range}
          />
        }
        description={
          analytics
            ? `${formatChartDate(analytics.startDate)} through ${formatChartDate(analytics.endDate)} in ${analytics.timeZone}. Select a muscle to inspect exact dated evidence.`
            : 'Loading versioned planned and completed training exposure.'
        }
        detail={
          selectedPoint ? (
            <ChartPointDetail>
              <p className="font-medium">{formatChartDate(selectedPoint.date)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {selectedPoint.qualifyingSetEquivalents} completed ·{' '}
                {selectedPoint.plannedSetEquivalents} planned set equivalents
              </p>
            </ChartPointDetail>
          ) : null
        }
        id="muscle-exposure-chart"
        summary={
          analytics && muscle ? (
            <ChartSummary
              items={[
                {
                  detail: `${muscle.completedSessionCount} completed sessions`,
                  label: 'Completed exposure',
                  value: muscle.qualifyingSetEquivalents,
                },
                {
                  detail: muscle.priority
                    ? `${muscle.fulfilledPlannedSetEquivalents} linked equivalents fulfilled · explicit programming priority`
                    : `${muscle.fulfilledPlannedSetEquivalents} linked equivalents fulfilled · no explicit programming priority`,
                  label: 'Planned exposure',
                  value: muscle.plannedSetEquivalents,
                },
                {
                  detail: `${muscle.exerciseCount} contributing exercises`,
                  label: 'Previous interval',
                  value: muscle.previousQualifyingSetEquivalents,
                },
                {
                  detail: `${muscle.exposureState.replaceAll('_', ' ')} · compared with the preceding ${range.toUpperCase()} interval`,
                  label: 'Change',
                  value: muscle.change.replaceAll('_', ' '),
                },
              ]}
              label={`${muscle.muscle} exposure summary`}
            />
          ) : undefined
        }
        table={
          analytics && muscle ? (
            <ChartDataTable
              caption={`Exact ${muscle.muscle} muscle exposure by date`}
              columns={[
                { key: 'date', header: 'Date', render: (point) => formatChartDate(point.date) },
                {
                  key: 'completed',
                  header: 'Completed equivalents',
                  render: (point) => point.qualifyingSetEquivalents,
                },
                {
                  key: 'planned',
                  header: 'Planned equivalents',
                  render: (point) => point.plannedSetEquivalents,
                },
                {
                  key: 'volume',
                  header: `Volume load (${analytics.weightUnit} × reps)`,
                  render: (point) => point.volumeLoad ?? 'Not meaningful',
                },
              ]}
              getRowKey={(point) => `${point.muscle}-${point.date}`}
              onSelectRow={(point) => setSelectedDate(point.date)}
              rows={chartData}
              selectionLabel={(point) =>
                `Inspect ${point.muscle} on ${formatChartDate(point.date)}`
              }
              summary="View exact muscle exposure"
            />
          ) : undefined
        }
        title={muscle ? `${muscle.muscle} exposure trend` : 'Muscle exposure trend'}
      >
        {analyticsQuery.isLoading ? (
          <ChartState
            description="Reading completed sets, scheduled targets, and contribution rules."
            kind="loading"
            title="Loading muscle exposure"
          />
        ) : analyticsQuery.isError ? (
          <ChartState
            description="Your workouts are safe. Try loading this interval again."
            kind="error"
            onAction={() => void analyticsQuery.refetch()}
            title="Muscle exposure could not be loaded"
          />
        ) : !analytics || analytics.rows.length === 0 ? (
          <ChartState
            description="Complete measurable main or supplemental sets to build this view."
            kind="empty"
            title="No qualifying muscle exposure"
          />
        ) : (
          <div className="space-y-4">
            <div aria-label="Select muscle" className="flex flex-wrap gap-2" role="group">
              {analytics.rows.map((row) => (
                <Button
                  aria-pressed={row.muscle === muscle?.muscle}
                  className="min-h-11 rounded-full"
                  key={row.muscle}
                  onClick={() => {
                    setSelectedMuscle(row.muscle);
                    setSelectedDate(null);
                  }}
                  variant={row.muscle === muscle?.muscle ? 'default' : 'outline'}
                >
                  {row.muscle}
                  {row.priority ? <span className="sr-only">, current priority</span> : null}
                </Button>
              ))}
            </div>
            <ChartLegend
              items={[
                { color: 'var(--color-primary)', label: 'Completed', style: 'line' },
                { color: 'var(--color-accent-cream)', label: 'Planned', style: 'dashed' },
              ]}
            />
            <div
              aria-label={`${muscle?.muscle} muscle exposure chart`}
              className="h-[280px] min-w-0"
              role="img"
            >
              <ResponsiveContainer
                height="100%"
                initialDimension={{ height: 280, width: 320 }}
                width="100%"
              >
                <LineChart
                  data={chartData}
                  margin={{ bottom: 4, left: 0, right: 8, top: 8 }}
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
                    allowDecimals
                    axisLine={false}
                    tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
                    tickLine={false}
                    width={36}
                  />
                  <Tooltip content={<MuscleTooltip />} />
                  <Line
                    activeDot={{ r: 4 }}
                    dataKey="qualifyingSetEquivalents"
                    dot={{ r: 3 }}
                    isAnimationActive={false}
                    name="Completed"
                    stroke="var(--color-primary)"
                    strokeWidth={2.5}
                    type="linear"
                  />
                  <Line
                    activeDot={{ r: 4 }}
                    dataKey="plannedSetEquivalents"
                    dot={{ r: 3 }}
                    isAnimationActive={false}
                    name="Planned"
                    stroke="var(--color-accent-cream)"
                    strokeDasharray="6 4"
                    strokeWidth={2.5}
                    type="linear"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </ChartFrame>

      {analytics && muscle ? (
        <div className="rounded-3xl border border-border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold">Contributing evidence</h3>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">contribution policy v{analytics.contributionVersion}</Badge>
              <Badge variant="outline">
                qualifying-set policy v{analytics.qualifyingSetPolicyVersion}
              </Badge>
            </div>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Showing {selectedSources.length} of {analytics.sourceCount} source records
            {analytics.sourcesTruncated
              ? '. The source list is truncated; totals and chart values still include the full interval.'
              : '. The source list is complete for this interval.'}
          </p>
          <ul className="mt-3 divide-y divide-border/70">
            {selectedSources.map((source) => (
              <li
                className="flex min-w-0 flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
                key={`${source.sourceType}-${source.setId}-${source.contributionId}`}
              >
                <div className="min-w-0">
                  <p className="font-medium">{source.exerciseName}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatChartDate(source.date)} · {source.role} {source.factor} ·{' '}
                    {source.sourceType}
                  </p>
                </div>
                <Link
                  className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline"
                  to={
                    source.sourceType === 'completed'
                      ? `/workouts/session/${source.sessionId}`
                      : `/workouts/scheduled/${source.scheduledWorkoutId}`
                  }
                >
                  View source
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

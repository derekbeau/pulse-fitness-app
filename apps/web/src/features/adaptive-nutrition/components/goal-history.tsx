import {
  ADAPTIVE_TDEE_CONSTANTS,
  type AdaptiveGoal,
  type AdaptiveGoalDetail,
  type AdaptiveGoalHistorySummary,
  type AdaptiveGoalRevision,
  type WeightUnit,
} from '@pulse/shared';
import { BarChart3, History, Search } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useWeightUnit } from '@/hooks/use-weight-unit';

import { useAdaptiveGoalDetail, useAdaptiveGoalHistory } from '../api/adaptive-nutrition';
import { formatAdaptiveDate, formatAdaptiveWeight } from '../lib/format-adaptive-nutrition';

const HISTORY_LIMIT = 20;

export function GoalHistory({ activeGoalId }: { activeGoalId: string }) {
  const { weightUnit } = useWeightUnit();
  const historyQuery = useAdaptiveGoalHistory(1, HISTORY_LIMIT);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);
  const detailQuery = useAdaptiveGoalDetail(selectedGoalId, selectedGoalId !== null);
  const goals = historyQuery.data?.data ?? [];
  const active = goals.find((summary) => summary.goal.id === activeGoalId);
  const prior = goals.filter((summary) => summary.goal.id !== activeGoalId);

  return (
    <>
      <Card className="gap-4 py-5">
        <CardHeader className="gap-2 px-5 sm:px-6">
          <div className="flex items-center gap-2">
            <History aria-hidden="true" className="size-4 text-primary" />
            <CardTitle>
              <h2>Goal progress & history</h2>
            </CardTitle>
          </div>
          <CardDescription>
            Review canonical trend progress, immutable strategy revisions, and every prior goal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-5 sm:px-6">
          {historyQuery.isLoading ? (
            <div aria-label="Loading goal history" className="space-y-2">
              <Skeleton className="h-20 rounded-xl" />
              <Skeleton className="h-20 rounded-xl" />
            </div>
          ) : historyQuery.isError ? (
            <div className="space-y-3" role="alert">
              <p className="text-sm text-destructive">Unable to load goal history.</p>
              <Button onClick={() => void historyQuery.refetch()} type="button" variant="outline">
                Retry goal history
              </Button>
            </div>
          ) : (
            <>
              {active ? (
                <GoalSummaryRow
                  label="Current goal"
                  onOpen={(trigger) => {
                    lastTriggerRef.current = trigger;
                    setSelectedGoalId(active.goal.id);
                  }}
                  summary={active}
                  unit={weightUnit}
                />
              ) : null}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Prior goals</h3>
                {prior.length ? (
                  <ol className="space-y-2">
                    {prior.map((summary) => (
                      <li key={summary.goal.id}>
                        <GoalSummaryRow
                          label="Prior goal"
                          onOpen={(trigger) => {
                            lastTriggerRef.current = trigger;
                            setSelectedGoalId(summary.goal.id);
                          }}
                          summary={summary}
                          unit={weightUnit}
                        />
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                    No prior goals yet. Direction changes and completed goals will remain here.
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setSelectedGoalId(null);
          }
        }}
        open={selectedGoalId !== null}
      >
        <DialogContent
          className="sm:max-w-4xl"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            lastTriggerRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Goal details</DialogTitle>
            <DialogDescription>
              Weekly trend, progress semantics, revisions, and linked accepted check-ins.
            </DialogDescription>
          </DialogHeader>
          {detailQuery.isLoading ? (
            <Skeleton className="h-96 rounded-xl" />
          ) : detailQuery.isError ? (
            <div className="space-y-3" role="alert">
              <p className="text-sm text-destructive">Unable to load this goal’s details.</p>
              <Button onClick={() => void detailQuery.refetch()} type="button" variant="outline">
                Retry details
              </Button>
            </div>
          ) : detailQuery.data ? (
            <GoalDetailContent detail={detailQuery.data} unit={weightUnit} />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function GoalSummaryRow({
  label,
  onOpen,
  summary,
  unit,
}: {
  label: string;
  onOpen: (trigger: HTMLButtonElement) => void;
  summary: AdaptiveGoalHistorySummary;
  unit: WeightUnit;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-border/70 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold">{goalLabel(summary.goal, unit)}</p>
          <Badge variant={summary.goal.status === 'active' ? 'default' : 'outline'}>
            {statusLabel(summary.goal.status)}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {label} · {formatAdaptiveDate(summary.goal.startedLocalDate)}
          {summary.goal.endedLocalDate
            ? ` – ${formatAdaptiveDate(summary.goal.endedLocalDate)}`
            : ' – present'}
          {summary.netChangeKg === null
            ? ''
            : ` · ${formatSignedWeight(summary.netChangeKg, unit)} net`}
        </p>
      </div>
      <Button
        className="min-h-11 w-full sm:w-auto"
        onClick={(event) => onOpen(event.currentTarget)}
        type="button"
        variant="outline"
      >
        <Search aria-hidden="true" /> View goal details
      </Button>
    </div>
  );
}

function GoalDetailContent({ detail, unit }: { detail: AdaptiveGoalDetail; unit: WeightUnit }) {
  const latestRevision = detail.revisions.at(-1);
  if (!latestRevision) return null;
  return (
    <div className="space-y-6">
      <section aria-labelledby="goal-detail-summary" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold" id="goal-detail-summary">
            {goalLabel(detail.goal, unit)}
          </h3>
          <Badge variant="outline">{statusLabel(detail.goal.status)}</Badge>
        </div>
        <dl className="grid gap-2 sm:grid-cols-3">
          <DetailMetric
            label="Start trend"
            value={formatAdaptiveWeight(detail.goal.startTrendWeightKg, unit)}
          />
          <DetailMetric label="Started" value={formatAdaptiveDate(detail.goal.startedLocalDate)} />
          <DetailMetric label="Strategy revision" value={`Revision ${latestRevision.sequence}`} />
        </dl>
      </section>

      <GoalProgressChart detail={detail} unit={unit} />

      <section aria-labelledby="goal-revisions" className="space-y-3">
        <div>
          <h3 className="font-semibold" id="goal-revisions">
            Strategy revisions
          </h3>
          <p className="text-sm text-muted-foreground">
            Append-only changes; the original progress start never moves.
          </p>
        </div>
        <ol className="space-y-2">
          {detail.revisions.map((revision) => (
            <li className="rounded-xl border border-border/70 p-3" key={revision.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">Revision {revision.sequence}</p>
                <Badge variant="outline">{revisionReasonLabel(revision.reason)}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Effective {formatAdaptiveDate(revision.effectiveLocalDate)}
              </p>
              <p className="mt-2 text-sm">{revisionChange(revision, unit)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="goal-linked-checkins" className="space-y-3">
        <h3 className="font-semibold" id="goal-linked-checkins">
          Linked accepted check-ins
        </h3>
        {detail.acceptedCheckIns.length ? (
          <ul className="space-y-2">
            {detail.acceptedCheckIns.map((checkIn) => (
              <li
                className="flex flex-wrap justify-between gap-2 rounded-xl border border-border/70 p-3 text-sm"
                key={checkIn.id}
              >
                <span>
                  {formatAdaptiveDate(checkIn.localDate)} · {kindLabel(checkIn.kind)}
                </span>
                <span className="text-muted-foreground">Accepted</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No accepted check-ins are linked to this goal.
          </p>
        )}
      </section>
    </div>
  );
}

function GoalProgressChart({ detail, unit }: { detail: AdaptiveGoalDetail; unit: WeightUnit }) {
  const revision = detail.revisions.at(-1);
  const data = useMemo(
    () =>
      detail.trendPoints.map((point) => ({
        ...point,
        displayTrend: displayWeight(point.trendWeightKg, unit),
        displayScale:
          point.scaleWeightKg === null ? null : displayWeight(point.scaleWeightKg, unit),
        progress: revision ? progressForPoint(detail.goal, revision, point.trendWeightKg) : null,
      })),
    [detail, revision, unit],
  );
  const values = data.map((point) => point.displayTrend);
  const domain: [number, number] = [Math.min(...values) - 1, Math.max(...values) + 1];
  return (
    <section aria-labelledby="weekly-goal-progress" className="space-y-4">
      <div className="flex items-center gap-2">
        <BarChart3 aria-hidden="true" className="size-4 text-primary" />
        <div>
          <h3 className="font-semibold" id="weekly-goal-progress">
            Weekly goal progress
          </h3>
          <p className="text-sm text-muted-foreground">
            Seven-day EWMA trend; scale entries remain separately identified.
          </p>
        </div>
      </div>
      <div
        aria-label={`Weekly trend-weight chart with ${data.length} points`}
        className="h-56 w-full"
        role="img"
      >
        <ResponsiveContainer
          height="100%"
          initialDimension={{ height: 224, width: 320 }}
          width="100%"
        >
          <LineChart data={data} margin={{ bottom: 2, left: 0, right: 8, top: 8 }}>
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
            <XAxis
              axisLine={false}
              dataKey="date"
              minTickGap={16}
              tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
              tickFormatter={shortDate}
              tickLine={false}
            />
            <YAxis
              axisLine={false}
              domain={domain}
              tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
              tickFormatter={(value: number) => `${value.toFixed(0)} ${unit}`}
              tickLine={false}
              width={48}
            />
            <Tooltip
              formatter={(value: number | undefined) => [
                `${(value ?? 0).toFixed(1)} ${unit}`,
                'Trend weight',
              ]}
              labelFormatter={(value) =>
                typeof value === 'string' ? formatAdaptiveDate(value) : ''
              }
            />
            <Line
              dataKey="displayTrend"
              dot={{ fill: 'var(--color-primary)', r: 4, strokeWidth: 0 }}
              isAnimationActive={false}
              name="Trend weight"
              stroke="var(--color-primary)"
              strokeWidth={2.5}
              type="monotone"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {detail.goal.type === 'maintain' ? (
        <div className="space-y-2" aria-label="Maintenance range history">
          {data.map((point) => (
            <div
              className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2 text-xs"
              key={point.date}
            >
              <span>{shortDate(point.date)}</span>
              <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className={`h-full rounded-full ${point.progress === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                  style={{ width: `${point.progress === 100 ? 100 : 35}%` }}
                />
              </div>
              <span>{point.progress === 100 ? 'Within range' : 'Outside range'}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2" aria-label="Week-by-week goal distance progress">
          {data.map((point) => (
            <div
              className="grid grid-cols-[5.5rem_1fr_3rem] items-center gap-2 text-xs"
              key={point.date}
            >
              <span>{shortDate(point.date)}</span>
              <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${point.progress ?? 0}%` }}
                />
              </div>
              <span className="text-right">{Math.round(point.progress ?? 0)}%</span>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border/70">
        <table className="w-full min-w-[30rem] text-left text-sm">
          <caption className="sr-only">
            Text equivalent of weekly goal trend and progress chart
          </caption>
          <thead className="bg-muted/30 text-xs text-muted-foreground">
            <tr>
              <th className="p-3" scope="col">
                Week
              </th>
              <th className="p-3" scope="col">
                Trend weight
              </th>
              <th className="p-3" scope="col">
                Scale weight
              </th>
              <th className="p-3" scope="col">
                Progress status
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((point) => (
              <tr className="border-t border-border/70" key={point.date}>
                <td className="p-3">{formatAdaptiveDate(point.date)}</td>
                <td className="p-3">{formatAdaptiveWeight(point.trendWeightKg, unit)}</td>
                <td className="p-3">{formatAdaptiveWeight(point.scaleWeightKg, unit)}</td>
                <td className="p-3">
                  {detail.goal.type === 'maintain'
                    ? point.progress === 100
                      ? 'Within maintenance range'
                      : 'Outside maintenance range'
                    : `${Math.round(point.progress ?? 0)}% of goal distance`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/20 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-semibold">{value}</dd>
    </div>
  );
}

function progressForPoint(goal: AdaptiveGoal, revision: AdaptiveGoalRevision, trendKg: number) {
  if (goal.type === 'maintain') {
    const center = revision.maintenanceCenterKg ?? goal.startTrendWeightKg;
    const radius = Math.max(
      ADAPTIVE_TDEE_CONSTANTS.goalToleranceAbsoluteKg,
      center * ADAPTIVE_TDEE_CONSTANTS.goalToleranceFraction,
    );
    return Math.abs(trendKg - center) <= radius ? 100 : 0;
  }
  const target = revision.targetWeightKg ?? goal.startTrendWeightKg;
  const total = Math.abs(goal.startTrendWeightKg - target);
  if (total === 0) return 100;
  const completed =
    goal.type === 'lose' ? goal.startTrendWeightKg - trendKg : trendKg - goal.startTrendWeightKg;
  return Math.min(100, Math.max(0, (completed / total) * 100));
}

const displayWeight = (kg: number, unit: WeightUnit) => (unit === 'kg' ? kg : kg / 0.45359237);
const shortDate = (date: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );
const statusLabel = (status: AdaptiveGoal['status']) =>
  status === 'active'
    ? 'Active'
    : status === 'completed'
      ? 'Completed'
      : status === 'replaced'
        ? 'Replaced'
        : 'Cancelled';
const kindLabel = (kind: 'baseline' | 'weekly' | 'manual' | 'goal_change') =>
  kind === 'goal_change' ? 'Goal update' : kind[0]?.toUpperCase() + kind.slice(1);
const goalLabel = (goal: AdaptiveGoal, unit: WeightUnit) =>
  goal.type === 'maintain'
    ? `Maintain around ${formatAdaptiveWeight(goal.maintenanceCenterKg, unit)}`
    : `${goal.type === 'lose' ? 'Lose' : 'Gain'} to ${formatAdaptiveWeight(goal.targetWeightKg, unit)}`;
const formatSignedWeight = (value: number, unit: WeightUnit) =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatAdaptiveWeight(Math.abs(value), unit)}`;
const revisionReasonLabel = (reason: AdaptiveGoalRevision['reason']) =>
  reason === 'user_edit'
    ? 'User edit'
    : reason === 'goal_completion'
      ? 'Goal completion'
      : reason === 'migration'
        ? 'Migrated'
        : 'Created';
const strategyWeight = (revision: AdaptiveGoalRevision, unit: WeightUnit, previous = false) =>
  formatAdaptiveWeight(
    previous
      ? (revision.previousTargetWeightKg ?? revision.previousCenterKg)
      : (revision.targetWeightKg ?? revision.maintenanceCenterKg),
    unit,
  );
const revisionChange = (revision: AdaptiveGoalRevision, unit: WeightUnit) =>
  revision.sequence === 1
    ? `Targeted ${strategyWeight(revision, unit)} with a ${Math.abs(revision.goalRatePctPerWeek)}% weekly rate.`
    : `${strategyWeight(revision, unit, true)} at ${Math.abs(revision.previousRatePctPerWeek)}%/week → ${strategyWeight(revision, unit)} at ${Math.abs(revision.goalRatePctPerWeek)}%/week.`;

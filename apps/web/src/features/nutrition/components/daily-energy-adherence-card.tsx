import type { DailyEnergyAdherence } from '@pulse/shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCalories } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

type DailyEnergyAdherenceCardProps = {
  adherence?: DailyEnergyAdherence;
  error?: Error | null;
  isFetching?: boolean;
  isLoading?: boolean;
  isRefetchError?: boolean;
  isStale?: boolean;
  onRetry?: () => void;
  requestedDate?: string;
};

const stateCopy: Record<
  Exclude<DailyEnergyAdherence['dataState'], 'gradeable'>,
  { title: string; detail: string }
> = {
  in_progress: {
    title: 'Day in progress',
    detail: "Today is still being logged, so Pulse won't grade it yet.",
  },
  pending_cutoff: {
    title: 'Waiting for day cutoff',
    detail: 'This log is marked complete, but today remains open until the local day ends.',
  },
  partial: {
    title: 'Partial log',
    detail: "This day is marked partial, so Pulse won't grade its energy adherence.",
  },
  unknown: {
    title: 'Completeness unknown',
    detail: 'Confirm that all calorie-containing items are logged before comparing this day.',
  },
  missing: {
    title: 'No nutrition log',
    detail: "There is no intake record for this day, so Pulse won't invent a comparison.",
  },
  future: {
    title: 'Future day',
    detail: 'Energy adherence becomes available after this day is logged and complete.',
  },
  unavailable: {
    title: 'No accepted target',
    detail: 'No accepted calorie target was effective on this date. Pulse does not backfill one.',
  },
};

const gradeCopy = {
  on_target: {
    title: 'On target',
    detail: 'Intake is inside the accepted target range for this day.',
  },
  near_target: {
    title: 'Near target',
    detail: 'Intake is just outside the inner target range for this day.',
  },
  off_target: {
    title: 'Outside target range',
    detail: 'Intake is outside the accepted target range for this day.',
  },
} as const;

const signedCalories = (value: number | null) =>
  value === null
    ? 'Not available'
    : `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatCalories(Math.abs(value))} kcal`;

const comparisonSentence = (value: number | null, axis: string) => {
  if (value === null) return `${axis} comparison is not available.`;
  if (value === 0) return `Intake matched ${axis.toLowerCase()}.`;
  return `Intake was ${formatCalories(Math.abs(value), 'kcal')} ${value > 0 ? 'above' : 'below'} ${axis.toLowerCase()}.`;
};

export function DailyEnergyAdherenceCard({
  adherence,
  error = null,
  isFetching = false,
  isLoading = false,
  isRefetchError = false,
  isStale = false,
  onRetry,
  requestedDate,
}: DailyEnergyAdherenceCardProps) {
  const hasRequestedFacts =
    adherence !== undefined &&
    (requestedDate === undefined || adherence.localDate === requestedDate);

  if (isLoading || (requestedDate !== undefined && !hasRequestedFacts && !error)) {
    return (
      <Card aria-label="Loading daily energy" role="status">
        <CardHeader className="gap-2">
          <Skeleton className="h-5 w-36 bg-muted/70" />
          <Skeleton className="h-4 w-64 max-w-full bg-muted/70" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-16 w-full rounded-xl bg-muted/70" />
        </CardContent>
      </Card>
    );
  }

  if (!adherence || !hasRequestedFacts) {
    return (
      <Card className="border-destructive/30" role="alert">
        <CardHeader className="gap-2">
          <h2 className="text-base font-semibold">Daily energy could not be loaded</h2>
          <p className="text-sm text-muted">Your meal data and accepted targets are unchanged.</p>
        </CardHeader>
        {onRetry ? (
          <CardContent>
            <Button className="min-h-11" onClick={onRetry} type="button" variant="outline">
              Retry daily energy
            </Button>
          </CardContent>
        ) : null}
      </Card>
    );
  }

  const grade = adherence.adherence ? gradeCopy[adherence.adherence] : null;
  const state =
    grade ??
    (adherence.dataState === 'gradeable'
      ? {
          title: 'Comparison unavailable',
          detail: 'Pulse could not verify a valid adherence label for these accepted facts.',
        }
      : stateCopy[adherence.dataState]);
  const target = adherence.target?.caloriesKcal ?? null;
  const expenditure = adherence.expenditure?.caloriesKcal ?? null;
  const outer = adherence.outerToleranceKcal ?? 1;
  const difference = adherence.intakeMinusTargetKcal ?? 0;
  const markerPosition = Math.max(2, Math.min(98, 50 + (difference / (outer * 1.5)) * 50));

  return (
    <Card
      aria-labelledby="daily-energy-heading"
      className="gap-4 py-5"
      data-testid="daily-energy-card"
      role="article"
    >
      <CardHeader className="gap-3 px-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 id="daily-energy-heading" className="text-base font-semibold text-foreground">
              Daily energy
            </h2>
            <p className="mt-1 text-sm text-muted">
              Accepted facts for {adherence.localDate} in {adherence.timeZone}.
            </p>
          </div>
          <Badge variant="outline">{state.title}</Badge>
        </div>
        <p className="text-sm text-foreground">{state.detail}</p>
        {isFetching ? (
          <p className="text-xs text-muted" role="status">
            Refreshing accepted facts…
          </p>
        ) : null}
        {isRefetchError || (error && hasRequestedFacts) ? (
          <div className="flex flex-wrap items-center gap-2" role="alert">
            <p className="text-xs text-destructive">
              Refresh failed. The accepted facts shown here may be out of date.
            </p>
            {onRetry ? (
              <Button className="min-h-11" onClick={onRetry} type="button" variant="outline">
                Retry refresh
              </Button>
            ) : null}
          </div>
        ) : isStale && !isFetching ? (
          <div className="flex flex-wrap items-center gap-2" role="status">
            <p className="text-xs text-muted">These accepted facts are ready to refresh.</p>
            {onRetry ? (
              <Button className="min-h-11" onClick={onRetry} type="button" variant="outline">
                Refresh facts
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardHeader>

      {adherence.dataState === 'gradeable' && target !== null ? (
        <CardContent className="space-y-3 px-4 sm:px-6">
          <div
            aria-label={`Energy adherence: ${state.title}. ${comparisonSentence(adherence.intakeMinusTargetKcal, 'Accepted target')}`}
            className="relative pt-5"
            role="img"
          >
            <div className="grid h-3 grid-cols-[1fr_1fr_1.2fr_1fr_1fr] overflow-hidden rounded-full border border-border/70">
              <span className="bg-muted" />
              <span className="bg-primary/20" />
              <span className="bg-primary/55" />
              <span className="bg-primary/20" />
              <span className="bg-muted" />
            </div>
            <span
              aria-hidden="true"
              className="absolute top-3 size-4 -translate-x-1/2 rounded-full border-2 border-card bg-foreground shadow-sm"
              style={{ left: `${markerPosition}%` }}
            />
            <div className="mt-1 flex justify-between text-[11px] text-muted">
              <span>Below</span>
              <span>Target {formatCalories(target, 'kcal')}</span>
              <span>Above</span>
            </div>
          </div>
        </CardContent>
      ) : null}

      <CardContent className="grid grid-cols-1 gap-2 px-4 sm:grid-cols-3 sm:px-6">
        <EnergyFact label="Logged intake" value={adherence.nutrition.intakeKcal} />
        <EnergyFact label="Accepted target" value={target} />
        <EnergyFact label="Accepted expenditure" value={expenditure} />
      </CardContent>

      <CardContent className="space-y-1 px-4 text-sm sm:px-6">
        <p>
          <span className="font-medium text-foreground">Target difference:</span>{' '}
          <span className="tabular-nums text-muted">
            {signedCalories(adherence.intakeMinusTargetKcal)}
          </span>
        </p>
        <p>
          <span className="font-medium text-foreground">Expenditure difference:</span>{' '}
          <span className="tabular-nums text-muted">
            {signedCalories(adherence.intakeMinusExpenditureKcal)}
          </span>
        </p>
        <p className="pt-1 text-muted">
          {comparisonSentence(adherence.intakeMinusTargetKcal, 'Accepted target')}{' '}
          {comparisonSentence(adherence.intakeMinusExpenditureKcal, 'Accepted expenditure')}
        </p>
      </CardContent>

      <CardContent className="px-4 text-xs text-muted sm:px-6">
        <p>
          Target adherence is symmetric: the same distance above or below the accepted target gets
          the same label. Exercise calories are not credited here.
        </p>
        <details className="mt-3 rounded-xl border border-border/70 bg-background/40 px-3 py-2">
          <summary className="flex min-h-11 cursor-pointer items-center font-medium text-foreground">
            Accepted-fact provenance
          </summary>
          <div className="space-y-4 pb-2 pt-1">
            <ProvenanceGroup title="Target">
              {adherence.target ? (
                <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1">
                  <ProvenanceRow
                    label="Source"
                    value={
                      adherence.target.source === 'adaptive'
                        ? 'Accepted adaptive recommendation'
                        : 'Manual target'
                    }
                  />
                  <ProvenanceRow label="Effective" value={adherence.target.effectiveDate} />
                  <ProvenanceRow
                    label="Recorded"
                    value={formatRecordedAt(adherence.target.recordedAt, adherence.timeZone)}
                  />
                  <ProvenanceRow label="Target event ID" value={adherence.target.targetEventId} />
                  <ProvenanceRow label="Target ID" value={adherence.target.targetId} />
                  {adherence.target.adaptiveCheckInId ? (
                    <ProvenanceRow
                      label="Accepted check-in ID"
                      value={adherence.target.adaptiveCheckInId}
                    />
                  ) : null}
                </dl>
              ) : (
                <p>No accepted target was effective on this date.</p>
              )}
            </ProvenanceGroup>
            <ProvenanceGroup title="Expenditure">
              {adherence.expenditure ? (
                <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1">
                  <ProvenanceRow
                    label="Source"
                    value={
                      adherence.expenditure.source === 'accepted_check_in'
                        ? 'Accepted adaptive check-in'
                        : 'Program starting estimate'
                    }
                  />
                  <ProvenanceRow label="Effective" value={adherence.expenditure.effectiveDate} />
                  {adherence.expenditure.checkInId ? (
                    <ProvenanceRow
                      label="Accepted check-in ID"
                      value={adherence.expenditure.checkInId}
                    />
                  ) : null}
                  {adherence.expenditure.inputFingerprint ? (
                    <ProvenanceRow
                      label="Input fingerprint"
                      value={adherence.expenditure.inputFingerprint}
                    />
                  ) : null}
                </dl>
              ) : (
                <p>No accepted expenditure estimate was effective on this date.</p>
              )}
            </ProvenanceGroup>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

function formatRecordedAt(value: number, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
    timeZoneName: 'short',
  }).format(new Date(value));
}

function ProvenanceGroup({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section aria-label={`${title} provenance`}>
      <h3 className="mb-1 font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

function ProvenanceRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="font-medium text-foreground">{label}</dt>
      <dd className="min-w-0 break-all tabular-nums">{value}</dd>
    </>
  );
}

function EnergyFact({ label, value }: { label: string; value: number | null }) {
  return (
    <div className={cn('rounded-xl border border-border/70 bg-background/40 px-3 py-2')}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-semibold tabular-nums text-foreground">
        {value === null ? 'Not available' : formatCalories(value, 'kcal')}
      </p>
    </div>
  );
}

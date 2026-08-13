import type { AdaptiveCheckInSummary } from '@pulse/shared';
import { History, Search } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

import {
  useAdaptiveNutritionCheckIn,
  useAdaptiveNutritionHistory,
} from '../api/adaptive-nutrition';
import {
  checkInStatusLabel,
  formatAdaptiveCalories,
  formatAdaptiveDate,
} from '../lib/format-adaptive-nutrition';
import { CheckInDataDetails } from './check-in-data-details';

const HISTORY_PAGE_SIZE = 10;

export function CheckInHistory() {
  const [page, setPage] = useState(1);
  const historyQuery = useAdaptiveNutritionHistory(page, HISTORY_PAGE_SIZE);
  const total = historyQuery.data?.meta.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));

  return (
    <Card className="gap-4 py-5">
      <CardHeader className="gap-2 px-5 sm:px-6">
        <div className="flex items-center gap-2">
          <History aria-hidden="true" className="size-4 text-primary" />
          <CardTitle>
            <h2>Check-in history</h2>
          </CardTitle>
        </div>
        <CardDescription>
          Every recommendation remains available as a replayable calculation record.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-5 sm:px-6">
        {historyQuery.isLoading ? (
          <div aria-label="Loading check-in history" className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton className="h-20 rounded-xl" key={index} />
            ))}
          </div>
        ) : historyQuery.isError ? (
          <p className="text-sm text-destructive" role="alert">
            Unable to load check-in history.
          </p>
        ) : historyQuery.data?.data.length ? (
          <ol className="space-y-2">
            {historyQuery.data.data.map((checkIn) => (
              <li key={checkIn.id}>
                <HistoryRow checkIn={checkIn} />
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-xl border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
            Your first baseline check-in will appear here after setup.
          </p>
        )}

        {total > HISTORY_PAGE_SIZE ? (
          <nav
            aria-label="Check-in history pages"
            className="flex items-center justify-between gap-3 pt-2"
          >
            <Button
              disabled={page === 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              type="button"
              variant="outline"
            >
              Previous
            </Button>
            <p className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </p>
            <Button
              disabled={page >= totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              type="button"
              variant="outline"
            >
              Next
            </Button>
          </nav>
        ) : null}
      </CardContent>
    </Card>
  );
}

function HistoryRow({ checkIn }: { checkIn: AdaptiveCheckInSummary }) {
  const [open, setOpen] = useState(false);
  const detailQuery = useAdaptiveNutritionCheckIn(checkIn.id, open);

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-border/70 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{formatAdaptiveDate(checkIn.localDate)}</p>
            <Badge variant={checkIn.status === 'accepted' ? 'default' : 'outline'}>
              {checkInStatusLabel[checkIn.status]}
            </Badge>
            <Badge variant="outline">{formatKind(checkIn.kind)}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {checkIn.proposedTdeeKcal
              ? `Proposed ${formatAdaptiveCalories(checkIn.proposedTdeeKcal)} expenditure`
              : checkIn.status === 'held'
                ? 'No target change proposed'
                : 'Calculation record'}
          </p>
        </div>
        <DialogTrigger asChild>
          <Button className="w-full sm:w-auto" type="button" variant="outline">
            <Search aria-hidden="true" />
            View calculation
          </Button>
        </DialogTrigger>
      </div>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{formatAdaptiveDate(checkIn.localDate)} check-in</DialogTitle>
          <DialogDescription>
            Immutable inputs, calculation details, and resolution for this recommendation.
          </DialogDescription>
        </DialogHeader>
        {detailQuery.isLoading ? (
          <Skeleton className="h-72 rounded-xl" />
        ) : detailQuery.isError ? (
          <p className="text-sm text-destructive" role="alert">
            Unable to load this calculation.
          </p>
        ) : detailQuery.data ? (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <HistoryMetric label="Status" value={checkInStatusLabel[detailQuery.data.status]} />
              <HistoryMetric label="Kind" value={formatKind(detailQuery.data.kind)} />
              <HistoryMetric
                label="Prior TDEE"
                value={formatAdaptiveCalories(detailQuery.data.priorTdeeKcal)}
              />
              <HistoryMetric
                label="Proposed TDEE"
                value={formatAdaptiveCalories(detailQuery.data.proposedTdeeKcal)}
              />
            </dl>
            <CheckInDataDetails checkIn={detailQuery.data} />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function HistoryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/20 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}

function formatKind(kind: AdaptiveCheckInSummary['kind']) {
  if (kind === 'baseline') return 'Baseline';
  if (kind === 'weekly') return 'Weekly';
  return 'Manual';
}

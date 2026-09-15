import type { BodyDueState } from '@pulse/shared';
import { CalendarClock, CheckCircle2, CircleDashed, Clock3 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useBodyDue, useSkipBodyDue, useSnoozeBodyDue } from '../api/body-progress';

const copy: Record<BodyDueState['state'], { title: string; description: string }> = {
  not_configured: {
    title: 'Set up Body Progress',
    description: 'Choose a measurement cadence, sites, and display unit to begin.',
  },
  upcoming: {
    title: 'Next check-in is upcoming',
    description: 'Your schedule is set. Extra logs will not reset its cadence.',
  },
  due_today: {
    title: 'Body check-in is due today',
    description: 'Take measurements when your conditions are reasonably repeatable.',
  },
  overdue: {
    title: 'Body check-in is ready',
    description:
      'Your anchored date has passed. Log when practical; there is no streak to protect.',
  },
  snoozed: {
    title: 'Body check-in is snoozed',
    description: 'Only this prompt moved. Your future cadence remains anchored.',
  },
  skipped_current_occurrence: {
    title: 'Current check-in skipped',
    description: 'Only this occurrence was dismissed. The next anchored date is unchanged.',
  },
  satisfied: {
    title: 'Scheduled check-in complete',
    description: 'This occurrence is satisfied. Extra logs are still available.',
  },
  error: {
    title: 'Due state unavailable',
    description: 'Pulse could not resolve the server-owned schedule state.',
  },
};

const dateLabel = (date: string | null) => date ?? 'Not available';

export function BodyDueCard({ compact = false }: { compact?: boolean }) {
  const dueQuery = useBodyDue();
  const skipMutation = useSkipBodyDue();
  const snoozeMutation = useSnoozeBodyDue();
  const [showSnooze, setShowSnooze] = useState(false);
  const [snoozedUntil, setSnoozedUntil] = useState('');

  if (dueQuery.isPending) {
    return (
      <Card aria-busy="true" aria-label="Loading Body Progress due state">
        <CardHeader>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-full max-w-sm" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-11 w-36" />
        </CardContent>
      </Card>
    );
  }

  if (dueQuery.isError || !dueQuery.data) {
    return (
      <Card className="border-destructive/40" role={compact ? 'status' : 'alert'}>
        <CardHeader>
          <CardTitle>Body Progress unavailable</CardTitle>
          <CardDescription>
            Pulse could not load the server due state. No date was guessed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            disabled={dueQuery.isFetching}
            onClick={() => void dueQuery.refetch()}
            variant="outline"
          >
            {dueQuery.isFetching ? 'Retrying…' : 'Retry'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const due = dueQuery.data;
  const stateCopy = copy[due.state];
  const actionable =
    Boolean(due.occurrenceDueDate) && ['due_today', 'overdue', 'snoozed'].includes(due.state);
  const Icon =
    due.state === 'satisfied'
      ? CheckCircle2
      : due.state === 'snoozed'
        ? Clock3
        : due.state === 'not_configured'
          ? CircleDashed
          : CalendarClock;

  return (
    <Card
      className="overflow-hidden border-border/70"
      data-due-state={due.state}
      data-testid={compact ? 'dashboard-body-due' : 'body-due-card'}
    >
      <CardHeader className={compact ? 'pb-1' : undefined}>
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-secondary text-primary">
            <Icon aria-hidden="true" className="size-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <CardTitle>{stateCopy.title}</CardTitle>
            <CardDescription>{stateCopy.description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Server local date</dt>
            <dd className="font-medium">{dateLabel(due.localDate)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Next prompt</dt>
            <dd className="font-medium">{dateLabel(due.nextDueDate)}</dd>
          </div>
          {!compact ? (
            <>
              <div>
                <dt className="text-muted-foreground">Time zone</dt>
                <dd className="break-words font-medium">{due.timeZone ?? 'Unresolved'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Authority</dt>
                <dd className="font-medium">
                  {due.timeZoneSource === 'adaptive_program'
                    ? 'Adaptive program'
                    : due.timeZoneSource === 'user_profile'
                      ? 'Profile'
                      : 'Unresolved'}
                </dd>
              </div>
            </>
          ) : null}
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to={due.state === 'not_configured' ? '/body?setup=1' : '/body?check-in=1'}>
              {due.state === 'not_configured'
                ? 'Set up'
                : due.state === 'satisfied'
                  ? 'Log extra check-in'
                  : 'Open Body Progress'}
            </Link>
          </Button>
          {actionable && !compact ? (
            <>
              <Button
                onClick={() => setShowSnooze((value) => !value)}
                type="button"
                variant="outline"
              >
                Snooze
              </Button>
              <Button
                disabled={skipMutation.isPending}
                onClick={() => due.occurrenceDueDate && skipMutation.mutate(due.occurrenceDueDate)}
                type="button"
                variant="ghost"
              >
                Skip this check-in
              </Button>
            </>
          ) : null}
        </div>
        {showSnooze && due.occurrenceDueDate && due.localDate ? (
          <form
            className="space-y-2 rounded-xl border border-border/70 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              const dueDate = due.occurrenceDueDate;
              if (snoozedUntil && dueDate)
                snoozeMutation.mutate(
                  { dueDate, snoozedUntil },
                  { onSuccess: () => setShowSnooze(false) },
                );
            }}
          >
            <Label htmlFor="body-snooze-date">Snooze this prompt until</Label>
            <Input
              className="min-h-11"
              id="body-snooze-date"
              min={due.localDate}
              onChange={(event) => setSnoozedUntil(event.currentTarget.value)}
              required
              type="date"
              value={snoozedUntil}
            />
            <p className="text-xs text-muted-foreground">
              This must be after today and before the next anchored occurrence. Future cadence will
              not move.
            </p>
            <Button disabled={snoozeMutation.isPending} type="submit">
              {snoozeMutation.isPending ? 'Saving…' : 'Save snooze'}
            </Button>
          </form>
        ) : null}
        {skipMutation.isError || snoozeMutation.isError ? (
          <p className="text-sm text-destructive" role="alert">
            The due action could not be saved. Refresh and try again.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

import { Link } from 'react-router';

import { Button } from '@/components/ui/button';

type DateAuthorityErrorProps = {
  isRetrying: boolean;
  onRetry: () => void;
  surface: 'Dashboard' | 'Habits' | 'Nutrition' | 'Weight' | 'Workouts';
};

export function DateAuthorityError({ isRetrying, onRetry, surface }: DateAuthorityErrorProps) {
  return (
    <section
      className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 sm:p-5"
      role="alert"
    >
      <h2 className="font-semibold text-foreground">{surface} date could not be loaded</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Pulse could not verify your local time zone, so no current-day facts or changes are shown.
      </p>
      <Button
        className="mt-4 min-h-11"
        disabled={isRetrying}
        onClick={onRetry}
        type="button"
        variant="outline"
      >
        {isRetrying ? 'Retrying…' : `Retry ${surface.toLowerCase()} date`}
      </Button>
    </section>
  );
}

export function TimeZoneRequired({
  surface,
}: {
  surface: 'Dashboard' | 'Habits' | 'Nutrition' | 'Weight' | 'Workouts';
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5" role="alert">
      <h2 className="font-semibold text-foreground">Time zone required</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Set a valid IANA time zone before Pulse can determine the current day for {surface}.
      </p>
      <Button asChild className="mt-4 min-h-11" variant="outline">
        <Link to="/settings">Set time zone</Link>
      </Button>
    </section>
  );
}

type DateAuthorityStaleNoticeProps = {
  date: string;
  isRetrying: boolean;
  onRetry: () => void;
  timeZone: string;
};

export function DateAuthorityStaleNotice({
  date,
  isRetrying,
  onRetry,
  timeZone,
}: DateAuthorityStaleNoticeProps) {
  return (
    <section className="rounded-2xl border border-amber-500/45 bg-amber-500/10 p-4" role="alert">
      <p className="font-medium text-foreground">Date refresh failed</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Showing {date} using the last verified {timeZone} time zone. Date-based changes are disabled
        until Pulse verifies it again.
      </p>
      <Button
        className="mt-3 min-h-11"
        disabled={isRetrying}
        onClick={onRetry}
        type="button"
        variant="outline"
      >
        {isRetrying ? 'Retrying…' : 'Retry date refresh'}
      </Button>
    </section>
  );
}

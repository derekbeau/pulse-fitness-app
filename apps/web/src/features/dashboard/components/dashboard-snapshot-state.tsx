import { Button } from '@/components/ui/button';

type DashboardSnapshotFailureProps = {
  dateLabel: string;
  isRetrying: boolean;
  onRetry: () => void;
  stale: boolean;
};

export function DashboardSnapshotFailure({
  dateLabel,
  isRetrying,
  onRetry,
  stale,
}: DashboardSnapshotFailureProps) {
  return (
    <section
      className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 sm:p-5"
      role="alert"
    >
      <h2 className="font-semibold text-foreground">
        {stale ? 'Dashboard snapshot refresh failed' : 'Dashboard snapshot could not be loaded'}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {stale
          ? `Showing the last verified data for ${dateLabel}. It may be out of date, so snapshot-based changes are disabled.`
          : `Pulse could not load verified facts for ${dateLabel}. No snapshot facts or changes are shown.`}
      </p>
      <Button
        className="mt-4 min-h-11"
        disabled={isRetrying}
        onClick={onRetry}
        type="button"
        variant="outline"
      >
        {isRetrying ? 'Retrying…' : 'Retry dashboard snapshot'}
      </Button>
    </section>
  );
}

import { Scale, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useDeleteWeight, useWeightTrend } from '@/features/weight/api/weight';
import { useWeightUnit } from '@/hooks/use-weight-unit';
import { parseDateInput } from '@/lib/date';

const entryDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

type PendingDeleteWeight = {
  date: string;
  id: string;
};

function formatEntryDate(dateKey: string) {
  return entryDateFormatter.format(parseDateInput(`${dateKey}T00:00:00`));
}

export function WeightHistory() {
  const [pendingDeleteWeight, setPendingDeleteWeight] = useState<PendingDeleteWeight | null>(null);
  const weightEntriesQuery = useWeightTrend();
  const deleteWeightMutation = useDeleteWeight();
  const { formatWeight } = useWeightUnit();
  const sortedWeightEntries = useMemo(
    () =>
      [...(weightEntriesQuery.data ?? [])].sort(
        (left, right) => right.date.localeCompare(left.date) || right.createdAt - left.createdAt,
      ),
    [weightEntriesQuery.data],
  );

  async function handleDelete() {
    if (!pendingDeleteWeight) {
      return;
    }

    try {
      await deleteWeightMutation.mutateAsync(pendingDeleteWeight.id);
      setPendingDeleteWeight(null);
    } catch {
      return;
    }
  }

  const isLoading = weightEntriesQuery.isLoading;
  const isError = weightEntriesQuery.isError;
  const isDeletePending = deleteWeightMutation.isPending;
  const isEmpty = !isLoading && !isError && sortedWeightEntries.length === 0;

  return (
    <section className="space-y-6">
      {isError ? (
        <div className="rounded-2xl border border-dashed border-destructive/40 p-6">
          <h2 className="text-lg font-semibold text-foreground">Unable to load weight history</h2>
          <p className="mt-1 text-sm text-muted">
            {weightEntriesQuery.error instanceof Error
              ? weightEntriesQuery.error.message
              : 'The weight history request failed.'}
          </p>
        </div>
      ) : null}

      {isLoading ? <p className="text-sm text-muted">Loading weight history...</p> : null}

      {isEmpty ? (
        <EmptyState
          description="Log your weight from the dashboard to start building your trend history."
          icon={Scale}
          title="No weight entries yet"
        />
      ) : null}

      {!isLoading && !isError && sortedWeightEntries.length > 0 ? (
        <ul className="grid gap-3" aria-label="Weight history entries">
          {sortedWeightEntries.map((entry) => {
            const formattedDate = formatEntryDate(entry.date);

            return (
              <li
                className="flex items-start justify-between gap-3 rounded-2xl border border-border/70 bg-card px-4 py-4 shadow-sm"
                key={entry.id}
              >
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">{formattedDate}</p>
                  <p className="text-lg font-semibold text-primary">{formatWeight(entry.weight)}</p>
                  {entry.notes ? <p className="text-sm text-muted">{entry.notes}</p> : null}
                </div>

                <Button
                  aria-label={`Delete weight entry from ${formattedDate}`}
                  className="min-h-[44px] min-w-[44px]"
                  onClick={() => {
                    setPendingDeleteWeight({ date: entry.date, id: entry.id });
                  }}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteWeight(null);
          }
        }}
        open={pendingDeleteWeight !== null}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this weight entry?</DialogTitle>
            <DialogDescription>
              {pendingDeleteWeight
                ? `This will permanently remove your entry from ${formatEntryDate(pendingDeleteWeight.date)}.`
                : 'This action cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              className="min-h-[44px]"
              onClick={() => {
                setPendingDeleteWeight(null);
              }}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className="min-h-[44px]"
              disabled={isDeletePending}
              onClick={() => {
                void handleDelete();
              }}
              type="button"
              variant="destructive"
            >
              {isDeletePending ? 'Deleting...' : 'Delete entry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

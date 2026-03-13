import { Scale, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { useConfirmation } from '@/components/ui/confirmation-dialog';
import { Input } from '@/components/ui/input';
import { useDeleteWeight, useUpdateWeight, useWeightTrend } from '@/features/weight/api/weight';
import { useWeightUnit } from '@/hooks/use-weight-unit';
import { parseDateInput } from '@/lib/date';

const entryDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function formatEntryDate(dateKey: string) {
  return entryDateFormatter.format(parseDateInput(`${dateKey}T00:00:00`));
}

export function WeightHistory() {
  const { confirm, dialog } = useConfirmation();
  // Intentional for now: this view is a full history log. Add pagination/date bounds if dataset size becomes a UX issue.
  const weightEntriesQuery = useWeightTrend();
  const deleteWeightMutation = useDeleteWeight();
  const updateWeightMutation = useUpdateWeight();
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingWeight, setEditingWeight] = useState('');
  const [editingWeightError, setEditingWeightError] = useState('');
  const { formatWeight } = useWeightUnit();
  const sortedWeightEntries = useMemo(
    () =>
      [...(weightEntriesQuery.data ?? [])].sort(
        (left, right) => right.date.localeCompare(left.date) || right.createdAt - left.createdAt,
      ),
    [weightEntriesQuery.data],
  );

  function handleDelete(entry: { date: string; id: string }) {
    confirm({
      title: 'Delete weight entry?',
      description: `This will permanently remove your entry from ${formatEntryDate(entry.date)}.`,
      confirmLabel: 'Delete entry',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          await deleteWeightMutation.mutateAsync(entry.id);
        } catch {
          // Error feedback is handled by the mutation onError callback.
          return;
        }
      },
    });
  }

  async function handleSaveEdit(entryId: string) {
    const parsedWeight = Number(editingWeight);
    if (Number.isNaN(parsedWeight) || parsedWeight <= 0) {
      setEditingWeightError('Enter a valid weight above 0.');
      return;
    }

    try {
      await updateWeightMutation.mutateAsync({
        id: entryId,
        input: { weight: parsedWeight },
      });
      setEditingEntryId(null);
      setEditingWeight('');
      setEditingWeightError('');
    } catch {
      return;
    }
  }

  const isLoading = weightEntriesQuery.isLoading;
  const isError = weightEntriesQuery.isError;
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
                  {editingEntryId === entry.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        aria-label={`Weight value for ${formattedDate}`}
                        className="h-9 w-32"
                        inputMode="decimal"
                        min="0.1"
                        onChange={(event) => {
                          setEditingWeight(event.currentTarget.value);
                          setEditingWeightError('');
                        }}
                        step="0.1"
                        type="number"
                        value={editingWeight}
                      />
                      <Button
                        className="h-9 px-3"
                        disabled={updateWeightMutation.isPending}
                        onClick={() => {
                          void handleSaveEdit(entry.id);
                        }}
                        type="button"
                      >
                        Save
                      </Button>
                      <Button
                        className="h-9 px-3"
                        onClick={() => {
                          setEditingEntryId(null);
                          setEditingWeight('');
                          setEditingWeightError('');
                        }}
                        type="button"
                        variant="ghost"
                      >
                        Cancel
                      </Button>
                      {editingWeightError ? (
                        <p className="text-sm text-destructive" role="status">
                          {editingWeightError}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <button
                      className="text-left text-lg font-semibold text-primary hover:underline"
                      onClick={() => {
                        setEditingEntryId(entry.id);
                        setEditingWeight(entry.weight.toFixed(1));
                        setEditingWeightError('');
                      }}
                      type="button"
                    >
                      {formatWeight(entry.weight)}
                    </button>
                  )}
                  {entry.notes ? <p className="text-sm text-muted">{entry.notes}</p> : null}
                </div>

                <Button
                  aria-label={`Delete weight entry from ${formattedDate}`}
                  className="min-h-[44px] min-w-[44px]"
                  onClick={() => handleDelete({ date: entry.date, id: entry.id })}
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
      {dialog}
    </section>
  );
}

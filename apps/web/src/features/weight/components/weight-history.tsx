import { zodResolver } from '@hookform/resolvers/zod';
import {
  createWeightInputSchema,
  formatWeight as formatWeightWithUnit,
  type BodyWeightEntry,
  type CreateWeightInput,
} from '@pulse/shared';
import { PencilLine, Plus, Scale, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';

import { EmptyState } from '@/components/ui/empty-state';
import {
  DateAuthorityError,
  DateAuthorityStaleNotice,
  TimeZoneRequired,
} from '@/components/date-authority-state';
import { Button } from '@/components/ui/button';
import { useConfirmation } from '@/components/ui/confirmation-dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  useDeleteWeight,
  useLogWeight,
  useUpdateWeight,
  useWeightEntries,
} from '@/features/weight/api/weight';
import { useWeightUnit } from '@/hooks/use-weight-unit';
import { useDateAuthority } from '@/hooks/use-date-authority';
import { parseDateInput } from '@/lib/date';

import { TrendWeightWorkspace } from './trend-weight-workspace';

const entryDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const compareWeightEntries = (left: BodyWeightEntry, right: BodyWeightEntry) =>
  left.date.localeCompare(right.date) ||
  left.createdAt - right.createdAt ||
  left.id.localeCompare(right.id);

function formatEntryDate(dateKey: string) {
  return entryDateFormatter.format(parseDateInput(`${dateKey}T00:00:00`));
}

export function WeightHistory() {
  const dateAuthority = useDateAuthority();
  const { confirm, dialog } = useConfirmation();
  const entriesQuery = useWeightEntries();
  const logWeightMutation = useLogWeight();
  const deleteWeightMutation = useDeleteWeight();
  const updateWeightMutation = useUpdateWeight();
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [addErrorMessage, setAddErrorMessage] = useState('');
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingWeight, setEditingWeight] = useState('');
  const [editingUnit, setEditingUnit] = useState<'lbs' | 'kg'>('lbs');
  const [editingNotes, setEditingNotes] = useState('');
  const [editingWeightError, setEditingWeightError] = useState('');
  const { weightUnit } = useWeightUnit();
  const addWeightPlaceholder = weightUnit === 'kg' ? '82.3' : '181.4';

  const {
    formState: { errors: addEntryErrors },
    handleSubmit,
    register,
    reset,
  } = useForm<CreateWeightInput>({
    defaultValues: {
      date: dateAuthority.localDate ?? '',
      notes: undefined,
    },
    resolver: zodResolver(createWeightInputSchema),
  });

  useEffect(() => {
    if (!dateAuthority.localDate || isAddFormOpen) return;
    reset({ date: dateAuthority.localDate, notes: undefined });
  }, [dateAuthority.localDate, isAddFormOpen, reset]);

  const allWeightEntries = useMemo(
    () => [...(entriesQuery.data ?? [])].sort(compareWeightEntries),
    [entriesQuery.data],
  );
  const sortedWeightEntries = useMemo(
    () => [...allWeightEntries].sort((left, right) => compareWeightEntries(right, left)),
    [allWeightEntries],
  );

  async function onSubmitNewEntry(values: CreateWeightInput) {
    if (dateAuthority.isLocked) return;
    setAddErrorMessage('');

    try {
      await logWeightMutation.mutateAsync({ ...values, unit: weightUnit });
      reset({
        date: dateAuthority.localDate ?? '',
        notes: undefined,
      });
      setIsAddFormOpen(false);
    } catch (error) {
      setAddErrorMessage(
        error instanceof Error ? error.message : 'Weight entry could not be saved.',
      );
    }
  }

  function startEditing(entry: BodyWeightEntry) {
    setEditingEntryId(entry.id);
    setEditingWeight(entry.weight.toString());
    setEditingUnit(entry.unit);
    setEditingNotes(entry.notes ?? '');
    setEditingWeightError('');
  }

  function stopEditing() {
    setEditingEntryId(null);
    setEditingWeight('');
    setEditingUnit('lbs');
    setEditingNotes('');
    setEditingWeightError('');
  }

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
          // The mutation hook owns user-facing error handling; this avoids an unhandled rejection
          // from the confirmation dialog callback.
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
        input: {
          notes: editingNotes.trim().length > 0 ? editingNotes.trim() : null,
          weight: parsedWeight,
          unit: editingUnit,
        },
      });
      stopEditing();
    } catch {
      // The mutation hook already reports errors via toast state.
      return;
    }
  }

  const isLoading = entriesQuery.isLoading;
  const isError = entriesQuery.isError;
  const isEmpty = !isLoading && !isError && sortedWeightEntries.length === 0;

  return (
    <section className="space-y-6">
      <TrendWeightWorkspace />

      {!dateAuthority.localDate ? (
        dateAuthority.isLoading ? (
          <p aria-live="polite" className="text-sm text-muted-foreground" role="status">
            Resolving your local weight date…
          </p>
        ) : dateAuthority.isInitialError ? (
          <DateAuthorityError
            isRetrying={dateAuthority.isRetrying}
            onRetry={() => void dateAuthority.retry()}
            surface="Weight"
          />
        ) : (
          <TimeZoneRequired surface="Weight" />
        )
      ) : dateAuthority.isStale && dateAuthority.timeZone ? (
        <DateAuthorityStaleNotice
          date={dateAuthority.localDate}
          isRetrying={dateAuthority.isRetrying}
          onRetry={() => void dateAuthority.retry()}
          timeZone={dateAuthority.timeZone}
        />
      ) : null}

      <section className="rounded-3xl border border-border/70 bg-card/95 p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">Log a new entry</h2>
            <p className="text-sm text-muted">
              Add today&apos;s weigh-in or backfill a missed day without leaving this page.
            </p>
          </div>
          <Button
            className="min-h-11 self-start"
            disabled={dateAuthority.isLocked}
            onClick={() => {
              setIsAddFormOpen((current) => !current);
              setAddErrorMessage('');
            }}
            type="button"
            variant={isAddFormOpen ? 'outline' : 'default'}
          >
            <Plus aria-hidden="true" className="mr-2 size-4" />
            {isAddFormOpen ? 'Hide form' : 'Add entry'}
          </Button>
        </div>

        {isAddFormOpen ? (
          <form
            aria-label="Add weight entry"
            className="mt-4 grid gap-3 border-t border-border/70 pt-4 sm:grid-cols-2"
            onSubmit={handleSubmit(onSubmitNewEntry)}
          >
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="weight-entry-date">
                Date
              </label>
              <Input
                id="weight-entry-date"
                type="date"
                aria-invalid={addEntryErrors.date ? true : undefined}
                disabled={dateAuthority.isLocked || logWeightMutation.isPending}
                {...register('date')}
              />
              {addEntryErrors.date?.message ? (
                <p className="text-sm text-destructive">{addEntryErrors.date.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="weight-entry-value">
                Weight ({weightUnit})
              </label>
              <Input
                id="weight-entry-value"
                type="number"
                step="0.1"
                min="0.1"
                inputMode="decimal"
                aria-invalid={addEntryErrors.weight ? true : undefined}
                disabled={dateAuthority.isLocked || logWeightMutation.isPending}
                placeholder={addWeightPlaceholder}
                {...register('weight', { valueAsNumber: true })}
              />
              {addEntryErrors.weight?.message ? (
                <p className="text-sm text-destructive">{addEntryErrors.weight.message}</p>
              ) : null}
            </div>

            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium text-foreground" htmlFor="weight-entry-notes">
                Notes
              </label>
              <Textarea
                id="weight-entry-notes"
                disabled={dateAuthority.isLocked || logWeightMutation.isPending}
                placeholder="Optional context like fasted, after cardio, or travel day."
                rows={3}
                {...register('notes')}
              />
            </div>

            {addErrorMessage ? (
              <p className="text-sm text-destructive sm:col-span-2">{addErrorMessage}</p>
            ) : null}

            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button
                className="min-h-11"
                disabled={dateAuthority.isLocked || logWeightMutation.isPending}
                type="submit"
              >
                Save entry
              </Button>
              <Button
                className="min-h-11"
                onClick={() => {
                  reset({
                    date: dateAuthority.localDate ?? '',
                    notes: undefined,
                  });
                  setAddErrorMessage('');
                  setIsAddFormOpen(false);
                }}
                type="button"
                variant="ghost"
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Entries</h2>
          <p className="text-sm text-muted">
            Review every weigh-in, update mistaken values or notes, and remove entries you no longer
            want.
          </p>
        </div>

        {isEmpty ? (
          <EmptyState
            description="Use the Add entry button above to log your first weigh-in."
            icon={Scale}
            title="No weight entries yet"
          />
        ) : null}

        {!isLoading && !isError && sortedWeightEntries.length > 0 ? (
          <ul className="grid gap-3" aria-label="Weight history entries">
            {sortedWeightEntries.map((entry) => {
              const formattedDate = formatEntryDate(entry.date);
              const isEditing = editingEntryId === entry.id;

              return (
                <li
                  className="rounded-2xl border border-border/70 bg-card px-4 py-4 shadow-sm"
                  key={entry.id}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="text-sm font-semibold text-foreground">{formattedDate}</p>

                      {isEditing ? (
                        <div className="grid gap-3 sm:max-w-xl sm:grid-cols-2">
                          <div className="space-y-2">
                            <label
                              className="text-sm font-medium text-foreground"
                              htmlFor={`weight-edit-${entry.id}`}
                            >
                              Weight ({editingUnit})
                            </label>
                            <Input
                              aria-label={`Weight value for ${formattedDate} (${editingUnit})`}
                              className="h-10"
                              id={`weight-edit-${entry.id}`}
                              inputMode="decimal"
                              min="0.1"
                              placeholder={editingUnit === 'kg' ? '82.3' : '181.4'}
                              onChange={(event) => {
                                setEditingWeight(event.currentTarget.value);
                                setEditingWeightError('');
                              }}
                              step="0.1"
                              type="number"
                              value={editingWeight}
                            />
                          </div>

                          <div className="space-y-2 sm:col-span-2">
                            <label
                              className="text-sm font-medium text-foreground"
                              htmlFor={`weight-notes-${entry.id}`}
                            >
                              Notes
                            </label>
                            <Textarea
                              aria-label={`Notes for ${formattedDate}`}
                              id={`weight-notes-${entry.id}`}
                              onChange={(event) => setEditingNotes(event.currentTarget.value)}
                              rows={3}
                              value={editingNotes}
                            />
                          </div>

                          {editingWeightError ? (
                            <p className="text-sm text-destructive sm:col-span-2" role="status">
                              {editingWeightError}
                            </p>
                          ) : null}

                          <div className="flex flex-wrap gap-2 sm:col-span-2">
                            <Button
                              className="min-h-11"
                              disabled={updateWeightMutation.isPending}
                              onClick={() => {
                                void handleSaveEdit(entry.id);
                              }}
                              type="button"
                            >
                              Save
                            </Button>
                            <Button
                              className="min-h-11"
                              onClick={stopEditing}
                              type="button"
                              variant="ghost"
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-lg font-semibold text-primary">
                            {formatWeightWithUnit(entry.weight, entry.unit)}
                          </p>
                          {entry.notes ? (
                            <p className="break-words text-sm text-muted">{entry.notes}</p>
                          ) : null}
                        </>
                      )}
                    </div>

                    {!isEditing ? (
                      <div className="flex items-center gap-2 self-start">
                        <Button
                          className="min-h-11"
                          onClick={() => startEditing(entry)}
                          type="button"
                          variant="outline"
                        >
                          <PencilLine aria-hidden="true" className="mr-2 size-4" />
                          Edit
                        </Button>
                        <Button
                          aria-label={`Delete weight entry from ${formattedDate}`}
                          className="min-h-11 min-w-11"
                          onClick={() => handleDelete({ date: entry.date, id: entry.id })}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 aria-hidden="true" className="size-4" />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      {dialog}
    </section>
  );
}

import { zodResolver } from '@hookform/resolvers/zod';
import { computeEWMA, computeWeightInsights, createWeightInputSchema, type BodyWeightEntry, type CreateWeightInput } from '@pulse/shared';
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PencilLine, Plus, Scale, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';

import { EmptyState } from '@/components/ui/empty-state';
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
import { addDays, formatUtcDateKey, parseDateInput } from '@/lib/date';

type RangeOption = {
  days: number | null;
  label: string;
  value: '30d' | '90d' | '180d' | '365d' | 'all';
};

const RANGE_OPTIONS: RangeOption[] = [
  { value: '30d', label: '30D', days: 30 },
  { value: '90d', label: '90D', days: 90 },
  { value: '180d', label: '6M', days: 180 },
  { value: '365d', label: '1Y', days: 365 },
  { value: 'all', label: 'All', days: null },
];

const DEFAULT_RANGE = RANGE_OPTIONS[0];

const entryDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const axisDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

const tooltipDateFormatter = new Intl.DateTimeFormat('en-US', {
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

function filterEntriesByRange(entries: BodyWeightEntry[], days: number | null) {
  if (days === null) {
    return entries;
  }

  const rangeEnd = formatUtcDateKey(new Date());
  const rangeStart = formatUtcDateKey(addDays(parseDateInput(`${rangeEnd}T00:00:00`), -(days - 1)));

  return entries.filter((entry) => entry.date >= rangeStart && entry.date <= rangeEnd);
}

function computeYAxisDomain(points: Array<{ scale: number; trend: number }>): [number, number] {
  if (points.length === 0) {
    return [0, 1];
  }

  const values = points.flatMap((point) => [point.scale, point.trend]);
  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    const padding = Math.max(1, min * 0.02);
    return [min - padding, max + padding];
  }

  const padding = Math.max(0.5, (max - min) * 0.1);
  return [Number((min - padding).toFixed(1)), Number((max + padding).toFixed(1))];
}

function formatSignedChange(value: number, formatWeightValue: (value: number) => string) {
  const absolute = formatWeightValue(Math.abs(value));

  if (Math.abs(value) < 0.1) {
    return `${absolute} change`;
  }

  return `${value > 0 ? '+' : '-'}${absolute}`;
}

function getDefaultDate() {
  return formatUtcDateKey(new Date());
}

export function WeightHistory() {
  const { confirm, dialog } = useConfirmation();
  const entriesQuery = useWeightEntries();
  const logWeightMutation = useLogWeight();
  const deleteWeightMutation = useDeleteWeight();
  const updateWeightMutation = useUpdateWeight();
  const [selectedRange, setSelectedRange] = useState<RangeOption>(DEFAULT_RANGE);
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [addErrorMessage, setAddErrorMessage] = useState('');
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingWeight, setEditingWeight] = useState('');
  const [editingNotes, setEditingNotes] = useState('');
  const [editingWeightError, setEditingWeightError] = useState('');
  const { formatWeight } = useWeightUnit();

  const {
    formState: { errors: addEntryErrors },
    handleSubmit,
    register,
    reset,
  } = useForm<CreateWeightInput>({
    defaultValues: {
      date: getDefaultDate(),
      notes: undefined,
    },
    resolver: zodResolver(createWeightInputSchema),
  });

  const allWeightEntries = useMemo(
    () => [...(entriesQuery.data ?? [])].sort(compareWeightEntries),
    [entriesQuery.data],
  );
  const chartEntries = useMemo(
    () => filterEntriesByRange(allWeightEntries, selectedRange.days),
    [allWeightEntries, selectedRange.days],
  );
  const sortedWeightEntries = useMemo(
    () => [...allWeightEntries].sort((left, right) => compareWeightEntries(right, left)),
    [allWeightEntries],
  );
  const chartData = useMemo(
    () => computeEWMA(chartEntries.map((entry) => ({ date: entry.date, weight: entry.weight }))),
    [chartEntries],
  );
  const summaryDays = selectedRange.days ?? Math.max(chartData.length, 1);
  const rangeInsights = useMemo(
    () => computeWeightInsights(chartData, summaryDays),
    [chartData, summaryDays],
  );
  const yDomain = useMemo(() => computeYAxisDomain(chartData), [chartData]);
  const latestEntry = sortedWeightEntries[0] ?? null;

  async function onSubmitNewEntry(values: CreateWeightInput) {
    setAddErrorMessage('');

    try {
      await logWeightMutation.mutateAsync(values);
      reset({
        date: getDefaultDate(),
        notes: undefined,
      });
      setIsAddFormOpen(false);
    } catch (error) {
      setAddErrorMessage(error instanceof Error ? error.message : 'Weight entry could not be saved.');
    }
  }

  function startEditing(entry: BodyWeightEntry) {
    setEditingEntryId(entry.id);
    setEditingWeight(entry.weight.toString());
    setEditingNotes(entry.notes ?? '');
    setEditingWeightError('');
  }

  function stopEditing() {
    setEditingEntryId(null);
    setEditingWeight('');
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
                disabled={logWeightMutation.isPending}
                {...register('date')}
              />
              {addEntryErrors.date?.message ? (
                <p className="text-sm text-destructive">{addEntryErrors.date.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="weight-entry-value">
                Weight
              </label>
              <Input
                id="weight-entry-value"
                type="number"
                step="0.1"
                min="0.1"
                inputMode="decimal"
                aria-invalid={addEntryErrors.weight ? true : undefined}
                disabled={logWeightMutation.isPending}
                placeholder="181.4"
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
                disabled={logWeightMutation.isPending}
                placeholder="Optional context like fasted, after cardio, or travel day."
                rows={3}
                {...register('notes')}
              />
            </div>

            {addErrorMessage ? (
              <p className="text-sm text-destructive sm:col-span-2">{addErrorMessage}</p>
            ) : null}

            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button className="min-h-11" disabled={logWeightMutation.isPending} type="submit">
                Save entry
              </Button>
              <Button
                className="min-h-11"
                onClick={() => {
                  reset({
                    date: getDefaultDate(),
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

      <section className="rounded-3xl border border-border/70 bg-card/95 p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">Trend chart</h2>
              <p className="text-sm text-muted">
                Logged weigh-ins with the dashboard&apos;s EWMA smoothing across your selected range.
              </p>
            </div>
            <div
              aria-label="Weight history range"
              className="inline-flex w-full flex-wrap items-center gap-1 rounded-full border border-border bg-secondary/30 p-1 sm:w-auto"
              role="group"
            >
              {RANGE_OPTIONS.map((option) => (
                <Button
                  aria-pressed={selectedRange.value === option.value}
                  className="rounded-full px-3 text-xs"
                  key={option.value}
                  onClick={() => setSelectedRange(option)}
                  size="sm"
                  type="button"
                  variant={selectedRange.value === option.value ? 'default' : 'ghost'}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-secondary/40 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Latest entry
              </p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {latestEntry ? formatWeight(latestEntry.weight) : '--'}
              </p>
            </div>
            <div className="rounded-2xl bg-secondary/40 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Period average
              </p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {chartData.length > 0 ? formatWeight(rangeInsights.avgWeight) : '--'}
              </p>
            </div>
            <div className="rounded-2xl bg-secondary/40 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Range change
              </p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {chartData.length > 0 ? formatSignedChange(rangeInsights.periodChange, formatWeight) : '--'}
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="h-[280px] w-full animate-pulse rounded-2xl bg-muted/50 sm:h-[360px]" />
          ) : isError ? (
            <div className="rounded-2xl border border-dashed border-destructive/40 p-6">
              <h3 className="text-base font-semibold text-foreground">Unable to load weight history</h3>
              <p className="mt-1 text-sm text-muted">
                {entriesQuery.error instanceof Error
                  ? entriesQuery.error.message
                  : 'The weight history request failed.'}
              </p>
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-border bg-muted/15 px-4 text-center sm:min-h-[320px]">
              <div className="space-y-2">
                <p className="text-base font-semibold text-foreground">
                  {isEmpty ? 'Log your first weight entry to build a trend.' : 'No entries in this range yet.'}
                </p>
                <p className="text-sm text-muted">
                  Try a wider date range or add a new weigh-in above.
                </p>
              </div>
            </div>
          ) : (
            <div aria-label="Weight history trend chart" className="h-[280px] w-full sm:h-[360px]" role="img">
              <ResponsiveContainer height="100%" width="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 2, left: 0 }}>
                  <defs>
                    <linearGradient id="weight-history-scale-fill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                  <XAxis
                    axisLine={false}
                    dataKey="date"
                    minTickGap={16}
                    tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
                    tickFormatter={(value: string) =>
                      axisDateFormatter.format(parseDateInput(`${value}T12:00:00`))
                    }
                    tickLine={false}
                  />
                  <YAxis
                    axisLine={false}
                    domain={yDomain}
                    tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
                    tickFormatter={(value: number) => value.toFixed(value % 1 === 0 ? 0 : 1)}
                    tickLine={false}
                    width={42}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-card)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '14px',
                      color: 'var(--color-foreground)',
                    }}
                    formatter={(value: number | undefined, name: string | undefined) => {
                      if (name === 'scale') {
                        return [formatWeight(value ?? 0), 'Logged weight'];
                      }

                      return [formatWeight(value ?? 0), 'Trend weight'];
                    }}
                    labelFormatter={(label) =>
                      typeof label === 'string'
                        ? tooltipDateFormatter.format(parseDateInput(`${label}T12:00:00`))
                        : ''
                    }
                    separator=": "
                  />
                  <Area
                    dataKey="scale"
                    fill="url(#weight-history-scale-fill)"
                    isAnimationActive={false}
                    name="scale"
                    stroke="var(--color-primary)"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    type="monotone"
                  />
                  <Line
                    dataKey="trend"
                    dot={{ fill: 'var(--color-card)', r: 4, stroke: 'var(--color-accent-cream)', strokeWidth: 2 }}
                    isAnimationActive={false}
                    name="trend"
                    stroke="var(--color-accent-cream)"
                    strokeDasharray="6 4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    type="monotone"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-muted">
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
              Logged weight
            </span>
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="size-2 rounded-full bg-[var(--color-accent-cream)]" />
              EWMA trend
            </span>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Entries</h2>
          <p className="text-sm text-muted">
            Review every weigh-in, update mistaken values or notes, and remove entries you no longer want.
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
                            <label className="text-sm font-medium text-foreground" htmlFor={`weight-edit-${entry.id}`}>
                              Weight
                            </label>
                            <Input
                              aria-label={`Weight value for ${formattedDate}`}
                              className="h-10"
                              id={`weight-edit-${entry.id}`}
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
                          </div>

                          <div className="space-y-2 sm:col-span-2">
                            <label className="text-sm font-medium text-foreground" htmlFor={`weight-notes-${entry.id}`}>
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
                            <Button className="min-h-11" onClick={stopEditing} type="button" variant="ghost">
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-lg font-semibold text-primary">{formatWeight(entry.weight)}</p>
                          {entry.notes ? <p className="break-words text-sm text-muted">{entry.notes}</p> : null}
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

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  adaptiveReviewContextCreateInputSchema,
  type AdaptiveReviewContextCreateInput,
  type DataQualityCalendarDay,
} from '@pulse/shared';
import {
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Dumbbell,
  MessageSquareText,
  RefreshCw,
  Scale,
  ShieldCheck,
  UtensilsCrossed,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router';

import { NutritionDayStatusControl } from '@/features/adaptive-nutrition/components/nutrition-day-status-control';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useCreateDataQualityContext, useDataQualityCalendar } from '../api/data-quality';

type Domain = 'nutrition' | 'weight' | 'workout' | 'algorithm' | 'context';

const DOMAIN_META = {
  nutrition: { label: 'Nutrition', icon: UtensilsCrossed, short: 'N' },
  weight: { label: 'Weight', icon: Scale, short: 'W' },
  workout: { label: 'Workout', icon: Dumbbell, short: 'X' },
  algorithm: { label: 'Algorithm', icon: BrainCircuit, short: 'A' },
  context: { label: 'Context', icon: MessageSquareText, short: 'C' },
} as const;

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const parseDateKey = (date: string) => new Date(`${date}T00:00:00.000Z`);
const toDateKey = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: string, amount: number) => {
  const value = parseDateKey(date);
  value.setUTCDate(value.getUTCDate() + amount);
  return toDateKey(value);
};
const addMonths = (date: string, amount: number) => {
  const value = parseDateKey(date);
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() + amount);
  return toDateKey(value);
};
const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
const monthGridRange = (date: string) => {
  const first = parseDateKey(monthStart(date));
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const start = addDays(toDateKey(first), -mondayOffset);
  const nextMonth = parseDateKey(addMonths(toDateKey(first), 1));
  const last = addDays(toDateKey(nextMonth), -1);
  const sundayOffset = (7 - parseDateKey(last).getUTCDay()) % 7;
  return { start, end: addDays(last, sundayOffset) };
};
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});
const monthFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'long',
  year: 'numeric',
});
const formatDate = (date: string) => dateFormatter.format(parseDateKey(date));
const formatTimestamp = (value: number, timeZone: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
const humanize = (value: string) => value.replaceAll('_', ' ');
const provenanceLabel = (value: { label: string; limitation: string | null }) => (
  <>
    {value.label}
    {value.limitation ? ` · ${value.limitation}` : ''}
  </>
);

const nutritionLabel = (day: DataQualityCalendarDay) => {
  if (day.nutrition.evidenceState === 'pending_cutoff') return 'Pending cutoff';
  if (day.nutrition.evidenceState === 'excluded') return 'Excluded';
  return humanize(day.nutrition.qualityState);
};
const weightLabel = (day: DataQualityCalendarDay) => {
  if (day.weight.evidenceState === 'pending_cutoff') return 'Pending cutoff';
  if (day.weight.suspect) return 'Suspect';
  if (day.weight.evidenceState === 'excluded') return 'Excluded';
  if (day.weight.correctionState === 'confirmed') return 'Corrected';
  return day.weight.entryId ? 'Logged' : 'No weigh-in';
};
const workoutLabel = (day: DataQualityCalendarDay) => {
  if (day.workouts.length === 0) return 'No workout';
  const states = [...new Set(day.workouts.map((item) => item.state))];
  return states.length === 1 && states[0] ? humanize(states[0]) : `${day.workouts.length} records`;
};
const algorithmLabel = (day: DataQualityCalendarDay) => humanize(day.algorithm.state);

function Indicator({ domain, label }: { domain: Domain; label: string }) {
  const meta = DOMAIN_META[domain];
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-md border border-border/70 bg-background/80 px-1 py-0.5 text-[0.58rem] font-semibold leading-tight text-foreground sm:text-[0.65rem]',
        (label.includes('Missing') || label.includes('No ')) &&
          'border-dashed text-muted-foreground',
        (label.includes('Pending') || label.includes('partial')) &&
          'border-amber-500/60 bg-amber-500/10',
        (label.includes('Excluded') || label.includes('Suspect')) &&
          'border-rose-500/60 bg-rose-500/10',
      )}
      title={`${meta.label}: ${label}`}
    >
      <span aria-hidden="true">{meta.short}</span>
      <span className="hidden truncate sm:inline">{label}</span>
      <span className="sr-only">{meta.label}: </span>
    </span>
  );
}

function DomainSection({
  children,
  icon: Icon,
  label,
  status,
}: {
  children: ReactNode;
  icon: typeof UtensilsCrossed;
  label: string;
  status: string;
}) {
  const id = `data-quality-${label.toLowerCase().replaceAll(' ', '-')}`;
  return (
    <section
      aria-labelledby={id}
      className="rounded-2xl border border-border/70 bg-background/65 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-semibold" id={id}>
          <Icon aria-hidden="true" className="size-4 text-primary" />
          {label}
        </h3>
        <Badge variant="outline">{status}</Badge>
      </div>
      <div className="mt-3 space-y-3 text-sm">{children}</div>
    </section>
  );
}

function FactList({ facts }: { facts: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {facts.map((fact) => (
        <div className="min-w-0 rounded-xl bg-secondary/45 px-3 py-2" key={fact.label}>
          <dt className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {fact.label}
          </dt>
          <dd className="mt-1 break-words font-medium text-foreground">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ReasonList({ codes }: { codes: string[] }) {
  if (codes.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Recorded reasons
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {codes.map((code) => (
          <li key={code}>
            <Badge className="whitespace-normal text-left" variant="secondary">
              {humanize(code)}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ContextDialog({
  date,
  open,
  onOpenChange,
}: {
  date: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const mutation = useCreateDataQualityContext();
  const form = useForm<AdaptiveReviewContextCreateInput>({
    resolver: zodResolver(adaptiveReviewContextCreateInputSchema),
    defaultValues: {
      subject: { kind: 'date', localDate: date },
      category: 'other',
      note: '',
      resolution: undefined,
      resolutionKind: undefined,
    },
  });

  useEffect(() => {
    form.reset({
      subject: { kind: 'date', localDate: date },
      category: 'other',
      note: '',
      resolution: undefined,
      resolutionKind: undefined,
    });
  }, [date, form]);

  const submit = form.handleSubmit(async (input) => {
    await mutation.mutateAsync(input);
    onOpenChange(false);
    form.reset({
      subject: { kind: 'date', localDate: date },
      category: 'other',
      note: '',
      resolution: undefined,
      resolutionKind: undefined,
    });
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add context for {formatDate(date)}</DialogTitle>
          <DialogDescription>
            Context helps explain the record. It does not change calories, status, eligibility, or
            algorithm calculations.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="data-quality-context-category">Context type</Label>
            <select
              className="flex min-h-11 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              disabled={mutation.isPending}
              id="data-quality-context-category"
              {...form.register('category')}
            >
              <option value="illness">Illness</option>
              <option value="recovery">Recovery</option>
              <option value="pain_injury">Pain or injury</option>
              <option value="travel">Travel</option>
              <option value="nutrition_exception">Nutrition exception</option>
              <option value="training_change">Training change</option>
              <option value="schedule_change">Schedule constraint</option>
              <option value="clarification">Clarification</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="data-quality-context-note">What should Pulse know?</Label>
            <Textarea
              aria-describedby={
                form.formState.errors.note ? 'data-quality-context-error' : undefined
              }
              aria-invalid={Boolean(form.formState.errors.note)}
              disabled={mutation.isPending}
              id="data-quality-context-note"
              placeholder="Bounded context for this date"
              {...form.register('note')}
            />
            {form.formState.errors.note ? (
              <p className="text-sm text-destructive" id="data-quality-context-error" role="alert">
                {form.formState.errors.note.message}
              </p>
            ) : null}
          </div>
          {mutation.isError ? (
            <p className="text-sm text-destructive" role="alert">
              {mutation.error instanceof Error ? mutation.error.message : 'Unable to add context.'}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              disabled={mutation.isPending}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={mutation.isPending} type="submit">
              {mutation.isPending ? 'Adding context…' : 'Add context'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DataQualityCalendarWorkspace() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedDate = searchParams.get('date');
  const initialDate =
    requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : null;
  const [visibleMonth, setVisibleMonth] = useState<string | null>(() =>
    initialDate ? monthStart(initialDate) : null,
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(initialDate);
  const [domains, setDomains] = useState<Set<Domain>>(
    () => new Set(['nutrition', 'weight', 'workout', 'algorithm', 'context']),
  );
  const [contextOpen, setContextOpen] = useState(searchParams.get('action') === 'context');
  const range = useMemo(() => (visibleMonth ? monthGridRange(visibleMonth) : null), [visibleMonth]);
  const calendarQuery = useDataQualityCalendar(range ? { start: range.start, end: range.end } : {});
  const calendar = calendarQuery.data;
  const resolvedVisibleMonth = visibleMonth ?? (calendar ? monthStart(calendar.today) : null);
  const resolvedSelectedDate = selectedDate ?? calendar?.today ?? null;
  const selectedDay =
    calendar?.days.find((day) => day.date === resolvedSelectedDate) ?? calendar?.days[0];

  const selectDate = (date: string) => {
    setSelectedDate(date);
    const next = new URLSearchParams(searchParams);
    next.set('date', date);
    next.delete('action');
    setSearchParams(next, { replace: true });
  };

  const changeMonth = (amount: number) => {
    if (!resolvedVisibleMonth) return;
    const nextMonth = addMonths(resolvedVisibleMonth, amount);
    setVisibleMonth(nextMonth);
    selectDate(nextMonth);
  };

  const jumpTo = (date: string) => {
    if (!date) return;
    setVisibleMonth(monthStart(date));
    selectDate(date);
  };

  const toggleDomain = (domain: Domain) => {
    setDomains((current) => {
      const next = new Set(current);
      if (next.has(domain)) {
        if (next.size > 1) next.delete(domain);
      } else {
        next.add(domain);
      }
      return next;
    });
  };

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/12 via-card to-[var(--color-accent-mint)]/35">
        <CardContent className="grid gap-4 p-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:p-6">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            <ShieldCheck aria-hidden="true" className="size-7" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
              Audit, not score
            </p>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-foreground/85">
              See what Pulse recorded, what is still pending, and what the algorithms could actually
              use. Missing and excluded records stay distinct; context never silently rewrites data.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="gap-4 border-b border-border/70 bg-secondary/25 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center justify-between gap-2 sm:justify-start">
              <Button
                aria-label="Previous month"
                className="min-h-11 min-w-11"
                disabled={!resolvedVisibleMonth}
                onClick={() => changeMonth(-1)}
                size="icon"
                type="button"
                variant="outline"
              >
                <ChevronLeft aria-hidden="true" />
              </Button>
              <h2
                className="min-w-40 text-center text-lg font-semibold"
                id="data-quality-month-heading"
              >
                {resolvedVisibleMonth
                  ? monthFormatter.format(parseDateKey(resolvedVisibleMonth))
                  : 'Loading…'}
              </h2>
              <Button
                aria-label="Next month"
                className="min-h-11 min-w-11"
                disabled={!resolvedVisibleMonth}
                onClick={() => changeMonth(1)}
                size="icon"
                type="button"
                variant="outline"
              >
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Label className="sr-only" htmlFor="data-quality-jump-date">
                Jump to date
              </Label>
              <Input
                className="min-h-11 min-w-0"
                id="data-quality-jump-date"
                onChange={(event) => jumpTo(event.target.value)}
                type="date"
                value={resolvedSelectedDate ?? ''}
              />
            </div>
          </div>
          <div aria-label="Calendar domains" className="flex flex-wrap gap-2" role="group">
            {(Object.keys(DOMAIN_META) as Domain[]).map((domain) => {
              const meta = DOMAIN_META[domain];
              const Icon = meta.icon;
              return (
                <Button
                  aria-pressed={domains.has(domain)}
                  className="min-h-11"
                  key={domain}
                  onClick={() => toggleDomain(domain)}
                  type="button"
                  variant={domains.has(domain) ? 'secondary' : 'outline'}
                >
                  <Icon aria-hidden="true" className="size-4" />
                  {meta.label}
                </Button>
              );
            })}
          </div>
        </CardHeader>

        {calendarQuery.isPending && !calendar ? (
          <div
            aria-live="polite"
            className="flex min-h-80 items-center justify-center gap-2 p-6 text-muted-foreground"
            role="status"
          >
            <RefreshCw
              aria-hidden="true"
              className="size-5 animate-spin motion-reduce:animate-none"
            />
            Loading Data Quality calendar
          </div>
        ) : calendarQuery.isError && !calendar ? (
          <div
            className="m-4 rounded-2xl border border-destructive/40 bg-destructive/5 p-5"
            role="alert"
          >
            <h2 className="font-semibold">Data Quality calendar could not be loaded</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Your source records are safe. Retry the read-only calendar request.
            </p>
            <Button
              className="mt-4 min-h-11"
              onClick={() => calendarQuery.refetch()}
              type="button"
              variant="outline"
            >
              Retry
            </Button>
          </div>
        ) : calendar ? (
          <CardContent className="space-y-5 p-3 sm:p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {calendar.summary.intervalLabel} summary · {formatDate(calendar.range.startDate)}–
              {formatDate(calendar.range.endDate)}
            </p>
            <div
              className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
              aria-label={calendar.summary.intervalLabel}
            >
              {[
                ['Complete nutrition', calendar.summary.nutrition.complete],
                ['Partial nutrition', calendar.summary.nutrition.partial],
                [
                  'Pending dates',
                  calendar.summary.nutrition.pending + calendar.summary.weight.pending,
                ],
                [
                  'Excluded evidence',
                  calendar.summary.nutrition.excluded + calendar.summary.weight.excluded,
                ],
                ['Missing nutrition', calendar.summary.nutrition.missing],
                ['Context days', calendar.summary.contextDays],
              ].map(([label, value]) => (
                <div
                  className="rounded-xl border border-border/60 bg-secondary/35 px-3 py-2"
                  key={label}
                >
                  <p className="text-lg font-semibold tabular-nums">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>

            <section
              aria-labelledby="data-quality-month-heading"
              aria-busy={calendarQuery.isFetching}
              className="min-w-0 max-w-full overflow-hidden [contain:inline-size_layout_paint]"
            >
              <div
                className="w-full min-w-0 max-w-full overflow-x-auto pb-2"
                data-testid="data-quality-calendar-scroller"
              >
                <div className="grid min-w-[336px] grid-cols-7 gap-1 sm:min-w-0 sm:gap-2">
                  {DAY_LABELS.map((label) => (
                    <p
                      className="py-1 text-center text-[0.65rem] font-bold uppercase tracking-[0.16em] text-muted-foreground"
                      key={label}
                    >
                      {label}
                    </p>
                  ))}
                  {calendar.days.map((day) => {
                    const inMonth = day.date.slice(0, 7) === resolvedVisibleMonth?.slice(0, 7);
                    const selected = day.date === selectedDay?.date;
                    return (
                      <button
                        aria-current={day.isToday ? 'date' : undefined}
                        aria-label={`${formatDate(day.date)}. Nutrition ${nutritionLabel(day)}. Weight ${weightLabel(day)}. Workout ${workoutLabel(day)}. Algorithm ${algorithmLabel(day)}. ${day.contexts.length} context record${day.contexts.length === 1 ? '' : 's'}.`}
                        aria-pressed={selected}
                        className={cn(
                          'min-h-20 min-w-11 rounded-xl border border-border/70 p-1.5 text-left transition-colors sm:min-h-28 sm:p-2',
                          inMonth
                            ? 'bg-card hover:border-primary/45'
                            : 'bg-secondary/20 opacity-55',
                          selected && 'border-primary bg-primary/8 ring-2 ring-primary/20',
                          day.isToday && 'outline outline-2 outline-offset-1 outline-primary/35',
                        )}
                        data-date={day.date}
                        key={day.date}
                        onClick={() => selectDate(day.date)}
                        type="button"
                      >
                        <span className="block text-xs font-semibold tabular-nums sm:text-sm">
                          {Number(day.date.slice(-2))}
                        </span>
                        <span className="mt-1 flex flex-col items-start gap-0.5 sm:gap-1">
                          {domains.has('nutrition') ? (
                            <Indicator domain="nutrition" label={nutritionLabel(day)} />
                          ) : null}
                          {domains.has('weight') ? (
                            <Indicator domain="weight" label={weightLabel(day)} />
                          ) : null}
                          {domains.has('workout') ? (
                            <Indicator domain="workout" label={workoutLabel(day)} />
                          ) : null}
                          {domains.has('algorithm') ? (
                            <Indicator domain="algorithm" label={algorithmLabel(day)} />
                          ) : null}
                          {domains.has('context') && day.contexts.length > 0 ? (
                            <Indicator
                              domain="context"
                              label={`${day.contexts.length} note${day.contexts.length === 1 ? '' : 's'}`}
                            />
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground" aria-live="polite">
                {calendar.timeZone} · {calendar.days.length} dates ·{' '}
                {calendarQuery.isFetching
                  ? 'Checking for updates…'
                  : selectedDay
                    ? `Selected ${formatDate(selectedDay.date)}`
                    : 'No date selected'}
              </p>
            </section>
          </CardContent>
        ) : null}
      </Card>

      {selectedDay && calendar ? (
        <Card id="data-quality-date-detail">
          <CardHeader className="border-b border-border/70">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">{formatDate(selectedDay.date)}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Exact source facts and algorithm treatment in {calendar.timeZone}.
                </p>
              </div>
              <Button
                className="min-h-11"
                disabled={
                  selectedDay.algorithm.state === 'no_program' ||
                  selectedDay.algorithm.state === 'pre_program'
                }
                onClick={() => setContextOpen(true)}
                type="button"
                variant="outline"
              >
                <MessageSquareText aria-hidden="true" className="size-4" />
                Add context
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 p-4 lg:grid-cols-2 lg:p-5">
            {domains.has('nutrition') ? (
              <DomainSection
                icon={UtensilsCrossed}
                label="Nutrition"
                status={nutritionLabel(selectedDay)}
              >
                <FactList
                  facts={[
                    {
                      label: 'Recorded status',
                      value: selectedDay.nutrition.explicitStatus ?? 'No record',
                    },
                    {
                      label: 'Algorithm treatment',
                      value: humanize(selectedDay.nutrition.evidenceState),
                    },
                    {
                      label: 'Meals / items',
                      value:
                        selectedDay.nutrition.mealCount === null
                          ? 'Not available'
                          : `${selectedDay.nutrition.mealCount} / ${selectedDay.nutrition.itemCount}`,
                    },
                    {
                      label: 'Calories',
                      value: selectedDay.nutrition.totals
                        ? `${Math.round(selectedDay.nutrition.totals.calories)} kcal`
                        : 'Not available',
                    },
                    {
                      label: 'Protein / carbs / fat',
                      value: selectedDay.nutrition.totals
                        ? `${Math.round(selectedDay.nutrition.totals.protein)}g / ${Math.round(selectedDay.nutrition.totals.carbs)}g / ${Math.round(selectedDay.nutrition.totals.fat)}g`
                        : 'Not available',
                    },
                    {
                      label: 'Nutrition log ID',
                      value: selectedDay.nutrition.logId ?? 'Not recorded',
                    },
                    {
                      label: 'Source',
                      value: provenanceLabel(selectedDay.nutrition.provenance),
                    },
                    {
                      label: 'Recorded',
                      value:
                        selectedDay.nutrition.createdAt === null
                          ? 'Not available'
                          : formatTimestamp(selectedDay.nutrition.createdAt, calendar.timeZone),
                    },
                    {
                      label: 'Last updated',
                      value:
                        selectedDay.nutrition.updatedAt === null
                          ? 'Not available'
                          : formatTimestamp(selectedDay.nutrition.updatedAt, calendar.timeZone),
                    },
                  ]}
                />
                <ReasonList codes={selectedDay.nutrition.reasonCodes} />
                <NutritionDayStatusControl
                  date={selectedDay.date}
                  isToday={selectedDay.isToday}
                  status={selectedDay.nutrition.explicitStatus}
                />
              </DomainSection>
            ) : null}

            {domains.has('weight') ? (
              <DomainSection icon={Scale} label="Weight" status={weightLabel(selectedDay)}>
                <FactList
                  facts={[
                    {
                      label: 'Scale weight',
                      value:
                        selectedDay.weight.weight === null
                          ? 'No weigh-in'
                          : `${selectedDay.weight.weight.toFixed(1)} ${selectedDay.weight.unit}`,
                    },
                    {
                      label: 'Product Trend Weight',
                      value:
                        selectedDay.weight.trendWeight === null
                          ? 'Not available'
                          : `${selectedDay.weight.trendWeight.toFixed(1)} ${selectedDay.weight.unit}`,
                    },
                    {
                      label: 'Algorithm treatment',
                      value: humanize(selectedDay.weight.evidenceState),
                    },
                    {
                      label: 'Weight entry ID',
                      value: selectedDay.weight.entryId ?? 'Not recorded',
                    },
                    {
                      label: 'Source',
                      value: provenanceLabel(selectedDay.weight.provenance),
                    },
                    {
                      label: 'Correction state',
                      value:
                        selectedDay.weight.correctionState === 'history_unavailable'
                          ? 'Correction history unavailable'
                          : humanize(selectedDay.weight.correctionState),
                    },
                    {
                      label: 'Suspect / stale',
                      value: `${selectedDay.weight.suspect ? 'Suspect' : 'Not flagged suspect'} · ${selectedDay.weight.stale ? 'Stale' : 'Not stale'}`,
                    },
                    {
                      label: 'Recorded',
                      value:
                        selectedDay.weight.createdAt === null
                          ? 'Not available'
                          : formatTimestamp(selectedDay.weight.createdAt, calendar.timeZone),
                    },
                  ]}
                />
                <ReasonList codes={selectedDay.weight.reasonCodes} />
                {selectedDay.weight.entryId ? (
                  <Button asChild className="min-h-11" variant="outline">
                    <Link to={`/weight/history?date=${selectedDay.date}`}>
                      Review weight measurement
                    </Link>
                  </Button>
                ) : null}
              </DomainSection>
            ) : null}

            {domains.has('workout') ? (
              <DomainSection icon={Dumbbell} label="Workout" status={workoutLabel(selectedDay)}>
                {selectedDay.workouts.length === 0 ? (
                  <p className="text-muted-foreground">
                    No workout plan or session is recorded for this date.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {selectedDay.workouts.map((workout) => (
                      <li className="rounded-xl border border-border/60 p-3" key={workout.id}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{workout.name}</p>
                          <Badge variant="outline">{humanize(workout.state)}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Recorded {formatTimestamp(workout.createdAt, calendar.timeZone)}
                          {workout.updatedAt > workout.createdAt
                            ? ` · Updated ${formatTimestamp(workout.updatedAt, calendar.timeZone)}`
                            : ''}
                        </p>
                        <dl className="mt-2 grid gap-1 text-xs text-muted-foreground">
                          <div>
                            <dt className="inline font-medium text-foreground">Relation IDs:</dt>{' '}
                            <dd className="inline">
                              plan {workout.scheduledWorkoutId ?? 'Not recorded'} · session{' '}
                              {workout.sessionId ?? 'Not recorded'}
                            </dd>
                          </div>
                          <div>
                            <dt className="inline font-medium text-foreground">Dates:</dt>{' '}
                            <dd className="inline">
                              planned {workout.plannedDate ?? 'Not recorded'} · session{' '}
                              {workout.sessionDate ?? 'Not recorded'}
                            </dd>
                          </div>
                          <div>
                            <dt className="inline font-medium text-foreground">Source:</dt>{' '}
                            <dd className="inline">{provenanceLabel(workout.provenance)}</dd>
                          </div>
                          <div>
                            <dt className="inline font-medium text-foreground">Correction:</dt>{' '}
                            <dd className="inline">
                              {workout.correctionState === 'history_unavailable'
                                ? 'Correction history unavailable'
                                : humanize(workout.correctionState)}
                            </dd>
                          </div>
                        </dl>
                        {workout.relationLimitation ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {workout.relationLimitation}
                          </p>
                        ) : null}
                        <ReasonList codes={workout.reasonCodes} />
                        <Button asChild className="mt-3 min-h-11" size="sm" variant="outline">
                          <Link
                            to={
                              workout.kind === 'workout_session'
                                ? `/workouts/session/${workout.id}`
                                : `/workouts/scheduled/${workout.id}`
                            }
                          >
                            Review workout
                          </Link>
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                {selectedDay.omittedWorkoutCount > 0 ? (
                  <p className="text-muted-foreground">
                    {selectedDay.omittedWorkoutCount} additional workout records are omitted from
                    this bounded view.
                  </p>
                ) : null}
              </DomainSection>
            ) : null}

            {domains.has('algorithm') ? (
              <DomainSection
                icon={BrainCircuit}
                label="Algorithm"
                status={algorithmLabel(selectedDay)}
              >
                <FactList
                  facts={[
                    { label: 'Program state', value: humanize(selectedDay.algorithm.state) },
                    {
                      label: 'Nutrition evidence',
                      value: humanize(selectedDay.algorithm.nutritionEvidenceState),
                    },
                    {
                      label: 'Weight evidence',
                      value: humanize(selectedDay.algorithm.weightEvidenceState),
                    },
                    {
                      label: 'Decision events',
                      value:
                        selectedDay.algorithm.events.length +
                        selectedDay.algorithm.omittedEventCount,
                    },
                  ]}
                />
                <ReasonList codes={selectedDay.algorithm.reasonCodes} />
                {selectedDay.algorithm.events.length > 0 ? (
                  <ul className="space-y-2">
                    {selectedDay.algorithm.events.map((event) => (
                      <li
                        className="flex flex-col gap-2 rounded-xl border border-border/60 p-3 sm:flex-row sm:items-center sm:justify-between"
                        key={`${event.kind}-${event.id}`}
                      >
                        <div>
                          <p className="font-medium">
                            {humanize(event.kind)} · {humanize(event.state)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            ID {event.id} · Effective {formatDate(event.effectiveDate)} · Source{' '}
                            {event.provenance.label}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {event.actions.map((action) => (
                            <Button
                              asChild
                              className="min-h-11"
                              key={`${event.id}-${action.kind}`}
                              size="sm"
                              variant="outline"
                            >
                              <Link to={action.href}>{action.label}</Link>
                            </Button>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">
                    No check-in or weekly-review decision is effective on this date.
                  </p>
                )}
                {selectedDay.algorithm.omittedEventCount > 0 ? (
                  <p className="text-muted-foreground">
                    {selectedDay.algorithm.omittedEventCount} additional decision events are omitted
                    from this bounded view.
                  </p>
                ) : null}
              </DomainSection>
            ) : null}

            {domains.has('context') ? (
              <DomainSection
                icon={MessageSquareText}
                label="Context"
                status={
                  selectedDay.contexts.length
                    ? `${selectedDay.contexts.length} recorded`
                    : 'No context'
                }
              >
                {selectedDay.contexts.length === 0 ? (
                  <p className="text-muted-foreground">
                    No bounded context is recorded. Absence of context does not imply that nothing
                    happened.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {selectedDay.contexts.map((context) => (
                      <li className="rounded-xl border border-border/60 p-3" key={context.id}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium capitalize">{humanize(context.category)}</p>
                          <Badge variant="outline">
                            {context.provenance.type === 'agent_token'
                              ? 'AgentToken'
                              : context.provenance.type === 'system'
                                ? 'Pulse system'
                                : 'You'}{' '}
                            · {context.provenance.label}
                          </Badge>
                        </div>
                        <p className="mt-2 leading-6">{context.note}</p>
                        {context.resolution ? (
                          <p className="mt-2 text-sm">
                            <span className="font-medium">Resolution:</span> {context.resolution}
                          </p>
                        ) : null}
                        <p className="mt-2 text-xs text-muted-foreground">
                          {humanize(context.subjectKind)} · revision {context.revision} · updated{' '}
                          {formatTimestamp(context.updatedAt, calendar.timeZone)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                {selectedDay.omittedContextCount > 0 ? (
                  <p className="text-muted-foreground">
                    {selectedDay.omittedContextCount} additional context records are omitted from
                    this bounded view.
                  </p>
                ) : null}
              </DomainSection>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="flex items-start gap-2 rounded-2xl border border-border/70 bg-secondary/30 p-4 text-sm text-muted-foreground">
        <Clock3 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <p>
          Completed-day cutoff and algorithm inclusion use the response time zone. Context explains
          evidence but never changes status or calculations by itself.
        </p>
      </div>

      {selectedDay ? (
        <ContextDialog date={selectedDay.date} onOpenChange={setContextOpen} open={contextOpen} />
      ) : null}
    </div>
  );
}

import { useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  List,
  LayoutGrid,
} from 'lucide-react';
import type { CalendarRuntimeItem } from '@pulse/shared';
import { Link } from 'react-router';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { useDateAuthority } from '@/hooks/use-date-authority';
import { ApiError } from '@/lib/api-client';
import { addDays, getMondayIndex, parseDateKey, toDateKey } from '@/lib/date-utils';
import { cn } from '@/lib/utils';
import { useCalendar } from '@/features/calendar/api/calendar';

const domains = ['activity', 'workout', 'journal', 'body_context', 'nutrition'] as const;
const states = ['planned', 'completed', 'observed', 'summary'] as const;
const domainLabel: Record<(typeof domains)[number], string> = {
  activity: 'Activity',
  workout: 'Workouts',
  journal: 'Journal',
  body_context: 'Body context',
  nutrition: 'Nutrition',
};
const stateLabel: Record<(typeof states)[number], string> = {
  planned: 'Planned',
  completed: 'Completed',
  observed: 'Observed',
  summary: 'Summary',
};
const monthTitle = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
const dayTitle = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});
const shortDay = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});
const macroNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const macroLine = (values: NonNullable<CalendarRuntimeItem['nutrition']>['target']) =>
  values
    ? `${macroNumber.format(values.calories)} kcal · ${macroNumber.format(values.protein)} g protein · ${macroNumber.format(values.carbs)} g carbs · ${macroNumber.format(values.fat)} g fat`
    : null;
const hrefFor = (item: CalendarRuntimeItem) => {
  if (item.domain === 'workout')
    return item.record.kind === 'scheduled_workout'
      ? `/workouts/scheduled/${item.record.id}`
      : `/workouts/session/${item.record.id}`;
  if (item.domain === 'nutrition') return `/nutrition?date=${item.localDate}`;
  if (item.domain === 'journal')
    return item.record.kind === 'journal_entry'
      ? `/journal?date=${item.localDate}&legacy=${encodeURIComponent(item.record.id)}`
      : `/journal/${encodeURIComponent(item.record.id)}`;
  if (item.domain === 'activity') {
    if (item.record.kind === 'activity') return `/activity/${encodeURIComponent(item.record.id)}`;
    return item.activityId
      ? `/activity/${encodeURIComponent(item.activityId)}?occurrence=${encodeURIComponent(item.record.id)}`
      : `/activity?occurrence=${encodeURIComponent(item.record.id)}`;
  }
  return `/journal?date=${item.localDate}&flare=${encodeURIComponent(item.record.id)}`;
};
const monthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1, 12);
const rangeFor = (month: Date) => {
  const start = addDays(month, -getMondayIndex(month));
  const days = Array.from({ length: 42 }, (_, index) => toDateKey(addDays(start, index)));
  return { days, from: days[0] ?? toDateKey(start), to: days[41] ?? toDateKey(addDays(start, 41)) };
};
const toggle = <T extends string>(current: T[], value: T) =>
  current.includes(value) ? current.filter((item) => item !== value) : [...current, value];

function Entry({ item }: { item: CalendarRuntimeItem }) {
  return (
    <Link
      className="group flex min-w-0 items-start gap-3 rounded-xl border border-border/60 bg-card/80 px-3 py-3 transition-colors hover:border-primary/45 hover:bg-accent/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      data-record-id={item.record.id}
      to={hrefFor(item)}
    >
      <span
        aria-hidden="true"
        className={cn(
          'mt-1.5 size-2 shrink-0 rounded-full',
          item.state === 'planned'
            ? 'bg-amber-400'
            : item.state === 'completed'
              ? 'bg-emerald-400'
              : item.domain === 'nutrition'
                ? 'bg-sky-400'
                : 'bg-fuchsia-400',
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-foreground group-hover:text-primary">
          {item.title}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {domainLabel[item.domain]} · {stateLabel[item.state]}
          {item.lifecycleStatus ? ` · ${item.lifecycleStatus}` : ''}
        </span>
        {item.nutrition && (
          <span className="mt-1 block space-y-0.5 text-xs leading-relaxed text-muted-foreground">
            <span className="block">
              {item.nutrition.actual
                ? `Actual: ${macroLine(item.nutrition.actual)}`
                : 'Actual: intake unknown'}
            </span>
            {item.nutrition.target && (
              <span className="block">Target: {macroLine(item.nutrition.target)}</span>
            )}
          </span>
        )}
      </span>
    </Link>
  );
}

export function CalendarPage() {
  const authority = useDateAuthority();
  const today = authority.localDate ?? toDateKey(new Date());
  const [visibleMonthState, setVisibleMonth] = useState<Date | null>(null);
  const visibleMonth = visibleMonthState ?? monthStart(parseDateKey(today));
  const [selectedDateState, setSelectedDate] = useState<string | null>(null);
  const selectedDate = selectedDateState ?? today;
  const [view, setView] = useState<'calendar' | 'agenda'>('calendar');
  const [selectedDomains, setDomains] = useState<(typeof domains)[number][]>([]);
  const [selectedStates, setStates] = useState<(typeof states)[number][]>([]);
  const range = rangeFor(visibleMonth);
  const query = useCalendar({
    from: range.from,
    to: range.to,
    domain: selectedDomains,
    state: selectedStates,
  });
  const grouped = useMemo(() => {
    const map = new Map<string, CalendarRuntimeItem[]>();
    for (const item of query.data?.items ?? [])
      map.set(item.localDate, [...(map.get(item.localDate) ?? []), item]);
    return map;
  }, [query.data]);
  const error = query.error;
  const errorMessage =
    error instanceof ApiError && error.code === 'USER_TIME_ZONE_REQUIRED'
      ? 'Set a valid time zone in your profile to view Calendar.'
      : error instanceof ApiError
        ? `${error.message} (${error.status}${error.code ? ` · ${error.code}` : ''})`
        : error instanceof Error
          ? error.message
          : 'Calendar could not load.';
  const moveMonth = (offset: number) => {
    const next = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1, 12);
    setVisibleMonth(next);
    setSelectedDate(toDateKey(next));
  };
  return (
    <main className="space-y-5">
      <PageHeader
        title="Calendar"
        description="Plans and recorded days, together without rewriting history."
        icon={
          <div className="rounded-2xl bg-primary/12 p-3 text-primary">
            <CalendarIcon aria-hidden="true" className="size-6" />
          </div>
        }
      />
      <section
        aria-label="Calendar controls"
        className="rounded-2xl border border-border/60 bg-card/70 p-3 shadow-sm sm:p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <Button
              aria-label="Previous month"
              size="icon-sm"
              variant="ghost"
              onClick={() => moveMonth(-1)}
            >
              <ChevronLeft />
            </Button>
            <h2 className="min-w-40 text-center font-display text-lg font-semibold">
              {monthTitle.format(visibleMonth)}
            </h2>
            <Button
              aria-label="Next month"
              size="icon-sm"
              variant="ghost"
              onClick={() => moveMonth(1)}
            >
              <ChevronRight />
            </Button>
          </div>
          <div aria-label="Calendar view" className="flex rounded-lg border border-border/70 p-1">
            <Button
              aria-pressed={view === 'calendar'}
              size="sm"
              variant={view === 'calendar' ? 'secondary' : 'ghost'}
              onClick={() => setView('calendar')}
            >
              <LayoutGrid /> Calendar
            </Button>
            <Button
              aria-pressed={view === 'agenda'}
              size="sm"
              variant={view === 'agenda' ? 'secondary' : 'ghost'}
              onClick={() => setView('agenda')}
            >
              <List /> Agenda
            </Button>
          </div>
        </div>
        <div aria-label="Domain filters" className="mt-4 flex flex-wrap gap-1.5">
          {domains.map((domain) => (
            <Button
              key={domain}
              aria-pressed={selectedDomains.includes(domain)}
              size="sm"
              variant={selectedDomains.includes(domain) ? 'secondary' : 'outline'}
              onClick={() => setDomains(toggle(selectedDomains, domain))}
            >
              {domainLabel[domain]}
            </Button>
          ))}
        </div>
        <div aria-label="State filters" className="mt-2 flex flex-wrap gap-1.5">
          {states.map((state) => (
            <Button
              key={state}
              aria-pressed={selectedStates.includes(state)}
              size="sm"
              variant={selectedStates.includes(state) ? 'secondary' : 'ghost'}
              onClick={() => setStates(toggle(selectedStates, state))}
            >
              {stateLabel[state]}
            </Button>
          ))}
        </div>
      </section>
      {query.isPending && (
        <p role="status" className="rounded-xl border border-border p-6 text-muted-foreground">
          Loading Calendar…
        </p>
      )}
      {query.isError && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-5">
          <p>{errorMessage}</p>
          <Button className="mt-3" variant="outline" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {query.data && (
        <>
          <p className="text-xs text-muted-foreground">
            {query.data.timeZone} · {query.data.items.length} records · {query.data.from} to{' '}
            {query.data.to}
          </p>
          {query.data.items.length === 0 && (
            <p className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
              No records match this range and filters.
            </p>
          )}
          {view === 'calendar' && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(17rem,1fr)]">
              <section
                aria-label="Calendar grid"
                className="rounded-2xl border border-border/60 bg-card/70 p-2 sm:p-4"
              >
                <div className="grid grid-cols-7 text-center text-xs font-medium text-muted-foreground">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
                    <span key={label} className="py-2">
                      {label}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {range.days.map((date) => {
                    const entries = grouped.get(date) ?? [];
                    return (
                      <button
                        key={date}
                        aria-label={`${date}, ${entries.length} records`}
                        aria-pressed={selectedDate === date}
                        className={cn(
                          'min-h-16 rounded-lg border p-1 text-left align-top transition-colors sm:min-h-20',
                          selectedDate === date
                            ? 'border-primary bg-primary/10'
                            : 'border-border/40 hover:bg-accent/40',
                          date.slice(0, 7) !== toDateKey(visibleMonth).slice(0, 7) && 'opacity-45',
                        )}
                        onClick={() => setSelectedDate(date)}
                      >
                        <span className="text-xs font-medium">{Number(date.slice(-2))}</span>
                        <span className="mt-1 flex flex-wrap gap-0.5">
                          {entries.slice(0, 5).map((item) => (
                            <span
                              key={`${item.domain}:${item.id}`}
                              aria-hidden="true"
                              className={cn(
                                'size-1.5 rounded-full',
                                item.state === 'planned'
                                  ? 'bg-amber-400'
                                  : item.state === 'completed'
                                    ? 'bg-emerald-400'
                                    : item.domain === 'nutrition'
                                      ? 'bg-sky-400'
                                      : 'bg-fuchsia-400',
                              )}
                            />
                          ))}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
              <section aria-label="Selected day records" className="space-y-2">
                <h2 className="font-display text-lg font-semibold">
                  {dayTitle.format(parseDateKey(selectedDate))}
                </h2>
                {(grouped.get(selectedDate) ?? []).length ? (
                  (grouped.get(selectedDate) ?? []).map((item) => (
                    <Entry key={`${item.domain}:${item.id}`} item={item} />
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No records on this day.</p>
                )}
              </section>
            </div>
          )}
          {view === 'agenda' && (
            <section aria-label="Calendar agenda" className="space-y-5">
              {range.days
                .filter((date) => grouped.has(date))
                .map((date) => (
                  <div key={date} data-local-date={date}>
                    <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
                      {shortDay.format(parseDateKey(date))}
                    </h2>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {(grouped.get(date) ?? []).map((item) => (
                        <Entry key={`${item.domain}:${item.id}`} item={item} />
                      ))}
                    </div>
                  </div>
                ))}
            </section>
          )}
        </>
      )}
    </main>
  );
}

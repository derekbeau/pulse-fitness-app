import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { getMockDayActivity } from '@/lib/mock-data/dashboard';
import { cn } from '@/lib/utils';

type CalendarPickerProps = {
  selectedDate?: Date;
  onDateSelect?: (date: Date) => void;
  className?: string;
};

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const MILLISECONDS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

const formatDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeDate = (date: Date): Date => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const isSameDay = (first: Date, second: Date): boolean => {
  return formatDateKey(first) === formatDateKey(second);
};

const getWeekStart = (date: Date): Date => {
  const normalizedDate = normalizeDate(date);
  const dayOfWeek = normalizedDate.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  return addDays(normalizedDate, mondayOffset);
};

const getWeekOffset = (fromDate: Date, baseDate: Date): number => {
  const fromWeekStart = getWeekStart(fromDate).getTime();
  const baseWeekStart = getWeekStart(baseDate).getTime();
  return Math.round((fromWeekStart - baseWeekStart) / MILLISECONDS_PER_WEEK);
};

const monthYearFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
});

const ariaDateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

export function CalendarPicker({ selectedDate, onDateSelect, className }: CalendarPickerProps) {
  const today = useMemo(() => normalizeDate(new Date()), []);
  const normalizedSelectedDate = selectedDate ? normalizeDate(selectedDate) : undefined;
  const [internalSelectedDate, setInternalSelectedDate] = useState<Date>(
    normalizedSelectedDate ?? today,
  );
  const [weekOffset, setWeekOffset] = useState<number>(() =>
    getWeekOffset(normalizedSelectedDate ?? today, today),
  );

  const activeSelectedDate = normalizedSelectedDate ?? internalSelectedDate;

  const weekDays = useMemo(() => {
    const weekStart = addDays(getWeekStart(today), weekOffset * 7);
    return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  }, [today, weekOffset]);

  const monthLabelDate = weekDays[3] ?? weekDays[0] ?? today;
  const monthYearLabel = monthYearFormatter.format(monthLabelDate);

  return (
    <section
      aria-label="Calendar day picker"
      className={cn('w-full space-y-3 rounded-xl border border-border bg-card p-3 sm:p-4', className)}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-base font-semibold text-foreground sm:text-lg">{monthYearLabel}</p>
        <div className="flex items-center gap-1">
          <Button
            aria-label="Previous week"
            className="size-8 rounded-full"
            onClick={() => {
              setWeekOffset((current) => current - 1);
            }}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            aria-label="Next week"
            className="size-8 rounded-full"
            onClick={() => {
              setWeekOffset((current) => current + 1);
            }}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-stretch gap-1 sm:gap-2">
        {weekDays.map((day, index) => {
          const activity = getMockDayActivity(day);
          const hasActivity = activity.hasWorkout || activity.hasMeals;
          const isToday = isSameDay(day, today);
          const isSelected = isSameDay(day, activeSelectedDate);
          const isFuture = day.getTime() > today.getTime();

          return (
            <button
              aria-label={`Select ${ariaDateFormatter.format(day)}`}
              aria-pressed={isSelected}
              className={cn(
                'flex min-w-0 flex-1 cursor-pointer flex-col items-center rounded-lg border px-1 py-2 transition-colors sm:px-2 sm:py-2.5',
                isToday
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-primary-foreground'
                  : 'text-foreground',
                isSelected && !isToday ? 'border-[var(--color-primary)] bg-card' : 'border-transparent',
                !isToday && 'hover:border-border hover:bg-secondary/50',
                isFuture && 'opacity-45',
              )}
              data-date={formatDateKey(day)}
              data-future={isFuture ? 'true' : 'false'}
              data-selected={isSelected ? 'true' : 'false'}
              data-slot="calendar-day"
              data-today={isToday ? 'true' : 'false'}
              key={day.toISOString()}
              onClick={() => {
                setInternalSelectedDate(day);
                onDateSelect?.(new Date(day));
              }}
              type="button"
            >
              <span className="text-[11px] font-medium text-current sm:text-xs">{DAY_NAMES[index]}</span>
              <span className="text-base font-semibold leading-tight text-current sm:text-lg">
                {day.getDate()}
              </span>
              <span
                className={cn(
                  'mt-1 size-1.5 rounded-full',
                  hasActivity ? 'visible' : 'invisible',
                  isToday
                    ? 'bg-primary-foreground'
                    : activity.hasWorkout && activity.hasMeals
                      ? 'bg-[var(--color-primary)]'
                      : activity.hasWorkout
                        ? 'bg-[var(--color-accent-mint)]'
                        : 'bg-[var(--color-accent-pink)]',
                )}
                data-slot="calendar-activity-dot"
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}

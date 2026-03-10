import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { addDays, formatDateKey, getToday, isSameDay } from '@/lib/date';
import { cn } from '@/lib/utils';

type DayCompletion = {
  completedCount: number;
  totalCount: number;
};

type WeeklyHabitDatePickerProps = {
  selectedDate: Date;
  visibleWeekStart: Date;
  completionByDate: Record<string, DayCompletion>;
  onDateSelect: (date: Date) => void;
  onWeekChange: (weekStart: Date) => void;
};

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

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

function getCompletionTone(completion: DayCompletion | undefined) {
  if (!completion || completion.totalCount <= 0 || completion.completedCount <= 0) {
    return 'bg-slate-400 dark:bg-slate-500';
  }

  if (completion.completedCount >= completion.totalCount) {
    return 'bg-emerald-500';
  }

  return 'bg-amber-500';
}

function getCompletionLabel(completion: DayCompletion | undefined) {
  const completedCount = completion?.completedCount ?? 0;
  const totalCount = completion?.totalCount ?? 0;

  return `${completedCount}/${totalCount}`;
}

export function WeeklyHabitDatePicker({
  selectedDate,
  visibleWeekStart,
  completionByDate,
  onDateSelect,
  onWeekChange,
}: WeeklyHabitDatePickerProps) {
  const today = getToday();

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => addDays(visibleWeekStart, index));
  }, [visibleWeekStart]);

  const monthLabelDate = weekDays[3] ?? weekDays[0] ?? today;

  return (
    <section
      aria-label="Habit date picker"
      className="w-full space-y-3 rounded-xl border border-border bg-card p-3 sm:p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-base font-semibold text-foreground sm:text-lg">
          {monthYearFormatter.format(monthLabelDate)}
        </p>
        <div className="flex items-center gap-1">
          <Button
            aria-label="Previous week"
            className="size-8 rounded-full"
            onClick={() => {
              onWeekChange(addDays(visibleWeekStart, -7));
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
              onWeekChange(addDays(visibleWeekStart, 7));
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
          const dayKey = formatDateKey(day);
          const completion = completionByDate[dayKey];
          const isToday = isSameDay(day, today);
          const isSelected = isSameDay(day, selectedDate);

          return (
            <button
              aria-label={`Select ${ariaDateFormatter.format(day)}`}
              aria-pressed={isSelected}
              className={cn(
                'flex min-w-0 flex-1 cursor-pointer flex-col items-center rounded-lg border px-1 py-2 transition-colors sm:px-2 sm:py-2.5',
                isSelected
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-on-accent)]'
                  : 'border-transparent text-foreground hover:border-border hover:bg-secondary/50',
              )}
              data-date={dayKey}
              data-selected={isSelected ? 'true' : 'false'}
              data-slot="habit-calendar-day"
              key={dayKey}
              onClick={() => {
                const nextDate = new Date(day);
                onDateSelect(nextDate);
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
                  isSelected ? 'bg-[var(--color-on-accent)]' : getCompletionTone(completion),
                )}
                data-slot="habit-calendar-completion-dot"
              />
              <span className="mt-1 text-[10px] font-medium leading-tight text-current sm:text-[11px]">
                {getCompletionLabel(completion)}
              </span>
              <span className="sr-only">
                {isToday ? 'Today, ' : ''}
                {completion?.completedCount ?? 0} of {completion?.totalCount ?? 0} habits complete
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export type { DayCompletion };

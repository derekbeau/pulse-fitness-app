import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  addDays,
  formatCompactDayLabel,
  isSameDay,
  startOfDay,
} from '@/features/nutrition/lib/nutrition-utils';
import { cn } from '@/lib/utils';

type DateNavBarProps = {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  className?: string;
};

export function DateNavBar({ selectedDate, onDateChange, className }: DateNavBarProps) {
  const normalizedSelectedDate = startOfDay(selectedDate);
  const today = startOfDay(new Date());
  const isAtOrAfterToday = normalizedSelectedDate.getTime() >= today.getTime();
  const isToday = isSameDay(normalizedSelectedDate, today);

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-2xl border border-border/70 bg-card px-3 py-2 shadow-sm',
        className,
      )}
    >
      <Button
        aria-label="Go to previous day"
        size="icon-sm"
        type="button"
        variant="ghost"
        onClick={() => onDateChange(addDays(normalizedSelectedDate, -1))}
      >
        <ChevronLeft aria-hidden="true" />
      </Button>

      <p className="flex-1 text-center text-sm font-semibold text-foreground sm:text-base">
        {formatCompactDayLabel(normalizedSelectedDate)}
      </p>

      {!isToday ? (
        <Button size="sm" type="button" variant="outline" onClick={() => onDateChange(today)}>
          Today
        </Button>
      ) : null}

      <Button
        aria-label="Go to next day"
        className="disabled:opacity-40"
        disabled={isAtOrAfterToday}
        size="icon-sm"
        type="button"
        variant="ghost"
        onClick={() => onDateChange(addDays(normalizedSelectedDate, 1))}
      >
        <ChevronRight aria-hidden="true" />
      </Button>
    </div>
  );
}

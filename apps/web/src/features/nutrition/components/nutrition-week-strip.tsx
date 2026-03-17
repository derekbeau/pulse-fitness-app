import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import type { NutritionWeekSummary } from '@pulse/shared';

import { Button } from '@/components/ui/button';
import { formatDateKey, startOfDay } from '@/features/nutrition/lib/nutrition-utils';
import { cn } from '@/lib/utils';

const DAY_ABBREVIATIONS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

type NutritionWeekStripProps = {
  days: NutritionWeekSummary;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  disableNextWeek?: boolean;
  className?: string;
};

const getIndicatorState = (
  mealCount: number,
  completeness: number,
): 'empty' | 'partial' | 'complete' => {
  if (mealCount <= 0) {
    return 'empty';
  }

  if (completeness >= 1) {
    return 'complete';
  }

  return 'partial';
};

export function NutritionWeekStrip({
  days,
  selectedDate,
  onSelectDate,
  onPreviousWeek,
  onNextWeek,
  disableNextWeek = false,
  className,
}: NutritionWeekStripProps) {
  const selectedDateKey = formatDateKey(selectedDate);

  return (
    <section
      className={cn('rounded-2xl border border-border/70 bg-card px-2 py-2 shadow-sm', className)}
    >
      <div className="flex items-center gap-2">
        <Button
          aria-label="Go to previous week"
          className="rounded-xl border border-border bg-card/95 shadow-sm hover:bg-card"
          size="icon-sm"
          type="button"
          variant="ghost"
          onClick={onPreviousWeek}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </Button>

        <div
          className="grid flex-1 grid-cols-7 gap-2"
          role="list"
          aria-label="Nutrition week summary"
        >
          {days.map((day, index) => {
            const dateNumber = new Date(`${day.date}T12:00:00Z`).getUTCDate();
            const dayLabel = DAY_ABBREVIATIONS[index] ?? '·';
            const isSelected = day.date === selectedDateKey;
            const indicatorState = getIndicatorState(day.mealCount, day.completeness);
            const progress = day.completeness;

            return (
              <div key={day.date} role="listitem">
                <button
                  aria-label={`Select ${day.date}`}
                  className={cn(
                    'flex w-full min-w-0 cursor-pointer flex-col items-center gap-1 rounded-xl px-2 py-2 transition-colors',
                    isSelected
                      ? 'bg-primary/15 text-primary shadow-[0_0_12px_-2px] shadow-primary/20 ring-1 ring-primary/20'
                      : 'border border-transparent text-muted-foreground/70 hover:text-foreground',
                  )}
                  data-selected={isSelected ? 'true' : 'false'}
                  type="button"
                  // Intentionally local time; nutrition page date state and keys are local-day based.
                  onClick={() => onSelectDate(startOfDay(new Date(`${day.date}T00:00:00`)))}
                >
                  <span className="text-[0.65rem] font-semibold uppercase tracking-[0.14em]">
                    {dayLabel}
                  </span>
                  <span className="text-sm font-semibold tabular-nums">{dateNumber}</span>
                  <span
                    aria-label={`Completeness ${indicatorState} for ${day.date}`}
                    className="flex h-5 w-5 items-center justify-center"
                    data-state={indicatorState}
                  >
                    {indicatorState === 'empty' ? (
                      <span
                        className={cn(
                          'h-3 w-3 rounded-full bg-transparent',
                          isSelected ? 'border border-primary/60' : 'border border-border/80',
                        )}
                      />
                    ) : null}
                    {indicatorState === 'partial' ? (
                      <span
                        className={cn(
                          'h-3 w-3 rounded-full',
                          isSelected ? 'border border-primary/60' : 'border border-accent/45',
                        )}
                        style={{
                          background: isSelected
                            ? `conic-gradient(from 0deg, var(--color-primary) ${Math.round(progress * 360)}deg, transparent 0deg)`
                            : `conic-gradient(from 0deg, var(--color-accent) ${Math.round(progress * 360)}deg, transparent 0deg)`,
                        }}
                      />
                    ) : null}
                    {indicatorState === 'complete' ? (
                      <span
                        className={cn(
                          'flex h-3 w-3 items-center justify-center rounded-full',
                          isSelected
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-accent text-accent-foreground',
                        )}
                      >
                        <Check aria-hidden="true" className="size-2.5" />
                      </span>
                    ) : null}
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        <Button
          aria-label="Go to next week"
          className="rounded-xl border border-border bg-card/95 shadow-sm hover:bg-card disabled:opacity-40"
          disabled={disableNextWeek}
          size="icon-sm"
          type="button"
          variant="ghost"
          onClick={onNextWeek}
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </section>
  );
}

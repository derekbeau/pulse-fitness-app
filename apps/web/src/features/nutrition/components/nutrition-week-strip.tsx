import { Check } from 'lucide-react';
import type { NutritionWeekSummary } from '@pulse/shared';

import { formatDateKey, startOfDay } from '@/features/nutrition/lib/nutrition-utils';
import { cn } from '@/lib/utils';

const DAY_ABBREVIATIONS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

type NutritionWeekStripProps = {
  days: NutritionWeekSummary;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
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
  className,
}: NutritionWeekStripProps) {
  const selectedDateKey = formatDateKey(selectedDate);

  return (
    <section
      className={cn('rounded-2xl border border-border/70 bg-card px-2 py-2 shadow-sm', className)}
    >
      <div className="grid grid-cols-7 gap-1" role="list" aria-label="Nutrition week summary">
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
                  'flex w-full min-w-0 flex-col items-center gap-1 rounded-xl px-2 py-2 transition-colors',
                  isSelected
                    ? 'bg-accent text-accent-foreground ring-1 ring-accent-foreground/20'
                    : 'text-muted hover:bg-muted/70 hover:text-foreground',
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
                    <span className="h-3 w-3 rounded-full border border-border/80 bg-transparent" />
                  ) : null}
                  {indicatorState === 'partial' ? (
                    <span
                      className="h-3 w-3 rounded-full border border-accent/45"
                      style={{
                        background: `conic-gradient(from 0deg, var(--color-accent) ${Math.round(progress * 360)}deg, transparent 0deg)`,
                      }}
                    />
                  ) : null}
                  {indicatorState === 'complete' ? (
                    <span className="flex h-3 w-3 items-center justify-center rounded-full bg-accent text-accent-foreground">
                      <Check aria-hidden="true" className="size-2.5" />
                    </span>
                  ) : null}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

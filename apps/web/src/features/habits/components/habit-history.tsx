import type { CSSProperties } from 'react';
import { Fragment, useMemo } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { defaultHabitConfigs } from '@/features/habits/lib/habit-constants';
import type { HabitConfig } from '@/features/habits/types';
import { cn } from '@/lib/utils';

const HISTORY_DAYS = 90;
const CELL_SIZE_PX = 14;
const CELL_GAP_PX = 4;
const LABEL_COLUMN_WIDTH_PX = 176;

type HabitHistoryValue = boolean | number;

type HabitHistoryEntry = {
  completionPercent: number;
  date: Date;
  isComplete: boolean;
  tooltipLabel: string;
  value: HabitHistoryValue;
};

type HabitHistoryRow = HabitConfig & {
  history: HabitHistoryEntry[];
  streakCount: number;
};

const monthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
});

const tooltipDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
});

function clampPercent(percent: number) {
  return Math.max(0, Math.min(percent, 100));
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function createHistoryDate(baseDate: Date, daysAgo: number) {
  const nextDate = new Date(baseDate);

  nextDate.setHours(12, 0, 0, 0);
  nextDate.setDate(baseDate.getDate() - daysAgo);

  return nextDate;
}

function getLastNDays(count: number, baseDate: Date) {
  return Array.from({ length: count }, (_, index) =>
    createHistoryDate(baseDate, count - index - 1),
  );
}

function getCompletionPercent(habit: HabitConfig, value: HabitHistoryValue) {
  if (habit.trackingType === 'boolean') {
    return value === true ? 100 : 0;
  }

  if (habit.target === null || habit.target <= 0 || typeof value !== 'number') {
    return 0;
  }

  return clampPercent((value / habit.target) * 100);
}

function isEntryComplete(habit: HabitConfig, value: HabitHistoryValue) {
  if (habit.trackingType === 'boolean') {
    return value === true;
  }

  return typeof value === 'number' && habit.target !== null && value >= habit.target;
}

function getBooleanValue(habitId: string, daysAgo: number) {
  switch (habitId) {
    case 'vitamins':
      if (daysAgo <= 3) {
        return true;
      }

      if (daysAgo === 4) {
        return false;
      }

      return [true, false, true, true, true, false, true][daysAgo % 7];
    case 'mobility':
      if (daysAgo === 0) {
        return false;
      }

      return [true, true, false, true, false, true][daysAgo % 6];
    default:
      return [true, false, true, true, false][daysAgo % 5];
  }
}

function getNumericValue(habitId: string, daysAgo: number) {
  switch (habitId) {
    case 'hydrate':
      if (daysAgo === 0) {
        return 8;
      }

      if (daysAgo === 1) {
        return 9;
      }

      if (daysAgo === 2) {
        return 8;
      }

      if (daysAgo === 3) {
        return 6;
      }

      return [5, 7, 8, 9, 6, 8, 4, 10, 7, 8, 6, 9][daysAgo % 12];
    case 'protein':
      if (daysAgo === 0) {
        return 110;
      }

      if (daysAgo === 1) {
        return 125;
      }

      if (daysAgo === 2) {
        return 130;
      }

      if (daysAgo === 3) {
        return 118;
      }

      return [95, 100, 120, 140, 110, 125, 90, 130][daysAgo % 8];
    default:
      return [1, 2, 3, 4, 2, 3][daysAgo % 6];
  }
}

function getTimeValue(habitId: string, daysAgo: number) {
  switch (habitId) {
    case 'sleep':
      if (daysAgo <= 6) {
        return [8.25, 8, 9, 8.5, 8.25, 8, 8.75][daysAgo];
      }

      if (daysAgo === 7) {
        return 7.5;
      }

      return [7.25, 8, 8.5, 6.5, 9, 7.75, 8][daysAgo % 7];
    default:
      return [0.5, 1, 1.25, 0.75, 1.5][daysAgo % 5];
  }
}

function getMockHistoryValue(habit: HabitConfig, daysAgo: number) {
  switch (habit.trackingType) {
    case 'boolean':
      return getBooleanValue(habit.id, daysAgo);
    case 'numeric':
      return getNumericValue(habit.id, daysAgo);
    case 'time':
      return getTimeValue(habit.id, daysAgo);
  }
}

function getTooltipLabel(habit: HabitConfig, date: Date, value: HabitHistoryValue) {
  const formattedDate = tooltipDateFormatter.format(date);

  if (habit.trackingType === 'boolean') {
    return `${formattedDate} - ${value === true ? 'Completed' : 'Not completed'}`;
  }

  return `${formattedDate} - ${formatNumber(Number(value))}/${formatNumber(habit.target ?? 0)} ${habit.unit}`;
}

function getCurrentStreakCount(history: HabitHistoryEntry[]) {
  let streakCount = 0;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (!history[index]?.isComplete) {
      break;
    }

    streakCount += 1;
  }

  return streakCount;
}

function buildHabitHistoryRows(baseDate: Date) {
  return defaultHabitConfigs.map<HabitHistoryRow>((habit) => {
    const history = getLastNDays(HISTORY_DAYS, baseDate).map((date, index, dates) => {
      const daysAgo = dates.length - index - 1;
      const value = getMockHistoryValue(habit, daysAgo);
      const completionPercent = getCompletionPercent(habit, value);
      const isComplete = isEntryComplete(habit, value);

      return {
        completionPercent,
        date,
        isComplete,
        tooltipLabel: getTooltipLabel(habit, date, value),
        value,
      };
    });

    return {
      ...habit,
      history,
      streakCount: getCurrentStreakCount(history),
    };
  });
}

function getMonthMarkers(dates: Date[]) {
  return dates.reduce<Array<{ index: number; label: string }>>((markers, date, index) => {
    const previousDate = dates[index - 1];

    if (!previousDate || previousDate.getMonth() !== date.getMonth()) {
      markers.push({
        index,
        label: monthFormatter.format(date),
      });
    }

    return markers;
  }, []);
}

function getProgressCellColor(percent: number) {
  return `color-mix(in srgb, #10b981 ${Math.round(clampPercent(percent))}%, var(--color-border))`;
}

function getCellPresentation(habit: HabitConfig, entry: HabitHistoryEntry) {
  if (habit.trackingType === 'boolean') {
    return {
      className: entry.isComplete
        ? 'border-emerald-700/20 bg-emerald-500'
        : 'border-slate-400/50 bg-slate-300/70 dark:border-slate-600/60 dark:bg-slate-600/45',
      style: undefined,
    };
  }

  return {
    className: 'border-black/5 dark:border-white/10',
    style: {
      backgroundColor: getProgressCellColor(entry.completionPercent),
    } satisfies CSSProperties,
  };
}

function getHistoryGridStyle(dayCount: number) {
  return {
    gridTemplateColumns: `repeat(${dayCount}, ${CELL_SIZE_PX}px)`,
  } satisfies CSSProperties;
}

function getGridWidth(dayCount: number) {
  return dayCount * CELL_SIZE_PX + (dayCount - 1) * CELL_GAP_PX;
}

export function HabitHistory() {
  const historyRows = useMemo(() => buildHabitHistoryRows(new Date()), []);
  const historyDates = historyRows[0]?.history.map((entry) => entry.date) ?? [];
  const monthMarkers = getMonthMarkers(historyDates);
  const gridWidth = getGridWidth(historyDates.length);

  return (
    <Card className="gap-5 border-border/70 shadow-sm">
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Habit history
            </p>
            <CardTitle
              aria-level={2}
              className="text-2xl font-semibold text-foreground"
              role="heading"
            >
              Last 90 days
            </CardTitle>
            <CardDescription className="max-w-2xl">
              Scan streaks across every habit, compare quiet misses against stronger runs, and hover
              any day for the exact value that was logged.
            </CardDescription>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="inline-flex rounded-full bg-[var(--color-accent-pink)] px-3 py-1 text-xs font-semibold text-on-pink dark:bg-pink-500/20 dark:text-pink-400">
              Boolean habits: gray or green
            </span>
            <span className="inline-flex rounded-full bg-[var(--color-accent-cream)] px-3 py-1 text-xs font-semibold text-on-cream dark:bg-amber-500/20 dark:text-amber-400">
              Numeric/time habits: intensity by target %
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="overflow-x-auto pb-2">
          <div className="min-w-max rounded-3xl border border-border/70 bg-card/40 p-4">
            <div
              className="grid gap-x-4 gap-y-3"
              style={{
                gridTemplateColumns: `${LABEL_COLUMN_WIDTH_PX}px max-content`,
              }}
            >
              <div className="sticky left-0 z-20 rounded-2xl bg-card/95 px-3 py-2 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Newest on the right
                </p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  Current streaks update from today&apos;s cell backward.
                </p>
              </div>

              <div className="relative h-10" style={{ width: gridWidth }}>
                {monthMarkers.map((marker) => (
                  <span
                    key={`${marker.label}-${marker.index}`}
                    className="absolute top-0 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground"
                    style={{
                      left: marker.index * (CELL_SIZE_PX + CELL_GAP_PX),
                    }}
                  >
                    {marker.label}
                  </span>
                ))}
              </div>

              <TooltipProvider>
                {historyRows.map((habit) => (
                  <Fragment key={habit.id}>
                    <div className="sticky left-0 z-10 flex items-center rounded-2xl bg-card/95 px-3 py-3 shadow-sm">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">
                          <span aria-hidden="true" className="mr-2 text-base">
                            {habit.emoji}
                          </span>
                          {habit.name}
                        </p>
                        <p
                          className="text-xs font-medium text-muted-foreground"
                          data-testid={`habit-streak-${habit.id}`}
                        >
                          {habit.streakCount}-day streak
                        </p>
                      </div>
                    </div>

                    <div
                      aria-label={`${habit.name} history`}
                      className="grid gap-1"
                      style={getHistoryGridStyle(habit.history.length)}
                    >
                      {habit.history.map((entry) => {
                        const presentation = getCellPresentation(habit, entry);

                        return (
                          <Tooltip key={`${habit.id}-${entry.date.toISOString()}`}>
                            <TooltipTrigger asChild>
                              <button
                                aria-label={`${habit.name}: ${entry.tooltipLabel}`}
                                className={cn(
                                  'size-3.5 cursor-pointer rounded-[4px] border transition-transform duration-150 hover:scale-110 focus-visible:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                                  presentation.className,
                                )}
                                data-percent={Math.round(entry.completionPercent)}
                                data-testid="habit-history-cell"
                                style={presentation.style}
                                title={entry.tooltipLabel}
                                type="button"
                              />
                            </TooltipTrigger>
                            <TooltipContent side="top" sideOffset={8}>
                              {entry.tooltipLabel}
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  </Fragment>
                ))}
              </TooltipProvider>
            </div>
          </div>
        </div>

        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Day cells stay compact so the full 90-day run fits inside one scrollable lane.
        </p>
      </CardContent>
    </Card>
  );
}

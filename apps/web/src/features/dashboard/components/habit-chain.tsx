import {
  isHabitScheduledForDate,
  type Habit as HabitRecord,
  type HabitEntry as HabitEntryRecord,
} from '@pulse/shared';
import { useState } from 'react';
import { Flame } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DashboardDrilldownLink,
  dashboardDrilldownCardClassName,
} from '@/features/dashboard/components/dashboard-drilldown-link';
import { HabitDayModal } from '@/features/habits/components/habit-day-modal';
import { addDays, formatDateKey, getToday, toDateKey } from '@/lib/date';
import { cn } from '@/lib/utils';

type HabitChainProps = {
  habitIds?: string[];
  habits?: HabitRecord[];
  entries?: HabitEntryRecord[];
  endDate?: string;
};

type HabitChainEntry = {
  date: string;
  entry: HabitEntryRecord | null;
  isFutureDate: boolean;
  isScheduled: boolean;
  status: 'completed' | 'missed' | 'not_scheduled';
};

type HabitChainHabit = {
  currentStreak: number;
  entries: HabitChainEntry[];
  habit: HabitRecord;
  id: string;
  name: string;
};

const DAYS_TO_DISPLAY = 30;

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const formatDateLabel = (date: string): string => {
  return dateFormatter.format(new Date(`${date}T00:00:00`));
};

const getCurrentStreak = (entries: HabitChainEntry[]) => {
  let streak = 0;

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];

    if (!entry) {
      continue;
    }

    if (entry.status === 'missed') {
      break;
    }

    if (entry.status === 'completed') {
      streak += 1;
    }
  }

  return streak;
};

const getVisibleHabits = (habits: HabitChainHabit[], habitIds?: string[]) => {
  if (!habitIds) {
    return habits;
  }

  const allowedIds = new Set(habitIds);
  return habits.filter((habit) => allowedIds.has(habit.id));
};

const buildHabitChainHabits = (
  habits: HabitRecord[],
  entries: HabitEntryRecord[],
  endDate: string,
): HabitChainHabit[] => {
  const entriesByHabit = new Map<string, HabitEntryRecord[]>();
  const entriesByHabitByDate = new Map<string, Map<string, HabitEntryRecord>>();

  entries.forEach((entry) => {
    const existingEntries = entriesByHabit.get(entry.habitId) ?? [];
    existingEntries.push(entry);
    entriesByHabit.set(entry.habitId, existingEntries);

    const entriesByDate =
      entriesByHabitByDate.get(entry.habitId) ?? new Map<string, HabitEntryRecord>();
    entriesByDate.set(entry.date, entry);
    entriesByHabitByDate.set(entry.habitId, entriesByDate);
  });

  const rangeEndDate = new Date(`${endDate}T00:00:00`);
  const todayKey = formatDateKey(getToday());
  const dates = Array.from({ length: DAYS_TO_DISPLAY }, (_, index) =>
    toDateKey(addDays(rangeEndDate, index - (DAYS_TO_DISPLAY - 1))),
  );

  return habits.map((habit) => {
    const entriesByDate =
      entriesByHabitByDate.get(habit.id) ?? new Map<string, HabitEntryRecord>();
    const entriesForHabit = entriesByHabit.get(habit.id) ?? [];
    const createdAtDateKey = toDateKey(new Date(habit.createdAt));
    const chainEntries = dates.map((date) => {
      const isFutureDate = date > todayKey;
      const existingEntry = entriesByDate.get(date) ?? null;

      if (date < createdAtDateKey || isFutureDate) {
        return {
          date,
          entry: existingEntry,
          isFutureDate,
          isScheduled: false,
          status: 'not_scheduled' as const,
        };
      }

      const isScheduled = isHabitScheduledForDate(habit, date, entriesForHabit);

      if (!isScheduled) {
        return {
          date,
          entry: existingEntry,
          isFutureDate: false,
          isScheduled,
          status: 'not_scheduled' as const,
        };
      }

      if (existingEntry?.completed === true) {
        return {
          date,
          entry: existingEntry,
          isFutureDate: false,
          isScheduled,
          status: 'completed' as const,
        };
      }

      if (date === todayKey) {
        return {
          date,
          entry: existingEntry,
          isFutureDate: false,
          isScheduled,
          // Scheduled-but-unlogged today stays neutral so the chain does not penalize the user
          // before the day is over. Consumers can inspect isScheduled/isFutureDate for detail.
          status: 'not_scheduled' as const,
        };
      }

      return {
        date,
        entry: existingEntry,
        isFutureDate: false,
        isScheduled,
        status: 'missed' as const,
      };
    });

    return {
      currentStreak: getCurrentStreak(chainEntries),
      entries: chainEntries,
      habit,
      id: habit.id,
      name: habit.name,
    };
  });
};

export function HabitChain({ habitIds, habits = [], entries = [], endDate }: HabitChainProps) {
  const [selectedDay, setSelectedDay] = useState<{
    entry: HabitChainEntry;
    habit: HabitRecord;
  } | null>(null);
  const selectedDateKey = endDate ?? formatDateKey(getToday());
  const resolvedHabits = buildHabitChainHabits(habits, entries, selectedDateKey);
  const visibleHabits = getVisibleHabits(resolvedHabits, habitIds);

  if (visibleHabits.length === 0) {
    return <p className="text-sm text-muted">No matching habits.</p>;
  }

  return (
    <>
      <section aria-label="Habit chains" className="space-y-2.5">
        <TooltipProvider>
          {visibleHabits.map((habit) => (
            <DashboardDrilldownLink
              indicatorClassName="right-3 bottom-3"
              key={habit.id}
              to="/habits"
              viewLabel={`View ${habit.name} habit details`}
            >
              <Card className={cn('gap-2 px-3 py-2.5', dashboardDrilldownCardClassName)}>
                <CardContent className="space-y-2 px-0">
                  <div className="flex items-start justify-between gap-3 pr-14">
                    <h2 className="text-sm leading-tight font-semibold text-foreground">
                      {habit.name}
                    </h2>
                    <p
                      className="inline-flex items-center gap-1 text-xs font-semibold text-foreground sm:text-sm"
                      data-slot="habit-chain-streak"
                    >
                      <Flame aria-hidden className="size-3.5 text-[var(--color-accent-pink)]" />
                      <span className="text-sm leading-none sm:text-base">{`${habit.currentStreak} day streak`}</span>
                    </p>
                  </div>

                  <div
                    className="grid grid-cols-7 gap-1.5 pr-14 sm:grid-cols-10"
                    data-slot="habit-chain-grid"
                  >
                    {habit.entries.map((entry) => {
                      const isSelectedDay = entry.date === selectedDateKey;
                      const statusLabel =
                        entry.status === 'completed'
                          ? 'Completed'
                          : entry.status === 'missed'
                            ? 'Missed'
                            : entry.isFutureDate
                              ? 'Future'
                              : entry.isScheduled
                                ? 'Not tracked'
                                : 'Not scheduled';
                      const statusClass =
                        entry.status === 'completed'
                          ? 'bg-[var(--color-accent-mint)]'
                          : entry.status === 'missed'
                            ? 'bg-red-400/70 dark:bg-red-500/50'
                            : 'bg-[var(--color-muted)]/40';

                      return (
                        <Tooltip key={`${habit.id}-${entry.date}`}>
                          <TooltipTrigger asChild>
                            <button
                              aria-label={`${habit.name} ${entry.date} ${statusLabel}`}
                              className={cn(
                                'relative z-20 size-8 min-h-8 min-w-8 justify-self-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55 sm:size-11 sm:min-h-11 sm:min-w-11',
                                statusClass,
                                isSelectedDay
                                  ? 'border-[var(--color-primary)]'
                                  : 'border-transparent',
                              )}
                              data-date={entry.date}
                              data-status={entry.status}
                              data-slot="habit-chain-day"
                              data-today={isSelectedDay ? 'true' : 'false'}
                              disabled={entry.isFutureDate}
                              onClick={() => {
                                setSelectedDay({
                                  entry,
                                  habit: habit.habit,
                                });
                              }}
                              title={`${formatDateLabel(entry.date)} — ${statusLabel}`}
                              type="button"
                            />
                          </TooltipTrigger>
                          <TooltipContent side="top" sideOffset={6}>
                            <p>{formatDateLabel(entry.date)}</p>
                            <p className="text-xs text-muted-foreground">{statusLabel}</p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </DashboardDrilldownLink>
          ))}
        </TooltipProvider>
      </section>

      {selectedDay ? (
        <HabitDayModal
          date={selectedDay.entry.date}
          entry={selectedDay.entry.entry}
          habit={selectedDay.habit}
          isOpen
          isScheduled={selectedDay.entry.isScheduled}
          key={`${selectedDay.habit.id}-${selectedDay.entry.date}-${selectedDay.entry.entry?.id ?? 'new'}`}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedDay(null);
            }
          }}
          status={selectedDay.entry.status}
        />
      ) : null}
    </>
  );
}

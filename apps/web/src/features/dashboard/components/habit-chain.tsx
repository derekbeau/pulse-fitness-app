import type { Habit as HabitRecord, HabitEntry as HabitEntryRecord } from '@pulse/shared';
import { Flame } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { addDays, formatDateKey, getToday, toDateKey } from '@/lib/date';
import { cn } from '@/lib/utils';

type HabitChainProps = {
  habitIds?: string[];
  habits?: HabitRecord[];
  entries?: HabitEntryRecord[];
  endDate?: string;
};

type HabitChainEntry = {
  completed: boolean;
  date: string;
};

type HabitChainHabit = {
  currentStreak: number;
  entries: HabitChainEntry[];
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
    if (!entries[index]?.completed) {
      break;
    }

    streak += 1;
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
  const entriesByHabit = new Map<string, Map<string, boolean>>();

  entries.forEach((entry) => {
    const entriesByDate = entriesByHabit.get(entry.habitId) ?? new Map<string, boolean>();
    entriesByDate.set(entry.date, entry.completed);
    entriesByHabit.set(entry.habitId, entriesByDate);
  });

  const rangeEndDate = new Date(`${endDate}T00:00:00`);
  const dates = Array.from({ length: DAYS_TO_DISPLAY }, (_, index) =>
    toDateKey(addDays(rangeEndDate, index - (DAYS_TO_DISPLAY - 1))),
  );

  return habits.map((habit) => {
    const entriesByDate = entriesByHabit.get(habit.id) ?? new Map<string, boolean>();
    const completedEntries = dates.map((date) => ({
      completed: entriesByDate.get(date) ?? false,
      date,
    }));

    return {
      currentStreak: getCurrentStreak(completedEntries),
      entries: completedEntries,
      id: habit.id,
      name: habit.name,
    };
  });
};

export function HabitChain({ habitIds, habits = [], entries = [], endDate }: HabitChainProps) {
  const selectedDateKey = endDate ?? formatDateKey(getToday());
  const resolvedHabits = buildHabitChainHabits(habits, entries, selectedDateKey);
  const visibleHabits = getVisibleHabits(resolvedHabits, habitIds);

  if (visibleHabits.length === 0) {
    return <p className="text-sm text-muted">No matching habits.</p>;
  }

  return (
    <section aria-label="Habit chains" className="space-y-3">
      <TooltipProvider>
        {visibleHabits.map((habit) => (
          <Card className="gap-2 px-3 py-3" key={habit.id}>
            <CardContent className="space-y-2 px-0">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-sm font-semibold text-foreground">{habit.name}</h2>
                <p
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground"
                  data-slot="habit-chain-streak"
                >
                  <Flame aria-hidden className="size-4 text-[var(--color-accent-pink)]" />
                  <span className="text-base leading-none">{`${habit.currentStreak} day streak`}</span>
                </p>
              </div>

              <div className="grid grid-cols-10 gap-[5px]" data-slot="habit-chain-grid">
                {habit.entries.map((entry) => {
                  const isSelectedDay = entry.date === selectedDateKey;
                  const statusLabel = entry.completed ? 'Completed' : 'Missed';

                  return (
                    <Tooltip key={`${habit.id}-${entry.date}`}>
                      <TooltipTrigger asChild>
                        <button
                          aria-label={`${habit.name} ${entry.date} ${statusLabel}`}
                          className={cn(
                            'aspect-square w-full cursor-pointer rounded-full border',
                            entry.completed
                              ? 'bg-[var(--color-accent-mint)]'
                              : 'bg-[var(--color-muted)]/40',
                            isSelectedDay
                              ? 'border-[var(--color-primary)]'
                              : 'border-transparent',
                          )}
                          data-completed={entry.completed ? 'true' : 'false'}
                          data-date={entry.date}
                          data-slot="habit-chain-day"
                          data-today={isSelectedDay ? 'true' : 'false'}
                          title={formatDateLabel(entry.date)}
                          type="button"
                        />
                      </TooltipTrigger>
                      <TooltipContent side="top" sideOffset={6}>
                        {formatDateLabel(entry.date)}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </TooltipProvider>
    </section>
  );
}

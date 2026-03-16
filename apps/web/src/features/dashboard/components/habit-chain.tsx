import {
  isHabitScheduledForDate,
  type Habit as HabitRecord,
  type HabitEntry as HabitEntryRecord,
} from '@pulse/shared';
import { useState } from 'react';
import { Flame } from 'lucide-react';
import { Link } from 'react-router';

import { Card, CardContent } from '@/components/ui/card';
import { TooltipProvider } from '@/components/ui/tooltip';
import { dashboardDrilldownCardClassName } from '@/features/dashboard/components/dashboard-drilldown-link';
import { HabitChainDot, type HabitDotEntry } from '@/features/habits/components/habit-chain-dot';
import { HabitDayModal } from '@/features/habits/components/habit-day-modal';
import { addDays, formatDateKey, getToday, toDateKey } from '@/lib/date';
import { cn } from '@/lib/utils';

type HabitChainProps = {
  habitIds?: string[];
  habits?: HabitRecord[];
  entries?: HabitEntryRecord[];
  endDate?: string;
};

type HabitChainHabit = {
  currentStreak: number;
  entries: HabitDotEntry[];
  habit: HabitRecord;
  id: string;
  name: string;
};

const DAYS_TO_DISPLAY = 30;

const getCurrentStreak = (entries: HabitDotEntry[]) => {
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

function getCompletionPercent(habit: HabitRecord, entry: HabitEntryRecord | null): number {
  if (habit.trackingType === 'boolean') {
    return entry?.completed === true ? 100 : 0;
  }
  if (habit.target == null || habit.target <= 0) return 0;
  if (typeof entry?.value !== 'number') return 0;
  return Math.min((entry.value / habit.target) * 100, 100);
}

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
    const entriesByDate = entriesByHabitByDate.get(habit.id) ?? new Map<string, HabitEntryRecord>();
    const entriesForHabit = entriesByHabit.get(habit.id) ?? [];
    const createdAtDateKey = toDateKey(new Date(habit.createdAt));
    const chainEntries: HabitDotEntry[] = dates.map((date) => {
      const isFutureDate = date > todayKey;
      const existingEntry = entriesByDate.get(date) ?? null;

      if (date < createdAtDateKey || isFutureDate) {
        return {
          date,
          entry: existingEntry,
          isFutureDate,
          isScheduled: false,
          status: 'not_scheduled' as const,
          completionPercent: 0,
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
          completionPercent: 0,
        };
      }

      if (existingEntry?.completed === true) {
        return {
          date,
          entry: existingEntry,
          isFutureDate: false,
          isScheduled,
          status: 'completed' as const,
          completionPercent: getCompletionPercent(habit, existingEntry),
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
          completionPercent: getCompletionPercent(habit, existingEntry),
        };
      }

      return {
        date,
        entry: existingEntry,
        isFutureDate: false,
        isScheduled,
        status: 'missed' as const,
        completionPercent: getCompletionPercent(habit, existingEntry),
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
    entry: HabitDotEntry;
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
      <section aria-label="Habit chains" className="grid grid-cols-2 gap-2.5">
        <TooltipProvider>
          {visibleHabits.map((habit) => (
            <Card
              className={cn('gap-2 px-3 py-2.5', dashboardDrilldownCardClassName)}
              key={habit.id}
            >
              <CardContent className="space-y-2 px-0">
                <Link
                  className="space-y-0.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  to="/habits"
                >
                  <h2 className="text-sm leading-tight font-semibold text-foreground">
                    {habit.name}
                  </h2>
                  <p
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground"
                    data-slot="habit-chain-streak"
                  >
                    <Flame aria-hidden className="size-3 text-[var(--color-accent-pink)]" />
                    <span>{`${habit.currentStreak} day streak`}</span>
                  </p>
                </Link>

                <div
                  className="grid grid-cols-6 gap-1 sm:grid-cols-10"
                  data-slot="habit-chain-grid"
                >
                  {habit.entries.map((entry) => (
                    <HabitChainDot
                      entry={entry}
                      habit={habit.habit}
                      highlighted={entry.date === selectedDateKey}
                      includeYear
                      key={`${habit.id}-${entry.date}`}
                      onClick={() => {
                        setSelectedDay({ entry, habit: habit.habit });
                      }}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
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

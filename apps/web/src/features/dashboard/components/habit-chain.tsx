import { Flame } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { type Habit, mockHabits } from '@/lib/mock-data/dashboard';
import { cn } from '@/lib/utils';

type HabitChainProps = {
  habitIds?: string[];
};

const DAYS_TO_DISPLAY = 30;

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const getTodayKey = (): string => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.toISOString().slice(0, 10);
};

const formatDateLabel = (date: string): string => {
  return dateFormatter.format(new Date(`${date}T00:00:00`));
};

const getVisibleHabits = (habitIds?: string[]): Habit[] => {
  if (!habitIds || habitIds.length === 0) {
    return mockHabits;
  }

  const allowedIds = new Set(habitIds);
  return mockHabits.filter((habit) => allowedIds.has(habit.id));
};

export function HabitChain({ habitIds }: HabitChainProps) {
  const habits = getVisibleHabits(habitIds);
  const todayKey = getTodayKey();

  if (habits.length === 0) {
    return <p className="text-sm text-muted">No matching habits.</p>;
  }

  return (
    <section aria-label="Habit chains" className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
      <TooltipProvider>
        {habits.map((habit) => {
          const entries = [...habit.entries]
            .sort((first, second) => first.date.localeCompare(second.date))
            .slice(-DAYS_TO_DISPLAY);

          return (
            <Card className="gap-3 px-3 py-3" key={habit.id}>
              <CardContent className="space-y-3 px-0">
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

                <div className="grid grid-cols-6 gap-1.5" data-slot="habit-chain-grid">
                  {entries.map((entry) => {
                    const isToday = entry.date === todayKey;
                    const statusLabel = entry.completed ? 'Completed' : 'Missed';

                    return (
                      <Tooltip key={`${habit.id}-${entry.date}`}>
                        <TooltipTrigger asChild>
                          <button
                            aria-label={`${habit.name} ${entry.date} ${statusLabel}`}
                            className={cn(
                              'size-4 shrink-0 cursor-pointer rounded-sm border',
                              entry.completed
                                ? 'bg-[var(--color-accent-mint)]'
                                : 'bg-[var(--color-muted)]/40',
                              isToday ? 'border-[var(--color-primary)]' : 'border-transparent',
                            )}
                            data-completed={entry.completed ? 'true' : 'false'}
                            data-date={entry.date}
                            data-slot="habit-chain-day"
                            data-today={isToday ? 'true' : 'false'}
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
          );
        })}
      </TooltipProvider>
    </section>
  );
}

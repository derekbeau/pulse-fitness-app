import { useMemo, useState } from 'react';

import { CalendarPicker } from '@/features/dashboard/components/calendar-picker';
import { HabitChain } from '@/features/dashboard/components/habit-chain';
import { MacroRings } from '@/features/dashboard/components/macro-rings';
import { RecentWorkouts } from '@/features/dashboard/components/recent-workouts';
import { SnapshotCards } from '@/features/dashboard/components/snapshot-cards';
import { getDashboardGreeting } from '@/features/dashboard/lib/greeting';
import { TrendSparklines } from '@/features/dashboard/components/trend-sparkline';
import { useHabitEntries, useHabits } from '@/features/habits/api/habits';
import { addDays, getToday, toDateKey } from '@/lib/date';
import { getMockSnapshotForDate } from '@/lib/mock-data/dashboard';

export function DashboardPage() {
  const [selectedDate, setSelectedDate] = useState<Date>(() => getToday());
  const selectedDateKey = toDateKey(selectedDate);
  const today = getToday();
  const todayKey = toDateKey(today);
  const habitRangeStart = toDateKey(addDays(today, -29));
  const greeting = getDashboardGreeting();

  const habitsQuery = useHabits();
  const selectedHabitEntriesQuery = useHabitEntries(selectedDateKey, selectedDateKey);
  const habitChainEntriesQuery = useHabitEntries(habitRangeStart, todayKey);

  const selectedSnapshot = useMemo(() => {
    const baseSnapshot = getMockSnapshotForDate(selectedDate);
    const habits = habitsQuery.data ?? [];
    const entries = selectedHabitEntriesQuery.data ?? [];
    const completedCount = entries.filter((entry) => entry.completed).length;

    return {
      ...baseSnapshot,
      habitsCompleted: completedCount,
      habitsTotal: habits.length,
    };
  }, [habitsQuery.data, selectedDate, selectedHabitEntriesQuery.data]);

  return (
    <main className="flex w-full flex-col gap-8 py-6">
      <header className="animate-fade-in space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted sm:text-sm">
          {greeting}
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
          Dashboard
        </h1>
      </header>

      <div
        className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-[minmax(240px,280px)_minmax(0,1fr)_minmax(280px,320px)]"
        data-slot="dashboard-layout"
      >
        <div
          className="order-1 flex min-w-0 flex-col gap-6 md:order-1 xl:order-2"
          data-slot="dashboard-main-column"
        >
          <div className="order-1 md:order-3" data-slot="dashboard-calendar-panel">
            <CalendarPicker onDateSelect={setSelectedDate} selectedDate={selectedDate} />
          </div>

          <div className="order-2 md:order-1" data-slot="dashboard-snapshot-panel">
            <SnapshotCards snapshot={selectedSnapshot} />
          </div>

          <div className="order-3 md:order-2" data-slot="dashboard-macro-panel">
            <MacroRings snapshot={selectedSnapshot} />
          </div>
        </div>

        <div
          className="order-2 flex min-w-0 flex-col gap-6 md:order-2 xl:order-1"
          data-slot="dashboard-sidebar-column"
        >
          <HabitChain habits={habitsQuery.data ?? []} entries={habitChainEntriesQuery.data ?? []} />
          <TrendSparklines />
        </div>

        <div
          className="order-3 min-w-0 md:col-start-2 xl:col-start-3"
          data-slot="dashboard-recent-workouts-column"
        >
          <RecentWorkouts />
        </div>
      </div>
    </main>
  );
}

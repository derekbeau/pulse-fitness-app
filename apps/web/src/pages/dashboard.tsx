import { useMemo, useState } from 'react';

import { CalendarPicker } from '@/features/dashboard/components/calendar-picker';
import { HabitChain } from '@/features/dashboard/components/habit-chain';
import { MacroRings } from '@/features/dashboard/components/macro-rings';
import { RecentWorkouts } from '@/features/dashboard/components/recent-workouts';
import { SnapshotCards } from '@/features/dashboard/components/snapshot-cards';
import { getDashboardGreeting } from '@/features/dashboard/lib/greeting';
import { TrendSparklines } from '@/features/dashboard/components/trend-sparkline';
import { getToday } from '@/lib/date';
import { getMockSnapshotForDate } from '@/lib/mock-data/dashboard';

export function DashboardPage() {
  const [selectedDate, setSelectedDate] = useState<Date>(() => getToday());
  const selectedSnapshot = useMemo(() => getMockSnapshotForDate(selectedDate), [selectedDate]);
  const greeting = getDashboardGreeting();

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted">{greeting}</p>
        <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          Dashboard
        </h1>
      </header>

      <div
        className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-[280px_1fr_300px]"
        data-slot="dashboard-layout"
      >
        <div
          className="order-1 flex flex-col gap-6 md:order-1 xl:order-2"
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
          className="order-2 flex flex-col gap-6 md:order-2 xl:order-1"
          data-slot="dashboard-sidebar-column"
        >
          <HabitChain />
          <TrendSparklines />
        </div>

        <div
          className="order-3 md:col-start-2 xl:col-start-3"
          data-slot="dashboard-recent-workouts-column"
        >
          <RecentWorkouts />
        </div>
      </div>
    </main>
  );
}

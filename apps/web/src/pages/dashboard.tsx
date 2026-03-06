import { useMemo, useState } from 'react';

import { CalendarPicker } from '@/features/dashboard/components/calendar-picker';
import { DashboardTrendSparklines } from '@/features/dashboard/components/dashboard-trend-sparklines';
import { HabitChain } from '@/features/dashboard/components/habit-chain';
import { MacroRings } from '@/features/dashboard/components/macro-rings';
import { RecentWorkouts } from '@/features/dashboard/components/recent-workouts';
import { SnapshotCards } from '@/features/dashboard/components/snapshot-cards';
import { getToday } from '@/lib/date';
import { getMockSnapshotForDate } from '@/lib/mock-data/dashboard';

export function DashboardPage() {
  const [selectedDate, setSelectedDate] = useState<Date>(() => getToday());
  const selectedSnapshot = useMemo(() => getMockSnapshotForDate(selectedDate), [selectedDate]);

  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-semibold text-primary">Dashboard</h1>
      <CalendarPicker onDateSelect={setSelectedDate} selectedDate={selectedDate} />
      <SnapshotCards snapshot={selectedSnapshot} />
      <DashboardTrendSparklines />
      <RecentWorkouts />
      <MacroRings snapshot={selectedSnapshot} />
      <HabitChain />
    </section>
  );
}

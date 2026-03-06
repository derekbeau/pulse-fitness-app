import { useMemo, useState } from 'react';

import { CalendarPicker } from '@/features/dashboard/components/calendar-picker';
import { HabitChain } from '@/features/dashboard/components/habit-chain';
import { MacroRings } from '@/features/dashboard/components/macro-rings';
import { SnapshotCards } from '@/features/dashboard/components/snapshot-cards';
import { getMockSnapshotForDate } from '@/lib/mock-data/dashboard';

const getToday = (): Date => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

export function DashboardPage() {
  const [selectedDate, setSelectedDate] = useState<Date>(() => getToday());
  const selectedSnapshot = useMemo(() => getMockSnapshotForDate(selectedDate), [selectedDate]);

  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-semibold text-primary">Dashboard</h1>
      <CalendarPicker onDateSelect={setSelectedDate} selectedDate={selectedDate} />
      <SnapshotCards snapshot={selectedSnapshot} />
      <MacroRings snapshot={selectedSnapshot} />
      <HabitChain />
    </section>
  );
}

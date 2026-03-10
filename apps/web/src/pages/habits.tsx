import { DailyHabits, HabitHistory } from '@/features/habits';

export function HabitsPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-semibold text-primary">Habits</h1>
      <p className="max-w-2xl text-sm text-muted">
        Keep today&apos;s routine visible, log progress quickly, and review how each habit has
        trended over the last 90 days.
      </p>
      <DailyHabits />
      <HabitHistory />
    </section>
  );
}

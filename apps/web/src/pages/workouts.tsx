import { WorkoutCalendar } from '@/features/workouts';

export function WorkoutsPage() {
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-primary">Workouts</h1>
        <p className="max-w-2xl text-sm text-muted">
          Review the month at a glance, see which training days are complete, and inspect the
          next session on deck.
        </p>
      </div>

      <WorkoutCalendar buildDayHref={(date) => `/workouts?date=${date}`} />
    </section>
  );
}

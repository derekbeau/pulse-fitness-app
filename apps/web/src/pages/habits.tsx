import { CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router';

import { EmptyState } from '@/components/ui/empty-state';
import { DailyHabits, HabitHistory, HabitSettings } from '@/features/habits';
import { useHabits } from '@/features/habits/api/habits';

export function HabitsPage() {
  const navigate = useNavigate();
  const habitsQuery = useHabits();
  const shouldShowEmptyState =
    !habitsQuery.isLoading && !habitsQuery.isError && (habitsQuery.data?.length ?? 0) === 0;

  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-semibold text-primary">Habits</h1>
      <p className="max-w-2xl text-sm text-muted">
        Keep today&apos;s routine visible, log progress quickly, and review how each habit has
        trended over the last 90 days.
      </p>
      {shouldShowEmptyState ? (
        <EmptyState
          action={{
            label: 'Add Habit',
            onClick: () => navigate('/settings'),
          }}
          description="Tap + to create your first habit."
          icon={CheckCircle}
          title="No habits configured"
        />
      ) : (
        <>
          <DailyHabits />
          <HabitSettings />
          <HabitHistory />
        </>
      )}
    </section>
  );
}

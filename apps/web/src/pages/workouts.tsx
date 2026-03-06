import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { WorkoutCalendar, WorkoutList } from '@/features/workouts';

export function WorkoutsPage() {
  const [activeView, setActiveView] = useState<'calendar' | 'list'>('calendar');

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-primary">Workouts</h1>
        <p className="max-w-2xl text-sm text-muted">
          Switch between the monthly schedule and a weekly history list to review completed
          training sessions.
        </p>
      </div>

      <div
        aria-label="Workout views"
        className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card p-1"
        role="group"
      >
        <Button
          aria-pressed={activeView === 'calendar'}
          onClick={() => setActiveView('calendar')}
          size="sm"
          type="button"
          variant={activeView === 'calendar' ? 'default' : 'ghost'}
        >
          Calendar
        </Button>
        <Button
          aria-pressed={activeView === 'list'}
          onClick={() => setActiveView('list')}
          size="sm"
          type="button"
          variant={activeView === 'list' ? 'default' : 'ghost'}
        >
          List
        </Button>
      </div>

      {activeView === 'calendar' ? (
        <WorkoutCalendar buildDayHref={(date) => `/workouts?date=${date}`} />
      ) : (
        <WorkoutList />
      )}
    </section>
  );
}

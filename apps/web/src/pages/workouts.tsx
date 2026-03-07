import { useState } from 'react';
import { useNavigate } from 'react-router';

import { Button } from '@/components/ui/button';
import {
  ExerciseLibrary,
  TemplateBrowser,
  WorkoutCalendar,
  WorkoutList,
} from '@/features/workouts';

export function WorkoutsPage() {
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState<'calendar' | 'list' | 'templates' | 'exercises'>(
    'calendar',
  );

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-primary">Workouts</h1>
        <p className="max-w-2xl text-sm text-muted">
          Review the schedule, revisit completed sessions, launch saved templates, or browse the
          shared exercise library.
        </p>
      </div>

      <div
        aria-label="Workout views"
        className="inline-flex w-fit items-center gap-1 rounded-full border border-border bg-card p-1"
        role="group"
      >
        <Button
          aria-pressed={activeView === 'calendar'}
          className="rounded-full"
          onClick={() => setActiveView('calendar')}
          size="sm"
          type="button"
          variant={activeView === 'calendar' ? 'default' : 'ghost'}
        >
          Calendar
        </Button>
        <Button
          aria-pressed={activeView === 'list'}
          className="rounded-full"
          onClick={() => setActiveView('list')}
          size="sm"
          type="button"
          variant={activeView === 'list' ? 'default' : 'ghost'}
        >
          List
        </Button>
        <Button
          aria-pressed={activeView === 'templates'}
          className="rounded-full"
          onClick={() => setActiveView('templates')}
          size="sm"
          type="button"
          variant={activeView === 'templates' ? 'default' : 'ghost'}
        >
          Templates
        </Button>
        <Button
          aria-pressed={activeView === 'exercises'}
          className="rounded-full"
          onClick={() => setActiveView('exercises')}
          size="sm"
          type="button"
          variant={activeView === 'exercises' ? 'default' : 'ghost'}
        >
          Exercises
        </Button>
      </div>

      {activeView === 'calendar' ? (
        <WorkoutCalendar
          buildDayHref={(date) => `/workouts?date=${date}`}
          buildSessionHref={(sessionId) => `/workouts/session/${sessionId}`}
        />
      ) : activeView === 'list' ? (
        <WorkoutList buildSessionHref={(sessionId) => `/workouts/session/${sessionId}`} />
      ) : activeView === 'templates' ? (
        <TemplateBrowser
          onStartTemplate={(templateId) => navigate(`/workouts/active?template=${templateId}`)}
        />
      ) : (
        <ExerciseLibrary />
      )}
    </section>
  );
}

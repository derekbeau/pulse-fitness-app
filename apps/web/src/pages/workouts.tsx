import { useState } from 'react';
import { Dumbbell } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';

import { WorkoutCardSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  WORKOUT_SESSION_COMPLETED_NOTICE,
  WORKOUT_SESSION_NOTICE_QUERY_KEY,
} from '@/features/workouts/lib/session-persistence';
import {
  ExerciseLibrary,
  TemplateBrowser,
  WorkoutCalendar,
  WorkoutList,
} from '@/features/workouts';
import { useWorkoutTemplates } from '@/features/workouts/api/workouts';

export function WorkoutsPage() {
  const [activeView, setActiveView] = useState<'calendar' | 'list' | 'templates' | 'exercises'>(
    'calendar',
  );
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const templatesQuery = useWorkoutTemplates();
  const showCompletedSessionNotice =
    searchParams.get(WORKOUT_SESSION_NOTICE_QUERY_KEY) === WORKOUT_SESSION_COMPLETED_NOTICE;
  const shouldShowTemplatesEmptyState =
    !templatesQuery.isLoading &&
    !templatesQuery.isError &&
    (templatesQuery.data?.length ?? 0) === 0;

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-primary">Workouts</h1>
        <p className="max-w-2xl text-sm text-muted">
          Review the schedule, revisit completed sessions, launch saved templates, or browse the
          shared exercise library.
        </p>
      </div>

      {showCompletedSessionNotice ? (
        <p className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground">
          Session was completed on another device.
        </p>
      ) : null}

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
        templatesQuery.isLoading ? (
          <div aria-label="Loading workout templates" className="grid gap-4 xl:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <WorkoutCardSkeleton key={index} />
            ))}
          </div>
        ) : shouldShowTemplatesEmptyState ? (
          <EmptyState
            action={{
              label: 'Create Template',
              onClick: () => navigate('/workouts/active'),
            }}
            description="Create a template or ask your agent to build one."
            icon={Dumbbell}
            title="No workouts yet"
          />
        ) : (
          <TemplateBrowser
            buildTemplateHref={(templateId) => `/workouts/template/${templateId}`}
            templates={templatesQuery.data ?? undefined}
          />
        )
      ) : (
        <ExerciseLibrary />
      )}
    </section>
  );
}

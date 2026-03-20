import { useQueryClient } from '@tanstack/react-query';
import type { WorkoutSessionStatus } from '@pulse/shared';
import { useEffect, useState } from 'react';
import { Dumbbell, X } from 'lucide-react';
import { useSearchParams } from 'react-router';

import { WorkoutCardSkeleton } from '@/components/skeletons';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { HelpIcon } from '@/components/ui/help-icon';
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
import {
  prefetchWorkoutTemplate,
  useCompletedSessions,
  useWorkoutTemplates,
} from '@/features/workouts/api/workouts';

const WORKOUT_VIEWS = ['calendar', 'list', 'templates', 'exercises'] as const;
const WORKOUTS_ONBOARDING_DISMISSED_KEY = 'pulse.workouts.onboarding.dismissed';
type WorkoutView = (typeof WORKOUT_VIEWS)[number];

function isWorkoutView(value: string | null): value is WorkoutView {
  return value != null && WORKOUT_VIEWS.includes(value as WorkoutView);
}

export function WorkoutsPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    try {
      return window.localStorage.getItem(WORKOUTS_ONBOARDING_DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const viewParam = searchParams.get('view');
  const activeView: WorkoutView = isWorkoutView(viewParam) ? viewParam : 'calendar';
  const templatesQuery = useWorkoutTemplates();
  const completedSessionsQuery = useCompletedSessions();
  const showCompletedSessionNotice =
    searchParams.get(WORKOUT_SESSION_NOTICE_QUERY_KEY) === WORKOUT_SESSION_COMPLETED_NOTICE;
  const shouldShowTemplatesEmptyState =
    !templatesQuery.isLoading &&
    !templatesQuery.isError &&
    (templatesQuery.data?.length ?? 0) === 0;
  const shouldShowOnboardingCard =
    !onboardingDismissed &&
    !completedSessionsQuery.isLoading &&
    !completedSessionsQuery.isError &&
    (completedSessionsQuery.data?.length ?? 0) === 0;

  useEffect(() => {
    if (isWorkoutView(viewParam)) {
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set('view', 'calendar');
    setSearchParams(nextSearchParams, { replace: true });
  }, [searchParams, setSearchParams, viewParam]);

  useEffect(() => {
    if (activeView !== 'list') {
      return;
    }

    const topTemplateIds = (templatesQuery.data ?? []).slice(0, 3).map((template) => template.id);
    for (const templateId of topTemplateIds) {
      void prefetchWorkoutTemplate(queryClient, templateId);
    }
  }, [activeView, queryClient, templatesQuery.data]);

  function setActiveView(view: WorkoutView) {
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set('view', view);
    setSearchParams(nextSearchParams);
  }

  function buildSessionHref(sessionId: string, status?: WorkoutSessionStatus) {
    const sessionSearchParams = new URLSearchParams();
    sessionSearchParams.set('view', activeView);

    if (status === 'in-progress' || status === 'paused') {
      sessionSearchParams.set('sessionId', sessionId);
      return `/workouts/active?${sessionSearchParams.toString()}`;
    }

    return `/workouts/session/${sessionId}?${sessionSearchParams.toString()}`;
  }

  function dismissOnboardingCard() {
    setOnboardingDismissed(true);
    try {
      window.localStorage.setItem(WORKOUTS_ONBOARDING_DISMISSED_KEY, '1');
    } catch {
      // Ignore localStorage failures and keep the UI responsive.
    }
  }

  return (
    <section className="space-y-6">
      <PageHeader
        actions={
          <HelpIcon title="Workouts help">
            <p>
              Pulse workouts follow a Templates {'>'} Sessions {'>'} Sets flow.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Start a workout from Templates, then log each exercise set during the session.
              </li>
              <li>
                Active sessions are saved in localStorage so you can recover if the app closes.
              </li>
              <li>
                Pause to stop active timing, resume when ready, or cancel if you need to end early.
              </li>
              <li>
                Scheduled workouts appear in Calendar and can be used to plan upcoming sessions.
              </li>
            </ul>
          </HelpIcon>
        }
        title="Workouts"
      />

      {shouldShowOnboardingCard ? (
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">How workouts flow in Pulse</h2>
              <p className="text-sm text-muted">
                Ask your agent to create a template, then start a session and log sets as you go.
              </p>
            </div>
            <Button
              aria-label="Dismiss workouts onboarding"
              className="h-8 w-8 rounded-full"
              onClick={dismissOnboardingCard}
              size="icon"
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" className="size-4" />
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={() => setActiveView('templates')}
              size="sm"
              type="button"
              variant="secondary"
            >
              Browse templates
            </Button>
          </div>
        </div>
      ) : null}

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
          buildDayHref={(date) => `/workouts?view=templates&date=${date}`}
          buildSessionHref={buildSessionHref}
        />
      ) : activeView === 'list' ? (
        <WorkoutList buildSessionHref={buildSessionHref} />
      ) : activeView === 'templates' ? (
        templatesQuery.isLoading ? (
          <div aria-label="Loading workout templates" className="grid gap-4 xl:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <WorkoutCardSkeleton key={index} />
            ))}
          </div>
        ) : shouldShowTemplatesEmptyState ? (
          <EmptyState
            description="Ask your agent to build a template, then start a session from it."
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

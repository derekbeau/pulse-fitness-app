import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ScheduledWorkoutListItem, WorkoutSessionListItem } from '@pulse/shared';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { API_TOKEN_STORAGE_KEY } from '@/lib/api-client';
import { renderWithQueryClient } from '@/test/render-with-query-client';
import { jsonResponse } from '@/test/test-utils';

import { WorkoutList } from './workout-list';

vi.mock('./schedule-workout-dialog', () => ({
  ScheduleWorkoutDialog: ({
    onRemove,
    onSubmitDate,
    open,
  }: {
    onRemove?: () => Promise<unknown>;
    onSubmitDate: (dateKey: string) => Promise<unknown>;
    open: boolean;
  }) =>
    open ? (
      <div>
        <button onClick={() => void onSubmitDate('2026-03-20')} type="button">
          Submit reschedule
        </button>
        {onRemove ? (
          <button onClick={() => void onRemove()} type="button">
            Remove from schedule
          </button>
        ) : null}
      </div>
    ) : null,
}));

const dateAuthorityMocks = vi.hoisted(() => {
  let mutationDate: string | null = '2026-03-12';

  return {
    setMutationDate: (value: string | null) => {
      mutationDate = value;
    },
    state: {
      dateAuthorityLocked: false,
      getTodayKeyForMutation: () => mutationDate,
      todayKey: '2026-03-12' as string | null,
    },
  };
});

vi.mock('@/features/workouts/hooks/use-today-key', () => ({
  useTodayKey: () => dateAuthorityMocks.state,
}));

describe('WorkoutList', () => {
  beforeEach(() => {
    dateAuthorityMocks.setMutationDate('2026-03-12');
    dateAuthorityMocks.state.dateAuthorityLocked = false;
    dateAuthorityMocks.state.todayKey = '2026-03-12';
    window.localStorage.setItem(API_TOKEN_STORAGE_KEY, 'test-token');
  });

  it('renders sections in order and includes in-progress actions', async () => {
    const sessions = [
      createSession({
        id: 'session-in-progress',
        date: '2026-03-12',
        status: 'in-progress',
        templateId: 'template-push',
        templateName: 'Upper Push',
      }),
      createSession({
        id: 'session-completed',
        date: '2026-03-10',
        status: 'completed',
        templateId: 'template-legs',
        templateName: 'Lower Body',
      }),
      createSession({
        id: 'session-paused',
        date: '2026-03-11',
        status: 'paused',
        templateId: 'template-pull',
        templateName: 'Upper Pull',
      }),
    ];

    const scheduledWorkouts = [
      createScheduledWorkout({
        id: 'schedule-upcoming',
        date: '2099-03-15',
        templateId: 'template-push',
        templateName: 'Upper Push',
        templateTrackingTypes: ['bodyweight_reps', 'seconds_only'],
        sessionId: null,
      }),
      createScheduledWorkout({
        id: 'schedule-missed',
        date: '2026-03-01',
        templateId: 'template-pull',
        templateName: 'Upper Pull',
        sessionId: 'session-soft-deleted',
      }),
    ];

    renderWorkoutList(sessions, scheduledWorkouts);

    expect(await screen.findByRole('heading', { level: 2, name: 'Scheduled' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Completed' })).toBeInTheDocument();
    expect(screen.getByText('Missed')).toBeInTheDocument();
    expect(screen.getByText('Bodyweight reps • Time only')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Start' }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('In Progress').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Paused').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Completed').length).toBeGreaterThan(0);

    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual(['In Progress', 'Scheduled', 'Completed']);

    const inProgressSection = getSectionByTitle('In Progress');
    const scheduledSection = getSectionByTitle('Scheduled');
    expect(
      within(inProgressSection).getAllByRole('link', { name: 'Resume' }).length,
    ).toBeGreaterThan(0);
    expect(
      within(inProgressSection).getAllByRole('button', { name: /Cancel/i }).length,
    ).toBeGreaterThan(0);
    expect(
      within(inProgressSection).getAllByRole('button', { name: /Delete/i }).length,
    ).toBeGreaterThan(0);
    within(scheduledSection)
      .getAllByRole('button', { name: 'Reschedule' })
      .forEach((button) => {
        expect(button).toHaveClass('hover:text-foreground', 'active:text-foreground');
      });
  });

  it('shows unavailable state for soft-deleted scheduled templates and hides stale start actions', async () => {
    const sessions = [
      createSession({
        id: 'session-hidden',
        templateId: 'template-deleted',
        templateName: null,
      }),
      createSession({
        id: 'session-visible',
        templateId: 'template-kept',
        templateName: 'Visible Workout',
      }),
    ];
    const scheduledWorkouts = [
      createScheduledWorkout({
        id: 'schedule-hidden',
        templateId: 'template-deleted',
        templateName: null,
      }),
      createScheduledWorkout({
        id: 'schedule-visible',
        templateId: 'template-kept',
        templateName: 'Visible Workout',
      }),
    ];

    renderWorkoutList(sessions, scheduledWorkouts);

    expect(
      (await screen.findAllByRole('link', { name: /visible workout/i })).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('Workout unavailable')).toBeInTheDocument();
    const unavailableCard = screen.getByText('Workout unavailable').closest('[data-slot="card"]');
    expect(unavailableCard).not.toBeNull();
    expect(
      within(unavailableCard as HTMLElement).getByRole('button', { name: 'Start' }),
    ).toBeDisabled();
  });

  it('shows planned-workout onboarding when no scheduled or active workouts exist', async () => {
    renderWorkoutList(
      [
        createSession({
          id: 'session-11',
          status: 'completed',
          date: '2026-03-01',
        }),
      ],
      [],
    );

    expect(await screen.findByText('No workouts planned')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Plan a workout' })).toHaveAttribute(
      'href',
      '/workouts?view=templates',
    );
    expect(screen.getByRole('link', { name: 'Browse templates' })).toHaveAttribute(
      'href',
      '/workouts?view=templates',
    );
  });

  it('shows an empty state when no workout sessions or schedules are returned', async () => {
    renderWorkoutList([], []);

    expect(
      await screen.findByText('No workouts yet. Plan one to get started.'),
    ).toBeInTheDocument();
  });

  it('does not render completed linked scheduled workouts in scheduled section', async () => {
    const sessions = [
      createSession({
        id: 'session-completed',
        status: 'completed',
        date: '2026-03-10',
        templateId: 'template-a',
        templateName: 'Completed Linked Session',
      }),
    ];
    const scheduledWorkouts = [
      createScheduledWorkout({
        id: 'schedule-linked-completed',
        date: '2026-03-10',
        templateId: 'template-a',
        templateName: 'Completed Linked Session',
        sessionId: 'session-completed',
      }),
      createScheduledWorkout({
        id: 'schedule-unlinked',
        date: '2026-03-15',
        templateId: 'template-b',
        templateName: 'Still Scheduled',
        sessionId: null,
      }),
    ];

    renderWorkoutList(sessions, scheduledWorkouts);

    await screen.findByRole('heading', { level: 2, name: 'Scheduled' });
    const scheduledSection = getSectionByTitle('Scheduled');

    expect(within(scheduledSection).getByText('Still Scheduled')).toBeInTheDocument();
    expect(
      within(scheduledSection).queryByText('Completed Linked Session'),
    ).not.toBeInTheDocument();
    expect(within(scheduledSection).getAllByRole('button', { name: 'Start' })).toHaveLength(1);
  });

  it('does not render in-progress linked scheduled workouts in scheduled section', async () => {
    const sessions = [
      createSession({
        id: 'session-in-progress',
        status: 'in-progress',
        date: '2026-03-12',
        templateId: 'template-a',
        templateName: 'In Progress Linked Session',
      }),
    ];
    const scheduledWorkouts = [
      createScheduledWorkout({
        id: 'schedule-linked-progress',
        date: '2026-03-12',
        templateId: 'template-a',
        templateName: 'In Progress Linked Session',
        sessionId: 'session-in-progress',
      }),
      createScheduledWorkout({
        id: 'schedule-unlinked',
        date: '2026-03-16',
        templateId: 'template-b',
        templateName: 'Scheduled Only',
        sessionId: null,
      }),
    ];

    renderWorkoutList(sessions, scheduledWorkouts);

    await screen.findByRole('heading', { level: 2, name: 'Scheduled' });
    const scheduledSection = getSectionByTitle('Scheduled');
    const inProgressSection = getSectionByTitle('In Progress');

    expect(within(scheduledSection).getByText('Scheduled Only')).toBeInTheDocument();
    expect(
      within(scheduledSection).queryByText('In Progress Linked Session'),
    ).not.toBeInTheDocument();
    expect(within(inProgressSection).getByText('In Progress Linked Session')).toBeInTheDocument();
  });

  it('reveals more scheduled workouts when clicking show more', async () => {
    const scheduledWorkouts = Array.from({ length: 5 }, (_, index) =>
      createScheduledWorkout({
        id: `schedule-${index + 1}`,
        date: `2026-03-${String(index + 10).padStart(2, '0')}`,
        templateName: `Scheduled ${index + 1}`,
      }),
    );

    renderWorkoutList([], scheduledWorkouts);

    await screen.findByRole('heading', { level: 2, name: 'Scheduled' });
    const scheduledSection = getSectionByTitle('Scheduled');

    expect(within(scheduledSection).queryByText('Scheduled 5')).not.toBeInTheDocument();

    fireEvent.click(within(scheduledSection).getByRole('button', { name: 'Show more' }));

    expect(within(scheduledSection).getByText('Scheduled 5')).toBeInTheDocument();
  });

  it('reveals more completed workouts when clicking show more', async () => {
    const sessions = Array.from({ length: 7 }, (_, index) =>
      createSession({
        id: `session-completed-${index + 1}`,
        status: 'completed',
        date: `2026-03-${String(index + 1).padStart(2, '0')}`,
        templateId: `template-${index + 1}`,
        templateName: `Completed ${index + 1}`,
      }),
    );

    renderWorkoutList(sessions, []);

    await screen.findByRole('heading', { level: 2, name: 'Completed' });
    const completedSection = getSectionByTitle('Completed');

    expect(within(completedSection).queryByText('Completed 1')).not.toBeInTheDocument();

    fireEvent.click(within(completedSection).getByRole('button', { name: 'Show more' }));

    expect(within(completedSection).getByText('Completed 1')).toBeInTheDocument();
  });

  it('formats completed workout durations from seconds', async () => {
    renderWorkoutList(
      [
        createSession({
          id: 'session-duration-seconds',
          status: 'completed',
          templateName: 'Duration Session',
          duration: 5400,
        }),
      ],
      [],
    );

    await screen.findByRole('heading', { level: 2, name: 'Completed' });
    const completedSection = getSectionByTitle('Completed');

    expect(within(completedSection).getByText('1h 30m')).toBeInTheDocument();
  });

  it('does not start after date authority locks while early-start confirmation is open', async () => {
    dateAuthorityMocks.setMutationDate('2026-03-12');
    const createSessionSpy = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = new URL(String(input), 'https://pulse.test');

      if (url.pathname === '/api/v1/workout-templates/template-push') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                id: 'template-push',
                userId: 'user-1',
                name: 'Upper Push',
                description: null,
                tags: [],
                sections: [
                  { type: 'warmup', exercises: [] },
                  { type: 'main', exercises: [] },
                  { type: 'cooldown', exercises: [] },
                ],
                createdAt: 1,
                updatedAt: 1,
              },
            }),
            { headers: { 'Content-Type': 'application/json' }, status: 200 },
          ),
        );
      }

      if (url.pathname === '/api/v1/workout-sessions' && (init?.method ?? 'GET') === 'GET') {
        return Promise.resolve(
          new Response(JSON.stringify({ data: [] }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
        );
      }

      if (url.pathname === '/api/v1/workout-sessions' && init?.method === 'POST') {
        createSessionSpy();
        return Promise.resolve(
          new Response(JSON.stringify({ data: { id: 'session-new' } }), {
            headers: { 'Content-Type': 'application/json' },
            status: 201,
          }),
        );
      }

      throw new Error(`Unhandled request: ${url.pathname}`);
    });

    renderWorkoutList(
      [],
      [
        createScheduledWorkout({
          date: '2026-03-15',
          templateId: 'template-push',
          templateName: 'Upper Push',
        }),
      ],
    );

    const startButton = await screen.findByRole('button', { name: 'Start' });
    await waitFor(() => expect(startButton).toBeEnabled());
    fireEvent.click(startButton);
    const dialog = await screen.findByRole('alertdialog');
    dateAuthorityMocks.setMutationDate(null);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start now' }));

    await waitFor(() => expect(createSessionSpy).not.toHaveBeenCalled());
  });

  it('disables rescheduling while date authority is stale', async () => {
    dateAuthorityMocks.state.dateAuthorityLocked = true;
    dateAuthorityMocks.setMutationDate(null);

    renderWorkoutList(
      [],
      [createScheduledWorkout({ templateId: 'template-push', templateName: 'Upper Push' })],
    );

    expect(await screen.findByRole('button', { name: 'Reschedule' })).toBeDisabled();
  });

  it('does not reschedule after date authority locks while the dialog is open', async () => {
    const rescheduleSpy = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = new URL(String(input), 'https://pulse.test');
      const method = init?.method ?? 'GET';

      if (url.pathname === '/api/v1/workout-templates/template-push' && method === 'GET') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                id: 'template-push',
                userId: 'user-1',
                name: 'Upper Push',
                description: null,
                tags: [],
                sections: [],
                createdAt: 1,
                updatedAt: 1,
              },
            }),
            { headers: { 'Content-Type': 'application/json' }, status: 200 },
          ),
        );
      }

      if (url.pathname === '/api/v1/scheduled-workouts/schedule-default' && method === 'PATCH') {
        rescheduleSpy();
        return Promise.resolve(
          new Response(JSON.stringify({ data: {} }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
        );
      }

      throw new Error(`Unhandled request: ${method} ${url.pathname}`);
    });

    renderWorkoutList(
      [],
      [createScheduledWorkout({ templateId: 'template-push', templateName: 'Upper Push' })],
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Reschedule' }));
    const submit = await screen.findByRole('button', { name: 'Submit reschedule' });
    dateAuthorityMocks.setMutationDate(null);
    fireEvent.click(submit);

    await waitFor(() => expect(rescheduleSpy).not.toHaveBeenCalled());
  });

  it('does not remove a schedule after date authority locks while confirmation is open', async () => {
    const unscheduleSpy = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = new URL(String(input), 'https://pulse.test');
      const method = init?.method ?? 'GET';

      if (url.pathname === '/api/v1/workout-templates/template-push' && method === 'GET') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                id: 'template-push',
                userId: 'user-1',
                name: 'Upper Push',
                description: null,
                tags: [],
                sections: [],
                createdAt: 1,
                updatedAt: 1,
              },
            }),
            { headers: { 'Content-Type': 'application/json' }, status: 200 },
          ),
        );
      }

      if (url.pathname === '/api/v1/scheduled-workouts/schedule-default' && method === 'DELETE') {
        unscheduleSpy();
        return Promise.resolve(jsonResponse({ data: { success: true } }));
      }

      throw new Error(`Unhandled request: ${method} ${url.pathname}`);
    });

    renderWorkoutList(
      [],
      [createScheduledWorkout({ templateId: 'template-push', templateName: 'Upper Push' })],
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Reschedule' }));
    const remove = await screen.findByRole('button', { name: 'Remove from schedule' });
    dateAuthorityMocks.setMutationDate(null);
    fireEvent.click(remove);

    await waitFor(() => expect(unscheduleSpy).not.toHaveBeenCalled());
  });
});

function getSectionByTitle(title: 'In Progress' | 'Scheduled' | 'Completed') {
  const heading = screen.getByRole('heading', { level: 2, name: title });
  const section = heading.closest('section');
  expect(section).not.toBeNull();
  return section as HTMLElement;
}

function renderWorkoutList(
  sessions: WorkoutSessionListItem[],
  scheduledWorkouts: ScheduledWorkoutListItem[],
) {
  return renderWithQueryClient(
    <MemoryRouter>
      <WorkoutList scheduledWorkouts={scheduledWorkouts} sessions={sessions} />
    </MemoryRouter>,
  );
}

function createSession(overrides: Partial<WorkoutSessionListItem>): WorkoutSessionListItem {
  return {
    id: 'session-default',
    name: 'Workout Session',
    date: '2026-03-10',
    status: 'completed',
    templateId: null,
    templateName: null,
    startedAt: Date.parse('2026-03-10T18:00:00Z'),
    completedAt: Date.parse('2026-03-10T19:00:00Z'),
    duration: 60,
    exerciseCount: 5,
    createdAt: 1,
    ...overrides,
  };
}

function createScheduledWorkout(
  overrides: Partial<ScheduledWorkoutListItem>,
): ScheduledWorkoutListItem {
  return {
    id: 'schedule-default',
    date: '2026-03-15',
    templateId: 'template-default',
    templateName: 'Scheduled Workout',
    sessionId: null,
    createdAt: 1,
    ...overrides,
  };
}

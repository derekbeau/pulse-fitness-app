import { fireEvent, screen } from '@testing-library/react';
import type { ScheduledWorkoutListItem, WorkoutSessionListItem } from '@pulse/shared';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { renderWithQueryClient } from '@/test/render-with-query-client';

import { WorkoutList } from './workout-list';

describe('WorkoutList', () => {
  it('renders scheduled workouts above upcoming/completed with missed indicator', async () => {
    const sessions = [
      createSession({
        id: 'session-in-progress',
        date: '2026-03-12',
        status: 'in-progress',
        templateId: 'template-push',
        templateName: 'Upper Push',
      }),
      createSession({
        id: 'session-paused',
        date: '2026-03-13',
        status: 'paused',
        templateId: 'template-pull',
        templateName: 'Upper Pull',
      }),
      createSession({
        id: 'session-completed',
        date: '2026-03-10',
        status: 'completed',
        templateId: 'template-legs',
        templateName: 'Lower Body',
        duration: 49,
      }),
    ];

    const scheduledWorkouts = [
      createScheduledWorkout({
        id: 'schedule-upcoming',
        date: '2026-03-15',
        templateId: 'template-push',
        templateName: 'Upper Push',
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
    expect(screen.getByRole('heading', { level: 2, name: 'Upcoming' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Completed' })).toBeInTheDocument();
    expect(screen.getByText('Missed')).toBeInTheDocument();
    const startLinks = screen.getAllByRole('link', { name: 'Start' });
    expect(
      startLinks.some((link) => link.getAttribute('href') === '/workouts/active?template=template-push'),
    ).toBe(true);
    expect(screen.getAllByText('In Progress').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Paused').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Completed').length).toBeGreaterThan(0);
  });

  it('filters soft-deleted template rows from scheduled and session lists', async () => {
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

    expect(await screen.findByRole('link', { name: /visible workout/i })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Start' })).toHaveLength(1);
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

    expect(await screen.findByText('No workouts yet. Plan one to get started.')).toBeInTheDocument();
  });

  it('opens a date-input dialog for rescheduling', async () => {
    const sessions = [
      createSession({
        id: 'session-completed',
        status: 'completed',
        date: '2026-03-10',
      }),
    ];
    const scheduledWorkouts = [
      createScheduledWorkout({
        id: 'schedule-upcoming',
        date: '2026-03-15',
        templateId: 'template-push',
        templateName: 'Upper Push',
        sessionId: null,
      }),
    ];

    renderWorkoutList(sessions, scheduledWorkouts);

    fireEvent.click(await screen.findByRole('button', { name: 'Reschedule' }));

    expect(await screen.findByRole('heading', { name: 'Reschedule workout' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-03-15')).toHaveAttribute('type', 'date');
  });
});

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

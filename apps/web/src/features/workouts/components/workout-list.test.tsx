import { screen } from '@testing-library/react';
import type { WorkoutSessionListItem } from '@pulse/shared';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { renderWithQueryClient } from '@/test/render-with-query-client';

import { WorkoutList } from './workout-list';

describe('WorkoutList', () => {
  it('groups sessions into upcoming and completed sections with status-specific indicators', async () => {
    const sessions = [
      createSession({
        id: 'session-upcoming',
        date: '2026-03-14',
        status: 'scheduled',
        templateId: 'template-push',
        templateName: 'Upper Push',
      }),
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

    renderWorkoutList(sessions);

    expect(await screen.findByRole('heading', { level: 2, name: 'Upcoming' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Completed' })).toBeInTheDocument();
    expect(screen.getByText('Planned')).toBeInTheDocument();
    expect(screen.getAllByText('In Progress').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Paused').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Completed').length).toBeGreaterThan(0);
    expect(screen.getByText(/Scheduled /)).toBeInTheDocument();
    expect(screen.getByText('49 min')).toBeInTheDocument();
    const inProgressLink = screen
      .getAllByRole('link', { name: /upper push/i })
      .find((link) => link.getAttribute('href') === '/workouts/active?sessionId=session-in-progress');
    expect(inProgressLink).toBeDefined();
    const pausedLink = screen
      .getAllByRole('link', { name: /upper pull/i })
      .find((link) => link.getAttribute('href') === '/workouts/active?sessionId=session-paused');
    expect(pausedLink).toBeDefined();
  });

  it('renders a workout card with summary stats and session detail link', async () => {
    const sessions = [
      createSession({
        id: 'session-10',
        date: '2026-03-10',
        status: 'completed',
        templateId: 'template-push',
        templateName: 'Upper Push',
        exerciseCount: 7,
        duration: 53,
      }),
    ];

    renderWorkoutList(sessions);

    expect(await screen.findByRole('link', { name: /upper push/i })).toHaveAttribute(
      'href',
      '/workouts/session/session-10',
    );
    expect(screen.getByText('53 min')).toBeInTheDocument();
    expect(screen.getByText('7 exercises')).toBeInTheDocument();
  });

  it('shows planned-workout onboarding when no scheduled sessions exist', async () => {
    renderWorkoutList([
      createSession({
        id: 'session-11',
        status: 'completed',
        date: '2026-03-01',
      }),
    ]);

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

  it('does not show planned-workout onboarding when an in-progress session exists', async () => {
    renderWorkoutList([
      createSession({
        id: 'session-12',
        status: 'in-progress',
        date: '2026-03-11',
      }),
    ]);

    expect(screen.getAllByText('In Progress').length).toBeGreaterThan(0);
    expect(screen.queryByText('No workouts planned')).not.toBeInTheDocument();
  });

  it('shows an empty state when no workout sessions are returned', async () => {
    renderWorkoutList([]);

    expect(await screen.findByText('No workouts yet. Plan one to get started.')).toBeInTheDocument();
  });
});

function renderWorkoutList(sessions: WorkoutSessionListItem[]) {
  return renderWithQueryClient(
    <MemoryRouter>
      <WorkoutList sessions={sessions} />
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

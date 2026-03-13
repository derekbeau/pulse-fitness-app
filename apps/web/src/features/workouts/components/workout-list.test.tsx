import { fireEvent, screen, within } from '@testing-library/react';
import type { ScheduledWorkoutListItem, WorkoutSessionListItem } from '@pulse/shared';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { renderWithQueryClient } from '@/test/render-with-query-client';

import { WorkoutList } from './workout-list';

describe('WorkoutList', () => {
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
    ];

    renderWorkoutList(sessions, []);

    expect(
      await screen.findByRole('heading', { level: 2, name: 'In Progress' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Scheduled' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Completed' })).toBeInTheDocument();

    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual(['In Progress', 'Scheduled', 'Completed']);

    const inProgressSection = getSectionByTitle('In Progress');
    expect(within(inProgressSection).getByRole('link', { name: 'Resume' })).toBeInTheDocument();
    expect(within(inProgressSection).getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
    expect(within(inProgressSection).getByRole('button', { name: /Delete/i })).toBeInTheDocument();
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
    expect(within(scheduledSection).getAllByRole('button', { name: 'Start now' })).toHaveLength(1);
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

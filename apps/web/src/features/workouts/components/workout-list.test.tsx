import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { parseDateKey, startOfWeek, toDateKey } from '@/lib/date-utils';
import { mockTemplates } from '@/lib/mock-data/workouts';

import { workoutCompletedSessions } from '..';
import { WorkoutList } from './workout-list';

describe('WorkoutList', () => {
  it('groups completed sessions by Monday-based week in reverse chronological order', () => {
    renderWorkoutList();

    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);

    expect(headings).toEqual(getExpectedWeekHeadings(workoutCompletedSessions));
  });

  it('renders each workout card with summary stats and a session detail link', () => {
    const session = workoutCompletedSessions[workoutCompletedSessions.length - 1];
    const template = mockTemplates.find((item) => item.id === session?.templateId);
    const totalSets =
      session?.exercises.reduce((count, exercise) => count + exercise.sets.length, 0) ?? 0;

    renderWorkoutList();

    expect(
      screen
        .getAllByRole('link')
        .some((link) => link.getAttribute('href') === `/workouts/session/${session?.id}`),
    ).toBe(true);
    expect(screen.getAllByText(template?.name ?? '').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(`${template?.sections.length ?? 0} sections`).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(`${session?.exercises.length ?? 0} exercises`).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(`${totalSets} sets`).length).toBeGreaterThan(0);
  });

  it('omits empty weeks instead of rendering gap headers', () => {
    renderWorkoutList(
      [workoutCompletedSessions[0], workoutCompletedSessions[workoutCompletedSessions.length - 1]]
        .filter(isDefined),
    );

    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2);
  });
});

function renderWorkoutList(sessions = workoutCompletedSessions) {
  return render(
    <MemoryRouter>
      <WorkoutList sessions={sessions} />
    </MemoryRouter>,
  );
}

function getExpectedWeekHeadings(sessions: typeof workoutCompletedSessions) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  });

  const weekStarts = [
    ...new Set(sessions.map((session) => toWeekKey(session.startedAt.slice(0, 10)))),
  ]
    .map(parseDateKey)
    .sort((left, right) => right.getTime() - left.getTime());

  return weekStarts.map((weekStart) => `Week of ${formatter.format(weekStart)}`);
}

function toWeekKey(dateKey: string) {
  return toDateKey(startOfWeek(parseDateKey(dateKey)));
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

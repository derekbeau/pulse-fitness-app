import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { mockSessions, mockTemplates } from '@/lib/mock-data/workouts';

import { WorkoutList } from './workout-list';

describe('WorkoutList', () => {
  it('groups completed sessions by Monday-based week in reverse chronological order', () => {
    renderWorkoutList();

    const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);

    expect(headings).toEqual(getExpectedWeekHeadings(mockSessions));
  });

  it('renders each workout card with summary stats and a session detail link', () => {
    const session = mockSessions[mockSessions.length - 1];
    const template = mockTemplates.find((item) => item.id === session?.templateId);
    const totalSets =
      session?.exercises.reduce((count, exercise) => count + exercise.sets.length, 0) ?? 0;

    renderWorkoutList();

    expect(
      screen
        .getAllByRole('link')
        .some((link) => link.getAttribute('href') === `/workouts/${session?.id}`),
    ).toBe(true);
    expect(screen.getAllByText(template?.name ?? '').length).toBeGreaterThan(0);
    expect(screen.getAllByText(`${template?.sections.length ?? 0} sections`).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText(`${session?.exercises.length ?? 0} exercises`).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText(`${totalSets} sets`).length).toBeGreaterThan(0);
  });

  it('omits empty weeks instead of rendering gap headers', () => {
    renderWorkoutList([mockSessions[0], mockSessions[mockSessions.length - 1]].filter(isDefined));

    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2);
  });
});

function renderWorkoutList(sessions = mockSessions) {
  return render(
    <MemoryRouter>
      <WorkoutList sessions={sessions} />
    </MemoryRouter>,
  );
}

function getExpectedWeekHeadings(sessions: typeof mockSessions) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  });

  const weekStarts = [...new Set(sessions.map((session) => toWeekKey(session.startedAt.slice(0, 10))))]
    .map(parseDateKey)
    .sort((left, right) => right.getTime() - left.getTime());

  return weekStarts.map((weekStart) => `Week of ${formatter.format(weekStart)}`);
}

function toWeekKey(dateKey: string) {
  const date = parseDateKey(dateKey);
  const mondayIndex = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayIndex);

  return [
    date.getFullYear(),
    `${date.getMonth() + 1}`.padStart(2, '0'),
    `${date.getDate()}`.padStart(2, '0'),
  ].join('-');
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, 12);
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

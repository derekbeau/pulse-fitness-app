import { screen } from '@testing-library/react';
import type { WorkoutSessionListItem } from '@pulse/shared';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_TOKEN_STORAGE_KEY } from '@/lib/api-client';
import { parseDateKey, startOfWeek, toDateKey } from '@/lib/date-utils';
import { renderWithQueryClient } from '@/test/render-with-query-client';
import { jsonResponse } from '@/test/test-utils';

import { WorkoutList } from './workout-list';

beforeEach(() => {
  window.localStorage.setItem(API_TOKEN_STORAGE_KEY, 'test-token');
});

afterEach(() => {
  window.localStorage.removeItem(API_TOKEN_STORAGE_KEY);
  vi.restoreAllMocks();
});

describe('WorkoutList', () => {
  it('groups completed sessions by Monday-based week in reverse chronological order', async () => {
    const sessions = [
      createSession({
        id: 'session-1',
        date: '2026-03-08',
        templateId: 'template-push',
        templateName: 'Upper Push',
      }),
      createSession({
        id: 'session-2',
        date: '2026-03-04',
        templateId: 'template-push',
        templateName: 'Upper Push',
      }),
      createSession({
        id: 'session-3',
        date: '2026-02-26',
        templateId: 'template-legs',
        templateName: 'Lower Body',
      }),
    ];

    mockWorkoutListRequests({ sessions });
    renderWorkoutList();

    expect((await screen.findAllByRole('link', { name: /upper push/i })).length).toBeGreaterThan(0);

    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);

    expect(headings).toEqual(getExpectedWeekHeadings(sessions));
  });

  it('renders a workout card with summary stats and session detail link', async () => {
    const sessions = [
      createSession({
        id: 'session-10',
        date: '2026-03-10',
        templateId: 'template-push',
        templateName: 'Upper Push',
        exerciseCount: 7,
        duration: 53,
      }),
    ];

    mockWorkoutListRequests({ sessions });
    renderWorkoutList();

    expect(await screen.findByRole('link', { name: /upper push/i })).toHaveAttribute(
      'href',
      '/workouts/session/session-10',
    );
    expect(screen.getByText('53 min')).toBeInTheDocument();
    expect(screen.getByText('7 exercises')).toBeInTheDocument();
  });

  it('shows an empty state when no completed sessions are returned', async () => {
    mockWorkoutListRequests({ sessions: [] });
    renderWorkoutList();

    expect(await screen.findByText('No completed workouts yet.')).toBeInTheDocument();
  });
});

function renderWorkoutList() {
  return renderWithQueryClient(
    <MemoryRouter>
      <WorkoutList />
    </MemoryRouter>,
  );
}

function mockWorkoutListRequests({ sessions }: { sessions: WorkoutSessionListItem[] }) {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input);

    if (url.includes('/api/v1/workout-sessions?status=completed')) {
      return Promise.resolve(jsonResponse({ data: sessions }));
    }

    if (url.includes('/api/v1/workout-templates')) {
      return Promise.resolve(
        jsonResponse({
          data: [
            {
              id: 'template-push',
              userId: 'user-1',
              name: 'Upper Push',
              description: null,
              tags: ['push'],
              sections: [
                { type: 'warmup', exercises: [] },
                { type: 'main', exercises: [] },
                { type: 'cooldown', exercises: [] },
              ],
              createdAt: 1,
              updatedAt: 1,
            },
            {
              id: 'template-legs',
              userId: 'user-1',
              name: 'Lower Body',
              description: null,
              tags: ['legs'],
              sections: [
                { type: 'warmup', exercises: [] },
                { type: 'main', exercises: [] },
                { type: 'cooldown', exercises: [] },
              ],
              createdAt: 1,
              updatedAt: 1,
            },
          ],
        }),
      );
    }

    throw new Error(`Unhandled request: ${url}`);
  });
}

function getExpectedWeekHeadings(sessions: WorkoutSessionListItem[]) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  });

  const weekStarts = [...new Set(sessions.map((session) => toWeekKey(session.date)))]
    .map(parseDateKey)
    .sort((left, right) => right.getTime() - left.getTime());

  return weekStarts.map((weekStart) => `Week of ${formatter.format(weekStart)}`);
}

function toWeekKey(dateKey: string) {
  return toDateKey(startOfWeek(parseDateKey(dateKey)));
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

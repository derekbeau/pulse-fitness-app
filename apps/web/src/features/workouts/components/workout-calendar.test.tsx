import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_TOKEN_STORAGE_KEY } from '@/lib/api-client';
import { toDateKey } from '@/lib/date-utils';
import { renderWithQueryClient } from '@/test/render-with-query-client';
import { jsonResponse } from '@/test/test-utils';

import { WorkoutCalendar } from './workout-calendar';

beforeEach(() => {
  window.localStorage.setItem(API_TOKEN_STORAGE_KEY, 'test-token');
});

afterEach(() => {
  window.localStorage.removeItem(API_TOKEN_STORAGE_KEY);
  vi.restoreAllMocks();
});

describe('WorkoutCalendar', () => {
  it('renders completed sessions from the API and links to session details', async () => {
    const sessionDate = new Date();
    sessionDate.setDate(Math.min(sessionDate.getDate(), 10));
    const sessionDateKey = toDateKey(sessionDate);
    const completedSession = {
      id: 'session-1',
      name: 'Upper Push',
      date: sessionDateKey,
      status: 'completed' as const,
      templateId: 'template-1',
      templateName: 'Upper Push',
      startedAt: Date.parse(`${sessionDateKey}T18:00:00Z`),
      completedAt: Date.parse(`${sessionDateKey}T19:00:00Z`),
      duration: 60,
      exerciseCount: 6,
      createdAt: 1,
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);

      if (url.includes('/api/v1/workout-sessions?status=completed')) {
        return Promise.resolve(jsonResponse({ data: [completedSession] }));
      }

      if (url.includes('/api/v1/workout-templates')) {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                id: 'template-1',
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
            ],
          }),
        );
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderWithQueryClient(
      <MemoryRouter>
        <WorkoutCalendar buildSessionHref={(sessionId) => `/workouts/session/${sessionId}`} />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Workout Calendar')).toBeInTheDocument();
    expect((await screen.findAllByLabelText('Completed workout')).length).toBeGreaterThan(0);

    fireEvent.click(
      screen.getByRole('button', {
        name: formatFullDate(new Date(`${sessionDateKey}T12:00:00`)),
      }),
    );

    expect(screen.getByRole('heading', { name: 'Upper Push' })).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View Session' })).toHaveAttribute(
      'href',
      '/workouts/session/session-1',
    );
  });

  it('shows empty calendar details when no completed sessions exist', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);

      if (url.includes('/api/v1/workout-sessions?status=completed')) {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.includes('/api/v1/workout-templates')) {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderWithQueryClient(
      <MemoryRouter>
        <WorkoutCalendar />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Workout Calendar')).toBeInTheDocument();
    expect(screen.queryByLabelText('Completed workout')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No workout planned' })).toBeInTheDocument();
    expect(document.getElementById('workout-day-details')).toHaveClass('order-first');
  });

  it('navigates between months', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);

      if (url.includes('/api/v1/workout-sessions?status=completed')) {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.includes('/api/v1/workout-templates')) {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderWithQueryClient(
      <MemoryRouter>
        <WorkoutCalendar />
      </MemoryRouter>,
    );
    await screen.findByText('Workout Calendar');

    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);

    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));

    expect(screen.getByText(formatMonth(nextMonth))).toBeInTheDocument();
  });
});

function formatFullDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function formatMonth(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

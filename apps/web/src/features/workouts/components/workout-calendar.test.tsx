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
  it('renders completed and scheduled workouts with session links', async () => {
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
      const url = new URL(String(input), 'https://pulse.test');

      if (url.pathname === '/api/v1/workout-sessions') {
        const statuses = url.searchParams.getAll('status');
        if (statuses.includes('completed')) {
          return Promise.resolve(jsonResponse({ data: [completedSession] }));
        }

        if (statuses.includes('in-progress') || statuses.includes('paused')) {
          return Promise.resolve(jsonResponse({ data: [] }));
        }

        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.pathname === '/api/v1/scheduled-workouts') {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                id: 'schedule-1',
                date: sessionDateKey,
                templateId: 'template-1',
                templateName: 'Upper Push',
                sessionId: null,
                createdAt: 1,
              },
              {
                id: 'schedule-2',
                date: sessionDateKey,
                templateId: 'template-2',
                templateName: 'Accessory',
                sessionId: null,
                createdAt: 2,
              },
            ],
          }),
        );
      }

      throw new Error(`Unhandled request: ${url.pathname}`);
    });

    renderWithQueryClient(
      <MemoryRouter>
        <WorkoutCalendar buildSessionHref={(sessionId) => `/workouts/session/${sessionId}`} />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Workout Calendar')).toBeInTheDocument();
    expect((await screen.findAllByLabelText('Completed workout')).length).toBeGreaterThan(0);
    expect((await screen.findAllByLabelText('Scheduled workout')).length).toBeGreaterThan(0);
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Done' })).toHaveAttribute(
      'href',
      '/workouts/session/session-1',
    );
    expect(screen.getByRole('button', { name: /selected/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows empty calendar details when no workouts exist', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = new URL(String(input), 'https://pulse.test');

      if (url.pathname === '/api/v1/workout-sessions') {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.pathname === '/api/v1/scheduled-workouts') {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      throw new Error(`Unhandled request: ${url.pathname}`);
    });

    renderWithQueryClient(
      <MemoryRouter>
        <WorkoutCalendar />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Workout Calendar')).toBeInTheDocument();
    expect(screen.queryByLabelText('Completed workout')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No workout planned' })).toBeInTheDocument();
  });

  it('navigates between months', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = new URL(String(input), 'https://pulse.test');

      if (url.pathname === '/api/v1/workout-sessions') {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.pathname === '/api/v1/scheduled-workouts') {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      throw new Error(`Unhandled request: ${url.pathname}`);
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

function formatMonth(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

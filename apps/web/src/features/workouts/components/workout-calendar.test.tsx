import { fireEvent, screen, within } from '@testing-library/react';
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
  it('renders per-workout indicators and a count badge for days with 3+ workouts', async () => {
    const sessionDate = new Date();
    const sessionDateKey = toDateKey(sessionDate);
    const inProgressSession = {
      id: 'session-in-progress',
      name: 'Morning Conditioning',
      date: sessionDateKey,
      status: 'in-progress' as const,
      templateId: 'template-3',
      templateName: 'Morning Conditioning',
      startedAt: Date.parse(`${sessionDateKey}T06:30:00Z`),
      completedAt: null,
      duration: null,
      exerciseCount: 4,
      createdAt: 3,
    };
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
        return Promise.resolve(jsonResponse({ data: [completedSession, inProgressSession] }));
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
                templateTrackingTypes: ['weight_reps', 'reps_seconds'],
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
              {
                id: 'schedule-3',
                date: sessionDateKey,
                templateId: 'template-3',
                templateName: 'Morning Conditioning',
                sessionId: 'session-in-progress',
                createdAt: 3,
              },
            ],
          }),
        );
      }

      if (url.pathname.startsWith('/api/v1/workout-templates/')) {
        return Promise.resolve(
          jsonResponse({
            data: {
              id: url.pathname.split('/').at(-1),
              name: 'Template',
              description: null,
              sections: [],
              tags: [],
              createdAt: 1,
              updatedAt: 1,
            },
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

    expect((await screen.findAllByLabelText('In-progress workout')).length).toBeGreaterThan(0);
    expect((await screen.findAllByLabelText('Completed workout')).length).toBeGreaterThan(0);
    expect(screen.getByText('+2')).toHaveClass('hidden', 'sm:inline-flex');
    expect(screen.getByRole('button', { name: 'Previous month' })).toHaveClass('size-8');
    expect(getCalendarDayTile(sessionDate)).toHaveClass('overflow-hidden');
    expect(screen.getByRole('link', { name: 'Done' })).toHaveAttribute(
      'href',
      '/workouts/session/session-1',
    );
  });

  it('shows selected-day workouts with status-aware actions', async () => {
    const dateKey = toDateKey(new Date());

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = new URL(String(input), 'https://pulse.test');

      if (url.pathname === '/api/v1/workout-sessions') {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                id: 'session-in-progress',
                name: 'Conditioning',
                date: dateKey,
                status: 'in-progress',
                templateId: 'template-conditioning',
                templateName: 'Conditioning',
                startedAt: Date.parse(`${dateKey}T08:00:00Z`),
                completedAt: null,
                duration: null,
                exerciseCount: 4,
                createdAt: 2,
              },
              {
                id: 'session-completed',
                name: 'Recovery Flow',
                date: dateKey,
                status: 'completed',
                templateId: 'template-recovery',
                templateName: 'Recovery Flow',
                startedAt: Date.parse(`${dateKey}T06:00:00Z`),
                completedAt: Date.parse(`${dateKey}T06:45:00Z`),
                duration: 45,
                exerciseCount: 3,
                createdAt: 1,
              },
            ],
          }),
        );
      }

      if (url.pathname === '/api/v1/scheduled-workouts') {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                id: 'schedule-1',
                date: dateKey,
                templateId: 'template-upper',
                templateName: 'Upper Push',
                sessionId: null,
                createdAt: 3,
              },
            ],
          }),
        );
      }

      if (url.pathname.startsWith('/api/v1/workout-templates/')) {
        return Promise.resolve(
          jsonResponse({
            data: {
              id: url.pathname.split('/').at(-1),
              name: 'Template',
              description: null,
              sections: [],
              tags: [],
              createdAt: 1,
              updatedAt: 1,
            },
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

    await screen.findByText('Upper Push');
    const detailsPanel = document.getElementById('workout-day-details');
    expect(detailsPanel).not.toBeNull();
    expect(within(detailsPanel as HTMLElement).getByText('Conditioning')).toBeInTheDocument();
    expect(within(detailsPanel as HTMLElement).getByText('Recovery Flow')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Resume' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View details' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Reschedule' })).toHaveLength(1);
  });

  it('shows empty selected-day state with a schedule CTA', async () => {
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

    expect(
      await screen.findByText('No workouts scheduled. Tap a day to view details.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '+ Schedule' })).toBeInTheDocument();
  });

  it('updates selected-day details when a calendar day is tapped', async () => {
    const targetDate = new Date();
    targetDate.setDate(Math.min(targetDate.getDate(), 11));
    const targetDateKey = toDateKey(targetDate);

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = new URL(String(input), 'https://pulse.test');

      if (url.pathname === '/api/v1/workout-sessions') {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.pathname === '/api/v1/scheduled-workouts') {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                id: 'schedule-target',
                date: targetDateKey,
                templateId: 'template-target',
                templateName: 'Leg Day',
                sessionId: null,
                createdAt: 1,
              },
            ],
          }),
        );
      }

      if (url.pathname.startsWith('/api/v1/workout-templates/')) {
        return Promise.resolve(
          jsonResponse({
            data: {
              id: url.pathname.split('/').at(-1),
              name: 'Template',
              description: null,
              sections: [],
              tags: [],
              createdAt: 1,
              updatedAt: 1,
            },
          }),
        );
      }

      throw new Error(`Unhandled request: ${url.pathname}`);
    });

    renderWithQueryClient(
      <MemoryRouter>
        <WorkoutCalendar />
      </MemoryRouter>,
    );

    await screen.findByText('No workouts scheduled. Tap a day to view details.');
    fireEvent.click(getCalendarDayTile(targetDate));

    const detailsPanel = document.getElementById('workout-day-details');
    expect(detailsPanel).not.toBeNull();
    expect(within(detailsPanel as HTMLElement).getByText('Leg Day')).toBeInTheDocument();
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
    await screen.findByText('No workouts scheduled. Tap a day to view details.');

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

function getCalendarDayTile(date: Date) {
  const fullLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);

  return screen.getByRole('button', {
    name: new RegExp(`^${escapeRegExp(fullLabel)}(?:, selected)?$`),
  });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

import { fireEvent, screen } from '@testing-library/react';
import type { Habit } from '@pulse/shared';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_TOKEN_STORAGE_KEY } from '@/lib/api-client';
import { addDays, getWeekStart, toDateKey } from '@/lib/date';
import { HabitsPage } from '@/pages/habits';
import { renderWithQueryClient } from '@/test/render-with-query-client';
import { jsonResponse } from '@/test/test-utils';

function createHabit(id: string, name: string): Habit {
  return {
    id,
    userId: 'user-1',
    name,
    description: null,
    emoji: '✅',
    trackingType: 'boolean',
    target: null,
    unit: null,
    frequency: 'daily',
    frequencyTarget: null,
    scheduledDays: null,
    pausedUntil: null,
    sortOrder: 0,
    active: true,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('HabitsPage', () => {
  beforeEach(() => {
    window.localStorage.setItem(API_TOKEN_STORAGE_KEY, 'test-token');
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('shows inline add controls when there are no habits', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const rawUrl =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'https://pulse.test');

      if (url.pathname === '/api/v1/habits') {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.pathname === '/api/v1/habit-entries') {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      throw new Error(`Unhandled request: ${url.pathname}`);
    });

    renderWithQueryClient(
      <MemoryRouter initialEntries={['/habits']}>
        <Routes>
          <Route element={<HabitsPage />} path="/habits" />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('No active habits configured yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Back to Dashboard' })).toHaveAttribute('href', '/');
    fireEvent.click(screen.getByRole('button', { name: 'Add Habit' }));

    expect(await screen.findByRole('heading', { name: 'Add habit' })).toBeInTheDocument();
  });

  it('renders habits content when habits exist', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const rawUrl =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'https://pulse.test');

      if (url.pathname === '/api/v1/habits') {
        return Promise.resolve(jsonResponse({ data: [createHabit('habit-1', 'Hydrate')] }));
      }

      if (url.pathname === '/api/v1/habit-entries') {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      throw new Error(`Unhandled request: ${url.pathname}`);
    });

    renderWithQueryClient(
      <MemoryRouter initialEntries={['/habits']}>
        <Routes>
          <Route element={<HabitsPage />} path="/habits" />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Daily habits')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'No habits configured' })).not.toBeInTheDocument();
  });

  it('lets users pick a past day and loads that day entries', async () => {
    const today = new Date();
    const yesterday = addDays(today, -1);
    const selectedDayKey = toDateKey(yesterday);
    const selectedDayIsInCurrentWeek =
      toDateKey(getWeekStart(today)) === toDateKey(getWeekStart(yesterday));
    const previousWeekStartKey = toDateKey(addDays(getWeekStart(today), -7));
    const previousWeekEndKey = toDateKey(addDays(getWeekStart(today), -1));
    const expectedHeading = new Intl.DateTimeFormat('en-US', {
      day: 'numeric',
      month: 'long',
      weekday: 'long',
    }).format(new Date(`${selectedDayKey}T00:00:00`));
    const habitEntriesRequests: string[] = [];
    const hydrateHabit = createHabit('habit-1', 'Hydrate');
    hydrateHabit.trackingType = 'numeric';
    hydrateHabit.target = 8;
    hydrateHabit.unit = 'glasses';

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const rawUrl =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'https://pulse.test');

      if (url.pathname === '/api/v1/habits') {
        return Promise.resolve(jsonResponse({ data: [hydrateHabit] }));
      }

      if (url.pathname === '/api/v1/habit-entries') {
        habitEntriesRequests.push(url.searchParams.toString());
        const from = url.searchParams.get('from');
        const to = url.searchParams.get('to');

        if (from === selectedDayKey && to === selectedDayKey) {
          return Promise.resolve(
            jsonResponse({
              data: [
                {
                  completed: true,
                  createdAt: 1,
                  date: selectedDayKey,
                  habitId: 'habit-1',
                  id: 'entry-1',
                  userId: 'user-1',
                  value: 8,
                },
              ],
            }),
          );
        }

        return Promise.resolve(
          jsonResponse({
            data: [
              {
                completed: true,
                createdAt: 1,
                date: selectedDayKey,
                habitId: 'habit-1',
                id: 'entry-week',
                userId: 'user-1',
                value: 8,
              },
            ],
          }),
        );
      }

      throw new Error(`Unhandled request: ${url.pathname}`);
    });

    renderWithQueryClient(
      <MemoryRouter initialEntries={['/habits']}>
        <Routes>
          <Route element={<HabitsPage />} path="/habits" />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByLabelText('Habit date picker')).toBeInTheDocument();

    if (!selectedDayIsInCurrentWeek) {
      fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
      expect(habitEntriesRequests).toContain(
        `from=${previousWeekStartKey}&to=${previousWeekEndKey}`,
      );
    }

    const selectedDayButton = document.querySelector(
      `[data-slot="habit-calendar-day"][data-date="${selectedDayKey}"]`,
    );
    if (!selectedDayButton) {
      throw new Error(`Expected habit date button for ${selectedDayKey}.`);
    }

    fireEvent.click(selectedDayButton);

    expect(await screen.findByRole('heading', { name: expectedHeading })).toBeInTheDocument();
    expect(habitEntriesRequests).toContain(`from=${selectedDayKey}&to=${selectedDayKey}`);
  });

  it('shows contextual help for habit tracking', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const rawUrl =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'https://pulse.test');

      if (url.pathname === '/api/v1/habits') {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.pathname === '/api/v1/habit-entries') {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      throw new Error(`Unhandled request: ${url.pathname}`);
    });

    renderWithQueryClient(
      <MemoryRouter initialEntries={['/habits']}>
        <Routes>
          <Route element={<HabitsPage />} path="/habits" />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByLabelText('Habit date picker')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));

    expect(screen.getByRole('heading', { name: 'Habits help' })).toBeInTheDocument();
    expect(screen.getByText('Boolean: mark done or not done for the day.')).toBeInTheDocument();
    expect(
      screen.getByText("Streaks power the dashboard's don't break the chain view for consistency."),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Your AI agent can also log or update habit entries for you.'),
    ).toBeInTheDocument();
  });
});

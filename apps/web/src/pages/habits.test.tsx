import { fireEvent, screen } from '@testing-library/react';
import type { Habit } from '@pulse/shared';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_TOKEN_STORAGE_KEY } from '@/lib/api-client';
import { HabitsPage } from '@/pages/habits';
import { renderWithQueryClient } from '@/test/render-with-query-client';
import { jsonResponse } from '@/test/test-utils';

function createHabit(id: string, name: string): Habit {
  return {
    id,
    userId: 'user-1',
    name,
    emoji: '✅',
    trackingType: 'boolean',
    target: null,
    unit: null,
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
  });

  it('shows the page empty state and navigates to settings from action', async () => {
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
          <Route element={<h1>Settings</h1>} path="/settings" />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'No habits configured' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add Habit' }));

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
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
});

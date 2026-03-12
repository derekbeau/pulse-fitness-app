import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_TOKEN_STORAGE_KEY } from '@/lib/api-client';
import { WeightHistoryPage } from '@/pages/weight-history';
import { renderWithQueryClient } from '@/test/render-with-query-client';
import { jsonResponse } from '@/test/test-utils';

describe('WeightHistoryPage', () => {
  beforeEach(() => {
    window.localStorage.setItem(API_TOKEN_STORAGE_KEY, 'test-token');
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('lists entries in reverse chronological order and deletes with confirmation', async () => {
    let weights = [
      {
        id: 'weight-1',
        date: '2026-03-04',
        weight: 181.8,
        notes: null,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'weight-2',
        date: '2026-03-05',
        weight: 181.2,
        notes: 'After cardio',
        createdAt: 2,
        updatedAt: 2,
      },
      {
        id: 'weight-3',
        date: '2026-03-06',
        weight: 181.4,
        notes: null,
        createdAt: 3,
        updatedAt: 3,
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const rawUrl =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'https://pulse.test');
      const method = init?.method ?? 'GET';

      if (url.pathname === '/api/v1/users/me' && method === 'GET') {
        return Promise.resolve(
          jsonResponse({
            data: {
              id: 'user-1',
              username: 'test-user',
              name: 'Test User',
              weightUnit: 'lbs',
              createdAt: 1,
            },
          }),
        );
      }

      if (url.pathname === '/api/v1/weight' && method === 'GET') {
        return Promise.resolve(
          jsonResponse({
            data: weights,
          }),
        );
      }

      if (url.pathname === '/api/v1/weight/weight-2' && method === 'DELETE') {
        weights = weights.filter((entry) => entry.id !== 'weight-2');
        return Promise.resolve(
          jsonResponse({
            data: { deleted: true, id: 'weight-2' },
          }),
        );
      }

      throw new Error(`Unhandled request: ${method} ${url.pathname}`);
    });

    renderWithQueryClient(
      <MemoryRouter initialEntries={['/weight']}>
        <Routes>
          <Route element={<WeightHistoryPage />} path="/weight" />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Weight History' })).toBeInTheDocument();
    expect(await screen.findByText('181.4 lbs')).toBeInTheDocument();
    expect(screen.getByText('181.2 lbs')).toBeInTheDocument();
    expect(screen.getByText('181.8 lbs')).toBeInTheDocument();
    expect(screen.getByText('After cardio')).toBeInTheDocument();

    const list = screen.getByRole('list', { name: 'Weight history entries' });
    const weightsInOrder = Array.from(list.querySelectorAll('li p.text-lg')).map(
      (element) => element.textContent,
    );
    expect(weightsInOrder).toEqual(['181.4 lbs', '181.2 lbs', '181.8 lbs']);

    fireEvent.click(screen.getByRole('button', { name: /Delete weight entry from Mar 5, 2026/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete entry' }));

    await waitFor(() => {
      expect(screen.queryByText('181.2 lbs')).not.toBeInTheDocument();
    });
    expect(screen.queryByText('After cardio')).not.toBeInTheDocument();
  });

  it('shows empty state when no entries are available', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const rawUrl =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'https://pulse.test');
      const method = init?.method ?? 'GET';

      if (url.pathname === '/api/v1/users/me' && method === 'GET') {
        return Promise.resolve(
          jsonResponse({
            data: {
              id: 'user-1',
              username: 'test-user',
              name: 'Test User',
              weightUnit: 'lbs',
              createdAt: 1,
            },
          }),
        );
      }

      if (url.pathname === '/api/v1/weight' && method === 'GET') {
        return Promise.resolve(
          jsonResponse({
            data: [],
          }),
        );
      }

      throw new Error(`Unhandled request: ${method} ${url.pathname}`);
    });

    renderWithQueryClient(
      <MemoryRouter initialEntries={['/weight']}>
        <Routes>
          <Route element={<WeightHistoryPage />} path="/weight" />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'No weight entries yet' })).toBeInTheDocument();
  });

  it('formats entries with the user preferred metric unit', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const rawUrl =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'https://pulse.test');
      const method = init?.method ?? 'GET';

      if (url.pathname === '/api/v1/users/me' && method === 'GET') {
        return Promise.resolve(
          jsonResponse({
            data: {
              id: 'user-1',
              username: 'test-user',
              name: 'Test User',
              weightUnit: 'kg',
              createdAt: 1,
            },
          }),
        );
      }

      if (url.pathname === '/api/v1/weight' && method === 'GET') {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                id: 'weight-1',
                date: '2026-03-06',
                weight: 81.2,
                notes: null,
                createdAt: 1,
                updatedAt: 1,
              },
            ],
          }),
        );
      }

      throw new Error(`Unhandled request: ${method} ${url.pathname}`);
    });

    renderWithQueryClient(
      <MemoryRouter initialEntries={['/weight']}>
        <Routes>
          <Route element={<WeightHistoryPage />} path="/weight" />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('81.2 kg')).toBeInTheDocument();
  });
});

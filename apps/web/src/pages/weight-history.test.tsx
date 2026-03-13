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
      <MemoryRouter initialEntries={['/weight/history']}>
        <Routes>
          <Route element={<WeightHistoryPage />} path="/weight/history" />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Weight History' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Back to Dashboard' })).toHaveAttribute('href', '/');
    expect(await screen.findByText('181.4 lbs')).toBeInTheDocument();
    expect(screen.getByText('181.2 lbs')).toBeInTheDocument();
    expect(screen.getByText('181.8 lbs')).toBeInTheDocument();
    expect(screen.getByText('After cardio')).toBeInTheDocument();

    const list = screen.getByRole('list', { name: 'Weight history entries' });
    const weightsInOrder = Array.from(list.querySelectorAll('li button.text-lg')).map(
      (element) => element.textContent,
    );
    expect(weightsInOrder).toEqual(['181.4 lbs', '181.2 lbs', '181.8 lbs']);

    fireEvent.click(screen.getByRole('button', { name: /Delete weight entry from Mar 5, 2026/i }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete entry' }));

    await waitFor(() => {
      expect(screen.queryByText('181.2 lbs')).not.toBeInTheDocument();
    });
    expect(screen.queryByText('After cardio')).not.toBeInTheDocument();
  });

  it('closes the confirmation dialog when delete fails', async () => {
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
            data: [
              {
                id: 'weight-1',
                date: '2026-03-06',
                weight: 181.4,
                notes: null,
                createdAt: 1,
                updatedAt: 1,
              },
            ],
          }),
        );
      }

      if (url.pathname === '/api/v1/weight/weight-1' && method === 'DELETE') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: {
                code: 'WEIGHT_NOT_FOUND',
                message: 'Weight entry not found',
              },
            }),
            {
              headers: { 'Content-Type': 'application/json' },
              status: 404,
            },
          ),
        );
      }

      throw new Error(`Unhandled request: ${method} ${url.pathname}`);
    });

    renderWithQueryClient(
      <MemoryRouter initialEntries={['/weight/history']}>
        <Routes>
          <Route element={<WeightHistoryPage />} path="/weight/history" />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('181.4 lbs')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Delete weight entry from Mar 6, 2026/i }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete entry' }));

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
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
      <MemoryRouter initialEntries={['/weight/history']}>
        <Routes>
          <Route element={<WeightHistoryPage />} path="/weight/history" />
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
      <MemoryRouter initialEntries={['/weight/history']}>
        <Routes>
          <Route element={<WeightHistoryPage />} path="/weight/history" />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('81.2 kg')).toBeInTheDocument();
  });

  it('supports inline editing of a weight value', async () => {
    let weights = [
      {
        id: 'weight-1',
        date: '2026-03-06',
        weight: 181.4,
        notes: null,
        createdAt: 1,
        updatedAt: 1,
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
        return Promise.resolve(jsonResponse({ data: weights }));
      }

      if (url.pathname === '/api/v1/weight/weight-1' && method === 'PATCH') {
        const payload =
          typeof init?.body === 'string' ? (JSON.parse(init.body) as { weight: number }) : null;
        const nextWeight = payload?.weight ?? weights[0]?.weight ?? 0;

        weights = weights.map((entry) =>
          entry.id === 'weight-1' ? { ...entry, weight: nextWeight, updatedAt: entry.updatedAt + 1 } : entry,
        );

        return Promise.resolve(jsonResponse({ data: weights[0] }));
      }

      throw new Error(`Unhandled request: ${method} ${url.pathname}`);
    });

    renderWithQueryClient(
      <MemoryRouter initialEntries={['/weight/history']}>
        <Routes>
          <Route element={<WeightHistoryPage />} path="/weight/history" />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('181.4 lbs')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '181.4 lbs' }));
    fireEvent.change(screen.getByLabelText('Weight value for Mar 6, 2026'), {
      target: { value: '180.2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByText('180.2 lbs')).toBeInTheDocument();
    });
  });

  it('shows contextual help for weight history', async () => {
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
      <MemoryRouter initialEntries={['/weight/history']}>
        <Routes>
          <Route element={<WeightHistoryPage />} path="/weight/history" />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Weight History' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));

    expect(screen.getByRole('heading', { name: 'Weight history help' })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Weight tracking stores one entry per day. Saving again on the same day updates that day's value instead of creating duplicates.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('The dashboard trend line uses an exponentially weighted moving average (EWMA).'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Tap any logged value to edit it inline when an entry needs correction.'),
    ).toBeInTheDocument();
  });
});

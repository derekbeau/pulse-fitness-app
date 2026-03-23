import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_TOKEN_STORAGE_KEY } from '@/lib/api-client';
import { WeightHistoryPage } from '@/pages/weight-history';
import { renderWithQueryClient } from '@/test/render-with-query-client';
import { jsonResponse } from '@/test/test-utils';

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  const React = await vi.importActual<typeof import('react')>('react');

  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">
        {React.isValidElement(children)
          ? React.cloneElement(
              children as React.ReactElement<{ height?: number; width?: number }>,
              {
                height: 360,
                width: 720,
              },
            )
          : children}
      </div>
    ),
  };
});

type WeightEntryFixture = {
  createdAt: number;
  date: string;
  id: string;
  notes: string | null;
  updatedAt: number;
  weight: number;
};

function renderPage() {
  renderWithQueryClient(
    <MemoryRouter initialEntries={['/weight/history']}>
      <Routes>
        <Route element={<WeightHistoryPage />} path="/weight/history" />
      </Routes>
    </MemoryRouter>,
  );
}

describe('WeightHistoryPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-03-08T12:00:00'));
    window.localStorage.setItem(API_TOKEN_STORAGE_KEY, 'test-token');
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows the chart, lists entries in reverse chronological order, and deletes with confirmation', async () => {
    let weights: WeightEntryFixture[] = [
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
        return Promise.resolve(jsonResponse({ data: weights }));
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

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Weight History' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Weight history trend chart' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '30D' })).toHaveAttribute('aria-pressed', 'true');

    const list = screen.getByRole('list', { name: 'Weight history entries' });
    expect(within(list).getByText('181.4 lbs')).toBeInTheDocument();
    expect(within(list).getByText('181.2 lbs')).toBeInTheDocument();
    expect(within(list).getByText('181.8 lbs')).toBeInTheDocument();
    expect(within(list).getByText('After cardio')).toBeInTheDocument();
    const weightsInOrder = Array.from(list.querySelectorAll('li p.text-lg')).map(
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

  it('adds a new weight entry from the quick-add form', async () => {
    let weights: WeightEntryFixture[] = [
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

      if (url.pathname === '/api/v1/weight' && method === 'POST') {
        const payload =
          typeof init?.body === 'string'
            ? (JSON.parse(init.body) as { date: string; notes?: string; weight: number })
            : null;

        const nextEntry: WeightEntryFixture = {
          id: 'weight-2',
          date: payload?.date ?? '2026-03-07',
          weight: payload?.weight ?? 180,
          notes: payload?.notes ?? null,
          createdAt: 2,
          updatedAt: 2,
        };
        weights = [...weights, nextEntry];
        return Promise.resolve(jsonResponse({ data: nextEntry }));
      }

      throw new Error(`Unhandled request: ${method} ${url.pathname}`);
    });

    renderPage();

    const list = await screen.findByRole('list', { name: 'Weight history entries' });
    expect(within(list).getByText('181.4 lbs')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));

    fireEvent.change(screen.getByLabelText('Date'), {
      target: { value: '2026-03-07' },
    });
    fireEvent.change(screen.getByLabelText('Weight'), {
      target: { value: '180.2' },
    });
    fireEvent.change(screen.getByLabelText('Notes'), {
      target: { value: 'After travel' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));

    await waitFor(() => {
      expect(
        within(screen.getByRole('list', { name: 'Weight history entries' })).getByText('180.2 lbs'),
      ).toBeInTheDocument();
    });
    expect(
      within(screen.getByRole('list', { name: 'Weight history entries' })).getByText(
        'After travel',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Add weight entry' })).not.toBeInTheDocument();
  });

  it('supports editing a weight value and note inline', async () => {
    let weights: WeightEntryFixture[] = [
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
          typeof init?.body === 'string'
            ? (JSON.parse(init.body) as { notes: string | null; weight: number })
            : null;

        weights = weights.map((entry) =>
          entry.id === 'weight-1'
            ? {
                ...entry,
                notes: payload?.notes ?? null,
                updatedAt: entry.updatedAt + 1,
                weight: payload?.weight ?? entry.weight,
              }
            : entry,
        );

        return Promise.resolve(jsonResponse({ data: weights[0] }));
      }

      throw new Error(`Unhandled request: ${method} ${url.pathname}`);
    });

    renderPage();

    const list = await screen.findByRole('list', { name: 'Weight history entries' });
    expect(within(list).getByText('181.4 lbs')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Weight value for Mar 6, 2026'), {
      target: { value: '180.2' },
    });
    fireEvent.change(screen.getByLabelText('Notes for Mar 6, 2026'), {
      target: { value: 'Adjusted after retest' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(
        within(screen.getByRole('list', { name: 'Weight history entries' })).getByText('180.2 lbs'),
      ).toBeInTheDocument();
    });
    expect(
      within(screen.getByRole('list', { name: 'Weight history entries' })).getByText(
        'Adjusted after retest',
      ),
    ).toBeInTheDocument();
  });

  it('shows validation feedback when saving an invalid inline weight edit', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
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

      if (url.pathname === '/api/v1/weight/weight-1' && method === 'PATCH') {
        throw new Error('PATCH should not be called for invalid edits');
      }

      throw new Error(`Unhandled request: ${method} ${url.pathname}`);
    });

    renderPage();

    const list = await screen.findByRole('list', { name: 'Weight history entries' });
    expect(within(list).getByText('181.4 lbs')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Weight value for Mar 6, 2026'), {
      target: { value: '0' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('Enter a valid weight above 0.')).toBeInTheDocument();
    const hasPatchToWeightEntry = fetchSpy.mock.calls.some((call) => {
      const input = call[0];
      const rawUrl =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'https://pulse.test');
      const method = call[1]?.method ?? 'GET';

      return url.pathname === '/api/v1/weight/weight-1' && method === 'PATCH';
    });
    expect(hasPatchToWeightEntry).toBe(false);
  });

  it('shows a range empty state until the user expands to all history', async () => {
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
                date: '2025-10-01',
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

    renderPage();

    const list = await screen.findByRole('list', { name: 'Weight history entries' });
    expect(within(list).getByText('81.2 kg')).toBeInTheDocument();
    expect(screen.getByText('No entries in this range yet.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'All' }));

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Weight history trend chart' })).toBeInTheDocument();
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
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      throw new Error(`Unhandled request: ${method} ${url.pathname}`);
    });

    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'No weight entries yet' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add entry' })).toBeInTheDocument();
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
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      throw new Error(`Unhandled request: ${method} ${url.pathname}`);
    });

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Weight History' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));

    expect(screen.getByRole('heading', { name: 'Weight history help' })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Weight tracking stores one entry per day. Saving again on the same day updates that day's value instead of creating duplicates.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'The dashboard trend line uses an exponentially weighted moving average (EWMA).',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Use the range selector to zoom from the last 30 days out to your full history.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Edit buttons let you correct a value or note without leaving the page.'),
    ).toBeInTheDocument();
  });
});

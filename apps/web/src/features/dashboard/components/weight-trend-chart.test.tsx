import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClientWrapper } from '@/test/query-client';

import { WeightTrendChart } from './weight-trend-chart';

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
                height: 320,
                width: 720,
              },
            )
          : children}
      </div>
    ),
  };
});

const weightEntriesFixture = [
  {
    id: 'weight-1',
    date: '2026-03-04',
    weight: 181.2,
    notes: null,
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'weight-2',
    date: '2026-03-05',
    weight: 180.4,
    notes: null,
    createdAt: 2,
    updatedAt: 2,
  },
  {
    id: 'weight-3',
    date: '2026-03-06',
    weight: 180.9,
    notes: null,
    createdAt: 3,
    updatedAt: 3,
  },
  {
    id: 'weight-4',
    date: '2026-03-07',
    weight: 180.2,
    notes: null,
    createdAt: 4,
    updatedAt: 4,
  },
];

describe('WeightTrendChart', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  function renderChart() {
    const { wrapper } = createQueryClientWrapper();

    return render(
      <MemoryRouter>
        <WeightTrendChart />
      </MemoryRouter>,
      { wrapper },
    );
  }

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-03-08T12:00:00'));

    mockFetch = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const rawUrl =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost');

      if (url.pathname === '/api/v1/weight' && init?.method === 'GET') {
        return Promise.resolve(
          new Response(JSON.stringify({ data: weightEntriesFixture }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              code: 'NOT_FOUND',
              message: 'Not found',
            },
          }),
          { headers: { 'Content-Type': 'application/json' }, status: 404 },
        ),
      );
    });

    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('fetches 1M range by default and renders header + insight metrics', async () => {
    const { container } = renderChart();

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Weight trend chart' })).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/weight?days=30',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(screen.getByRole('heading', { name: 'Weight Trend' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View weight history' })).toHaveAttribute(
      'href',
      '/weight/history',
    );
    expect(screen.getByText('Current trend')).toBeInTheDocument();
    expect(screen.getByText('Period average')).toBeInTheDocument();
    expect(screen.getByText(/3-day change:/)).toBeInTheDocument();
    expect(screen.getByText(/7-day change:/)).toBeInTheDocument();
    expect(screen.getByLabelText('3-day direction stable')).toBeInTheDocument();
    expect(screen.getByLabelText('7-day direction down')).toBeInTheDocument();

    const chartCard = container.querySelector('[data-slot="weight-trend-chart"]');
    expect(chartCard).toHaveClass('gap-3', 'py-3');
    expect(container.querySelector('[data-slot="weight-trend-legend"]')).toHaveClass('gap-1.5');
  });

  it('switches ranges and re-fetches weight entries with selected days', async () => {
    renderChart();

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/v1/weight?days=30', expect.any(Object));
    });

    fireEvent.click(screen.getByRole('button', { name: '1W' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/v1/weight?days=7', expect.any(Object));
    });

    fireEvent.click(screen.getByRole('button', { name: 'All' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/v1/weight', expect.any(Object));
    });
  });

  it('allows toggling each legend series', async () => {
    renderChart();

    const scaleToggle = await screen.findByRole('button', { name: 'Scale Weight' });
    const trendToggle = screen.getByRole('button', { name: 'Trend Weight' });

    expect(scaleToggle).toHaveAttribute('aria-pressed', 'true');
    expect(trendToggle).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(scaleToggle);
    fireEvent.click(trendToggle);

    expect(scaleToggle).toHaveAttribute('aria-pressed', 'false');
    expect(trendToggle).toHaveAttribute('aria-pressed', 'false');
    expect(
      screen.getByText('Enable at least one series to display the chart.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Weight trend chart' })).not.toBeInTheDocument();
  });

  it('renders empty state when no weight entries exist', async () => {
    mockFetch.mockImplementation((input: string | URL | Request, init?: RequestInit) => {
      const rawUrl =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost');

      if (url.pathname === '/api/v1/weight' && init?.method === 'GET') {
        return Promise.resolve(
          new Response(JSON.stringify({ data: [] }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              code: 'NOT_FOUND',
              message: 'Not found',
            },
          }),
          { headers: { 'Content-Type': 'application/json' }, status: 404 },
        ),
      );
    });

    renderChart();

    expect(await screen.findByText('Log your weight to see trends')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to weight entry' })).toHaveAttribute(
      'href',
      '/#dashboard-log-weight-card',
    );
  });
});

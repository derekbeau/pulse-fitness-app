import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { weightQueryKeys } from '@/features/weight/api/weight';
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

const analyticsFixture = {
  range: { preset: '1m', startDate: '2026-02-07', endDate: '2026-03-08' },
  timeZone: 'America/Detroit',
  isHistorical: true,
  unit: 'lbs',
  algorithm: {
    version: 'trend-weight-v1',
    windowDays: 30,
    alpha: 0.1,
    interpolation: 'none',
    minimumObservations: 2,
  },
  current: {
    latestScale: {
      id: 'weight-3',
      date: '2026-03-07',
      weight: 180.2,
      unit: 'lbs',
      notes: null,
      createdAt: 3,
      updatedAt: 3,
    },
    trendWeight: 180.85,
    trendDate: '2026-03-07',
    scaleTrendDifference: -0.65,
    ratePerWeek: -0.3,
    rateEffectiveDate: '2026-03-07',
    state: 'developing',
    evidence: { observationCount: 3, spanDays: 3, latestAgeDays: 1 },
  },
  deltas: [7, 14, 30, 90].map((requestedDays) => ({
    requestedDays,
    status: 'unavailable',
    value: null,
    fromAsOfDate: '2026-01-01',
    fromTrendDate: null,
    toTrendDate: '2026-03-07',
    reasonCode: 'NO_PRIOR_TREND',
  })),
  points: [
    {
      sourceEntryId: 'weight-1',
      date: '2026-03-04',
      scaleWeight: 181.2,
      trendWeight: null,
      scaleTrendDifference: null,
      state: 'scale_only',
      observationCount: 1,
      spanDays: 0,
      gapFromPreviousDays: null,
      startsNewTrendSegment: false,
      corrected: false,
      annotation: null,
    },
    {
      sourceEntryId: 'weight-2',
      date: '2026-03-05',
      scaleWeight: 180.4,
      trendWeight: 181.12,
      scaleTrendDifference: -0.72,
      state: 'developing',
      observationCount: 2,
      spanDays: 1,
      gapFromPreviousDays: 1,
      startsNewTrendSegment: false,
      corrected: false,
      annotation: null,
    },
    {
      sourceEntryId: 'weight-3',
      date: '2026-03-07',
      scaleWeight: 180.2,
      trendWeight: 180.85,
      scaleTrendDifference: -0.65,
      state: 'developing',
      observationCount: 3,
      spanDays: 3,
      gapFromPreviousDays: 2,
      startsNewTrendSegment: false,
      corrected: false,
      annotation: null,
    },
  ],
  markers: [],
  goal: null,
  explanation: {
    headline: 'Trend Weight has limited confidence.',
    detail:
      'Scale weight can move faster than Trend Weight because Trend Weight waits for repeated evidence.',
    lag: 'Trend Weight intentionally responds gradually to short-term scale changes; it does not diagnose their cause.',
    confidence: 'Trend Weight is available, but the recent evidence span is limited.',
    facts: {
      confidenceReason: 'LIMITED_EVIDENCE_SPAN',
      scaleTrendRelation: 'below',
      paceDirection: 'losing',
      paceFreshness: 'current',
      goalComparison: 'no_goal',
    },
  },
  policy: {
    productTrend: 'trend-weight-v1',
    trajectory: 'product_trend_weight',
    coaching: 'product_trend_weight',
    goalEta: 'adaptive_model_trend',
    goalCompletion: 'adaptive_model_trend',
    maintenanceRange: 'adaptive_model_trend',
    celebrations: 'adaptive_model_trend',
    adaptiveTdee: 'adaptive_model_trend',
    measurementHistory: 'scale_weight',
    explanation: 'Product trend is display truth; model trend remains versioned.',
  },
  sourceFingerprint: 'a'.repeat(64),
};

describe('WeightTrendChart', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  const renderChart = (endDate = '2026-03-08') => {
    const { queryClient, wrapper } = createQueryClientWrapper();
    return {
      ...render(
        <MemoryRouter>
          <WeightTrendChart endDate={endDate} />
        </MemoryRouter>,
        { wrapper },
      ),
      queryClient,
    };
  };

  beforeEach(() => {
    mockFetch = vi.fn((input: string | URL | Request) => {
      const rawUrl =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost');
      if (url.pathname === '/api/v1/weight/trend') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                ...analyticsFixture,
                range: { ...analyticsFixture.range, preset: url.searchParams.get('range') },
              },
            }),
            { headers: { 'Content-Type': 'application/json' }, status: 200 },
          ),
        );
      }
      return Promise.resolve(new Response('{}', { status: 404 }));
    });
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('uses the server-owned analytics endpoint and selected historical date', async () => {
    renderChart();
    expect(await screen.findByRole('img', { name: 'Trend Weight chart' })).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/weight/trend?range=1m&timeZone=America%2FDetroit&end=2026-03-08',
      expect.any(Object),
    );
    expect(screen.getByText('Trend Weight')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '180.9 lbs' })).toBeInTheDocument();
    expect(screen.getByText('Historical view')).toBeInTheDocument();
  });

  it('switches ranges without recomputing values in the component', async () => {
    renderChart();
    await screen.findByRole('img', { name: 'Trend Weight chart' });
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/weight/trend?range=all&timeZone=America%2FDetroit&end=2026-03-08',
        expect.any(Object),
      );
    });
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: '180.9 lbs' })).toBeInTheDocument();
  });

  it('refetches through its dedicated analytics cache key', async () => {
    const { queryClient } = renderChart();
    await screen.findByRole('img', { name: 'Trend Weight chart' });
    const before = mockFetch.mock.calls.length;
    await queryClient.invalidateQueries({ queryKey: weightQueryKeys.analyticsRoot() });
    await waitFor(() => expect(mockFetch.mock.calls.length).toBeGreaterThan(before));
  });

  it('renders the explicit no-data state from the server', async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              ...analyticsFixture,
              current: {
                latestScale: null,
                trendWeight: null,
                trendDate: null,
                scaleTrendDifference: null,
                ratePerWeek: null,
                rateEffectiveDate: null,
                state: 'no_data',
                evidence: { observationCount: 0, spanDays: 0, latestAgeDays: null },
              },
              points: [],
            },
          }),
          { headers: { 'Content-Type': 'application/json' }, status: 200 },
        ),
      ),
    );
    renderChart();
    expect(
      await screen.findByText('Log your first weigh-in to start Trend Weight.'),
    ).toBeInTheDocument();
    expect(screen.getByText('No trend data')).toBeInTheDocument();
  });
});

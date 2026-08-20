import type { TrendWeightAnalytics } from '@pulse/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_TOKEN_STORAGE_KEY } from '@/lib/api-client';
import { WeightHistoryPage } from '@/pages/weight-history';
import { renderWithQueryClient } from '@/test/render-with-query-client';
import { jsonResponse } from '@/test/test-utils';

const weightUnitState = vi.hoisted(() => ({ value: 'lbs' as 'lbs' | 'kg' }));
const trendAnalyticsState = vi.hoisted(() => ({
  data: {
    range: { preset: '1m', startDate: '2026-02-07', endDate: '2026-03-08' },
    timeZone: 'America/Detroit',
    isHistorical: false,
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
        date: '2026-03-06',
        weight: 181.4,
        unit: 'lbs',
        notes: null,
        createdAt: 3,
        updatedAt: 3,
      },
      trendWeight: 181.6,
      trendDate: '2026-03-06',
      scaleTrendDifference: -0.2,
      ratePerWeek: -0.3,
      rateEffectiveDate: '2026-03-06',
      state: 'developing',
      evidence: { observationCount: 3, spanDays: 2, latestAgeDays: 2 },
    },
    deltas: [7, 14, 30, 90].map((requestedDays) => ({
      requestedDays,
      status: 'unavailable',
      value: null,
      fromAsOfDate: '2026-01-01',
      fromTrendDate: null,
      toTrendDate: '2026-03-06',
      reasonCode: 'NO_PRIOR_TREND',
    })),
    points: [
      {
        sourceEntryId: 'weight-1',
        date: '2026-03-04',
        scaleWeight: 181.8,
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
        scaleWeight: 181.2,
        trendWeight: 181.74,
        scaleTrendDifference: -0.54,
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
        date: '2026-03-06',
        scaleWeight: 181.4,
        trendWeight: 181.706,
        scaleTrendDifference: -0.306,
        state: 'developing',
        observationCount: 3,
        spanDays: 2,
        gapFromPreviousDays: 1,
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
      explanation: 'Product Trend Weight is for display; model trend remains versioned.',
    },
    sourceFingerprint: 'a'.repeat(64),
  } as TrendWeightAnalytics,
}));

vi.mock('@/hooks/use-weight-unit', () => ({
  useWeightUnit: () => ({ weightUnit: weightUnitState.value }),
}));

vi.mock('@/features/weight/api/weight', async () => {
  const actual = await vi.importActual<typeof import('@/features/weight/api/weight')>(
    '@/features/weight/api/weight',
  );
  return {
    ...actual,
    useTrendWeightAnalytics: () => ({
      data: trendAnalyticsState.data,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }),
  };
});

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
  unit: 'lbs' | 'kg';
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
  let originalTimezone: string | undefined;

  beforeEach(() => {
    originalTimezone = process.env.TZ;
    weightUnitState.value = 'lbs';
    process.env.TZ = 'America/Detroit';
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-03-08T12:00:00'));
    window.localStorage.setItem(API_TOKEN_STORAGE_KEY, 'test-token');
  });

  afterEach(() => {
    trendAnalyticsState.data.goal = null;
    trendAnalyticsState.data.markers = [];
    if (originalTimezone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTimezone;
    }
    window.localStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders maintenance semantics and off-measurement annotations from server facts', async () => {
    trendAnalyticsState.data.goal = {
      id: 'goal-maintain',
      type: 'maintain',
      targetWeight: null,
      maintenanceCenter: 181.5,
      maintenanceLower: 179.5,
      maintenanceUpper: 183.5,
      desiredRatePerWeek: 0,
      actualRatePerWeek: -0.3,
      paceState: 'outside_goal_band',
      maintenanceBandState: 'inside_maintenance_band',
      explanation: 'Trend Weight is inside the maintenance corridor.',
    };
    trendAnalyticsState.data.markers = [
      {
        id: 'revision-off-date',
        date: '2026-03-03',
        kind: 'goal_revised',
        label: 'Goal revised',
      },
      {
        id: 'goal-started',
        date: '2026-03-05',
        kind: 'goal_started',
        label: 'Goal started',
      },
      {
        id: 'check-in',
        date: '2026-03-05',
        kind: 'check_in',
        label: 'Check-in',
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
        return Promise.resolve(jsonResponse({ data: [] }));
      }
      throw new Error(`Unhandled request: ${method} ${url.pathname}`);
    });

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Trend Weight' })).toBeInTheDocument();
    const goalContext = screen.getByRole('heading', { name: 'Goal context' }).closest('article');
    if (!goalContext) throw new Error('Goal context article was not rendered');
    expect(within(goalContext).getByText('Maintenance corridor')).toBeInTheDocument();
    expect(within(goalContext).getByText(/inside maintenance band/i)).toBeInTheDocument();
    expect(within(goalContext).getByText('0 lbs/week')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show exact values' }));
    expect(screen.getByRole('heading', { name: 'Annotations' })).toBeInTheDocument();
    expect(screen.getByText(/Mar 3, 2026 · Goal revised · goal revised/)).toBeInTheDocument();
    const marchFifth = screen.getByRole('row', { name: /Mar 5, 2026/ });
    expect(within(marchFifth).getByText('Goal started · Check-in')).toBeInTheDocument();
  });

  it('shows the chart, lists entries in reverse chronological order, and deletes with confirmation', async () => {
    let weights: WeightEntryFixture[] = [
      {
        id: 'weight-1',
        date: '2026-03-04',
        weight: 181.8,
        unit: 'lbs',
        notes: null,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'weight-2',
        date: '2026-03-05',
        weight: 181.2,
        unit: 'lbs',
        notes: 'After cardio',
        createdAt: 2,
        updatedAt: 2,
      },
      {
        id: 'weight-3',
        date: '2026-03-06',
        weight: 181.4,
        unit: 'lbs',
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

    expect(await screen.findByRole('heading', { name: 'Trend Weight' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Trend Weight chart' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1M' })).toHaveAttribute('aria-pressed', 'true');

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
        unit: 'lbs',
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
            ? (JSON.parse(init.body) as {
                date: string;
                notes?: string;
                unit: 'lbs' | 'kg';
                weight: number;
              })
            : null;

        const nextEntry: WeightEntryFixture = {
          id: 'weight-2',
          date: payload?.date ?? '2026-03-07',
          weight: payload?.weight ?? 180,
          unit: 'lbs',
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
    fireEvent.change(screen.getByLabelText('Weight (lbs)'), {
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

  it('defaults a new entry to the local calendar date near a UTC day boundary', async () => {
    vi.setSystemTime(new Date('2026-03-09T01:30:00.000Z'));

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

    await screen.findByRole('heading', { name: 'Trend Weight' });
    fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));

    expect(screen.getByLabelText('Date')).toHaveValue('2026-03-08');
  });

  it('supports editing a weight value and note inline', async () => {
    let weights: WeightEntryFixture[] = [
      {
        id: 'weight-1',
        date: '2026-03-06',
        weight: 181.4,
        unit: 'lbs',
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
    fireEvent.change(screen.getByLabelText('Weight value for Mar 6, 2026 (lbs)'), {
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
                unit: 'lbs',
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
    fireEvent.change(screen.getByLabelText('Weight value for Mar 6, 2026 (lbs)'), {
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

  it('keeps response units while using the active kg preference for new entries', async () => {
    weightUnitState.value = 'kg';
    const weights: WeightEntryFixture[] = [
      {
        id: 'weight-1',
        date: '2026-03-06',
        weight: 181.4,
        unit: 'lbs',
        notes: null,
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    let postedPayload: { date: string; notes?: string; unit: 'lbs' | 'kg'; weight: number } | null =
      null;

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
        return Promise.resolve(jsonResponse({ data: weights }));
      }

      if (url.pathname === '/api/v1/weight' && method === 'POST') {
        postedPayload = JSON.parse(String(init?.body)) as typeof postedPayload;
        return Promise.resolve(
          jsonResponse({
            data: {
              id: 'weight-2',
              date: postedPayload?.date ?? '2026-03-08',
              weight: postedPayload?.weight ?? 82.3,
              unit: 'kg',
              notes: null,
              createdAt: 2,
              updatedAt: 2,
            },
          }),
        );
      }

      throw new Error(`Unhandled request: ${method} ${url.pathname}`);
    });

    renderPage();

    const list = await screen.findByRole('list', { name: 'Weight history entries' });
    expect(within(list).getByText('181.4 lbs')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));
    expect(await screen.findByLabelText('Weight (kg)')).toHaveAttribute('placeholder', '82.3');

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Weight value for Mar 6, 2026 (lbs)')).toHaveAttribute(
      'placeholder',
      '181.4',
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[1]);

    fireEvent.change(screen.getByLabelText('Weight (kg)'), { target: { value: '82.3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));

    await waitFor(() => {
      expect(postedPayload).toEqual(
        expect.objectContaining({
          unit: 'kg',
          weight: 82.3,
        }),
      );
    });
  });

  it('keeps the entry ledger separate from the server-owned exact trend table', async () => {
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
                unit: 'kg',
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
    fireEvent.click(screen.getByRole('button', { name: 'Show exact values' }));
    expect(
      screen.getByRole('table', { name: 'Exact Scale and Trend Weight values' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mar 6, 2026' })).toBeInTheDocument();
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

    expect(await screen.findByRole('heading', { name: 'Trend Weight' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));

    expect(screen.getByRole('heading', { name: 'Trend Weight help' })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Weight tracking stores one entry per day. Saving again on the same day updates that day's value instead of creating duplicates.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Product Trend Weight uses observations from the trailing 30 calendar days. With fewer than two measurements, Pulse labels the result as still learning.',
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

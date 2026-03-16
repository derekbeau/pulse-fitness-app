import {
  type DashboardConfig,
  DASHBOARD_WIDGET_IDS,
  type DashboardSnapshot,
  type Habit,
  type HabitEntry,
} from '@pulse/shared';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getDashboardGreeting } from '@/features/dashboard/lib/greeting';
import { createQueryClientWrapper } from '@/test/query-client';

import { DashboardPage } from './dashboard';

const formatWeight = (value: number): string => `${value.toFixed(1)} lbs`;
const DEFAULT_VISIBLE_WIDGETS = Object.keys(DASHBOARD_WIDGET_IDS);

function createDeferredResponse() {
  let resolve: (value: Response) => void = () => {};

  const promise = new Promise<Response>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

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
                height: 60,
                width: 320,
              },
            )
          : children}
      </div>
    ),
  };
});

const habits: Habit[] = [
  {
    active: true,
    createdAt: 1,
    emoji: '🧘',
    id: 'habit-meditate',
    name: 'Meditate',
    description: null,
    sortOrder: 0,
    target: null,
    trackingType: 'boolean',
    unit: null,
    frequency: 'daily',
    frequencyTarget: null,
    scheduledDays: null,
    pausedUntil: null,
    updatedAt: 1,
    userId: 'user-1',
  },
];

const habitEntries: HabitEntry[] = [
  {
    completed: false,
    createdAt: 1,
    date: '2026-03-04',
    habitId: 'habit-meditate',
    id: 'entry-2026-03-04',
    userId: 'user-1',
    value: null,
  },
  {
    completed: true,
    createdAt: 2,
    date: '2026-03-05',
    habitId: 'habit-meditate',
    id: 'entry-2026-03-05',
    userId: 'user-1',
    value: null,
  },
  {
    completed: true,
    createdAt: 3,
    date: '2026-03-06',
    habitId: 'habit-meditate',
    id: 'entry-2026-03-06',
    userId: 'user-1',
    value: null,
  },
];

const snapshotForToday: DashboardSnapshot = {
  date: '2026-03-06',
  weight: {
    date: '2026-03-06',
    unit: 'lb',
    value: 181.4,
    trendValue: null,
  },
  macros: {
    actual: {
      calories: 1900,
      protein: 170,
      carbs: 210,
      fat: 70,
    },
    target: {
      calories: 2300,
      protein: 190,
      carbs: 260,
      fat: 75,
    },
  },
  workout: {
    name: 'Upper Push A',
    status: 'completed',
    templateId: 'template-upper-push-a',
    sessionId: 'session-upper-push-a',
    duration: 62,
  },
  habits: {
    total: 1,
    completed: 1,
    percentage: 100,
  },
};

const snapshotForMarch4: DashboardSnapshot = {
  date: '2026-03-04',
  weight: null,
  macros: {
    actual: {
      calories: 1725,
      protein: 150,
      carbs: 180,
      fat: 60,
    },
    target: {
      calories: 2300,
      protein: 190,
      carbs: 260,
      fat: 75,
    },
  },
  workout: null,
  habits: {
    total: 1,
    completed: 0,
    percentage: 0,
  },
};

const weightTrendData = [
  { date: '2026-02-09', value: 182.2 },
  { date: '2026-03-06', value: 181.4 },
];

const macroTrendData = [
  {
    date: '2026-02-09',
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  },
  {
    date: '2026-03-06',
    calories: 1900,
    protein: 170,
    carbs: 210,
    fat: 70,
  },
];

const weightEntriesData = [
  {
    id: 'weight-entry-1',
    date: '2026-03-04',
    weight: 181.8,
    notes: null,
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'weight-entry-2',
    date: '2026-03-05',
    weight: 181.2,
    notes: null,
    createdAt: 2,
    updatedAt: 2,
  },
  {
    id: 'weight-entry-3',
    date: '2026-03-06',
    weight: 181.4,
    notes: null,
    createdAt: 3,
    updatedAt: 3,
  },
];

const recentWorkoutsListData = [
  {
    id: 'recent-workout-1',
    name: 'Upper Push A',
    date: '2026-03-05',
    status: 'completed',
    templateId: 'template-1',
    templateName: 'Upper Push',
    startedAt: 1,
    completedAt: 2,
    duration: 62,
    exerciseCount: 2,
    createdAt: 3,
  },
];

describe('DashboardPage', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let dashboardConfig: DashboardConfig;
  let snapshotsByDate: Record<string, DashboardSnapshot>;
  let shouldFailDashboardConfigSave: boolean;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T10:00:00'));
    snapshotsByDate = {
      [snapshotForToday.date]: snapshotForToday,
      [snapshotForMarch4.date]: snapshotForMarch4,
    };
    dashboardConfig = {
      habitChainIds: ['habit-meditate'],
      trendMetrics: ['weight', 'calories', 'protein'],
      visibleWidgets: DEFAULT_VISIBLE_WIDGETS,
    };
    shouldFailDashboardConfigSave = false;

    mockFetch = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const rawUrl =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost');

      if (url.pathname === '/api/v1/dashboard/snapshot' && init?.method === 'GET') {
        const requestedDate = url.searchParams.get('date') ?? snapshotForToday.date;
        const snapshot = snapshotsByDate[requestedDate] ?? snapshotForToday;

        return Promise.resolve(
          new Response(JSON.stringify({ data: snapshot }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
        );
      }

      if (url.pathname === '/api/v1/dashboard/config' && init?.method === 'GET') {
        return Promise.resolve(
          new Response(JSON.stringify({ data: dashboardConfig }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
        );
      }

      if (url.pathname === '/api/v1/dashboard/config' && init?.method === 'PUT') {
        if (shouldFailDashboardConfigSave) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                error: {
                  code: 'SERVER_ERROR',
                  message: 'Unavailable',
                },
              }),
              { headers: { 'Content-Type': 'application/json' }, status: 503 },
            ),
          );
        }

        dashboardConfig = JSON.parse(String(init.body)) as DashboardConfig;

        return Promise.resolve(
          new Response(JSON.stringify({ data: dashboardConfig }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
        );
      }

      if (url.pathname === '/api/v1/habits' && init?.method === 'GET') {
        return Promise.resolve(
          new Response(JSON.stringify({ data: habits }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
        );
      }

      if (url.pathname === '/api/v1/habit-entries' && init?.method === 'GET') {
        const from = url.searchParams.get('from') ?? '';
        const to = url.searchParams.get('to') ?? '';
        const entriesInRange = habitEntries.filter(
          (entry) => entry.date >= from && entry.date <= to,
        );

        return Promise.resolve(
          new Response(JSON.stringify({ data: entriesInRange }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
        );
      }

      if (url.pathname === '/api/v1/dashboard/trends/weight' && init?.method === 'GET') {
        return Promise.resolve(
          new Response(JSON.stringify({ data: weightTrendData }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
        );
      }

      if (url.pathname === '/api/v1/dashboard/trends/macros' && init?.method === 'GET') {
        return Promise.resolve(
          new Response(JSON.stringify({ data: macroTrendData }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
        );
      }

      if (url.pathname === '/api/v1/weight' && init?.method === 'GET') {
        return Promise.resolve(
          new Response(JSON.stringify({ data: weightEntriesData }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
        );
      }

      if (url.pathname === '/api/v1/workout-sessions' && init?.method === 'GET') {
        return Promise.resolve(
          new Response(JSON.stringify({ data: recentWorkoutsListData }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
        );
      }

      if (url.pathname === '/api/v1/weight' && init?.method === 'POST') {
        const body =
          typeof init.body === 'string'
            ? (JSON.parse(init.body) as { date: string; weight: number })
            : null;
        const nextDate = body?.date ?? snapshotForToday.date;
        const nextWeight = body?.weight ?? snapshotForToday.weight?.value ?? 0;
        const previousSnapshot = snapshotsByDate[nextDate] ?? snapshotForToday;

        snapshotsByDate[nextDate] = {
          ...previousSnapshot,
          date: nextDate,
          weight: {
            date: nextDate,
            unit: 'lb',
            value: nextWeight,
            trendValue: null,
          },
        };

        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                id: `weight-${nextDate}`,
                date: nextDate,
                weight: nextWeight,
                notes: null,
                createdAt: 1,
                updatedAt: 2,
              },
            }),
            {
              headers: { 'Content-Type': 'application/json' },
              status: 201,
            },
          ),
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

  it('renders the dashboard title, greeting, and responsive column layout with API snapshot data', async () => {
    const { wrapper } = createQueryClientWrapper();
    const { container } = render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
      { wrapper },
    );

    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/dashboard/snapshot?date=2026-03-05'),
      expect.objectContaining({ method: 'GET' }),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/dashboard/snapshot?date=2026-03-07'),
      expect.objectContaining({ method: 'GET' }),
    );

    const bodyWeightCard = screen
      .getAllByText('Trend Weight')[0]
      .closest('[data-slot="stat-card"]');
    expect(bodyWeightCard).toBeInTheDocument();
    expect(
      within(bodyWeightCard as HTMLElement).getByText(formatWeight(181.4)),
    ).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Good morning')).toBeInTheDocument();
    expect(screen.getByText('Friday, March 6, 2026')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back to today' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Calendar day picker')).toBeInTheDocument();
    expect(screen.getByText('Habits')).toBeInTheDocument();
    expect(screen.getByLabelText('Macro display mode')).toBeInTheDocument();
    expect(screen.getByLabelText('Habit chains')).toBeInTheDocument();
    expect(screen.getByLabelText('Trend sparklines')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Weight Trend' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recent Workouts' })).toBeInTheDocument();
    expect(screen.getByText('Upper Push A (Completed)')).toBeInTheDocument();
    expect(screen.getByText('1900 / 2300')).toBeInTheDocument();
    const proteinCard = screen.getAllByText('Protein')[0]?.closest('[data-slot="stat-card"]');
    expect(within(proteinCard as HTMLElement).getByText('170g / 190g')).toBeInTheDocument();
    expect(screen.getByText('1/1')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-log-weight-card')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'View history' })).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'View weight history' })).toHaveAttribute(
      'href',
      '/weight/history',
    );
    expect(screen.getByRole('link', { name: 'View nutrition details' })).toHaveAttribute(
      'href',
      '/nutrition',
    );
    expect(screen.getByRole('link', { name: 'View habits details' })).toHaveAttribute(
      'href',
      '/habits',
    );
    expect(screen.queryByTestId('dashboard-log-weight-form')).not.toBeInTheDocument();

    const layout = container.querySelector('[data-slot="dashboard-layout"]');
    const mainColumn = container.querySelector('[data-slot="dashboard-main-column"]');
    const sidebarColumn = container.querySelector('[data-slot="dashboard-sidebar-column"]');
    const recentColumn = container.querySelector('[data-slot="dashboard-recent-workouts-column"]');
    const weightTrendRow = container.querySelector('[data-slot="dashboard-weight-trend-row"]');
    const calendarPanel = container.querySelector('[data-slot="dashboard-calendar-panel"]');
    const snapshotPanel = container.querySelector('[data-slot="dashboard-snapshot-panel"]');
    const macroPanel = container.querySelector('[data-slot="dashboard-macro-panel"]');

    expect(layout).toHaveClass(
      'grid',
      'min-w-0',
      'grid-cols-1',
      'gap-3',
      'md:grid-cols-2',
      'xl:grid-cols-[minmax(220px,248px)_minmax(0,1fr)_minmax(260px,300px)]',
    );
    expect(mainColumn).toHaveClass('order-1', 'gap-3', 'md:order-1', 'xl:order-2');
    expect(sidebarColumn).toHaveClass('order-2', 'gap-3', 'md:order-2', 'xl:order-1');
    expect(
      container.querySelector('[data-qa="dashboard-log-weight-form"]'),
    ).not.toBeInTheDocument();
    expect(recentColumn).toHaveClass('order-3', 'md:col-span-2', 'xl:col-span-1', 'xl:col-start-3');
    expect(weightTrendRow).toHaveClass('order-4', 'md:col-span-2', 'xl:col-span-3');
    expect(calendarPanel).toHaveClass('order-1', 'md:order-3');
    expect(snapshotPanel).toHaveClass('order-2', 'md:order-1');
    expect(macroPanel).toHaveClass('order-3', 'md:order-2');
    expect(screen.getByTestId('dashboard-log-weight-card')).toHaveClass('gap-3', 'py-3');
  });

  it('opens contextual dashboard help from the page header', async () => {
    const { wrapper } = createQueryClientWrapper();
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
      { wrapper },
    );

    await vi.runAllTimersAsync();
    await Promise.resolve();

    fireEvent.click(screen.getByRole('button', { name: 'Help' }));

    expect(screen.getByRole('heading', { name: 'Dashboard help' })).toBeInTheDocument();
    expect(
      screen.getByText(/nutrition totals come from meals logged by your AI agent/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/habit streaks show how many consecutive days/i)).toBeInTheDocument();
  });

  it('renders stat-card skeletons while the dashboard snapshot request is pending', async () => {
    const deferredSnapshot = createDeferredResponse();

    mockFetch.mockImplementation((input: string | URL | Request, init?: RequestInit) => {
      const rawUrl =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost');

      if (url.pathname === '/api/v1/dashboard/snapshot' && init?.method === 'GET') {
        return deferredSnapshot.promise;
      }

      if (url.pathname === '/api/v1/dashboard/config' && init?.method === 'GET') {
        return Promise.resolve(
          new Response(JSON.stringify({ data: dashboardConfig }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
        );
      }

      if (url.pathname === '/api/v1/habits' && init?.method === 'GET') {
        return Promise.resolve(
          new Response(JSON.stringify({ data: habits }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
        );
      }

      if (url.pathname === '/api/v1/habit-entries' && init?.method === 'GET') {
        return Promise.resolve(
          new Response(JSON.stringify({ data: habitEntries }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
        );
      }

      if (url.pathname === '/api/v1/dashboard/trends/weight' && init?.method === 'GET') {
        return Promise.resolve(
          new Response(JSON.stringify({ data: weightTrendData }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
        );
      }

      if (url.pathname === '/api/v1/dashboard/trends/macros' && init?.method === 'GET') {
        return Promise.resolve(
          new Response(JSON.stringify({ data: macroTrendData }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
        );
      }

      if (url.pathname === '/api/v1/weight' && init?.method === 'GET') {
        return Promise.resolve(
          new Response(JSON.stringify({ data: weightEntriesData }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
        );
      }

      if (url.pathname === '/api/v1/workout-sessions' && init?.method === 'GET') {
        return Promise.resolve(
          new Response(JSON.stringify({ data: recentWorkoutsListData }), {
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

    const { wrapper } = createQueryClientWrapper();
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
      { wrapper },
    );

    expect(screen.getByLabelText('Loading dashboard snapshots')).toBeInTheDocument();
    const skeletonCards = screen.getAllByTestId('stat-card-skeleton');
    expect(skeletonCards).toHaveLength(5);
    expect(skeletonCards[4]).toHaveClass('col-span-2');

    deferredSnapshot.resolve(
      new Response(JSON.stringify({ data: snapshotForToday }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    );

    await vi.runAllTimersAsync();
    await Promise.resolve();
    expect(screen.getAllByText('Trend Weight')[0]).toBeInTheDocument();
  });

  it('updates snapshot and habit chain windows when a new calendar day is selected', async () => {
    const { wrapper } = createQueryClientWrapper();
    const { container } = render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
      { wrapper },
    );

    await vi.runAllTimersAsync();
    await Promise.resolve();

    const bodyWeightCard = screen
      .getAllByText('Trend Weight')[0]
      .closest('[data-slot="stat-card"]');
    const habitsCard = screen.getByText('Habits').closest('[data-slot="stat-card"]');

    expect(bodyWeightCard).toBeInTheDocument();
    expect(habitsCard).toBeInTheDocument();
    expect(
      within(bodyWeightCard as HTMLElement).getByText(formatWeight(181.4)),
    ).toBeInTheDocument();
    expect(within(habitsCard as HTMLElement).getByText('1/1')).toBeInTheDocument();

    const initialSquares = container.querySelectorAll('[data-slot="habit-chain-day"]');
    expect(initialSquares[29]).toHaveAttribute('data-date', '2026-03-06');

    fireEvent.click(screen.getByRole('button', { name: /select wednesday, march 4, 2026/i }));

    await vi.runAllTimersAsync();
    await Promise.resolve();

    const refreshedBodyWeightCard = screen
      .getAllByText('Trend Weight')[0]
      .closest('[data-slot="stat-card"]') as HTMLElement;
    const refreshedHabitsCard = screen
      .getByText('Habits')
      .closest('[data-slot="stat-card"]') as HTMLElement;

    expect(within(refreshedBodyWeightCard).getByText('Log weight')).toBeInTheDocument();
    expect(within(refreshedHabitsCard).getByText('0/1')).toBeInTheDocument();
    expect(screen.getByText('Rest Day')).toBeInTheDocument();
    expect(screen.getByText('Wednesday, March 4, 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to today' })).toBeInTheDocument();

    const updatedSquares = container.querySelectorAll('[data-slot="habit-chain-day"]');
    expect(updatedSquares[29]).toHaveAttribute('data-date', '2026-03-04');
    expect(updatedSquares[29]).toHaveClass('border-[var(--color-primary)]');
    expect(
      mockFetch.mock.calls.some((call) => {
        const rawInput = call[0];
        const rawUrl =
          typeof rawInput === 'string'
            ? rawInput
            : rawInput instanceof URL
              ? rawInput.toString()
              : rawInput.url;

        return rawUrl.includes('/api/v1/dashboard/snapshot?date=2026-03-04');
      }),
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Back to today' }));

    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(screen.getByText('Friday, March 6, 2026')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back to today' })).not.toBeInTheDocument();
  });

  it('edits a logged weight entry and refreshes the body weight card', async () => {
    const { wrapper } = createQueryClientWrapper();
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
      { wrapper },
    );

    await vi.runAllTimersAsync();
    await Promise.resolve();

    const initialBodyWeightCard = screen
      .getAllByText('Trend Weight')[0]
      .closest('[data-slot="stat-card"]') as HTMLElement;

    expect(within(initialBodyWeightCard).getByText(formatWeight(181.4))).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Weight (lbs)'), { target: { value: '175.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Weight' }));

    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(screen.queryByLabelText('Weight (lbs)')).not.toBeInTheDocument();
    const refreshedBodyWeightCard = screen
      .getAllByText('Trend Weight')[0]
      .closest('[data-slot="stat-card"]') as HTMLElement;

    expect(within(refreshedBodyWeightCard).getByText('175.5 lbs')).toBeInTheDocument();
  });

  it('shows a log weight CTA for days without an entry and opens the inline form', async () => {
    const { wrapper } = createQueryClientWrapper();
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
      { wrapper },
    );

    await vi.runAllTimersAsync();
    await Promise.resolve();

    fireEvent.click(screen.getByRole('button', { name: /select wednesday, march 4, 2026/i }));

    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(screen.getByTestId('dashboard-log-weight-cta')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Weight (lbs)')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('dashboard-log-weight-cta'));

    expect(screen.getByLabelText('Weight (lbs)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Weight' })).toBeInTheDocument();
  });

  it('renders only configured habit chains and trend metrics', async () => {
    dashboardConfig = {
      habitChainIds: [],
      trendMetrics: ['protein'],
      visibleWidgets: DEFAULT_VISIBLE_WIDGETS,
    };

    const { wrapper } = createQueryClientWrapper();
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
      { wrapper },
    );

    await vi.runAllTimersAsync();
    await Promise.resolve();

    const trendSparklinesSection = screen.getByLabelText('Trend sparklines');

    expect(screen.getByText('Protein Trend')).toBeInTheDocument();
    expect(within(trendSparklinesSection).queryByText('Weight Trend')).not.toBeInTheDocument();
    expect(within(trendSparklinesSection).queryByText('Calorie Trend')).not.toBeInTheDocument();
    expect(screen.getByText('No matching habits.')).toBeInTheDocument();
  });

  it('hides the weight trend widget when it is excluded from visible widgets', async () => {
    dashboardConfig = {
      habitChainIds: ['habit-meditate'],
      trendMetrics: ['weight', 'calories', 'protein'],
      visibleWidgets: ['snapshot', 'macro-rings', 'habit-chain', 'trend-sparklines'],
    };

    const { wrapper } = createQueryClientWrapper();
    const { container } = render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
      { wrapper },
    );

    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(screen.queryByRole('heading', { name: 'Weight Trend' })).not.toBeInTheDocument();
    expect(
      container.querySelector('[data-slot="dashboard-weight-trend-row"]'),
    ).not.toBeInTheDocument();
  });

  it('supports dashboard widget edit mode with save and cancel behavior', async () => {
    const { wrapper } = createQueryClientWrapper();
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
      { wrapper },
    );

    await vi.runAllTimersAsync();
    await Promise.resolve();

    fireEvent.click(screen.getByRole('button', { name: 'Edit dashboard widgets' }));

    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hide Recent Workouts widget' }));
    await vi.runAllTimersAsync();
    await Promise.resolve();
    expect(screen.queryByRole('heading', { name: 'Recent Workouts' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Hidden widgets' })).toBeInTheDocument();
    expect(screen.getByText('Recent Workouts')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    await vi.runAllTimersAsync();
    await Promise.resolve();
    expect(screen.getByRole('heading', { name: 'Recent Workouts' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hide Recent Workouts widget' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recent Workouts' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit dashboard widgets' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hide Recent Workouts widget' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await vi.runAllTimersAsync();
    await Promise.resolve();
    expect(screen.queryByRole('heading', { name: 'Recent Workouts' })).not.toBeInTheDocument();

    const saveRequest = mockFetch.mock.calls.find(([url, init]) => {
      const raw = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      return raw.includes('/api/v1/dashboard/config') && init?.method === 'PUT';
    });

    expect(saveRequest).toBeDefined();
    expect(JSON.parse(String(saveRequest?.[1]?.body))).toMatchObject({
      visibleWidgets: expect.not.arrayContaining(['recent-workouts']),
    });
  });

  it('stays in edit mode and shows an error when widget visibility save fails', async () => {
    shouldFailDashboardConfigSave = true;
    const { wrapper } = createQueryClientWrapper();
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
      { wrapper },
    );

    await vi.runAllTimersAsync();
    await Promise.resolve();

    fireEvent.click(screen.getByRole('button', { name: 'Edit dashboard widgets' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hide Recent Workouts widget' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await vi.runAllTimersAsync();
    await Promise.resolve();
    expect(
      screen.getByText('Unable to save widget visibility. Please try again.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Hidden widgets' })).toBeInTheDocument();
  });

  it('renders the dashboard empty state when there are no habits and no recent workouts', async () => {
    const emptySnapshot: DashboardSnapshot = {
      date: '2026-03-06',
      weight: null,
      macros: {
        actual: {
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
        },
        target: {
          calories: 2300,
          protein: 190,
          carbs: 260,
          fat: 75,
        },
      },
      workout: null,
      habits: {
        total: 0,
        completed: 0,
        percentage: 0,
      },
    };

    mockFetch.mockImplementation((input: string | URL | Request, init?: RequestInit) => {
      const rawUrl =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost');

      if (url.pathname === '/api/v1/dashboard/snapshot' && init?.method === 'GET') {
        return Promise.resolve(
          new Response(JSON.stringify({ data: emptySnapshot }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
        );
      }

      if (url.pathname === '/api/v1/dashboard/config' && init?.method === 'GET') {
        return Promise.resolve(
          new Response(JSON.stringify({ data: dashboardConfig }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
        );
      }

      if (url.pathname === '/api/v1/habits' && init?.method === 'GET') {
        return Promise.resolve(
          new Response(JSON.stringify({ data: [] }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
        );
      }

      if (url.pathname === '/api/v1/habit-entries' && init?.method === 'GET') {
        return Promise.resolve(
          new Response(JSON.stringify({ data: [] }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
        );
      }

      if (url.pathname === '/api/v1/workout-sessions' && init?.method === 'GET') {
        return Promise.resolve(
          new Response(JSON.stringify({ data: [] }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
        );
      }

      if (url.pathname === '/api/v1/dashboard/trends/weight' && init?.method === 'GET') {
        return Promise.resolve(
          new Response(JSON.stringify({ data: [] }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
        );
      }

      if (url.pathname === '/api/v1/dashboard/trends/macros' && init?.method === 'GET') {
        return Promise.resolve(
          new Response(JSON.stringify({ data: [] }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
        );
      }

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

    const { wrapper } = createQueryClientWrapper();
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
      { wrapper },
    );

    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(screen.getByRole('heading', { name: 'Welcome to Pulse!' })).toBeInTheDocument();
    expect(
      screen.getByText('Start by setting up your habits and logging your first workout.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Recent Workouts' })).not.toBeInTheDocument();
  });
});

describe('getDashboardGreeting', () => {
  it('returns time-of-day greetings for morning, afternoon, and evening', () => {
    expect(getDashboardGreeting(new Date('2026-03-06T08:00:00'))).toBe('Good morning');
    expect(getDashboardGreeting(new Date('2026-03-06T14:00:00'))).toBe('Good afternoon');
    expect(getDashboardGreeting(new Date('2026-03-06T20:00:00'))).toBe('Good evening');
  });
});

import type { DashboardConfig, DashboardSnapshot, Habit, HabitEntry } from '@pulse/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getDashboardGreeting } from '@/features/dashboard/lib/greeting';
import { createQueryClientWrapper } from '@/test/query-client';

import { DashboardPage } from './dashboard';

const formatWeight = (value: number): string => `${value.toFixed(1)} lbs`;

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
    sortOrder: 0,
    target: null,
    trackingType: 'boolean',
    unit: null,
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
    };

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
        const entriesInRange = habitEntries.filter((entry) => entry.date >= from && entry.date <= to);

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

      if (url.pathname === '/api/v1/workout-sessions' && init?.method === 'GET') {
        return Promise.resolve(
          new Response(JSON.stringify({ data: recentWorkoutsListData }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
        );
      }

      if (url.pathname === '/api/v1/weight' && init?.method === 'POST') {
        const body = typeof init.body === 'string' ? (JSON.parse(init.body) as { date: string; weight: number }) : null;
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

    const bodyWeightCard = screen.getByText('Body Weight').closest('[data-slot="stat-card"]');
    expect(bodyWeightCard).toBeInTheDocument();
    expect(within(bodyWeightCard as HTMLElement).getByText(formatWeight(181.4))).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Good morning')).toBeInTheDocument();
    expect(screen.getByLabelText('Calendar day picker')).toBeInTheDocument();
    expect(screen.getByText('Habits')).toBeInTheDocument();
    expect(screen.getByLabelText('Macro display mode')).toBeInTheDocument();
    expect(screen.getByLabelText('Habit chains')).toBeInTheDocument();
    expect(screen.getByLabelText('Trend sparklines')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recent Workouts' })).toBeInTheDocument();
    expect(screen.getByText('Upper Push A (Completed)')).toBeInTheDocument();
    expect(screen.getByText('1900 / 2300')).toBeInTheDocument();
    expect(screen.getByText('170g / 190g')).toBeInTheDocument();
    expect(screen.getByText('1 / 1 complete')).toBeInTheDocument();
    expect(screen.getByLabelText('Weight (lbs)')).toHaveAttribute('id', 'dashboard-weight-input');
    expect(screen.getByLabelText('Weight (lbs)')).toHaveAttribute('name', 'weight');
    expect(screen.getByLabelText('Weight (lbs)')).toHaveAttribute(
      'data-qa',
      'dashboard-weight-input',
    );
    expect(screen.getByText('Log Weight').closest('[data-qa]')).toHaveAttribute(
      'data-qa',
      'dashboard-log-weight-card',
    );
    expect(screen.getByTestId('dashboard-log-weight-card')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Weight' })).toHaveAttribute(
      'data-qa',
      'dashboard-save-weight',
    );
    expect(screen.getByRole('button', { name: 'Save Weight' })).toHaveAttribute(
      'id',
      'dashboard-save-weight',
    );
    expect(screen.getByTestId('dashboard-weight-input')).toHaveAttribute(
      'data-testid',
      'dashboard-weight-input',
    );
    expect(screen.getByTestId('dashboard-save-weight')).toHaveAttribute(
      'data-testid',
      'dashboard-save-weight',
    );

    const layout = container.querySelector('[data-slot="dashboard-layout"]');
    const mainColumn = container.querySelector('[data-slot="dashboard-main-column"]');
    const sidebarColumn = container.querySelector('[data-slot="dashboard-sidebar-column"]');
    const logWeightForm = container.querySelector('[data-qa="dashboard-log-weight-form"]');
    const recentColumn = container.querySelector('[data-slot="dashboard-recent-workouts-column"]');
    const calendarPanel = container.querySelector('[data-slot="dashboard-calendar-panel"]');
    const snapshotPanel = container.querySelector('[data-slot="dashboard-snapshot-panel"]');
    const macroPanel = container.querySelector('[data-slot="dashboard-macro-panel"]');

    expect(layout).toHaveClass(
      'grid',
      'min-w-0',
      'grid-cols-1',
      'gap-6',
      'md:grid-cols-2',
      'xl:grid-cols-[minmax(240px,280px)_minmax(0,1fr)_minmax(280px,320px)]',
    );
    expect(mainColumn).toHaveClass('order-1', 'md:order-1', 'xl:order-2');
    expect(sidebarColumn).toHaveClass('order-2', 'md:order-2', 'xl:order-1');
    expect(logWeightForm).toBeInTheDocument();
    expect(recentColumn).toHaveClass('order-3', 'md:col-start-2', 'xl:col-start-3');
    expect(calendarPanel).toHaveClass('order-1', 'md:order-3');
    expect(snapshotPanel).toHaveClass('order-2', 'md:order-1');
    expect(macroPanel).toHaveClass('order-3', 'md:order-2');
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

    const bodyWeightCard = screen.getByText('Body Weight').closest('[data-slot="stat-card"]');
    const habitsCard = screen.getByText('Habits').closest('[data-slot="stat-card"]');

    expect(bodyWeightCard).toBeInTheDocument();
    expect(habitsCard).toBeInTheDocument();
    expect(within(bodyWeightCard as HTMLElement).getByText(formatWeight(181.4))).toBeInTheDocument();
    expect(within(habitsCard as HTMLElement).getByText('1 / 1 complete')).toBeInTheDocument();

    const initialSquares = container.querySelectorAll('[data-slot="habit-chain-day"]');
    expect(initialSquares[29]).toHaveAttribute('data-date', '2026-03-06');

    fireEvent.click(screen.getByRole('button', { name: /select wednesday, march 4, 2026/i }));

    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(within(bodyWeightCard as HTMLElement).getByText('--')).toBeInTheDocument();
    expect(within(habitsCard as HTMLElement).getByText('0 / 1 complete')).toBeInTheDocument();
    expect(screen.getByText('Rest Day')).toBeInTheDocument();

    const updatedSquares = container.querySelectorAll('[data-slot="habit-chain-day"]');
    expect(updatedSquares[29]).toHaveAttribute('data-date', '2026-03-04');
    expect(updatedSquares[29]).toHaveAttribute('data-today', 'true');
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
  });

  it('logs a new weight entry and refreshes the body weight card', async () => {
    vi.useRealTimers();

    const { wrapper } = createQueryClientWrapper();
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
      { wrapper },
    );

    const bodyWeightCard = screen.getByText('Body Weight').closest('[data-slot="stat-card"]');
    expect(bodyWeightCard).toBeInTheDocument();
    await waitFor(() => {
      expect(within(bodyWeightCard as HTMLElement).getByText(formatWeight(181.4))).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Weight (lbs)'), { target: { value: '175.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Weight' }));

    await waitFor(() => {
      expect(screen.getByText('Weight entry saved.')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(within(bodyWeightCard as HTMLElement).getByText('175.5 lbs')).toBeInTheDocument();
    });
  });

  it('renders only configured habit chains and trend metrics', async () => {
    dashboardConfig = {
      habitChainIds: [],
      trendMetrics: ['protein'],
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

    expect(screen.getByText('Protein Trend')).toBeInTheDocument();
    expect(screen.queryByText('Weight Trend')).not.toBeInTheDocument();
    expect(screen.queryByText('Calorie Trend')).not.toBeInTheDocument();
    expect(screen.getByText('No matching habits.')).toBeInTheDocument();
  });
});

describe('getDashboardGreeting', () => {
  it('returns time-of-day greetings for morning, afternoon, and evening', () => {
    expect(getDashboardGreeting(new Date('2026-03-06T08:00:00'))).toBe('Good morning');
    expect(getDashboardGreeting(new Date('2026-03-06T14:00:00'))).toBe('Good afternoon');
    expect(getDashboardGreeting(new Date('2026-03-06T20:00:00'))).toBe('Good evening');
  });
});

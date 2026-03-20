import {
  type DashboardConfig,
  DASHBOARD_WIDGET_IDS,
  type DashboardSnapshot,
  type Habit,
  type HabitEntry,
} from '@pulse/shared';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { type ReactNode } from 'react';
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

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({
    children,
    onDragEnd,
  }: {
    children: ReactNode;
    onDragEnd?: (event: { active: { id: string }; over: { id: string } | null }) => void;
  }) => (
    <div data-testid="mock-dnd-context">
      <button
        aria-label="Mock reorder widgets"
        onClick={() =>
          onDragEnd?.({
            active: { id: 'recent-workouts' },
            over: { id: 'snapshot-cards' },
          })
        }
        type="button"
      >
        reorder
      </button>
      {children}
    </div>
  ),
  KeyboardSensor: function KeyboardSensor() {
    return undefined;
  },
  PointerSensor: function PointerSensor() {
    return undefined;
  },
  closestCenter: () => null,
  useSensor: () => ({}),
  useSensors: (...sensors: unknown[]) => sensors,
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: ReactNode }) => children,
  arrayMove: (items: unknown[], oldIndex: number, newIndex: number) => {
    if (oldIndex === newIndex) {
      return [...items];
    }

    const copy = [...items];
    const [moved] = copy.splice(oldIndex, 1);
    copy.splice(newIndex, 0, moved);
    return copy;
  },
  sortableKeyboardCoordinates: () => ({ x: 0, y: 0 }),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => undefined,
    transform: null,
    transition: undefined,
  }),
  verticalListSortingStrategy: () => null,
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: () => '',
    },
  },
}));

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

    const dashboardHeading = screen.getByRole('heading', { name: 'Dashboard' });
    const greeting = screen.getByText('Good morning');

    expect(dashboardHeading).toBeInTheDocument();
    expect(greeting).toBeInTheDocument();
    expect(
      greeting.compareDocumentPosition(dashboardHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText('Friday, March 6, 2026')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back to today' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change date' })).toBeInTheDocument();
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
    expect(screen.getAllByRole('link', { name: 'View weight history' })).toHaveLength(3);
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
    const snapshotPanel = container.querySelector('[data-slot="dashboard-snapshot-panel"]');
    const macroPanel = container.querySelector('[data-slot="dashboard-macro-panel"]');

    expect(layout).toBeInTheDocument();
    expect(mainColumn).toBeInTheDocument();
    expect(sidebarColumn).toBeInTheDocument();
    expect(recentColumn).toBeInTheDocument();
    expect(weightTrendRow).toBeInTheDocument();
    expect(snapshotPanel).toBeInTheDocument();
    expect(macroPanel).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-log-weight-card')).toBeInTheDocument();
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

  it('updates snapshot when a new calendar day is selected via the date popover', async () => {
    const { wrapper } = createQueryClientWrapper();
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
      { wrapper },
    );

    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(screen.getByText('Friday, March 6, 2026')).toBeInTheDocument();

    // Open the calendar popover
    fireEvent.click(screen.getByRole('button', { name: 'Change date' }));

    await vi.runAllTimersAsync();
    await Promise.resolve();

    fireEvent.click(screen.getByRole('button', { name: /select wednesday, march 4, 2026/i }));

    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(screen.getByText('Wednesday, March 4, 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to today' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to today' }));

    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(screen.getByText('Friday, March 6, 2026')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back to today' })).not.toBeInTheDocument();
  }, 15_000);

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

    // Open the calendar popover and select March 4
    fireEvent.click(screen.getByRole('button', { name: 'Change date' }));
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

  it('renders habit daily cards from dashboard config and coexists with habit chains', async () => {
    dashboardConfig = {
      habitChainIds: ['habit-meditate'],
      trendMetrics: ['weight', 'calories', 'protein'],
      visibleWidgets: [...DEFAULT_VISIBLE_WIDGETS, 'habit-daily:habit-meditate'],
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

    expect(screen.getByTestId('habit-daily-status-card-habit-meditate')).toBeInTheDocument();
    expect(screen.getByLabelText('Habit chains')).toBeInTheDocument();
    expect(screen.getAllByText('Meditate').length).toBeGreaterThan(1);
  });

  it('shows habit daily card loading state while habits are still loading', async () => {
    dashboardConfig = {
      habitChainIds: ['habit-meditate'],
      trendMetrics: ['weight', 'calories', 'protein'],
      visibleWidgets: [...DEFAULT_VISIBLE_WIDGETS, 'habit-daily:habit-meditate'],
    };
    const deferredHabits = createDeferredResponse();
    const defaultFetchImplementation = mockFetch.getMockImplementation() as
      | ((input: string | URL | Request, init?: RequestInit) => Promise<Response>)
      | undefined;

    mockFetch.mockImplementation((input: string | URL | Request, init?: RequestInit) => {
      const rawUrl =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost');

      if (url.pathname === '/api/v1/habits' && init?.method === 'GET') {
        return deferredHabits.promise;
      }

      return (
        defaultFetchImplementation?.(input, init) ??
        Promise.resolve(
          new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found' } }), {
            headers: { 'Content-Type': 'application/json' },
            status: 404,
          }),
        )
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

    expect(
      screen.getByTestId('habit-daily-status-card-loading-habit-meditate'),
    ).toBeInTheDocument();

    deferredHabits.resolve(
      new Response(JSON.stringify({ data: habits }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    );

    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(screen.getByTestId('habit-daily-status-card-habit-meditate')).toBeInTheDocument();
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

  it('opens the dashboard widget sidebar when edit is clicked', async () => {
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

    expect(screen.getByTestId('dashboard-widget-sidebar')).toBeInTheDocument();
    expect(screen.getByText('Dashboard widgets')).toBeInTheDocument();
  });

  it('toggles widget visibility from sidebar switches and saves via PUT', async () => {
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
    fireEvent.click(screen.getByRole('switch', { name: 'Toggle Recent Workouts widget' }));

    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(screen.queryByRole('heading', { name: 'Recent Workouts' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await vi.runAllTimersAsync();
    await Promise.resolve();

    const saveRequest = mockFetch.mock.calls.find(([url, init]) => {
      const raw = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      return raw.includes('/api/v1/dashboard/config') && init?.method === 'PUT';
    });

    expect(saveRequest).toBeDefined();
    expect(JSON.parse(String(saveRequest?.[1]?.body))).toMatchObject({
      visibleWidgets: expect.not.arrayContaining(['recent-workouts']),
    });
  });

  it('toggles habit daily sub-switches from the sidebar', async () => {
    const { wrapper } = createQueryClientWrapper();
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
      { wrapper },
    );

    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(screen.queryByTestId('habit-daily-status-card-habit-meditate')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit dashboard widgets' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Toggle Meditate daily status widget' }));

    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(screen.getByTestId('habit-daily-status-card-habit-meditate')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: 'Toggle Meditate daily status widget' }));

    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(screen.queryByTestId('habit-daily-status-card-habit-meditate')).not.toBeInTheDocument();
  });

  it('updates visibleWidgets order when drag reorder completes', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Mock reorder widgets' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await vi.runAllTimersAsync();
    await Promise.resolve();

    const saveRequest = mockFetch.mock.calls.find(([url, init]) => {
      const raw = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      return raw.includes('/api/v1/dashboard/config') && init?.method === 'PUT';
    });

    expect(saveRequest).toBeDefined();
    expect(JSON.parse(String(saveRequest?.[1]?.body))).toMatchObject({
      visibleWidgets: expect.arrayContaining(DEFAULT_VISIBLE_WIDGETS),
    });
    expect(JSON.parse(String(saveRequest?.[1]?.body)).visibleWidgets[0]).toBe('recent-workouts');
  });

  it('saves dashboard config when the sidebar closes', async () => {
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
    fireEvent.click(screen.getByRole('switch', { name: 'Toggle Recent Workouts widget' }));

    const sidebar = screen.getByTestId('dashboard-widget-sidebar');
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Close' }));

    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(screen.queryByTestId('dashboard-widget-sidebar')).not.toBeInTheDocument();

    const saveRequest = mockFetch.mock.calls.find(([url, init]) => {
      const raw = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      return raw.includes('/api/v1/dashboard/config') && init?.method === 'PUT';
    });

    expect(saveRequest).toBeDefined();
    expect(JSON.parse(String(saveRequest?.[1]?.body))).toMatchObject({
      visibleWidgets: expect.not.arrayContaining(['recent-workouts']),
    });
  });

  it('saves changes when the sidebar closes and keeps it open on save failure', async () => {
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
    fireEvent.click(screen.getByRole('switch', { name: 'Toggle Recent Workouts widget' }));

    const sidebar = screen.getByTestId('dashboard-widget-sidebar');
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Close' }));

    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(screen.getByTestId('dashboard-widget-sidebar')).toBeInTheDocument();
    expect(
      screen.getByText('Unable to save dashboard widgets. Please try again.'),
    ).toBeInTheDocument();
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

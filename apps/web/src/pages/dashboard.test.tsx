import type { Habit, HabitEntry } from '@pulse/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useHabitEntries, useHabits } from '@/features/habits/api/habits';
import { getDashboardGreeting } from '@/features/dashboard/lib/greeting';
import { createQueryClientWrapper } from '@/test/query-client';
import { getMockSnapshotForDate } from '@/lib/mock-data/dashboard';
import { DashboardPage } from './dashboard';

const formatWeight = (value: number): string => `${value.toFixed(1)} lbs`;

vi.mock('@/features/habits/api/habits', () => ({
  useHabitEntries: vi.fn(),
  useHabits: vi.fn(),
}));

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

const mockedUseHabitEntries = vi.mocked(useHabitEntries);
const mockedUseHabits = vi.mocked(useHabits);

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

const todayEntry: HabitEntry = {
  completed: true,
  createdAt: 1,
  date: '2026-03-06',
  habitId: 'habit-meditate',
  id: 'entry-1',
  userId: 'user-1',
  value: null,
};

describe('DashboardPage', () => {
  let latestWeightEntry = {
    id: 'weight-latest',
    date: '2026-03-06',
    weight: 181.4,
    notes: null,
    createdAt: 1,
    updatedAt: 1,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T10:00:00'));
    latestWeightEntry = {
      id: 'weight-latest',
      date: '2026-03-06',
      weight: 181.4,
      notes: null,
      createdAt: 1,
      updatedAt: 1,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;

        if (url.includes('/api/v1/weight') && init?.method === 'POST') {
          const body =
            typeof init.body === 'string'
              ? (JSON.parse(init.body) as { date: string; weight: number })
              : null;

          latestWeightEntry = {
            id: 'weight-latest',
            date: body?.date ?? latestWeightEntry.date,
            weight: body?.weight ?? latestWeightEntry.weight,
            notes: null,
            createdAt: latestWeightEntry.createdAt,
            updatedAt: latestWeightEntry.updatedAt + 1,
          };

          return Promise.resolve(
            new Response(JSON.stringify({ data: latestWeightEntry }), {
              headers: { 'Content-Type': 'application/json' },
              status: 201,
            }),
          );
        }

        if (url.includes('/api/v1/weight/latest')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                data: latestWeightEntry,
              }),
              { headers: { 'Content-Type': 'application/json' }, status: 200 },
            ),
          );
        }

        if (url.includes('/api/v1/nutrition-targets/current')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                data: {
                  id: 'target-current',
                  calories: 2300,
                  protein: 190,
                  carbs: 260,
                  fat: 75,
                  effectiveDate: '2026-03-06',
                  createdAt: 1,
                  updatedAt: 1,
                },
              }),
              { headers: { 'Content-Type': 'application/json' }, status: 200 },
            ),
          );
        }

        return Promise.resolve(
          new Response(JSON.stringify({ data: null }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
        );
      }),
    );

    mockedUseHabits.mockReturnValue({
      data: habits,
      error: null,
      isError: false,
      isPending: false,
    } as ReturnType<typeof useHabits>);
    mockedUseHabitEntries.mockImplementation(
      (from, to) =>
        ({
          data: from === '2026-03-06' && to === '2026-03-06' ? [todayEntry] : [todayEntry],
          error: null,
          isError: false,
          isPending: false,
        }) as ReturnType<typeof useHabitEntries>,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('renders the dashboard title, greeting, and responsive column layout', () => {
    const { wrapper } = createQueryClientWrapper();
    const { container } = render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
      { wrapper },
    );

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Good morning')).toBeInTheDocument();
    expect(screen.getByLabelText('Calendar day picker')).toBeInTheDocument();
    expect(screen.getByText('Body Weight')).toBeInTheDocument();
    expect(screen.getByText('Habits')).toBeInTheDocument();
    expect(screen.getByLabelText('Macro display mode')).toBeInTheDocument();
    expect(screen.getByLabelText('Habit chains')).toBeInTheDocument();
    expect(screen.getByLabelText('Trend sparklines')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recent Workouts' })).toBeInTheDocument();
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

  it('updates snapshot content when a new calendar day is selected', async () => {
    mockedUseHabitEntries.mockImplementation(
      (from, to) =>
        ({
          data: from === '2026-03-04' && to === '2026-03-04' ? [] : [todayEntry],
          error: null,
          isError: false,
          isPending: false,
        }) as ReturnType<typeof useHabitEntries>,
    );

    const { wrapper } = createQueryClientWrapper();
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
      { wrapper },
    );

    const selectedSnapshot = getMockSnapshotForDate(new Date('2026-03-04T00:00:00'));
    const bodyWeightCard = screen.getByText('Body Weight').closest('[data-slot="stat-card"]');
    const habitsCard = screen.getByText('Habits').closest('[data-slot="stat-card"]');

    expect(bodyWeightCard).toBeInTheDocument();
    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(habitsCard).toBeInTheDocument();
    expect(
      within(bodyWeightCard as HTMLElement).getByText(formatWeight(181.4)),
    ).toBeInTheDocument();
    expect(within(habitsCard as HTMLElement).getByText('1 / 1 complete')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /select wednesday, march 4, 2026/i }));

    expect(
      within(bodyWeightCard as HTMLElement).getByText(formatWeight(181.4)),
    ).toBeInTheDocument();
    expect(screen.getByText(`${selectedSnapshot.macros.calories.actual}kcal`)).toBeInTheDocument();
    expect(within(habitsCard as HTMLElement).getByText('0 / 1 complete')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recent Workouts' })).toBeInTheDocument();
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
      expect(
        within(bodyWeightCard as HTMLElement).getByText(formatWeight(181.4)),
      ).toBeInTheDocument();
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
});

describe('getDashboardGreeting', () => {
  it('returns time-of-day greetings for morning, afternoon, and evening', () => {
    expect(getDashboardGreeting(new Date('2026-03-06T08:00:00'))).toBe('Good morning');
    expect(getDashboardGreeting(new Date('2026-03-06T14:00:00'))).toBe('Good afternoon');
    expect(getDashboardGreeting(new Date('2026-03-06T20:00:00'))).toBe('Good evening');
  });
});

import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getDashboardGreeting } from '@/features/dashboard/lib/greeting';
import { getMockSnapshotForDate } from '@/lib/mock-data/dashboard';
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

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T10:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the dashboard title, greeting, and responsive column layout', () => {
    const { container } = render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Good morning')).toBeInTheDocument();
    expect(screen.getByLabelText('Calendar day picker')).toBeInTheDocument();
    expect(screen.getByText('Body Weight')).toBeInTheDocument();
    expect(screen.getByLabelText('Macro display mode')).toBeInTheDocument();
    expect(screen.getByLabelText('Habit chains')).toBeInTheDocument();
    expect(screen.getByLabelText('Trend sparklines')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recent Workouts' })).toBeInTheDocument();

    const layout = container.querySelector('[data-slot="dashboard-layout"]');
    const mainColumn = container.querySelector('[data-slot="dashboard-main-column"]');
    const sidebarColumn = container.querySelector('[data-slot="dashboard-sidebar-column"]');
    const recentColumn = container.querySelector('[data-slot="dashboard-recent-workouts-column"]');
    const calendarPanel = container.querySelector('[data-slot="dashboard-calendar-panel"]');
    const snapshotPanel = container.querySelector('[data-slot="dashboard-snapshot-panel"]');
    const macroPanel = container.querySelector('[data-slot="dashboard-macro-panel"]');

    expect(layout).toHaveClass(
      'grid',
      'grid-cols-1',
      'gap-6',
      'md:grid-cols-2',
      'xl:grid-cols-[280px_1fr_300px]',
    );
    expect(mainColumn).toHaveClass('order-1', 'md:order-1', 'xl:order-2');
    expect(sidebarColumn).toHaveClass('order-2', 'md:order-2', 'xl:order-1');
    expect(recentColumn).toHaveClass('order-3', 'md:col-start-2', 'xl:col-start-3');
    expect(calendarPanel).toHaveClass('order-1', 'md:order-3');
    expect(snapshotPanel).toHaveClass('order-2', 'md:order-1');
    expect(macroPanel).toHaveClass('order-3', 'md:order-2');
  });

  it('updates snapshot content when a new calendar day is selected', () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    const todaySnapshot = getMockSnapshotForDate(new Date('2026-03-06T00:00:00'));
    const selectedSnapshot = getMockSnapshotForDate(new Date('2026-03-04T00:00:00'));
    const bodyWeightCard = screen.getByText('Body Weight').closest('[data-slot="stat-card"]');

    expect(bodyWeightCard).toBeInTheDocument();
    expect(
      within(bodyWeightCard as HTMLElement).getByText(formatWeight(todaySnapshot.weight)),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /select wednesday, march 4, 2026/i }));

    expect(
      within(bodyWeightCard as HTMLElement).getByText(formatWeight(selectedSnapshot.weight)),
    ).toBeInTheDocument();
    expect(screen.getByText(`${selectedSnapshot.macros.calories.actual}kcal`)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recent Workouts' })).toBeInTheDocument();
  });
});

describe('getDashboardGreeting', () => {
  it('returns time-of-day greetings for morning, afternoon, and evening', () => {
    expect(getDashboardGreeting(new Date('2026-03-06T08:00:00'))).toBe('Good morning');
    expect(getDashboardGreeting(new Date('2026-03-06T14:00:00'))).toBe('Good afternoon');
    expect(getDashboardGreeting(new Date('2026-03-06T20:00:00'))).toBe('Good evening');
  });
});

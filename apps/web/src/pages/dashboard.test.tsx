import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('updates snapshot content when a new calendar day is selected', () => {
    render(<DashboardPage />);

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
  });
});

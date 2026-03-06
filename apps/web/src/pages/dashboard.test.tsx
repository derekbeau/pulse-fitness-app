import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getMockSnapshotForDate } from '@/lib/mock-data/dashboard';
import { DashboardPage } from './dashboard';

const formatWeight = (value: number): string => `${value.toFixed(1)} lbs`;

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

    expect(screen.getByText(formatWeight(todaySnapshot.weight))).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /select wednesday, march 4, 2026/i }));

    expect(screen.getByText(formatWeight(selectedSnapshot.weight))).toBeInTheDocument();
  });
});

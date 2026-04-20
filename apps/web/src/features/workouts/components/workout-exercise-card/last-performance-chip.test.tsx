import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useLastPerformance } from '@/hooks/use-last-performance';

import { LastPerformanceChip } from './last-performance-chip';

vi.mock('@/hooks/use-last-performance', () => ({
  useLastPerformance: vi.fn(),
}));

const useLastPerformanceMock = vi.mocked(useLastPerformance);
const asQueryResult = <T,>(value: T) => value as unknown as ReturnType<typeof useLastPerformance>;

describe('LastPerformanceChip', () => {
  it('renders loading state', () => {
    useLastPerformanceMock.mockReturnValue(
      asQueryResult({
        data: null,
        isPending: true,
      }),
    );

    render(
      <LastPerformanceChip exerciseId="exercise-1" trackingType="weight_reps" weightUnit="lbs" />,
    );

    expect(screen.getByText('Last performance: loading…')).toBeInTheDocument();
  });

  it('renders empty state when no history exists', () => {
    useLastPerformanceMock.mockReturnValue(
      asQueryResult({
        data: { history: null, historyEntries: [], related: [] },
        isPending: false,
      }),
    );

    render(
      <LastPerformanceChip exerciseId="exercise-1" trackingType="weight_reps" weightUnit="lbs" />,
    );

    expect(screen.getByText('Last performance: no history')).toBeInTheDocument();
  });

  it('renders formatted history chip when data exists', () => {
    useLastPerformanceMock.mockReturnValue(
      asQueryResult({
        data: {
          history: {
            date: '2026-04-15',
            notes: null,
            sessionId: 'session-1',
            sets: [{ completed: true, reps: 8, setNumber: 1, weight: 135 }],
          },
          historyEntries: [
            {
              date: '2026-04-15',
              notes: null,
              sessionId: 'session-1',
              sets: [{ completed: true, reps: 8, setNumber: 1, weight: 135 }],
            },
          ],
          related: [],
        },
        isPending: false,
      }),
    );

    render(
      <LastPerformanceChip exerciseId="exercise-1" trackingType="weight_reps" weightUnit="lbs" />,
    );

    expect(screen.getByText(/Last: Apr 15, 2026 · 135x8/i)).toBeInTheDocument();
  });
});

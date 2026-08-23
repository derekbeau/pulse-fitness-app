import { fireEvent, render, screen, within } from '@testing-library/react';
import type { WorkoutMuscleAnalytics } from '@pulse/shared';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { useWorkoutMuscleAnalytics } from '../api/progression';
import { MuscleAnalytics } from './muscle-analytics';

vi.mock('../api/progression', () => ({ useWorkoutMuscleAnalytics: vi.fn() }));
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div>
        {React.isValidElement(children)
          ? React.cloneElement(
              children as React.ReactElement<{ height?: number; width?: number }>,
              { height: 280, width: 640 },
            )
          : children}
      </div>
    ),
  };
});

const analytics: WorkoutMuscleAnalytics = {
  contributionVersion: 1,
  endDate: '2026-08-23',
  qualifyingSetPolicyVersion: 1,
  range: '30d',
  rows: [
    {
      change: 'increased',
      completedSessionCount: 1,
      exerciseCount: 1,
      exposureState: 'fully_completed',
      fulfilledPlannedSetEquivalents: 2,
      muscle: 'chest',
      plannedSetEquivalents: 2,
      previousQualifyingSetEquivalents: 1,
      priority: true,
      qualifyingSetEquivalents: 2,
      sourceCount: 2,
      sourceIds: ['set-1', 'planned-set-1'],
      sourceIdsTruncated: false,
      volumeLoad: 400,
    },
  ],
  series: [
    {
      date: '2026-08-20',
      muscle: 'chest',
      plannedSetEquivalents: 0,
      qualifyingSetEquivalents: 2,
      volumeLoad: 400,
    },
    {
      date: '2026-08-23',
      muscle: 'chest',
      plannedSetEquivalents: 2,
      qualifyingSetEquivalents: 0,
      volumeLoad: null,
    },
  ],
  sources: [
    {
      contributionId: 'contribution-1',
      date: '2026-08-20',
      exerciseId: 'exercise-1',
      exerciseName: 'Incline press',
      factor: 1,
      muscle: 'chest',
      role: 'primary',
      scheduledWorkoutId: null,
      sessionId: 'session-1',
      setId: 'set-1',
      sourceScheduledSetId: 'planned-set-1',
      sourceType: 'completed',
      volumeLoad: 400,
    },
  ],
  sourceCount: 1,
  sourcesTruncated: false,
  startDate: '2026-07-25',
  timeZone: 'America/Detroit',
  weightUnit: 'lbs',
};

describe('MuscleAnalytics', () => {
  it('renders versioned honest exposure, keyboard-operable exact values, and source links', () => {
    vi.mocked(useWorkoutMuscleAnalytics).mockReturnValue({
      data: analytics,
      isError: false,
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useWorkoutMuscleAnalytics>);
    render(
      <MemoryRouter>
        <MuscleAnalytics />
      </MemoryRouter>,
    );

    expect(screen.getByText(/not universal optimal-volume targets/i)).toBeInTheDocument();
    expect(
      screen.getByText(/only completions linked to an exact scheduled set/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('chest exposure summary')).toHaveTextContent(
      'Completed exposure21 completed sessionsPlanned exposure22 linked equivalents fulfilled · explicit programming priority',
    );
    expect(screen.getByText(/Showing 1 of 2 source records/)).toHaveTextContent(
      'The source list is truncated; totals and chart values still include the full interval.',
    );
    expect(screen.getByText('contribution policy v1')).toBeInTheDocument();
    expect(screen.getByText('qualifying-set policy v1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View source' })).toHaveAttribute(
      'href',
      '/workouts/session/session-1',
    );

    fireEvent.click(screen.getByText('View exact muscle exposure'));
    const row = screen.getByRole('row', { name: /Aug 20, 2026/ });
    expect(within(row).getByText('400')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Inspect chest on Aug 20, 2026/ }));
    expect(screen.getByLabelText('Selected chart point')).toHaveTextContent(
      'Aug 20, 20262 completed · 0 planned',
    );
  });

  it('switches the server-owned range without replacing the chart controls', () => {
    vi.mocked(useWorkoutMuscleAnalytics).mockReturnValue({
      data: analytics,
      isError: false,
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useWorkoutMuscleAnalytics>);
    render(
      <MemoryRouter>
        <MuscleAnalytics />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: '7D' }));
    expect(useWorkoutMuscleAnalytics).toHaveBeenLastCalledWith(
      expect.objectContaining({ range: '7d' }),
    );
    expect(screen.getByRole('button', { name: '7D' })).toHaveAttribute('aria-pressed', 'true');
  });
});

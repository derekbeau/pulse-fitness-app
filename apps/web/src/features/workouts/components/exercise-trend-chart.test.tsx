import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ExerciseTrendChart } from './exercise-trend-chart';
import { buildExerciseTrendData } from './exercise-trend-data';
import {
  computeEstimated1RM,
  computeSessionVolume,
  getMetricOptionsForTrackingType,
} from './exercise-trend-metrics';

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
                height: 320,
                width: 640,
              },
            )
          : children}
      </div>
    ),
  };
});

const sessions = [
  {
    date: '2026-01-05',
    notes: null,
    sessionId: 'session-1',
    sets: [
      { reps: 8, setNumber: 1, weight: 40 },
      { reps: 10, setNumber: 2, weight: 35 },
    ],
  },
  {
    date: '2026-02-09',
    notes: null,
    sessionId: 'session-2',
    sets: [
      { reps: 7, setNumber: 1, weight: 50 },
      { reps: 9, setNumber: 2, weight: 45 },
    ],
  },
  {
    date: '2026-03-01',
    notes: null,
    sessionId: 'session-3',
    sets: [
      { reps: 10, setNumber: 1, weight: 47.5 },
      { reps: 8, setNumber: 2, weight: 50 },
    ],
  },
];

describe('ExerciseTrendChart', () => {
  it('renders metric selector and switches metric values', () => {
    render(
      <ExerciseTrendChart
        exerciseName="Incline Dumbbell Press"
        sessions={sessions}
        trackingType="weight_reps"
        weightUnit="lbs"
      />,
    );

    expect(screen.getByRole('button', { name: 'Max Weight' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Total Volume' })).toBeInTheDocument();
    const summary = screen.getByLabelText('Selected exercise range summary');
    expect(within(summary).getByText('Latest max weight')).toBeInTheDocument();
    expect(within(summary).getAllByText('50 lbs')).not.toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Total Volume' }));

    expect(within(summary).getByText('Latest total volume')).toBeInTheDocument();
    expect(within(summary).getAllByText('875 lbs*reps')).not.toHaveLength(0);
  });

  it('filters chart history by date range', () => {
    render(
      <ExerciseTrendChart
        exerciseName="Incline Dumbbell Press"
        sessions={sessions}
        trackingType="weight_reps"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '1M' }));

    expect(screen.queryByText('Jan 5')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'All' }));

    expect(screen.getByText('Jan 5')).toBeInTheDocument();
  });

  it('shows an empty state when an exercise has no history', () => {
    render(
      <ExerciseTrendChart exerciseName="Air Bike" sessions={[]} trackingType="seconds_only" />,
    );

    expect(screen.getByText('No history in this range')).toBeInTheDocument();
    expect(
      screen.getByText(/complete a session with a supported max time value/i),
    ).toBeInTheDocument();
  });

  it('exposes exact values and keyboard-operable point inspection', () => {
    const { container } = render(
      <ExerciseTrendChart
        exerciseName="Incline Dumbbell Press"
        sessions={sessions}
        trackingType="weight_reps"
      />,
    );

    fireEvent.click(screen.getByText('View exact chart values'));
    fireEvent.click(screen.getByRole('button', { name: /Inspect Jan 5, 2026/ }));

    expect(screen.getByLabelText('Selected chart point')).toHaveTextContent(
      'Jan 5, 2026Max Weight 40 lbs',
    );
    const controlledId = screen.getByRole('button', { name: '3M' }).getAttribute('aria-controls');
    expect(controlledId).toBe('exercise-trend-visual');
    expect(container.querySelectorAll(`#${controlledId}`)).toHaveLength(1);
    expect(new Set([...container.querySelectorAll('[id]')].map((node) => node.id)).size).toBe(
      container.querySelectorAll('[id]').length,
    );
  });

  it('preserves deterministic identity for multiple sessions on the same date', () => {
    const sameDateSessions = [
      {
        date: '2026-08-22',
        notes: null,
        sessionId: 'session-b',
        sets: [{ reps: 8, setNumber: 1, weight: 50 }],
      },
      {
        date: '2026-08-22',
        notes: null,
        sessionId: 'session-a',
        sets: [{ reps: 8, setNumber: 1, weight: 40 }],
      },
    ];

    expect(
      buildExerciseTrendData({
        metric: 'max_weight',
        sessions: sameDateSessions,
        trackingType: 'weight_reps',
      }).map((point) => [point.sessionId, point.value]),
    ).toEqual([
      ['session-a', 40],
      ['session-b', 50],
    ]);

    render(
      <ExerciseTrendChart
        exerciseName="Same-day Press"
        sessions={sameDateSessions}
        trackingType="weight_reps"
      />,
    );
    fireEvent.click(screen.getByText('View exact chart values'));
    const secondSession = screen.getByRole('button', {
      name: /Inspect Aug 22, 2026 · session 2 of 2/,
    });
    fireEvent.click(secondSession);
    expect(screen.getByLabelText('Selected chart point')).toHaveTextContent(
      'Aug 22, 2026Session 2 of 2Max Weight 50 lbs',
    );
  });

  it('computeEstimated1RM follows Epley formula', () => {
    expect(computeEstimated1RM(100, 10)).toBeCloseTo(133.3, 1);
  });

  it('computeSessionVolume sums weight and reps across sets', () => {
    expect(
      computeSessionVolume([
        { reps: 10, weight: 100 },
        { reps: 8, weight: 90 },
      ]),
    ).toBe(1720);
  });

  it('filters available metrics by tracking type', () => {
    expect(getMetricOptionsForTrackingType('weight_reps').map((metric) => metric.key)).toEqual([
      'max_weight',
      'max_reps',
      'total_volume',
      'est_1rm',
    ]);

    expect(getMetricOptionsForTrackingType('seconds_only').map((metric) => metric.key)).toEqual([
      'max_time',
    ]);
  });

  it('keeps unsupported session values out of the typed series instead of converting them to zero', () => {
    expect(
      buildExerciseTrendData({
        metric: 'max_weight',
        sessions: [...sessions, { date: '2026-03-02', notes: null, sessionId: 'blank', sets: [] }],
        trackingType: 'weight_reps',
      }),
    ).toHaveLength(3);
  });

  it.each([
    ['max_weight', 'weight_reps', { reps: 8, seconds: null, weight: null }],
    ['total_volume', 'weight_reps', { reps: 8, seconds: null, weight: null }],
    ['est_1rm', 'weight_reps', { reps: 8, seconds: null, weight: null }],
    ['max_weight', 'weight_seconds', { reps: null, seconds: 30, weight: null }],
  ] as const)('omits %s for %s when no finite weight was recorded', (metric, trackingType, set) => {
    expect(
      buildExerciseTrendData({
        metric,
        sessions: [
          {
            date: '2026-08-22',
            notes: null,
            sessionId: 'missing-weight',
            sets: [{ ...set, setNumber: 1 }],
          },
        ],
        trackingType,
      }),
    ).toEqual([]);
  });

  it.each([
    ['max_weight', 'weight_reps'],
    ['total_volume', 'weight_reps'],
    ['est_1rm', 'weight_reps'],
    ['max_weight', 'weight_seconds'],
  ] as const)(
    'preserves an explicitly recorded zero for %s with %s instead of confusing it with missing data',
    (metric, trackingType) => {
      expect(
        buildExerciseTrendData({
          metric,
          sessions: [
            {
              date: '2026-08-22',
              notes: null,
              sessionId: 'zero-weight',
              sets: [{ reps: 8, seconds: 30, setNumber: 1, weight: 0 }],
            },
          ],
          trackingType,
        }),
      ).toEqual([expect.objectContaining({ sessionId: 'zero-weight', value: 0 })]);
    },
  );
});

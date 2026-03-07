import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SeverityPoint, TimelineEvent } from '../types';
import { SeverityChart } from './severity-chart';

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

describe('SeverityChart', () => {
  const severityHistory: SeverityPoint[] = [
    { date: '2025-01-01', value: 6 },
    { date: '2025-01-10', value: 3 },
  ];

  const timeline: TimelineEvent[] = [
    {
      id: 'shoulder-flare-2025-01-05',
      date: '2025-01-05',
      event: 'Pain spiked after a heavy pressing day.',
      type: 'flare',
      notes: 'Backed off pressing volume for the rest of the week.',
    },
  ];

  it('renders a responsive chart with event markers and hover details', () => {
    const { container } = render(<SeverityChart severityHistory={severityHistory} timeline={timeline} />);

    expect(screen.getByText('Pain / Severity Over Time')).toBeInTheDocument();
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Pain / Severity Over Time chart' })).toBeInTheDocument();

    const eventMarkers = container.querySelectorAll('[data-slot="severity-event-marker"]');
    expect(eventMarkers).toHaveLength(1);

    fireEvent.focus(eventMarkers[0] as Element);

    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(screen.getByText('January 5, 2025')).toBeInTheDocument();
    expect(screen.getByText('Pain spiked after a heavy pressing day.')).toBeInTheDocument();
  });

  it('shows a fallback when fewer than two severity data points are available', () => {
    render(<SeverityChart severityHistory={[severityHistory[0]]} timeline={timeline} />);

    expect(
      screen.getByText('Not enough data to show a trend yet. Add at least two severity check-ins.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('responsive-container')).not.toBeInTheDocument();
  });
});

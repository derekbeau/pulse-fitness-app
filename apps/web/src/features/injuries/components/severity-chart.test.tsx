import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { mockHealthConditions } from '../lib/mock-data';
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
  it('renders a responsive chart with event markers and hover details', () => {
    const condition = mockHealthConditions[0];
    const { container } = render(
      <SeverityChart severityHistory={condition.severityHistory} timeline={condition.timeline} />,
    );

    expect(screen.getByText('Pain / Severity Over Time')).toBeInTheDocument();
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Pain / Severity Over Time chart' })).toBeInTheDocument();

    const eventMarkers = container.querySelectorAll('[data-slot="severity-event-marker"]');
    expect(eventMarkers).toHaveLength(condition.timeline.length);

    fireEvent.focus(eventMarkers[0] as Element);

    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(screen.getByText('March 18, 2025')).toBeInTheDocument();
    expect(
      screen.getByText('Sharp anterior shoulder pain showed up during the top set of incline dumbbell press.'),
    ).toBeInTheDocument();

  });

  it('shows a fallback when fewer than two severity data points are available', () => {
    render(
      <SeverityChart
        severityHistory={[mockHealthConditions[0].severityHistory[0]]}
        timeline={mockHealthConditions[0].timeline}
      />,
    );

    expect(screen.getByText('Not enough data to show a trend yet. Add at least two severity check-ins.')).toBeInTheDocument();
    expect(screen.queryByTestId('responsive-container')).not.toBeInTheDocument();
  });
});
